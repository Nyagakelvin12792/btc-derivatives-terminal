import { describe, expect, it } from 'vitest';
import type { NormalizedDeribitOption, OptionType } from '@/lib/deribit/types';
import {
    buildDemoTerrainDataContract,
    buildTerrainDataContract,
    calculateCharmExposureUsdPerDay,
    calculateConfluenceScore,
    calculateGexExposureUsdPerOnePercentMove,
    calculateIntensity,
    calculateVannaExposureUsdPerVolPoint,
    classifyDealerBehavior,
    intensityBand,
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
    dte?: number;
}): NormalizedDeribitOption {
    const dte = params.dte ?? 85.333;
    const ivPercent = params.ivPercent ?? 55;
    return {
        instrument: params.instrument,
        currency: 'BTC',
        expiryStr: params.expiryStr ?? '27MAR26',
        expiryDate,
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
        expect(response.maxPainByExpiry).toHaveLength(2);
        expect(response.confluenceLevels[0].confluenceScore).toBeGreaterThanOrEqual(
            response.confluenceLevels.at(-1)?.confluenceScore ?? 0
        );
        expect(response.vannaContours.length).toBeGreaterThan(0);
        expect(response.charmGlyphs.every((glyph) => glyph.intensity >= 25)).toBe(true);
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
});
