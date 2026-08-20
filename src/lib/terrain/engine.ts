import { contours } from 'd3-contour';
import type { NormalizedDeribitOption, OptionType } from '../deribit/types';
import { calculateGreeks } from '../quant/engine';
import {
    TERRAIN_ASSUMPTION_MODEL,
    TERRAIN_SCHEMA_VERSION,
    type CharmPressureGlyph,
    type ConfluenceFloorCell,
    type DealerBehaviorZone,
    type GammaFlipCurvePoint,
    type GammaFlipLevel,
    type HedgeDirection,
    type IntensityBand,
    type KeyLevel,
    type MaxPainByExpiry,
    type TerrainConfluenceLevel,
    type TerrainDataContractV2,
    type TerrainDataMode,
    type TerrainKeyContract,
    type TerrainScale,
    type TerrainScales,
    type TerrainSurfaceCell,
    type VannaContourPoint,
    type VannaContourPrimitive,
} from './types';

const RISK_FREE_RATE = 0.04;
const GEX_UNIT = 'USD hedge-notional change per 1% BTC spot move';
const VANNA_UNIT = 'USD hedge-notional change per 1 volatility-point IV move';
const CHARM_UNIT = 'USD hedge-notional change per calendar day';
const OPEN_INTEREST_UNIT = 'BTC open interest';
const VANNA_CONTOUR_THRESHOLDS = [-80, -60, -40, -20, 0, 20, 40, 60, 80];

interface ContractExposure {
    option: NormalizedDeribitOption;
    rawDelta: number;
    rawGamma: number;
    rawVanna: number;
    rawCharm: number;
    gexExposure: number;
    vannaExposure: number;
    charmExposure: number;
    openInterestUsd: number;
}

interface CellAccumulator {
    strike: number;
    expiry: string;
    dte: number;
    observed: boolean;
    rawDelta: number;
    rawGamma: number;
    rawVanna: number;
    rawCharm: number;
    gexExposure: number;
    vannaExposure: number;
    charmExposure: number;
    callGexExposure: number;
    putGexExposure: number;
    openInterestBtc: number;
    openInterestUsd: number;
    ivSum: number;
    count: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 6): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function cellKey(expiry: string, strike: number): string {
    return `${expiry}:${strike}`;
}

function positionSign(type: OptionType): 1 | -1 {
    return type === 'call' ? 1 : -1;
}

export function calculateGexExposureUsdPerOnePercentMove(
    rawGamma: number,
    openInterestBtc: number,
    spotUsd: number,
    type: OptionType
): number {
    if (!validExposureInput(rawGamma, openInterestBtc, spotUsd) || rawGamma < 0) return 0;
    return positionSign(type) * rawGamma * openInterestBtc * spotUsd * spotUsd * 0.01;
}

export function calculateVannaExposureUsdPerVolPoint(
    rawVanna: number,
    openInterestBtc: number,
    spotUsd: number,
    type: OptionType
): number {
    if (!validExposureInput(rawVanna, openInterestBtc, spotUsd)) return 0;
    return positionSign(type) * rawVanna * openInterestBtc * spotUsd * 0.01;
}

export function calculateCharmExposureUsdPerDay(
    rawCharmCalendarDriftPerYear: number,
    openInterestBtc: number,
    spotUsd: number,
    type: OptionType
): number {
    if (!validExposureInput(rawCharmCalendarDriftPerYear, openInterestBtc, spotUsd)) return 0;
    return positionSign(type) * rawCharmCalendarDriftPerYear * openInterestBtc * spotUsd / 365;
}

export function calculateCharmHedgeFlowUsdPerDay(charmExposure: number): number {
    if (!Number.isFinite(charmExposure)) return 0;
    return -charmExposure;
}

export function classifyCharmHedgeDirection(charmHedgeFlowUsdPerDay: number): HedgeDirection {
    if (charmHedgeFlowUsdPerDay > 0) return 'BUY_HEDGE';
    if (charmHedgeFlowUsdPerDay < 0) return 'SELL_HEDGE';
    return 'NEUTRAL';
}

function validExposureInput(rawGreek: number, openInterestBtc: number, spotUsd: number): boolean {
    return (
        Number.isFinite(rawGreek) &&
        Number.isFinite(openInterestBtc) &&
        Number.isFinite(spotUsd) &&
        openInterestBtc >= 0 &&
        spotUsd > 0
    );
}

export function intensityBand(value: number): IntensityBand {
    if (value >= 75) return 'EXTREME';
    if (value >= 50) return 'HIGH';
    if (value >= 25) return 'MEDIUM';
    return 'LOW';
}

export function calculateIntensity(value: number, robustAbsMax: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(robustAbsMax) || robustAbsMax <= 0) return 0;
    return round(clamp((Math.abs(value) / robustAbsMax) * 100, 0, 100), 3);
}

export function calculateConfluenceScore(params: {
    gexIntensity: number;
    vannaIntensity: number;
    charmIntensity: number;
    oiIntensity: number;
    structureIntensity: number;
}): number {
    const score =
        0.35 * params.gexIntensity +
        0.2 * params.vannaIntensity +
        0.15 * params.charmIntensity +
        0.15 * params.oiIntensity +
        0.15 * params.structureIntensity;

    return round(clamp(score, 0, 100), 3);
}

export function classifyDealerBehavior(params: {
    isCallWall: boolean;
    isPutWall: boolean;
    nearGammaFlip: boolean;
    gexExposure: number;
    gexIntensity: number;
    vannaIntensity: number;
    charmIntensity: number;
    dte: number;
    confluenceScore: number;
}): DealerBehaviorZone {
    if ((params.isCallWall || params.isPutWall) && params.confluenceScore >= 80) return 'HIGH_CONFLUENCE_WALL';
    if (params.nearGammaFlip) return 'REGIME_TRANSITION';
    if (params.vannaIntensity >= 75 && params.vannaIntensity >= params.gexIntensity + 10 && params.vannaIntensity >= params.charmIntensity + 10) {
        return 'VOL_SENSITIVE_ZONE';
    }
    if (params.charmIntensity >= 75 && params.dte <= 14) return 'DECAY_PRESSURE_ZONE';
    if (params.gexExposure > 0 && params.gexIntensity >= 60) return 'STABILIZATION_ZONE';
    if (params.gexExposure < 0 && params.gexIntensity >= 60) return 'ACCELERATION_ZONE';
    return 'NEUTRAL';
}

export function buildTerrainDataContract(params: {
    options: readonly NormalizedDeribitOption[];
    spotPrice: number;
    now: Date;
    dataMode: TerrainDataMode;
}): TerrainDataContractV2 {
    const exposures = params.options.map((option) => calculateContractExposure(option, params.spotPrice));
    const strikes = sortedUnique(exposures.map(({ option }) => option.strike));
    const expiries = sortedExpiries(exposures.map(({ option }) => ({
        expiry: option.expiryStr,
        expiryDate: option.expiryDate,
        dte: option.dte,
    })));
    const dtes = expiries.map((expiry) => round(expiry.dte, 3));

    const callWall = calculateCallWall(exposures);
    const putWall = calculatePutWall(exposures);
    const maxPainByExpiry = calculateMaxPainByExpiry(params.options);
    const primaryMaxPain = maxPainByExpiry[0] ?? null;
    const gammaFlip = calculatePortfolioGammaFlip(params.options, params.spotPrice);
    const cellMap = aggregateCells(exposures, params.spotPrice);
    const scales = calculateScalesFromCells(cellMap);
    const surfaceGrid = buildSurfaceGrid({
        strikes,
        expiries,
        cellMap,
        spotPrice: params.spotPrice,
        dataMode: params.dataMode,
        scales,
        callWall,
        putWall,
        gammaFlip,
        maxPainByExpiry,
    });
    const keyContracts = buildKeyContracts(exposures, params.spotPrice, scales, callWall, putWall, gammaFlip);
    const confluenceLevels = buildConfluenceLevels(surfaceGrid);
    const vannaContours = buildVannaContours(surfaceGrid, scales.vanna.robustAbsMax);
    const charmGlyphs = buildCharmGlyphs(surfaceGrid);
    const confluenceFloor = buildConfluenceFloor(surfaceGrid);

    const totalCallGex = sum(exposures.filter(({ option }) => option.type === 'call').map(({ gexExposure }) => gexExposure));
    const totalPutGex = sum(exposures.filter(({ option }) => option.type === 'put').map(({ gexExposure }) => gexExposure));
    const totalVannaExposure = sum(exposures.map(({ vannaExposure }) => vannaExposure));
    const totalCharmExposure = sum(exposures.map(({ charmExposure }) => charmExposure));
    const totalOpenInterest = sum(exposures.map(({ option }) => option.openInterest));

    return {
        schemaVersion: TERRAIN_SCHEMA_VERSION,
        timestamp: params.now.toISOString(),
        dataMode: params.dataMode,
        assumptionModel: TERRAIN_ASSUMPTION_MODEL,
        spotPrice: params.spotPrice,
        summary: {
            totalCallGex,
            totalPutGex,
            netGex: totalCallGex + totalPutGex,
            totalVannaExposure,
            totalCharmExposure,
            totalOpenInterest,
            gammaFlip: gammaFlip.strike,
            maxPainStrike: primaryMaxPain?.strike ?? params.spotPrice,
            topPositiveGexStrike: callWall.strike,
            topNegativeGexStrike: putWall.strike,
            callWallExposure: callWall.exposure,
            putWallExposure: putWall.exposure,
            contractsCount: params.options.length,
        },
        scales,
        strikes,
        expirations: expiries.map(({ expiry }) => expiry),
        dtes,
        surfaceGrid,
        keyLevels: {
            callWall,
            putWall,
            gammaFlip,
            primaryMaxPain,
        },
        maxPainByExpiry,
        confluenceLevels,
        vannaContours,
        charmGlyphs,
        confluenceFloor,
        keyContracts,
        topContracts: keyContracts,
    };
}

export function buildDemoTerrainDataContract(spotPrice: number, now: Date): TerrainDataContractV2 {
    return buildTerrainDataContract({
        options: buildDemoOptions(spotPrice, now),
        spotPrice,
        now,
        dataMode: 'DEMO',
    });
}

function calculateContractExposure(option: NormalizedDeribitOption, spotPrice: number): ContractExposure {
    const greeks = calculateGreeks(spotPrice, option.strike, option.tte, option.ivDecimal, RISK_FREE_RATE, option.type);
    return {
        option,
        rawDelta: greeks.delta,
        rawGamma: greeks.gamma,
        rawVanna: greeks.vanna,
        rawCharm: greeks.charm,
        gexExposure: calculateGexExposureUsdPerOnePercentMove(greeks.gamma, option.openInterest, spotPrice, option.type),
        vannaExposure: calculateVannaExposureUsdPerVolPoint(greeks.vanna, option.openInterest, spotPrice, option.type),
        charmExposure: calculateCharmExposureUsdPerDay(greeks.charm, option.openInterest, spotPrice, option.type),
        openInterestUsd: option.openInterest * spotPrice,
    };
}

function calculateCallWall(exposures: readonly ContractExposure[]): KeyLevel {
    const byStrike = new Map<number, number>();
    for (const exposure of exposures) {
        if (exposure.option.type !== 'call') continue;
        byStrike.set(exposure.option.strike, (byStrike.get(exposure.option.strike) ?? 0) + Math.max(0, exposure.gexExposure));
    }
    return maxMapEntry(byStrike, 0);
}

function calculatePutWall(exposures: readonly ContractExposure[]): KeyLevel {
    const byStrike = new Map<number, number>();
    for (const exposure of exposures) {
        if (exposure.option.type !== 'put') continue;
        byStrike.set(exposure.option.strike, (byStrike.get(exposure.option.strike) ?? 0) + exposure.gexExposure);
    }
    const fallback: number = exposures[0]?.option.strike ?? 0;
    let bestStrike: number = fallback;
    let bestExposure = 0;
    for (const [strike, exposure] of byStrike.entries()) {
        if (Math.abs(exposure) > Math.abs(bestExposure)) {
            bestStrike = strike;
            bestExposure = exposure;
        }
    }
    return { strike: bestStrike, exposure: bestExposure };
}

function calculatePortfolioGammaFlip(options: readonly NormalizedDeribitOption[], spotPrice: number): GammaFlipLevel {
    const minSpot = Math.max(1, spotPrice * 0.7);
    const maxSpot = spotPrice * 1.3;
    const steps = 60;
    const curve: GammaFlipCurvePoint[] = [];

    for (let i = 0; i <= steps; i++) {
        const hypotheticalSpot = minSpot + ((maxSpot - minSpot) * i) / steps;
        const gexExposure = sum(options.map((option) => {
            const greeks = calculateGreeks(hypotheticalSpot, option.strike, option.tte, option.ivDecimal, RISK_FREE_RATE, option.type);
            return calculateGexExposureUsdPerOnePercentMove(greeks.gamma, option.openInterest, hypotheticalSpot, option.type);
        }));
        curve.push({ spot: round(hypotheticalSpot, 2), gexExposure });
    }

    return selectPrimaryGammaFlipFromCurve(curve, spotPrice);
}

export function selectPrimaryGammaFlipFromCurve(curve: readonly GammaFlipCurvePoint[], spotPrice: number): GammaFlipLevel {
    if (curve.length === 0) {
        return { strike: 0, gexExposure: 0, curve: [], crossings: [] };
    }

    const crossings: number[] = [];
    for (let i = 0; i < curve.length - 1; i++) {
        const a = curve[i];
        const b = curve[i + 1];
        if (a.gexExposure === 0) {
            crossings.push(a.spot);
            continue;
        }
        if ((a.gexExposure < 0 && b.gexExposure > 0) || (a.gexExposure > 0 && b.gexExposure < 0)) {
            const weight = Math.abs(a.gexExposure) / (Math.abs(a.gexExposure) + Math.abs(b.gexExposure));
            crossings.push(round(a.spot + (b.spot - a.spot) * weight, 2));
        }
    }
    const last = curve[curve.length - 1];
    if (last.gexExposure === 0) crossings.push(last.spot);

    const uniqueCrossings = sortedUnique(crossings);
    if (uniqueCrossings.length > 0) {
        const primaryCrossing = uniqueCrossings.reduce((best, crossing) => (
            Math.abs(crossing - spotPrice) < Math.abs(best - spotPrice) ? crossing : best
        ), uniqueCrossings[0]);
        return {
            strike: primaryCrossing,
            gexExposure: 0,
            curve: [...curve],
            crossings: uniqueCrossings,
        };
    }

    const closest = curve.reduce((best, point) => Math.abs(point.gexExposure) < Math.abs(best.gexExposure) ? point : best, curve[0]);
    return { strike: closest.spot, gexExposure: closest.gexExposure, curve: [...curve], crossings: [] };
}

function calculateMaxPainByExpiry(options: readonly NormalizedDeribitOption[]): MaxPainByExpiry[] {
    const byExpiry = new Map<string, NormalizedDeribitOption[]>();
    for (const option of options) {
        const group = byExpiry.get(option.expiryStr) ?? [];
        group.push(option);
        byExpiry.set(option.expiryStr, group);
    }

    return Array.from(byExpiry.entries())
        .map(([expiry, expiryOptions]) => {
            const strikes = sortedUnique(expiryOptions.map((option) => option.strike));
            let minPain = Infinity;
            let maxPainStrike = strikes[0] ?? 0;
            for (const testStrike of strikes) {
                const pain = sum(expiryOptions.map((option) => {
                    if (option.type === 'call' && testStrike > option.strike) return (testStrike - option.strike) * option.openInterest;
                    if (option.type === 'put' && testStrike < option.strike) return (option.strike - testStrike) * option.openInterest;
                    return 0;
                }));
                if (pain < minPain) {
                    minPain = pain;
                    maxPainStrike = testStrike;
                }
            }
            const first = expiryOptions[0];
            return { expiry, dte: first?.dte ?? 0, strike: maxPainStrike, pain: minPain };
        })
        .sort((a, b) => a.dte - b.dte);
}

function calculateScalesFromCells(cellMap: ReadonlyMap<string, CellAccumulator>): TerrainScales {
    const cells = Array.from(cellMap.values());
    return {
        gex: scaleFor(cells.map(({ gexExposure }) => gexExposure), GEX_UNIT),
        vanna: scaleFor(cells.map(({ vannaExposure }) => vannaExposure), VANNA_UNIT),
        charm: scaleFor(cells.map(({ charmExposure }) => charmExposure), CHARM_UNIT),
        openInterest: scaleFor(cells.map(({ openInterestBtc }) => openInterestBtc), OPEN_INTEREST_UNIT),
    };
}

function scaleFor(values: readonly number[], unit: string): TerrainScale {
    const finiteValues = values.filter(Number.isFinite);
    const absValues = finiteValues.map(Math.abs).sort((a, b) => a - b);
    const maxAbs = absValues[absValues.length - 1] ?? 1;
    const percentileIndex = Math.max(0, Math.ceil(absValues.length * 0.95) - 1);
    const robustAbsMax = absValues[percentileIndex] || maxAbs || 1;
    return {
        min: finiteValues.length ? Math.min(...finiteValues) : 0,
        max: finiteValues.length ? Math.max(...finiteValues) : 0,
        robustAbsMax,
        unit,
    };
}

function aggregateCells(exposures: readonly ContractExposure[], spotPrice: number): Map<string, CellAccumulator> {
    const cellMap = new Map<string, CellAccumulator>();
    for (const exposure of exposures) {
        const key = cellKey(exposure.option.expiryStr, exposure.option.strike);
        const cell = cellMap.get(key) ?? {
            strike: exposure.option.strike,
            expiry: exposure.option.expiryStr,
            dte: exposure.option.dte,
            observed: true,
            rawDelta: 0,
            rawGamma: 0,
            rawVanna: 0,
            rawCharm: 0,
            gexExposure: 0,
            vannaExposure: 0,
            charmExposure: 0,
            callGexExposure: 0,
            putGexExposure: 0,
            openInterestBtc: 0,
            openInterestUsd: 0,
            ivSum: 0,
            count: 0,
        };

        cell.rawDelta += exposure.rawDelta;
        cell.rawGamma += exposure.rawGamma;
        cell.rawVanna += exposure.rawVanna;
        cell.rawCharm += exposure.rawCharm;
        cell.gexExposure += exposure.gexExposure;
        cell.vannaExposure += exposure.vannaExposure;
        cell.charmExposure += exposure.charmExposure;
        if (exposure.option.type === 'call') cell.callGexExposure += exposure.gexExposure;
        else cell.putGexExposure += exposure.gexExposure;
        cell.openInterestBtc += exposure.option.openInterest;
        cell.openInterestUsd += exposure.option.openInterest * spotPrice;
        cell.ivSum += exposure.option.ivPercent;
        cell.count += 1;
        cellMap.set(key, cell);
    }
    return cellMap;
}

function buildSurfaceGrid(params: {
    strikes: readonly number[];
    expiries: readonly { expiry: string; dte: number }[];
    cellMap: Map<string, CellAccumulator>;
    spotPrice: number;
    dataMode: TerrainDataMode;
    scales: TerrainScales;
    callWall: KeyLevel;
    putWall: KeyLevel;
    gammaFlip: GammaFlipLevel;
    maxPainByExpiry: readonly MaxPainByExpiry[];
}): TerrainSurfaceCell[][] {
    return params.expiries.map(({ expiry, dte }) => params.strikes.map((strike) => {
        const cell = params.cellMap.get(cellKey(expiry, strike)) ?? emptyCell(strike, expiry, dte, params.spotPrice, params.dataMode);
        const gexIntensity = calculateIntensity(cell.gexExposure, params.scales.gex.robustAbsMax);
        const vannaIntensity = calculateIntensity(cell.vannaExposure, params.scales.vanna.robustAbsMax);
        const charmIntensity = calculateIntensity(cell.charmExposure, params.scales.charm.robustAbsMax);
        const oiIntensity = calculateIntensity(cell.openInterestBtc, params.scales.openInterest.robustAbsMax);
        const structureIntensity = calculateStructureIntensity({
            strike,
            expiry,
            spotPrice: params.spotPrice,
            callWall: params.callWall,
            putWall: params.putWall,
            gammaFlip: params.gammaFlip,
            maxPainByExpiry: params.maxPainByExpiry,
        });
        const confluenceScore = calculateConfluenceScore({
            gexIntensity,
            vannaIntensity,
            charmIntensity,
            oiIntensity,
            structureIntensity,
        });
        const behaviorZone = classifyDealerBehavior({
            isCallWall: strike === params.callWall.strike,
            isPutWall: strike === params.putWall.strike,
            nearGammaFlip: Math.abs(strike - params.gammaFlip.strike) <= proximityBand(params.spotPrice),
            gexExposure: cell.gexExposure,
            gexIntensity,
            vannaIntensity,
            charmIntensity,
            dte,
            confluenceScore,
        });

        return {
            strike,
            expiry,
            dte: round(dte, 3),
            observed: cell.observed,
            rawDelta: averageOrNull(cell.rawDelta, cell.count),
            rawGamma: averageOrNull(cell.rawGamma, cell.count),
            rawVanna: averageOrNull(cell.rawVanna, cell.count),
            rawCharm: averageOrNull(cell.rawCharm, cell.count),
            gexExposure: cell.gexExposure,
            vannaExposure: cell.vannaExposure,
            charmExposure: cell.charmExposure,
            callGexExposure: cell.callGexExposure,
            putGexExposure: cell.putGexExposure,
            openInterestBtc: cell.openInterestBtc,
            openInterestUsd: cell.openInterestUsd,
            iv: averageOrNull(cell.ivSum, cell.count),
            gexIntensity,
            vannaIntensity,
            charmIntensity,
            oiIntensity,
            gexBand: intensityBand(gexIntensity),
            vannaBand: intensityBand(vannaIntensity),
            charmBand: intensityBand(charmIntensity),
            oiBand: intensityBand(oiIntensity),
            confluenceScore,
            confluenceBand: intensityBand(confluenceScore),
            behaviorZone,
            gex: cell.gexExposure,
            callGex: cell.callGexExposure,
            putGex: cell.putGexExposure,
            openInterest: cell.openInterestBtc,
            gamma: average(cell.rawGamma, cell.count),
        };
    }));
}

function buildKeyContracts(
    exposures: readonly ContractExposure[],
    spotPrice: number,
    scales: TerrainScales,
    callWall: KeyLevel,
    putWall: KeyLevel,
    gammaFlip: GammaFlipLevel
): TerrainKeyContract[] {
    return exposures
        .map((exposure) => {
            const gexIntensity = calculateIntensity(exposure.gexExposure, scales.gex.robustAbsMax);
            const vannaIntensity = calculateIntensity(exposure.vannaExposure, scales.vanna.robustAbsMax);
            const charmIntensity = calculateIntensity(exposure.charmExposure, scales.charm.robustAbsMax);
            const oiIntensity = calculateIntensity(exposure.option.openInterest, scales.openInterest.robustAbsMax);
            const confluenceScore = calculateConfluenceScore({
                gexIntensity,
                vannaIntensity,
                charmIntensity,
                oiIntensity,
                structureIntensity: Math.max(
                    levelProximity(exposure.option.strike, callWall.strike, spotPrice),
                    levelProximity(exposure.option.strike, putWall.strike, spotPrice),
                    levelProximity(exposure.option.strike, gammaFlip.strike, spotPrice)
                ),
            });
            const behaviorZone = classifyDealerBehavior({
                isCallWall: exposure.option.strike === callWall.strike,
                isPutWall: exposure.option.strike === putWall.strike,
                nearGammaFlip: Math.abs(exposure.option.strike - gammaFlip.strike) <= proximityBand(spotPrice),
                gexExposure: exposure.gexExposure,
                gexIntensity,
                vannaIntensity,
                charmIntensity,
                dte: exposure.option.dte,
                confluenceScore,
            });

            return {
                instrument: exposure.option.instrument,
                strike: exposure.option.strike,
                expiryStr: exposure.option.expiryStr,
                expiryDate: exposure.option.expiryDate,
                dte: exposure.option.dte,
                tte: exposure.option.tte,
                type: exposure.option.type,
                openInterest: exposure.option.openInterest,
                openInterestBtc: exposure.option.openInterest,
                openInterestUsd: exposure.openInterestUsd,
                iv: exposure.option.ivPercent,
                rawDelta: exposure.rawDelta,
                rawGamma: exposure.rawGamma,
                rawVanna: exposure.rawVanna,
                rawCharm: exposure.rawCharm,
                delta: exposure.rawDelta,
                gamma: exposure.rawGamma,
                vanna: exposure.rawVanna,
                charm: exposure.rawCharm,
                gex: exposure.gexExposure,
                gexExposure: exposure.gexExposure,
                vannaExposure: exposure.vannaExposure,
                charmExposure: exposure.charmExposure,
                gexIntensity,
                vannaIntensity,
                charmIntensity,
                confluenceScore,
                behaviorZone,
                volume: exposure.option.volume,
            };
        })
        .sort((a, b) => Math.abs(b.gexExposure) - Math.abs(a.gexExposure))
        .slice(0, 15);
}

function buildConfluenceLevels(surfaceGrid: readonly TerrainSurfaceCell[][]): TerrainConfluenceLevel[] {
    return surfaceGrid
        .flat()
        .filter((cell) => cell.confluenceScore > 0)
        .sort((a, b) => b.confluenceScore - a.confluenceScore)
        .slice(0, 25)
        .map((cell) => ({
            strike: cell.strike,
            expiry: cell.expiry,
            dte: cell.dte,
            confluenceScore: cell.confluenceScore,
            confluenceBand: cell.confluenceBand,
            behaviorZone: cell.behaviorZone,
            gexExposure: cell.gexExposure,
            vannaExposure: cell.vannaExposure,
            charmExposure: cell.charmExposure,
            openInterestBtc: cell.openInterestBtc,
        }));
}

export function buildVannaContours(
    surfaceGrid: readonly TerrainSurfaceCell[][],
    robustAbsMax: number
): VannaContourPrimitive[] {
    const rows = surfaceGrid.length;
    const columns = surfaceGrid[0]?.length ?? 0;
    if (rows < 2 || columns < 2 || robustAbsMax <= 0) return [];

    const values = surfaceGrid.flatMap((row) => row.map((cell) => {
        return clamp((cell.vannaExposure / robustAbsMax) * 100, -100, 100);
    }));

    const generated = contours()
        .size([columns, rows])
        .thresholds(VANNA_CONTOUR_THRESHOLDS)
        .smooth(true)(values);

    return generated.flatMap((contour) => {
        const threshold = round(contour.value, 3);
        return contour.coordinates.flatMap((polygon) => polygon.map((ring) => ({
            threshold,
            sign: threshold > 0 ? 'POSITIVE' : threshold < 0 ? 'NEGATIVE' : 'ZERO',
            intensity: Math.abs(threshold),
            points: ring.map(([x, y]) => contourPoint(x, y, surfaceGrid)),
        } satisfies VannaContourPrimitive)));
    });
}

function buildCharmGlyphs(surfaceGrid: readonly TerrainSurfaceCell[][]): CharmPressureGlyph[] {
    return surfaceGrid
        .flat()
        .filter((cell) => cell.charmIntensity >= 25)
        .sort((a, b) => b.charmIntensity - a.charmIntensity)
        .slice(0, 100)
        .map((cell) => {
            const charmHedgeFlowUsdPerDay = calculateCharmHedgeFlowUsdPerDay(cell.charmExposure);
            return {
                strike: cell.strike,
                dte: cell.dte,
                expiry: cell.expiry,
                charmExposure: cell.charmExposure,
                charmHedgeFlowUsdPerDay,
                intensity: cell.charmIntensity,
                hedgeDirection: classifyCharmHedgeDirection(charmHedgeFlowUsdPerDay),
            };
        });
}

function buildConfluenceFloor(surfaceGrid: readonly TerrainSurfaceCell[][]): ConfluenceFloorCell[][] {
    return surfaceGrid.map((row) => row.map((cell) => ({
        strike: cell.strike,
        dte: cell.dte,
        expiry: cell.expiry,
        confluenceScore: cell.confluenceScore,
        confluenceBand: cell.confluenceBand,
    })));
}

function calculateStructureIntensity(params: {
    strike: number;
    expiry: string;
    spotPrice: number;
    callWall: KeyLevel;
    putWall: KeyLevel;
    gammaFlip: GammaFlipLevel;
    maxPainByExpiry: readonly MaxPainByExpiry[];
}): number {
    const expiryMaxPain = params.maxPainByExpiry.find((level) => level.expiry === params.expiry);
    return Math.max(
        levelProximity(params.strike, params.callWall.strike, params.spotPrice),
        levelProximity(params.strike, params.putWall.strike, params.spotPrice),
        levelProximity(params.strike, params.gammaFlip.strike, params.spotPrice),
        expiryMaxPain ? levelProximity(params.strike, expiryMaxPain.strike, params.spotPrice) : 0
    );
}

function levelProximity(strike: number, level: number, spotPrice: number): number {
    const band = proximityBand(spotPrice);
    return round(clamp(100 - (Math.abs(strike - level) / band) * 100, 0, 100), 3);
}

function proximityBand(spotPrice: number): number {
    return Math.max(1000, spotPrice * 0.02);
}

function contourPoint(x: number, y: number, surfaceGrid: readonly TerrainSurfaceCell[][]): VannaContourPoint {
    const strikeAxis = surfaceGrid[0]?.map((cell) => cell.strike) ?? [];
    const dteAxis = surfaceGrid.map((row) => row[0]?.dte ?? 0);
    return {
        x: round(x, 3),
        y: round(y, 3),
        strike: round(interpolateAxis(strikeAxis, x), 3),
        dte: round(interpolateAxis(dteAxis, y), 3),
    };
}

function interpolateAxis(axis: readonly number[], contourCoordinate: number): number {
    if (axis.length === 0) return 0;
    if (axis.length === 1) return axis[0];
    const fractionalIndex = clamp(contourCoordinate - 0.5, 0, axis.length - 1);
    const lowerIndex = Math.floor(fractionalIndex);
    const upperIndex = Math.min(axis.length - 1, lowerIndex + 1);
    const weight = fractionalIndex - lowerIndex;
    return axis[lowerIndex] + (axis[upperIndex] - axis[lowerIndex]) * weight;
}

function emptyCell(strike: number, expiry: string, dte: number, spotPrice: number, dataMode: TerrainDataMode): CellAccumulator {
    const greeks = dataMode === 'DEMO'
        ? calculateGreeks(spotPrice, strike, dte / 365, 0.5, RISK_FREE_RATE, 'call')
        : null;
    return {
        strike,
        expiry,
        dte,
        observed: dataMode === 'DEMO',
        rawDelta: greeks?.delta ?? 0,
        rawGamma: greeks?.gamma ?? 0,
        rawVanna: greeks?.vanna ?? 0,
        rawCharm: greeks?.charm ?? 0,
        gexExposure: 0,
        vannaExposure: 0,
        charmExposure: 0,
        callGexExposure: 0,
        putGexExposure: 0,
        openInterestBtc: 0,
        openInterestUsd: 0,
        ivSum: dataMode === 'DEMO' ? 50 : 0,
        count: dataMode === 'DEMO' ? 1 : 0,
    };
}

function sortedUnique(values: readonly number[]): number[] {
    return Array.from(new Set(values)).sort((a, b) => a - b);
}

function sortedExpiries(values: readonly { expiry: string; expiryDate: Date; dte: number }[]): { expiry: string; dte: number }[] {
    const byExpiry = new Map<string, { expiry: string; expiryDate: Date; dte: number }>();
    for (const value of values) {
        byExpiry.set(value.expiry, value);
    }
    return Array.from(byExpiry.values())
        .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
        .slice(0, 10)
        .map(({ expiry, dte }) => ({ expiry, dte }));
}

function maxMapEntry(map: Map<number, number>, fallbackStrike: number): KeyLevel {
    let strike = fallbackStrike;
    let exposure = 0;
    for (const [candidateStrike, candidateExposure] of map.entries()) {
        if (candidateExposure > exposure) {
            strike = candidateStrike;
            exposure = candidateExposure;
        }
    }
    return { strike, exposure };
}

function average(total: number, count: number): number {
    return count > 0 ? total / count : 0;
}

function averageOrNull(total: number, count: number): number | null {
    return count > 0 ? total / count : null;
}

function sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

function buildDemoOptions(spotPrice: number, now: Date): NormalizedDeribitOption[] {
    const dtes = [7, 14, 30, 60, 90, 180];
    const strikeMultipliers = [0.75, 0.85, 0.95, 1, 1.05, 1.15, 1.25];
    const options: NormalizedDeribitOption[] = [];

    for (const dte of dtes) {
        const expiryDate = new Date(now.getTime() + dte * 24 * 60 * 60 * 1000);
        const expiryStr = `${dte}D`;
        for (const multiplier of strikeMultipliers) {
            const strike = Math.round((spotPrice * multiplier) / 1000) * 1000;
            for (const type of ['call', 'put'] as const) {
                const openInterest = Math.max(25, 900 * Math.exp(-Math.pow((strike - spotPrice) / (spotPrice * 0.18), 2)));
                options.push({
                    instrument: `BTC-${expiryStr}-${strike}-${type === 'call' ? 'C' : 'P'}`,
                    currency: 'BTC',
                    expiryStr,
                    expiryDate,
                    strike,
                    type,
                    dte,
                    tte: dte / 365,
                    openInterest,
                    ivDecimal: 0.55,
                    ivPercent: 55,
                    volume: openInterest * 0.1,
                } as unknown as NormalizedDeribitOption);
            }
        }
    }

    return options;
}
