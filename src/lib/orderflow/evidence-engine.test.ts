import { describe, expect, it } from 'vitest';
import {
    ORDERFLOW_SCHEMA_VERSION,
    type FootprintBarV1,
    type FootprintCellV1,
} from './contracts';
import { createCaptureCoverageV1 } from './provenance';
import {
    buildDecisionZones,
    canSatisfyMandatoryGate,
    createFlowEvidenceSnapshot,
    detectAbsorption,
    detectAcceptance,
    detectCvdDivergence,
    reconcileAbsorptionAndAcceptance,
    synthesizeFlowEvidence,
} from './evidence-engine';
import {
    AbsorptionObservationV1Schema,
    AcceptanceObservationV1Schema,
    CvdDivergenceV1Schema,
    DecisionZoneV1Schema,
} from './evidence-contracts';

const validCoverage = createCaptureCoverageV1({
    dataMode: 'LIVE',
    source: 'BINANCE_SPOT',
    venue: 'BINANCE_SPOT',
    symbol: 'BTCUSDT',
    capturedAt: 100_500,
    eventTime: 100_000,
    coverageStart: 60_000,
    coverageEnd: 100_000,
    sequenceState: 'LIVE',
    gapCount: 0,
    precision: 'TRADE',
    approximation: 'NONE',
});

function createMockBar(partial: {
    openTime: number;
    closeTime: number;
    low?: number;
    high?: number;
    buyNotionalUsd?: number;
    sellNotionalUsd?: number;
    deltaNotionalUsd?: number;
    cells?: FootprintCellV1[];
}): FootprintBarV1 {
    const low = partial.low ?? 69950;
    const high = partial.high ?? 70050;
    const buyNotional = partial.buyNotionalUsd ?? 350000;
    const sellNotional = partial.sellNotionalUsd ?? 350000;
    const totalNotional = buyNotional + sellNotional;
    const deltaNotional = partial.deltaNotionalUsd ?? (buyNotional - sellNotional);

    const cell: FootprintCellV1 = {
        priceLow: low,
        priceHigh: high,
        priceMid: (low + high) / 2,
        buyVolumeBtc: 5,
        sellVolumeBtc: 5,
        buyNotionalUsd: buyNotional,
        sellNotionalUsd: sellNotional,
        totalNotionalUsd: totalNotional,
        deltaNotionalUsd: deltaNotional,
        tradeCount: 100,
        buyImbalance: false,
        sellImbalance: false,
        imbalanceRatio: 1.0,
    };

    return {
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        openTime: partial.openTime,
        closeTime: partial.closeTime,
        interval: '1m',
        priceBucket: 50,
        cells: partial.cells ?? [cell],
        totalNotionalUsd: totalNotional,
        deltaNotionalUsd: deltaNotional,
        pocPrice: (low + high) / 2,
        minRunningDeltaUsd: Math.min(0, deltaNotional),
        maxRunningDeltaUsd: Math.max(0, deltaNotional),
        coverage: validCoverage,
    };
}

describe('UX16.5 Flow Evidence Engine', () => {
    describe('1. Decision Zone Construction & Confluence (Section 13)', () => {
        it('builds decision zones with tolerance bands and deterministic merging', () => {
            const zones = buildDecisionZones({
                spotPrice: 70000,
                toleranceBps: 0.002, // 20 bps = $140
                optionsLevels: {
                    callWall: 72000,
                    putWall: 68000,
                    gammaFlip: 69900,
                },
                volumeProfile: {
                    poc: 70000, // Near gammaFlip 69900 (within $140), should merge!
                    vah: 72050, // Near callWall 72000 (within $140), should merge!
                    val: 67950, // Near putWall 68000, should merge!
                    isApproximate: false,
                },
            });

            expect(zones.length).toBeGreaterThan(0);
            zones.forEach((z) => {
                expect(() => DecisionZoneV1Schema.parse(z)).not.toThrow();
            });

            // Find merged zone around $70,000 (Gamma Flip + Volume POC)
            const zone70k = zones.find((z) => z.priceLow <= 70000 && z.priceHigh >= 70000);
            expect(zone70k).toBeDefined();
            expect(zone70k?.sources).toContain('OPTIONS');
            expect(zone70k?.sources).toContain('VOLUME_PROFILE');
            expect(zone70k?.contributors.length).toBeGreaterThanOrEqual(2);
            expect(zone70k?.strengthScore).toBeGreaterThan(80);
        });

        it('tracks approximate provenance and enforces that approximate VP cannot satisfy a mandatory gate', () => {
            const zones = buildDecisionZones({
                spotPrice: 70000,
                volumeProfile: {
                    poc: 70000,
                    isApproximate: true,
                },
            });

            expect(zones.length).toBe(1);
            expect(zones[0].isApproximate).toBe(true);

            // Mandatory Gate Rule Check:
            const gateResult = canSatisfyMandatoryGate(zones[0]);
            expect(gateResult.allowed).toBe(false);
            expect(gateResult.reasonCode).toBe('APPROXIMATE_VP_CANNOT_SATISFY_MANDATORY_GATE');

            // Exact zone check:
            const exactZones = buildDecisionZones({
                spotPrice: 70000,
                optionsLevels: {
                    callWall: 72000,
                },
                volumeProfile: {
                    poc: 70000,
                    isApproximate: false,
                },
            });
            const exactResult = canSatisfyMandatoryGate(exactZones[0]);
            expect(exactResult.allowed).toBe(true);
        });
    });

    describe('2. Absorption Detection Gates (Section 12.11)', () => {
        const testZones = buildDecisionZones({
            spotPrice: 70000,
            toleranceBps: 0.002, // 140 usd
            optionsLevels: {
                putWall: 68000,
                callWall: 72000,
            },
        });

        it('REJECTS absorption outside a decision zone in production mode', () => {
            // Price is at 69500 (nowhere near putWall 68000 or callWall 72000)
            const unzonedBar = createMockBar({
                openTime: 1700000000000,
                closeTime: 1700000060000,
                low: 69490,
                high: 69520,
                sellNotionalUsd: 150000, // Heavy sell volume
                buyNotionalUsd: 20000,
            });

            // Production mode = true
            const absorptionsProd = detectAbsorption({
                bars: [unzonedBar],
                decisionZones: testZones,
                isProduction: true,
                minAggressiveVolumeUsd: 50000,
            });

            expect(absorptionsProd).toHaveLength(0); // STRICT GATE: Must not fire outside decision zone in production!

            // Non-production mode allows unzoned exploration
            const absorptionsDev = detectAbsorption({
                bars: [unzonedBar],
                decisionZones: testZones,
                isProduction: false,
                minAggressiveVolumeUsd: 50000,
            });
            expect(absorptionsDev.length).toBeGreaterThanOrEqual(1);
            expect(absorptionsDev[0].zoneId).toBe('UNZONED');
        });

        it('REJECTS absorption without aggressive execution volume', () => {
            // Price is inside putWall zone (68000), but volume is tiny
            const lowVolumeBar = createMockBar({
                openTime: 1700000000000,
                closeTime: 1700000060000,
                low: 67990,
                high: 68020,
                sellNotionalUsd: 10000, // Below minAggressiveVolumeUsd (50,000)
                buyNotionalUsd: 5000,
            });

            const absorptions = detectAbsorption({
                bars: [lowVolumeBar],
                decisionZones: testZones,
                isProduction: true,
                minAggressiveVolumeUsd: 50000,
            });

            expect(absorptions).toHaveLength(0); // Cannot fire without aggressive volume!
        });

        it('FIRES bullish absorption when price is in decision zone with aggressive sell volume and small price displacement', () => {
            const absorbedBar = createMockBar({
                openTime: 1700000000000,
                closeTime: 1700000060000,
                low: 67990,
                high: 68030,
                sellNotionalUsd: 250000, // Aggressive sellers
                buyNotionalUsd: 50000,   // Negative delta
            });

            const absorptions = detectAbsorption({
                bars: [absorbedBar],
                decisionZones: testZones,
                isProduction: true,
                minAggressiveVolumeUsd: 50000,
                minAbsorptionRatio: 2.0,
                maxDisplacementUsd: 100,
            });

            expect(absorptions).toHaveLength(1);
            const abs = absorptions[0];
            expect(() => AbsorptionObservationV1Schema.parse(abs)).not.toThrow();
            expect(abs.side).toBe('BULLISH');
            expect(abs.zoneId).toContain('dz-put-wall');
            expect(abs.aggressiveVolumeUsd).toBe(250000);
            expect(abs.reasonCodes).toContain('ABSORPTION_IN_DECISION_ZONE');
            expect(abs.reasonCodes).toContain('HIGH_AGGRESSIVE_SELL_VOLUME');
            expect(abs.sourceRefs.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('3. Acceptance & Mutual Exclusion (Section 12.12)', () => {
        const testZones = buildDecisionZones({
            spotPrice: 70000,
            optionsLevels: {
                putWall: 68000,
            },
        });

        it('detects acceptance below when price breaks and closes below zone with dwell duration', () => {
            const putZone = testZones[0];
            const breakdownBars = [
                createMockBar({
                    openTime: 1700000000000,
                    closeTime: 1700000060000,
                    low: putZone.priceLow - 50,
                    high: putZone.priceLow - 5,
                    sellNotionalUsd: 100000,
                    buyNotionalUsd: 20000,
                }),
                createMockBar({
                    openTime: 1700000060000,
                    closeTime: 1700000120000,
                    low: putZone.priceLow - 80,
                    high: putZone.priceLow - 30,
                    sellNotionalUsd: 80000,
                    buyNotionalUsd: 15000,
                }),
            ];

            const acceptances = detectAcceptance({
                bars: breakdownBars,
                decisionZones: testZones,
                minBreakoutVolumeUsd: 50000,
                minDwellMs: 60000,
            });

            expect(acceptances).toHaveLength(1);
            const acc = acceptances[0];
            expect(() => AcceptanceObservationV1Schema.parse(acc)).not.toThrow();
            expect(acc.side).toBe('BELOW');
            expect(acc.closedBeyond).toBe(true);
            expect(acc.reasonCodes).toContain('PRICE_CLOSED_BEYOND_ZONE');
            expect(acc.sourceRefs.length).toBeGreaterThanOrEqual(1);
        });

        it('enforces that acceptance and absorption CANNOT both remain active for the same side/level/time window', () => {
            const putZone = testZones[0];

            // Bullish absorption at putZone
            const mockAbsorption = AbsorptionObservationV1Schema.parse({
                id: 'abs-bullish-1',
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                side: 'BULLISH',
                zoneId: putZone.id,
                priceLow: putZone.priceLow,
                priceHigh: putZone.priceHigh,
                aggressiveVolumeUsd: 200000,
                aggressiveDeltaUsd: -150000,
                priceDisplacementUsd: 20,
                absorptionRatio: 10,
                startTime: 1700000000000,
                endTime: 1700000060000,
                hasLiquiditySupport: true,
                confirmations: ['DECISION_ZONE_PUT_WALL'],
                reasonCodes: ['ABSORPTION_IN_DECISION_ZONE'],
                sourceRefs: ['true-flow-footprint'],
            });

            // Acceptance below putZone during the same window
            const mockAcceptance = AcceptanceObservationV1Schema.parse({
                id: 'acc-below-1',
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                side: 'BELOW',
                zoneId: putZone.id,
                levelPrice: putZone.priceLow,
                breakoutVolumeUsd: 150000,
                breakoutDeltaUsd: -120000,
                dwellDurationMs: 60000,
                closedBeyond: true,
                startTime: 1700000000000,
                endTime: 1700000060000,
                reasonCodes: ['PRICE_CLOSED_BEYOND_ZONE'],
                sourceRefs: ['true-flow-footprint'],
            });

            // Reconcile
            const { reconciledAbsorptions, reconciledAcceptances } = reconcileAbsorptionAndAcceptance(
                [mockAbsorption],
                [mockAcceptance]
            );

            // Absorption must be revoked because acceptance broke the zone!
            expect(reconciledAbsorptions).toHaveLength(0);
            expect(reconciledAcceptances).toHaveLength(1);
        });
    });

    describe('4. CVD Divergence & Compared Pivots (Section 12.13)', () => {
        it('detects bullish CVD divergence and exposes all 4 compared pivots for auditability', () => {
            const candles = [
                { openTime: 1000, closeTime: 2000, open: 70000, high: 70100, low: 69900, close: 70000 },
                { openTime: 2000, closeTime: 3000, open: 70000, high: 70050, low: 69800, close: 69850 }, // Swing Low 1 @ 69800
                { openTime: 3000, closeTime: 4000, open: 69850, high: 70200, low: 69850, close: 70150 },
                { openTime: 4000, closeTime: 5000, open: 70150, high: 70180, low: 69650, close: 69700 }, // Swing Low 2 @ 69650 (Lower low by $150)
                { openTime: 5000, closeTime: 6000, open: 69700, high: 70300, low: 69700, close: 70250 },
            ];

            const cvdPoints = [
                { time: 1000, cvd: -50000 },
                { time: 2000, cvd: -100000 }, // CVD @ Pivot 1: -100,000
                { time: 3000, cvd: -30000 },
                { time: 4000, cvd: -40000 },  // CVD @ Pivot 2: -40,000 (Higher Low: -40k > -100k)
                { time: 5000, cvd: 20000 },
            ];

            const divergences = detectCvdDivergence({
                candles,
                cvdPoints,
                minDisplacementUsd: 100,
            });

            expect(divergences).toHaveLength(1);
            const div = divergences[0];
            expect(() => CvdDivergenceV1Schema.parse(div)).not.toThrow();

            expect(div.kind).toBe('BULLISH_CVD_DIVERGENCE');
            // Auditability check: Exposes compared pivots!
            expect(div.pricePivot1.price).toBe(69800);
            expect(div.pricePivot2.price).toBe(69650);
            expect(div.cvdPivot1.value).toBe(-100000);
            expect(div.cvdPivot2.value).toBe(-40000);
            expect(div.priceDisplacementUsd).toBe(-150);
            expect(div.cvdDisplacementUsd).toBe(60000);

            // Auditability: reason codes and source references
            expect(div.reasonCodes).toContain('PRICE_LOWER_LOW');
            expect(div.reasonCodes).toContain('CVD_HIGHER_LOW');
            expect(div.sourceRefs).toContain('binance-spot-candles');
            expect(div.sourceRefs).toContain('true-trade-cvd');
        });
    });

    describe('5. Synthesized Flow Evidence & Snapshot Creation', () => {
        it('synthesizes validated MarketEvidenceV1 array and creates flow evidence snapshot', () => {
            const zones = buildDecisionZones({
                spotPrice: 70000,
                optionsLevels: { callWall: 72000 },
            });

            const snapshot = createFlowEvidenceSnapshot({
                zones,
                absorptions: [],
                acceptances: [],
                divergences: [],
                coverage: validCoverage,
            });

            expect(snapshot.zones.length).toBeGreaterThan(0);
            expect(snapshot.coverage.quality).toBe('HIGH');

            const marketEvidence = synthesizeFlowEvidence({
                zones,
                coverage: validCoverage,
            });

            expect(marketEvidence.length).toBeGreaterThan(0);
            marketEvidence.forEach((ev) => {
                expect(ev.reasonCodes.length).toBeGreaterThanOrEqual(1);
                expect(ev.sourceRefs.length).toBeGreaterThanOrEqual(1);
            });
        });
    });
});
