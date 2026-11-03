import { describe, expect, it } from 'vitest';
import {
    FootprintCellV1,
    FootprintCellV1Schema,
    MarketEvidenceV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
} from './contracts';
import {
    calculateDiagonalImbalance,
    calculateOrderFlowImbalance,
    calculateQueueImbalance,
    convertMicrostructureToMarketEvidence,
    detectProbableReplenishment,
    detectStackedImbalances,
    estimateAddPull,
    trackLiquidityPersistence,
} from './microstructure';
import {
    AddPullEventV1Schema,
    DEFAULT_IMBALANCE_CONFIG,
    LiquidityPersistenceV1Schema,
    OrderFlowImbalanceV1Schema,
    ProbableReplenishmentV1Schema,
    QueueImbalanceWindowV1Schema,
    StackedImbalanceZoneV1Schema,
} from './microstructure-contracts';

function makeCell(
    priceLow: number,
    priceHigh: number,
    buyNotional: number,
    sellNotional: number,
): FootprintCellV1 {
    const totalNotionalUsd = buyNotional + sellNotional;
    const deltaNotionalUsd = buyNotional - sellNotional;
    return FootprintCellV1Schema.parse({
        priceLow,
        priceHigh,
        priceMid: (priceLow + priceHigh) / 2,
        buyVolumeBtc: buyNotional / 100_000,
        sellVolumeBtc: sellNotional / 100_000,
        buyNotionalUsd: buyNotional,
        sellNotionalUsd: sellNotional,
        totalNotionalUsd,
        deltaNotionalUsd,
        tradeCount: 10,
        buyImbalance: false,
        sellImbalance: false,
        imbalanceRatio: null,
    });
}

describe('UX16.4 Microstructure Engine & Contracts', () => {
    describe('12.3 Diagonal and Stacked Imbalance', () => {
        it('matches hand-calculated diagonal imbalance fixture', () => {
            const cells = [
                makeCell(100, 105, 10_000, 50_000),   // Row 0: sell = 50k
                makeCell(105, 110, 200_000, 15_000),  // Row 1: buy = 200k, sell = 15k
                makeCell(110, 115, 30_000, 300_000),  // Row 2: buy = 30k, sell = 300k
            ];

            const result = calculateDiagonalImbalance(cells, {
                ratioThreshold: 3.0,
                minDominantNotionalUsd: 50_000,
                minDeltaNotionalUsd: 25_000,
            });

            expect(result).toHaveLength(3);

            // Row 1 Buy comparison: ask(Row 1: 200k) / bid(Row 0: 50k) = 4.0 >= 3.0
            // Delta: 200k - 50k = 150k >= 25k -> QUALIFIES
            expect(result[1].buyImbalance).toBe(true);
            expect(result[1].sellImbalance).toBe(false);
            expect(result[1].imbalanceRatio).toBe(4.0);

            // Row 0 has no row below -> cannot have buy imbalance
            expect(result[0].buyImbalance).toBe(false);

            // Row 2 Sell comparison: bid(Row 2: 300k) vs ask above (none) -> no sell imbalance
            expect(result[2].sellImbalance).toBe(false);
        });

        it('rejects small-volume ratios even when ratio exceeds threshold', () => {
            const cells = [
                makeCell(100, 105, 5, 1),    // Row 0: sell = $1
                makeCell(105, 110, 10, 2),   // Row 1: buy = $10 (ratio 10.0 vs $1!)
            ];

            const result = calculateDiagonalImbalance(cells, {
                ratioThreshold: 3.0,
                minDominantNotionalUsd: 50_000, // min $50k required
            });

            // Ratio is 10.0, but dominant volume is $10 << $50,000 -> must NOT qualify
            expect(result[1].buyImbalance).toBe(false);
            expect(result[1].imbalanceRatio).toBeNull();
        });

        it('honors ignoreZeroComparisons setting', () => {
            const cells = [
                makeCell(100, 105, 10_000, 0),       // Row 0: sell = 0
                makeCell(105, 110, 100_000, 10_000), // Row 1: buy = 100k
            ];

            // When ignoreZeroComparisons = true (default), 100k / 0 does not qualify
            const defaultResult = calculateDiagonalImbalance(cells, {
                ignoreZeroComparisons: true,
                minDominantNotionalUsd: 50_000,
            });
            expect(defaultResult[1].buyImbalance).toBe(false);

            // When ignoreZeroComparisons = false, 100k qualifies because dominant volume >= 50k
            const allowZeroResult = calculateDiagonalImbalance(cells, {
                ignoreZeroComparisons: false,
                minDominantNotionalUsd: 50_000,
            });
            expect(allowZeroResult[1].buyImbalance).toBe(true);
        });

        it('detects stacked imbalance requiring adjacent rows', () => {
            // Create 3 adjacent buy-imbalanced rows
            const cells = [
                makeCell(100, 105, 10_000, 20_000),
                makeCell(105, 110, 100_000, 20_000), // 100k / 20k = 5.0 (buy)
                makeCell(110, 115, 120_000, 20_000), // 120k / 20k = 6.0 (buy)
                makeCell(115, 120, 150_000, 20_000), // 150k / 20k = 7.5 (buy)
                makeCell(120, 125, 20_000, 10_000),
            ];

            const imbalanced = calculateDiagonalImbalance(cells);
            const zones = detectStackedImbalances(imbalanced, 1_700_000_000_000, 3);

            expect(zones).toHaveLength(1);
            expect(zones[0].side).toBe('BUY');
            expect(zones[0].rowCount).toBe(3);
            expect(zones[0].priceLow).toBe(105);
            expect(zones[0].priceHigh).toBe(120);
            expect(zones[0].dominantNotionalUsd).toBe(370_000);
        });

        it('does not qualify non-adjacent rows as stacked imbalance', () => {
            const cells = [
                makeCell(100, 105, 10_000, 20_000),
                makeCell(105, 110, 100_000, 20_000), // buy imbal
                makeCell(110, 115, 10_000, 50_000),  // NOT imbalanced (neutral)
                makeCell(115, 120, 150_000, 20_000), // buy imbal
            ];

            const imbalanced = calculateDiagonalImbalance(cells);
            const zones = detectStackedImbalances(imbalanced, 1_700_000_000_000, 3);

            // Only 1 at row 1 and 1 at row 3; neither forms 3 consecutive adjacent rows
            expect(zones).toHaveLength(0);
        });
    });

    describe('12.6 Queue Imbalance', () => {
        it('calculates queue imbalance across 5, 10, 25 bps windows and labels window', () => {
            const mid = 100_000;
            const bids = [
                { price: 99_980, notional: 2_000_000 }, // -2 bps (in 5, 10, 25)
                { price: 99_920, notional: 1_000_000 }, // -8 bps (in 10, 25)
                { price: 99_800, notional: 1_000_000 }, // -20 bps (in 25)
            ];
            const asks = [
                { price: 100_020, notional: 1_000_000 }, // +2 bps (in 5, 10, 25)
                { price: 100_080, notional: 1_000_000 }, // +8 bps (in 10, 25)
                { price: 100_200, notional: 2_000_000 }, // +20 bps (in 25)
            ];

            const windows = calculateQueueImbalance(bids, asks, mid, 1_700_000_000_000);
            expect(windows).toHaveLength(3);

            // 5 bps window: bids = 2M, asks = 1M -> imbalance = (2M - 1M) / 3M = 0.3333
            expect(windows[0].windowBps).toBe(5);
            expect(windows[0].bidDepthNotionalUsd).toBe(2_000_000);
            expect(windows[0].askDepthNotionalUsd).toBe(1_000_000);
            expect(windows[0].imbalance).toBeCloseTo(0.3333, 2);

            // 10 bps window: bids = 3M, asks = 2M -> imbalance = (3M - 2M) / 5M = 0.20
            expect(windows[1].windowBps).toBe(10);
            expect(windows[1].imbalance).toBe(0.2);

            // 25 bps window: bids = 4M, asks = 4M -> imbalance = 0.0
            expect(windows[2].windowBps).toBe(25);
            expect(windows[2].imbalance).toBe(0);
        });
    });

    describe('12.7 Order Flow Imbalance (OFI)', () => {
        it('calculates Cont-style OFI on book state changes', () => {
            const prevBook = {
                bidPrice: 100_000,
                bidQty: 10,
                askPrice: 100_010,
                askQty: 10,
                timestamp: 1_000,
            };

            // Bid price improved from 100,000 to 100,005 with 15 BTC qty (bullish demand increase)
            const currBook = {
                bidPrice: 100_005,
                bidQty: 15,
                askPrice: 100_010,
                askQty: 10,
                timestamp: 2_000,
            };

            const ofi = calculateOrderFlowImbalance(prevBook, currBook);
            expect(ofi.rawOfi).toBe(15);
            expect(ofi.normalizedOfi).toBeGreaterThan(0);
            expect(ofi.sequenceValid).toBe(true);
        });
    });

    describe('12.8 Liquidity Persistence', () => {
        it('uses continuous time and not message count', () => {
            // Case A: 2 observations spanning 20 seconds
            const longDurationObs = [
                { priceBucket: 100_000, side: 'BID' as const, notionalUsd: 500_000, timestamp: 0 },
                { priceBucket: 100_000, side: 'BID' as const, notionalUsd: 500_000, timestamp: 20_000 },
            ];
            const persistentResult = trackLiquidityPersistence(longDurationObs, {
                minPersistenceMs: 15_000,
                notionalThresholdUsd: 300_000,
            });
            expect(persistentResult[0].persistenceMs).toBe(20_000);
            expect(persistentResult[0].isPersistent).toBe(true);

            // Case B: 50 observations spanning only 1 second (high frequency noise)
            const highFreqObs = Array.from({ length: 50 }, (_, i) => ({
                priceBucket: 100_000,
                side: 'BID' as const,
                notionalUsd: 500_000,
                timestamp: i * 20, // 0ms to 980ms
            }));
            const noiseResult = trackLiquidityPersistence(highFreqObs, {
                minPersistenceMs: 15_000,
                notionalThresholdUsd: 300_000,
            });
            expect(noiseResult[0].persistenceMs).toBe(980);
            expect(noiseResult[0].isPersistent).toBe(false); // DOES NOT qualify despite 50 observations!
        });
    });

    describe('12.9 Add and Pull Events', () => {
        it('correctly attributes pulls excluding observed executions', () => {
            // Depth decreased from 500k to 300k (200k removed)
            // But 200k was consumed by executed aggressive trades!
            const tradeConsumed = estimateAddPull(500_000, 300_000, 200_000, 100_000, 'BID', 1_000);
            expect(tradeConsumed.estimatedRemoveUsd).toBe(200_000);
            expect(tradeConsumed.observedExecutionUsd).toBe(200_000);
            expect(tradeConsumed.estimatedPullUsd).toBe(0); // 0 pulled; it was legitimately filled!
            expect(tradeConsumed.isEstimated).toBe(true);

            // Depth decreased from 500k to 300k (200k removed), but only 20k was executed!
            // 180k was pulled/cancelled!
            const cancelled = estimateAddPull(500_000, 300_000, 20_000, 100_000, 'BID', 1_000);
            expect(cancelled.estimatedPullUsd).toBe(180_000);
            expect(cancelled.isEstimated).toBe(true);
        });
    });

    describe('12.10 Probable Replenishment', () => {
        it('qualifies replenishment and strictly labels PROBABLE_REPLENISHMENT', () => {
            const execution = {
                priceBucket: 100_000,
                side: 'BID' as const,
                notionalUsd: 250_000,
                timestamp: 1_000,
            };

            const subsequentDepths = [
                { depthUsd: 50_000, timestamp: 1_200 },
                { depthUsd: 260_000, timestamp: 1_800 }, // refilled within 800ms
                { depthUsd: 260_000, timestamp: 2_500 },
            ];

            const rep = detectProbableReplenishment(execution, subsequentDepths, {
                maxWindowMs: 5_000,
                minRefillRatio: 0.8,
            });

            expect(rep).not.toBeNull();
            expect(rep?.label).toBe('PROBABLE_REPLENISHMENT'); // NON-NEGOTIABLE PRINCIPLE
            expect(rep?.refillRatio).toBe(1.04);
            expect(rep?.timeToRefillMs).toBe(800);
            expect(rep?.sequenceValid).toBe(true);
        });

        it('rejects candidate if refill occurs outside configured window', () => {
            const execution = {
                priceBucket: 100_000,
                side: 'BID' as const,
                notionalUsd: 250_000,
                timestamp: 1_000,
            };

            // Refill occurs at 10,000ms (> 5,000ms window)
            const subsequentDepths = [
                { depthUsd: 260_000, timestamp: 10_000 },
            ];

            const rep = detectProbableReplenishment(execution, subsequentDepths, {
                maxWindowMs: 5_000,
            });

            expect(rep).toBeNull();
        });
    });

    describe('MarketEvidenceV1 Conversion', () => {
        it('converts detected microstructure events to valid MarketEvidenceV1', () => {
            const coverage = {
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                dataMode: 'SHADOW' as const,
                source: 'BINANCE_SPOT' as const,
                venue: 'BINANCE_SPOT' as const,
                symbol: 'BTCUSDT' as const,
                capturedAt: 1_700_000_000_000,
                eventTime: 1_700_000_000_000,
                coverageStart: 1_699_990_000_000,
                coverageEnd: 1_700_000_000_000,
                freshnessMs: 50,
                sequenceState: 'LIVE' as const,
                gapCount: 0,
                precision: 'TRADE' as const,
                approximation: 'NONE' as const,
                quality: 'HIGH' as const,
            };

            const zones = [
                StackedImbalanceZoneV1Schema.parse({
                    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                    side: 'BUY',
                    priceLow: 100_000,
                    priceHigh: 100_030,
                    rowCount: 3,
                    totalNotionalUsd: 500_000,
                    dominantNotionalUsd: 400_000,
                    meanRatio: 4.5,
                    candleOpenTime: 1_700_000_000_000,
                }),
            ];

            const evidence = convertMicrostructureToMarketEvidence({
                stackedZones: zones,
                coverage,
            });

            expect(evidence).toHaveLength(1);
            expect(evidence[0].kind).toBe('STACKED_BUY_IMBALANCE');
            expect(evidence[0].direction).toBe('BULLISH');
            expect(MarketEvidenceV1Schema.safeParse(evidence[0]).success).toBe(true);
        });
    });
});
