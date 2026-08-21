import { describe, expect, it } from 'vitest';
import type { NormalizedDeribitOption, OptionType } from '@/lib/deribit/types';
import type { TerrainSurfaceCell } from './types';
import {
    buildDemoTerrainDataContract,
    buildTerrainDataContract,
    calculateCharmExposureUsdPerDay,
    calculateCharmHedgeFlowUsdPerDay,
    calculateConfluenceScore,
    calculateGexExposureUsdPerOnePercentMove,
    calculateIntensity,
    calculatePortfolioGammaFlip,
    calculateVannaExposureUsdPerVolPoint,
    buildVannaContours,
    classifyDealerBehavior,
    classifyCharmHedgeDirection,
    intensityBand,
    selectPrimaryGammaFlipFromCurve,
} from './engine';

const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
const expiryDate = new Date(Date.UTC(2026, 2, 27, 8, 0, 0));

function option(params: {
    instrument: string;
    strike: number;
    type: OptionType;
    openInterest: number;
    ivPercent?: number;
    expiryStr?: string;
    expiryDate?: Date;
    dte?: number;
}): NormalizedDeribitOption {
    const dte = params.dte ?? 85.333;
    const ivPercent = params.ivPercent ?? 55;
    return {
        instrument: params.instrument,
        currency: 'BTC',
        expiryStr: params.expiryStr ?? '27MAR26',
        expiryDate: params.expiryDate ?? expiryDate,
        strike: params.strike,
        type: params.type,
        dte,
        tte: dte / 365,
        openInterest: params.openInterest,
        ivDecimal: ivPercent / 100,
        ivPercent,
        volume: params.openInterest * 0.2,
    } as unknown as NormalizedDeribitOption;
}

describe('terrain exposure formulas', () => {
    it('locks GEX as USD hedge-notional change per 1 percent BTC move', () => {
        expect(calculateGexExposureUsdPerOnePercentMove(0.001, 100, 50000, 'call')).toBe(2_500_000);
        expect(calculateGexExposureUsdPerOnePercentMove(0.001, 100, 50000, 'put')).toBe(-2_500_000);
    });

    it('locks Vanna as USD hedge-notional change per one volatility-point IV move', () => {
        expect(calculateVannaExposureUsdPerVolPoint(0.5, 100, 50000, 'call')).toBe(25000);
        expect(calculateVannaExposureUsdPerVolPoint(0.5, 100, 50000, 'put')).toBe(-25000);
    });

    it('locks Charm as signed USD hedge-notional change per calendar day', () => {
        const expected = (12 * 100 * 50000) / 365;
        expect(calculateCharmExposureUsdPerDay(12, 100, 50000, 'call')).toBeCloseTo(expected, 8);
        expect(calculateCharmExposureUsdPerDay(12, 100, 50000, 'put')).toBeCloseTo(-expected, 8);
    });

    it('maps charm exposure to the opposite neutralizing hedge flow direction', () => {
        expect(calculateCharmHedgeFlowUsdPerDay(125)).toBe(-125);
        expect(calculateCharmHedgeFlowUsdPerDay(-125)).toBe(125);
        expect(classifyCharmHedgeDirection(125)).toBe('BUY_HEDGE');
        expect(classifyCharmHedgeDirection(-125)).toBe('SELL_HEDGE');
        expect(classifyCharmHedgeDirection(0)).toBe('NEUTRAL');
    });
});

describe('terrain scoring and behavior helpers', () => {
    it('uses independent intensity bands and weighted confluence scoring', () => {
        expect(calculateIntensity(50, 200)).toBe(25);
        expect(intensityBand(24)).toBe('LOW');
        expect(intensityBand(25)).toBe('MEDIUM');
        expect(intensityBand(50)).toBe('HIGH');
        expect(intensityBand(75)).toBe('EXTREME');
        expect(
            calculateConfluenceScore({
                gexIntensity: 100,
                vannaIntensity: 50,
                charmIntensity: 20,
                oiIntensity: 40,
                structureIntensity: 80,
            })
        ).toBe(66);
    });

    it('classifies dealer behavior with deterministic precedence', () => {
        expect(
            classifyDealerBehavior({
                isCallWall: true,
                isPutWall: false,
                nearGammaFlip: true,
                gexExposure: -100,
                gexIntensity: 100,
                vannaIntensity: 0,
                charmIntensity: 0,
                dte: 30,
                confluenceScore: 85,
            })
        ).toBe('HIGH_CONFLUENCE_WALL');
        expect(
            classifyDealerBehavior({
                isCallWall: false,
                isPutWall: false,
                nearGammaFlip: false,
                gexExposure: -100,
                gexIntensity: 80,
                vannaIntensity: 20,
                charmIntensity: 20,
                dte: 30,
                confluenceScore: 40,
            })
        ).toBe('ACCELERATION_ZONE');
    });
});

describe('Terrain Data Contract V2', () => {
    it('builds V2 terrain data with structural levels, contours, glyphs, and compatibility fields', () => {
        const response = buildTerrainDataContract({
            spotPrice: 68000,
            now,
            dataMode: 'LIVE',
            options: [
                option({ instrument: 'BTC-27MAR26-64000-P', strike: 64000, type: 'put', openInterest: 120, ivPercent: 65 }),
                option({ instrument: 'BTC-27MAR26-68000-C', strike: 68000, type: 'call', openInterest: 100, ivPercent: 55 }),
                option({ instrument: 'BTC-27MAR26-72000-C', strike: 72000, type: 'call', openInterest: 180, ivPercent: 60 }),
                option({ instrument: 'BTC-27MAR26-72000-P', strike: 72000, type: 'put', openInterest: 30, ivPercent: 58 }),
                option({ instrument: 'BTC-26JUN26-76000-C', strike: 76000, type: 'call', openInterest: 75, ivPercent: 62, expiryStr: '26JUN26', dte: 176 }),
                option({ instrument: 'BTC-26JUN26-64000-P', strike: 64000, type: 'put', openInterest: 90, ivPercent: 68, expiryStr: '26JUN26', dte: 176 }),
            ],
        });

        expect(response.schemaVersion).toBe(2);
        expect(response.dataMode).toBe('LIVE');
        expect(response.assumptionModel).toBe('OI_SIGN_PROXY_V1');
        expect(response.scales.gex.unit).toBe('USD hedge-notional change per 1% BTC spot move');
        expect(response.scales.vanna.unit).toBe('USD hedge-notional change per 1 volatility-point IV move');
        expect(response.scales.charm.unit).toBe('USD hedge-notional change per calendar day');
        expect(response.surfaceGrid).toHaveLength(response.expirations.length);
        expect(response.surfaceGrid.every((row) => row.length === response.strikes.length)).toBe(true);
        expect(response.keyLevels.callWall.strike).toBe(72000);
        expect(response.keyLevels.putWall.strike).toBe(64000);
        expect(response.keyLevels.gammaFlip.curve.length).toBeGreaterThan(10);
        expect(Array.isArray(response.keyLevels.gammaFlip.crossings)).toBe(true);
        expect(response.maxPainByExpiry).toHaveLength(2);
        expect(response.confluenceLevels[0].confluenceScore).toBeGreaterThanOrEqual(
            response.confluenceLevels.at(-1)?.confluenceScore ?? 0
        );
        expect(response.vannaContours.length).toBeGreaterThan(0);
        expect(response.charmGlyphs.every((glyph) => glyph.intensity >= 25)).toBe(true);
        for (const glyph of response.charmGlyphs) {
            expect(glyph.charmHedgeFlowUsdPerDay).toBeCloseTo(-glyph.charmExposure, 8);
            expect(glyph.hedgeDirection).toBe(classifyCharmHedgeDirection(glyph.charmHedgeFlowUsdPerDay));
        }
        expect(response.confluenceFloor).toHaveLength(response.surfaceGrid.length);
        expect(response.keyContracts[0]).toEqual(
            expect.objectContaining({
                rawGamma: expect.any(Number),
                gexExposure: expect.any(Number),
                vannaExposure: expect.any(Number),
                charmExposure: expect.any(Number),
                behaviorZone: expect.any(String),
            })
        );
        expect(response.topContracts).toBe(response.keyContracts);
        expect(response.summary.netGex).toBeCloseTo(response.summary.totalCallGex + response.summary.totalPutGex, 8);
    });

    it('builds explicit DEMO metadata for synthetic terrain responses', () => {
        const response = buildDemoTerrainDataContract(69000, now);

        expect(response.schemaVersion).toBe(2);
        expect(response.dataMode).toBe('DEMO');
        expect(response.assumptionModel).toBe('OI_SIGN_PROXY_V1');
        expect(response.surfaceGrid.length).toBeGreaterThan(0);
        expect(response.summary.contractsCount).toBeGreaterThan(0);
    });

    it('builds a visually useful DEMO terrain surface with non-degenerate exposures and structural levels', () => {
        const response = buildDemoTerrainDataContract(69000, now);
        const cells = response.surfaceGrid.flat();
        const gexValues = cells.map((cell) => cell.gexExposure);
        const vannaValues = cells.map((cell) => cell.vannaExposure);
        const charmValues = cells.map((cell) => cell.charmExposure);
        const structuralStrikes = [
            response.spotPrice,
            response.keyLevels.gammaFlip.strike,
            response.keyLevels.callWall.strike,
            response.keyLevels.putWall.strike,
            response.keyLevels.primaryMaxPain?.strike ?? response.spotPrice,
        ];

        expect(cells.filter((cell) => cell.observed)).toHaveLength(cells.length);
        expect(gexValues.some((value) => value > 0)).toBe(true);
        expect(gexValues.some((value) => value < 0)).toBe(true);
        expect(vannaValues.some((value) => value > 0)).toBe(true);
        expect(vannaValues.some((value) => value < 0)).toBe(true);
        expect(charmValues.some((value) => value > 0)).toBe(true);
        expect(charmValues.some((value) => value < 0)).toBe(true);
        expect(Math.max(...charmValues) - Math.min(...charmValues)).toBeGreaterThan(1000);
        expect(response.scales.gex.robustAbsMax).toBeGreaterThan(1e6);
        expect(response.scales.vanna.robustAbsMax).toBeGreaterThan(1e4);
        expect(response.scales.charm.robustAbsMax).toBeGreaterThan(1e3);
        expect(new Set(structuralStrikes).size).toBeGreaterThanOrEqual(4);
    });

    it('preserves explicit DEGRADED metadata when requested by the API layer', () => {
        const response = buildTerrainDataContract({
            spotPrice: 68000,
            now,
            dataMode: 'DEGRADED',
            options: [],
        });

        expect(response.schemaVersion).toBe(2);
        expect(response.dataMode).toBe('DEGRADED');
        expect(response.assumptionModel).toBe('OI_SIGN_PROXY_V1');
        expect(response.keyContracts).toEqual([]);
    });

    it('leaves LIVE rectangular cells unobserved without invented IV or raw Greeks', () => {
        const response = buildTerrainDataContract({
            spotPrice: 68000,
            now,
            dataMode: 'LIVE',
            options: [
                option({ instrument: 'BTC-27MAR26-64000-C', strike: 64000, type: 'call', openInterest: 100 }),
                option({ instrument: 'BTC-27MAR26-70000-C', strike: 70000, type: 'call', openInterest: 100 }),
                option({ instrument: 'BTC-26JUN26-64000-P', strike: 64000, type: 'put', openInterest: 100, expiryStr: '26JUN26', dte: 176 }),
            ],
        });

        const emptyLiveCell = response.surfaceGrid
            .flat()
            .find((cell) => cell.expiry === '26JUN26' && cell.strike === 70000);

        expect(emptyLiveCell).toEqual(expect.objectContaining({
            observed: false,
            rawDelta: null,
            rawGamma: null,
            rawVanna: null,
            rawCharm: null,
            iv: null,
            gexExposure: 0,
            vannaExposure: 0,
            charmExposure: 0,
            openInterestBtc: 0,
            gamma: 0,
        }));
    });

    it('derives surface scale bounds from aggregated strike-expiry cells', () => {
        const response = buildTerrainDataContract({
            spotPrice: 68000,
            now,
            dataMode: 'LIVE',
            options: [
                option({ instrument: 'BTC-27MAR26-68000-C-A', strike: 68000, type: 'call', openInterest: 100 }),
                option({ instrument: 'BTC-27MAR26-68000-C-B', strike: 68000, type: 'call', openInterest: 100 }),
                option({ instrument: 'BTC-27MAR26-76000-C', strike: 76000, type: 'call', openInterest: 1 }),
            ],
        });

        const aggregatedCell = response.surfaceGrid.flat().find((cell) => cell.strike === 68000);
        const largestContractGex = Math.max(...response.keyContracts.map((contract) => Math.abs(contract.gexExposure)));

        expect(aggregatedCell).toBeDefined();
        expect(Math.abs(aggregatedCell?.gexExposure ?? 0)).toBeGreaterThan(largestContractGex);
        expect(response.scales.gex.max).toBeCloseTo(aggregatedCell?.gexExposure ?? 0, 8);
        expect(response.scales.gex.robustAbsMax).toBeCloseTo(Math.abs(aggregatedCell?.gexExposure ?? 0), 8);
    });

    it('selects the gamma flip crossing nearest current spot and retains all crossings', () => {
        const gammaFlip = selectPrimaryGammaFlipFromCurve([
            { spot: 80, gexExposure: -10 },
            { spot: 100, gexExposure: 10 },
            { spot: 120, gexExposure: -10 },
            { spot: 140, gexExposure: 10 },
        ], 107);

        expect(gammaFlip.strike).toBe(110);
        expect(gammaFlip.gexExposure).toBe(0);
        expect(gammaFlip.crossings).toEqual([90, 110, 130]);
    });

    it('interpolates Vanna contour strike and DTE from fractional grid coordinates', () => {
        const grid: TerrainSurfaceCell[][] = [
            [
                terrainCell({ strike: 100, dte: 10, vannaExposure: -100 }),
                terrainCell({ strike: 250, dte: 10, vannaExposure: 100 }),
            ],
            [
                terrainCell({ strike: 100, dte: 40, vannaExposure: -100, expiry: '26JUN26' }),
                terrainCell({ strike: 250, dte: 40, vannaExposure: 100, expiry: '26JUN26' }),
            ],
        ];

        const zeroContour = buildVannaContours(grid, 100).find((contour) => contour.threshold === 0);
        const interpolatedPoint = zeroContour?.points.find((point) => point.strike > 100 && point.strike < 250);

        expect(interpolatedPoint).toBeDefined();
        expect(interpolatedPoint?.strike).toBeGreaterThan(100);
        expect(interpolatedPoint?.strike).toBeLessThan(250);
        expect(interpolatedPoint?.dte).toBeGreaterThanOrEqual(10);
        expect(interpolatedPoint?.dte).toBeLessThanOrEqual(40);
        expect(interpolatedPoint?.x).toEqual(expect.any(Number));
        expect(interpolatedPoint?.y).toEqual(expect.any(Number));
    });

    it('scopes displayed axes, cells, and scales to the nearest 10 expiries while structural analytics stay full-chain', () => {
        const displayedOptions = buildDisplayedScopeOptions();
        const hiddenOptions = [
            option({
                instrument: 'BTC-31DEC27-74000-C',
                strike: 74000,
                type: 'call',
                openInterest: 1_000_000,
                ivPercent: 80,
                expiryStr: '31DEC27',
                expiryDate: dateForDte(720),
                dte: 720,
            }),
            option({
                instrument: 'BTC-31DEC27-62000-P',
                strike: 62000,
                type: 'put',
                openInterest: 1_000_000,
                ivPercent: 80,
                expiryStr: '31DEC27',
                expiryDate: dateForDte(720),
                dte: 720,
            }),
        ];
        const visibleOnlyResponse = buildTerrainDataContract({
            spotPrice: 68000,
            now,
            dataMode: 'LIVE',
            options: displayedOptions,
        });
        const fullChainOptions = [...displayedOptions, ...hiddenOptions];
        const response = buildTerrainDataContract({
            spotPrice: 68000,
            now,
            dataMode: 'LIVE',
            options: fullChainOptions,
        });
        const expectedFullChainGammaFlip = calculatePortfolioGammaFlip(fullChainOptions, 68000);

        expect(response.expirations).toHaveLength(10);
        expect(response.expirations).toEqual(visibleOnlyResponse.expirations);
        expect(response.maxPainByExpiry).toHaveLength(11);
        expect(response.strikes).toEqual(visibleOnlyResponse.strikes);
        expect(response.strikes).not.toContain(62000);
        expect(response.strikes).not.toContain(74000);
        expect(response.surfaceGrid).toHaveLength(response.expirations.length);
        expect(response.surfaceGrid.every((row) => row.length === response.strikes.length)).toBe(true);

        expect(response.scales.gex).toEqual(visibleOnlyResponse.scales.gex);
        expect(response.scales.vanna).toEqual(visibleOnlyResponse.scales.vanna);
        expect(response.scales.charm).toEqual(visibleOnlyResponse.scales.charm);
        expect(response.scales.openInterest).toEqual(visibleOnlyResponse.scales.openInterest);

        const hiddenCall = response.keyContracts.find((contract) => contract.instrument === 'BTC-31DEC27-74000-C');
        const hiddenPut = response.keyContracts.find((contract) => contract.instrument === 'BTC-31DEC27-62000-P');
        expect(Math.abs(hiddenCall?.gexExposure ?? 0)).toBeGreaterThan(response.scales.gex.robustAbsMax);
        expect(Math.abs(hiddenCall?.vannaExposure ?? 0)).toBeGreaterThan(response.scales.vanna.robustAbsMax);
        expect(Math.abs(hiddenPut?.charmExposure ?? 0)).toBeGreaterThan(response.scales.charm.robustAbsMax);

        expect(response.keyLevels.callWall.strike).toBe(74000);
        expect(response.keyLevels.callWall.exposure).toBeGreaterThan(visibleOnlyResponse.keyLevels.callWall.exposure);
        expect(response.keyLevels.putWall.strike).toBe(62000);
        expect(Math.abs(response.keyLevels.putWall.exposure)).toBeGreaterThan(Math.abs(visibleOnlyResponse.keyLevels.putWall.exposure));
        expect(response.keyLevels.gammaFlip).toEqual(expectedFullChainGammaFlip);
    });
});

function terrainCell(params: {
    strike: number;
    dte: number;
    vannaExposure: number;
    expiry?: string;
}): TerrainSurfaceCell {
    return {
        strike: params.strike,
        expiry: params.expiry ?? '27MAR26',
        dte: params.dte,
        observed: true,
        rawDelta: 0,
        rawGamma: 0,
        rawVanna: 0,
        rawCharm: 0,
        gexExposure: 0,
        vannaExposure: params.vannaExposure,
        charmExposure: 0,
        callGexExposure: 0,
        putGexExposure: 0,
        openInterestBtc: 0,
        openInterestUsd: 0,
        iv: 50,
        gexIntensity: 0,
        vannaIntensity: Math.abs(params.vannaExposure),
        charmIntensity: 0,
        oiIntensity: 0,
        gexBand: 'LOW',
        vannaBand: 'LOW',
        charmBand: 'LOW',
        oiBand: 'LOW',
        confluenceScore: 0,
        confluenceBand: 'LOW',
        behaviorZone: 'NEUTRAL',
        gex: 0,
        callGex: 0,
        putGex: 0,
        openInterest: 0,
        gamma: 0,
    };
}

function buildDisplayedScopeOptions(): NormalizedDeribitOption[] {
    const options: NormalizedDeribitOption[] = [];
    for (let dte = 1; dte <= 10; dte++) {
        const expiryStr = `${dte}D`;
        const expiryDateForOption = dateForDte(dte);
        options.push(
            option({
                instrument: `BTC-${expiryStr}-66000-P`,
                strike: 66000,
                type: 'put',
                openInterest: 12 + dte,
                ivPercent: 52,
                expiryStr,
                expiryDate: expiryDateForOption,
                dte,
            }),
            option({
                instrument: `BTC-${expiryStr}-68000-C`,
                strike: 68000,
                type: 'call',
                openInterest: 16 + dte,
                ivPercent: 50,
                expiryStr,
                expiryDate: expiryDateForOption,
                dte,
            }),
            option({
                instrument: `BTC-${expiryStr}-70000-C`,
                strike: 70000,
                type: 'call',
                openInterest: 10 + dte,
                ivPercent: 54,
                expiryStr,
                expiryDate: expiryDateForOption,
                dte,
            })
        );
    }
    return options;
}

function dateForDte(dte: number): Date {
    return new Date(now.getTime() + dte * 24 * 60 * 60 * 1000);
}
