import {
    CaptureCoverageV1,
    FootprintCellV1,
    FootprintCellV1Schema,
    MarketEvidenceV1,
    MarketEvidenceV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
} from './contracts';
import {
    AddPullEventV1,
    AddPullEventV1Schema,
    DEFAULT_IMBALANCE_CONFIG,
    ImbalanceConfigV1,
    LiquidityPersistenceV1,
    LiquidityPersistenceV1Schema,
    OrderFlowImbalanceV1,
    OrderFlowImbalanceV1Schema,
    ProbableReplenishmentV1,
    ProbableReplenishmentV1Schema,
    QueueImbalanceWindowV1,
    QueueImbalanceWindowV1Schema,
    StackedImbalanceZoneV1,
    StackedImbalanceZoneV1Schema,
} from './microstructure-contracts';

export interface BookTop {
    bidPrice: number;
    bidQty: number;
    askPrice: number;
    askQty: number;
    timestamp: number;
}

export interface DepthObservation {
    priceBucket: number;
    side: 'BID' | 'ASK';
    notionalUsd: number;
    timestamp: number;
}

/**
 * Section 12.3: Pure Footprint Diagonal Imbalance calculation.
 * Compares aggressive buyers at price level i against aggressive sellers at level i - 1,
 * and aggressive sellers at price level i against aggressive buyers at level i + 1.
 */
export function calculateDiagonalImbalance(
    cells: readonly FootprintCellV1[],
    config: Partial<ImbalanceConfigV1> = {},
): FootprintCellV1[] {
    if (!cells.length) return [];

    const cfg: ImbalanceConfigV1 = {
        ...DEFAULT_IMBALANCE_CONFIG,
        ...config,
    };

    // Ensure cells are sorted strictly ascending by price
    const sorted = [...cells].sort((left, right) => left.priceMid - right.priceMid);
    const n = sorted.length;

    return sorted.map((cell, i) => {
        const askExecuted = cell.buyNotionalUsd;
        const bidExecuted = cell.sellNotionalUsd;

        // Buy Imbalance: Ask(i) vs Bid(i - 1)
        let buyQualifies = false;
        let buyRatio: number | null = null;
        if (i > 0) {
            const bidBelow = sorted[i - 1].sellNotionalUsd;
            if (bidBelow > 0) {
                const ratio = askExecuted / bidBelow;
                if (
                    ratio >= cfg.ratioThreshold &&
                    askExecuted >= cfg.minDominantNotionalUsd &&
                    askExecuted - bidBelow >= cfg.minDeltaNotionalUsd
                ) {
                    buyQualifies = true;
                    buyRatio = Math.round(ratio * 100) / 100;
                }
            } else if (!cfg.ignoreZeroComparisons && askExecuted >= cfg.minDominantNotionalUsd) {
                buyQualifies = true;
                buyRatio = 99.99;
            }
        }

        // Sell Imbalance: Bid(i) vs Ask(i + 1)
        let sellQualifies = false;
        let sellRatio: number | null = null;
        if (i < n - 1) {
            const askAbove = sorted[i + 1].buyNotionalUsd;
            if (askAbove > 0) {
                const ratio = bidExecuted / askAbove;
                if (
                    ratio >= cfg.ratioThreshold &&
                    bidExecuted >= cfg.minDominantNotionalUsd &&
                    bidExecuted - askAbove >= cfg.minDeltaNotionalUsd
                ) {
                    sellQualifies = true;
                    sellRatio = Math.round(ratio * 100) / 100;
                }
            } else if (!cfg.ignoreZeroComparisons && bidExecuted >= cfg.minDominantNotionalUsd) {
                sellQualifies = true;
                sellRatio = 99.99;
            }
        }

        // Mutual exclusion: cell cannot be both buy and sell imbalanced
        if (buyQualifies && sellQualifies) {
            if ((buyRatio ?? 0) >= (sellRatio ?? 0)) {
                sellQualifies = false;
                sellRatio = null;
            } else {
                buyQualifies = false;
                buyRatio = null;
            }
        }

        const imbalanceRatio = buyQualifies ? buyRatio : sellQualifies ? sellRatio : null;

        return FootprintCellV1Schema.parse({
            ...cell,
            buyImbalance: buyQualifies,
            sellImbalance: sellQualifies,
            imbalanceRatio,
        });
    });
}

/**
 * Section 12.3: Detect stacked imbalance zones (consecutive adjacent footprint rows).
 */
export function detectStackedImbalances(
    cells: readonly FootprintCellV1[],
    candleOpenTime: number,
    minStackedRows: number = 3,
): StackedImbalanceZoneV1[] {
    if (cells.length < minStackedRows) return [];
    const sorted = [...cells].sort((left, right) => left.priceMid - right.priceMid);
    const zones: StackedImbalanceZoneV1[] = [];

    let currentBuyRun: FootprintCellV1[] = [];
    let currentSellRun: FootprintCellV1[] = [];

    const flushRun = (run: FootprintCellV1[], side: 'BUY' | 'SELL') => {
        if (run.length >= minStackedRows) {
            const priceLow = Math.min(...run.map((c) => c.priceLow));
            const priceHigh = Math.max(...run.map((c) => c.priceHigh));
            const totalNotionalUsd = run.reduce((sum, c) => sum + c.totalNotionalUsd, 0);
            const dominantNotionalUsd = run.reduce(
                (sum, c) => sum + (side === 'BUY' ? c.buyNotionalUsd : c.sellNotionalUsd),
                0,
            );
            const ratios = run.map((c) => c.imbalanceRatio).filter((r): r is number => r !== null && Number.isFinite(r));
            const meanRatio = ratios.length ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length : 3.0;

            zones.push(
                StackedImbalanceZoneV1Schema.parse({
                    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                    side,
                    priceLow,
                    priceHigh,
                    rowCount: run.length,
                    totalNotionalUsd,
                    dominantNotionalUsd,
                    meanRatio: Math.round(meanRatio * 100) / 100,
                    candleOpenTime,
                }),
            );
        }
    };

    for (const cell of sorted) {
        if (cell.buyImbalance) {
            currentBuyRun.push(cell);
        } else {
            flushRun(currentBuyRun, 'BUY');
            currentBuyRun = [];
        }

        if (cell.sellImbalance) {
            currentSellRun.push(cell);
        } else {
            flushRun(currentSellRun, 'SELL');
            currentSellRun = [];
        }
    }

    flushRun(currentBuyRun, 'BUY');
    flushRun(currentSellRun, 'SELL');

    return zones;
}

/**
 * Section 12.6: Queue imbalance across declared basis-point windows (5, 10, 25 bps).
 */
export function calculateQueueImbalance(
    bids: readonly { price: number; notional: number }[],
    asks: readonly { price: number; notional: number }[],
    midPrice: number,
    timestamp: number,
    windowsBps: readonly number[] = [5, 10, 25],
): QueueImbalanceWindowV1[] {
    if (midPrice <= 0) return [];

    return windowsBps.map((windowBps) => {
        const bpsRatio = windowBps / 10_000;
        const minBid = midPrice * (1 - bpsRatio);
        const maxAsk = midPrice * (1 + bpsRatio);

        const bidDepthNotionalUsd = bids
            .filter((b) => b.price >= minBid && b.price <= midPrice)
            .reduce((sum, b) => sum + b.notional, 0);

        const askDepthNotionalUsd = asks
            .filter((a) => a.price <= maxAsk && a.price >= midPrice)
            .reduce((sum, a) => sum + a.notional, 0);

        const total = bidDepthNotionalUsd + askDepthNotionalUsd;
        const imbalance = total > 0 ? (bidDepthNotionalUsd - askDepthNotionalUsd) / total : 0;

        return QueueImbalanceWindowV1Schema.parse({
            windowBps,
            bidDepthNotionalUsd,
            askDepthNotionalUsd,
            imbalance: Math.max(-1, Math.min(1, Math.round(imbalance * 10_000) / 10_000)),
            timestamp,
        });
    });
}

/**
 * Section 12.7: Cont-style Order Flow Imbalance (OFI).
 * e_n = I(Pb_n >= Pb_prev)*Qb_n - I(Pb_n <= Pb_prev)*Qb_prev - I(Pa_n <= Pa_prev)*Qa_n + I(Pa_n >= Pa_prev)*Qa_prev
 */
export function calculateOrderFlowImbalance(
    prevBook: BookTop,
    currBook: BookTop,
    windowMs: number = 1_000,
): OrderFlowImbalanceV1 {
    const pbCurr = currBook.bidPrice;
    const pbPrev = prevBook.bidPrice;
    const qbCurr = currBook.bidQty;
    const qbPrev = prevBook.bidQty;

    const paCurr = currBook.askPrice;
    const paPrev = prevBook.askPrice;
    const qaCurr = currBook.askQty;
    const qaPrev = prevBook.askQty;

    let bidContribution = 0;
    if (pbCurr > pbPrev) {
        bidContribution = qbCurr;
    } else if (pbCurr === pbPrev) {
        bidContribution = qbCurr - qbPrev;
    } else {
        bidContribution = -qbPrev;
    }

    let askContribution = 0;
    if (paCurr < paPrev) {
        askContribution = -qaCurr;
    } else if (paCurr === paPrev) {
        askContribution = -(qaCurr - qaPrev);
    } else {
        askContribution = qaPrev;
    }

    const rawOfi = bidContribution + askContribution;
    const totalVolume = qbCurr + qbPrev + qaCurr + qaPrev;
    const normalizedOfi = totalVolume > 0 ? Math.max(-1, Math.min(1, rawOfi / totalVolume)) : 0;

    return OrderFlowImbalanceV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        eventTime: currBook.timestamp,
        rawOfi,
        normalizedOfi: Math.round(normalizedOfi * 10_000) / 10_000,
        windowMs,
        sequenceValid: true,
    });
}

/**
 * Section 12.8: Liquidity persistence tracked by continuous elapsed time, not message count.
 */
export function trackLiquidityPersistence(
    observations: readonly DepthObservation[],
    options: { minPersistenceMs?: number; notionalThresholdUsd?: number } = {},
): LiquidityPersistenceV1[] {
    const minPersistenceMs = options.minPersistenceMs ?? 15_000;
    const notionalThresholdUsd = options.notionalThresholdUsd ?? 250_000;

    // Group observations by key = `${side}-${priceBucket}`
    const groups = new Map<string, DepthObservation[]>();
    for (const obs of observations) {
        const key = `${obs.side}-${obs.priceBucket}`;
        const list = groups.get(key) ?? [];
        list.push(obs);
        groups.set(key, list);
    }

    const results: LiquidityPersistenceV1[] = [];
    for (const list of groups.values()) {
        if (!list.length) continue;
        list.sort((a, b) => a.timestamp - b.timestamp);

        const firstSeenTime = list[0].timestamp;
        const lastSeenTime = list[list.length - 1].timestamp;
        const persistenceMs = lastSeenTime - firstSeenTime;
        const notionals = list.map((o) => o.notionalUsd);
        const meanNotionalUsd = notionals.reduce((sum, n) => sum + n, 0) / notionals.length;
        const maxNotionalUsd = Math.max(...notionals);
        const endNotionalUsd = notionals[notionals.length - 1];

        // Continuous time above threshold
        let timeAboveThresholdMs = 0;
        for (let i = 0; i < list.length - 1; i += 1) {
            if (list[i].notionalUsd >= notionalThresholdUsd) {
                timeAboveThresholdMs += list[i + 1].timestamp - list[i].timestamp;
            }
        }

        const isPersistent = persistenceMs >= minPersistenceMs && maxNotionalUsd >= notionalThresholdUsd;

        results.push(
            LiquidityPersistenceV1Schema.parse({
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                priceBucket: list[0].priceBucket,
                side: list[0].side,
                firstSeenTime,
                lastSeenTime,
                persistenceMs,
                meanNotionalUsd: Math.round(meanNotionalUsd),
                maxNotionalUsd: Math.round(maxNotionalUsd),
                endNotionalUsd: Math.round(endNotionalUsd),
                timeAboveThresholdMs,
                isPersistent,
                sequenceValid: true,
            }),
        );
    }

    return results;
}

/**
 * Section 12.9: Add and Pull event estimation.
 * estimatedPull = max(0, estimatedRemove - observedExecutionAgainstLevel)
 */
export function estimateAddPull(
    prevDepthUsd: number,
    currDepthUsd: number,
    observedExecutionUsd: number,
    priceBucket: number,
    side: 'BID' | 'ASK',
    eventTime: number,
): AddPullEventV1 {
    const netBookChangeUsd = currDepthUsd - prevDepthUsd;
    const estimatedAddUsd = Math.max(0, netBookChangeUsd);
    const estimatedRemoveUsd = Math.max(0, -netBookChangeUsd);
    const estimatedPullUsd = Math.max(0, estimatedRemoveUsd - observedExecutionUsd);

    return AddPullEventV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        eventTime,
        priceBucket,
        side,
        netBookChangeUsd,
        estimatedAddUsd,
        estimatedRemoveUsd,
        observedExecutionUsd,
        estimatedPullUsd,
        isEstimated: true,
    });
}

/**
 * Section 12.10: Detect probable replenishment.
 * Requires execution against resting level, subsequent refill within time window,
 * and refill size exceeding minimum ratio.
 * Label is strictly PROBABLE_REPLENISHMENT; never ICEBERG_CONFIRMED.
 */
export function detectProbableReplenishment(
    execution: {
        priceBucket: number;
        side: 'BID' | 'ASK';
        notionalUsd: number;
        timestamp: number;
    },
    subsequentDepths: readonly { depthUsd: number; timestamp: number }[],
    options: { maxWindowMs?: number; minRefillRatio?: number; repeatCount?: number } = {},
): ProbableReplenishmentV1 | null {
    const maxWindowMs = options.maxWindowMs ?? 5_000;
    const minRefillRatio = options.minRefillRatio ?? 0.8;
    const repeatCount = options.repeatCount ?? 1;

    if (execution.notionalUsd <= 0 || !subsequentDepths.length) return null;

    // Filter depths occurring within maxWindowMs after the execution
    const validAfter = subsequentDepths.filter(
        (d) => d.timestamp > execution.timestamp && d.timestamp <= execution.timestamp + maxWindowMs,
    );
    if (!validAfter.length) return null;

    const maxRefilledDepth = Math.max(...validAfter.map((d) => d.depthUsd));
    const refillRatio = maxRefilledDepth / execution.notionalUsd;

    if (refillRatio < minRefillRatio) return null;

    const refillEvent = validAfter.find((d) => d.depthUsd === maxRefilledDepth) ?? validAfter[0];
    const timeToRefillMs = refillEvent.timestamp - execution.timestamp;

    return ProbableReplenishmentV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        eventTime: refillEvent.timestamp,
        priceBucket: execution.priceBucket,
        side: execution.side,
        executedAgainstNotionalUsd: execution.notionalUsd,
        refilledNotionalUsd: maxRefilledDepth,
        refillRatio: Math.round(refillRatio * 100) / 100,
        timeToRefillMs,
        repeatCount,
        label: 'PROBABLE_REPLENISHMENT',
        sequenceValid: true,
    });
}

/**
 * Section 11/27: Converts detected microstructure events into schema-validated MarketEvidenceV1 objects.
 */
export function convertMicrostructureToMarketEvidence(
    options: {
        stackedZones?: readonly StackedImbalanceZoneV1[];
        persistentWalls?: readonly LiquidityPersistenceV1[];
        addPulls?: readonly AddPullEventV1[];
        replenishments?: readonly ProbableReplenishmentV1[];
        coverage: CaptureCoverageV1;
    },
): MarketEvidenceV1[] {
    const evidence: MarketEvidenceV1[] = [];
    const { stackedZones = [], persistentWalls = [], addPulls = [], replenishments = [], coverage } = options;

    // 1. Stacked Imbalance Zones
    for (const zone of stackedZones) {
        const direction = zone.side === 'BUY' ? 'BULLISH' : 'BEARISH';
        const kind = zone.side === 'BUY' ? 'STACKED_BUY_IMBALANCE' : 'STACKED_SELL_IMBALANCE';
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `evidence-stacked-${zone.side.toLowerCase()}-${zone.candleOpenTime}-${Math.round(zone.priceLow)}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind,
                direction,
                startTime: zone.candleOpenTime,
                endTime: null,
                priceLow: zone.priceLow,
                priceHigh: zone.priceHigh,
                strengthPercentile: Math.min(100, Math.round(zone.meanRatio * 20)),
                confidence: zone.rowCount >= 4 ? 'HIGH' : 'MEDIUM',
                reasonCodes: [`STACKED_${zone.side}_${zone.rowCount}_ROWS`, `RATIO_${zone.meanRatio.toFixed(1)}`],
                sourceRefs: ['BINANCE_SPOT_FOOTPRINT'],
                quality: coverage,
                invalidatedAt: null,
            }),
        );
    }

    // 2. Persistent Liquidity Walls
    for (const wall of persistentWalls.filter((w) => w.isPersistent)) {
        const direction = wall.side === 'BID' ? 'BULLISH' : 'BEARISH';
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `evidence-persist-${wall.side.toLowerCase()}-${Math.round(wall.priceBucket)}-${wall.firstSeenTime}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: 'PERSISTENT_LIQUIDITY',
                direction,
                startTime: wall.firstSeenTime,
                endTime: wall.lastSeenTime,
                priceLow: wall.priceBucket,
                priceHigh: wall.priceBucket + 10,
                strengthPercentile: 90,
                confidence: wall.persistenceMs >= 30_000 ? 'HIGH' : 'MEDIUM',
                reasonCodes: [`PERSISTENT_${wall.side}_${Math.round(wall.persistenceMs / 1000)}S`, `NOTIONAL_${Math.round(wall.maxNotionalUsd / 1000)}K`],
                sourceRefs: ['BINANCE_SPOT_DEPTH'],
                quality: coverage,
                invalidatedAt: null,
            }),
        );
    }

    // 3. Add and Pull Events (strongest only)
    for (const ap of addPulls.filter((e) => e.estimatedPullUsd >= 200_000)) {
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `evidence-pull-${ap.side.toLowerCase()}-${Math.round(ap.priceBucket)}-${ap.eventTime}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: 'LIQUIDITY_PULL',
                direction: ap.side === 'BID' ? 'BEARISH' : 'BULLISH',
                startTime: ap.eventTime,
                endTime: null,
                priceLow: ap.priceBucket,
                priceHigh: ap.priceBucket + 10,
                strengthPercentile: 85,
                confidence: 'MEDIUM',
                reasonCodes: [`ESTIMATED_PULL_${Math.round(ap.estimatedPullUsd / 1000)}K`, 'UNMATCHED_CANCELLATION'],
                sourceRefs: ['BINANCE_SPOT_DEPTH'],
                quality: coverage,
                invalidatedAt: null,
            }),
        );
    }

    // 4. Probable Replenishment
    for (const rep of replenishments) {
        const direction = rep.side === 'BID' ? 'BULLISH' : 'BEARISH';
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `evidence-replenish-${rep.side.toLowerCase()}-${Math.round(rep.priceBucket)}-${rep.eventTime}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: 'PROBABLE_REPLENISHMENT',
                direction,
                startTime: rep.eventTime,
                endTime: null,
                priceLow: rep.priceBucket,
                priceHigh: rep.priceBucket + 10,
                strengthPercentile: 92,
                confidence: rep.repeatCount >= 2 ? 'HIGH' : 'MEDIUM',
                reasonCodes: [`REFILL_RATIO_${rep.refillRatio.toFixed(2)}`, `REFILL_TIME_${rep.timeToRefillMs}MS`],
                sourceRefs: ['BINANCE_SPOT_DEPTH', 'BINANCE_SPOT_AGGTRADE'],
                quality: coverage,
                invalidatedAt: null,
            }),
        );
    }

    return evidence;
}
