import { footprintPriceBucketIndex } from './price-bucket';
import { addObservedTrade, candleObservation, type ObservedCandle } from './observed-candle';
import { calculateDiagonalImbalance } from './microstructure';
import type { ImbalanceConfigV1 } from './microstructure-contracts';
import {
    FootprintBarV1Schema,
    FootprintCellV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    type AggregateTradeCaptureSnapshotV1,
    type CaptureCoverageV1,
    type ClassifiedTradeV1,
    type TradeCaptureBoundaryV1,
} from './contracts';
import {
    CvdBarV1Schema,
    CvdSegmentV1Schema,
    SegmentedFootprintBarV1Schema,
    TradeVolumeProfileRowV1Schema,
    TradeVolumeProfileV1Schema,
    TRUE_FLOW_INTERVAL_MS,
    TrueFlowIntervalSchema,
    TrueFlowSnapshotV1Schema,
    TrueFlowTotalsV1Schema,
    type TrueFlowInterval,
    type TrueFlowSnapshotV1,
    type TrueFlowTotalsV1,
} from './true-flow-contracts';

export interface TrueFlowOptions {
    interval: TrueFlowInterval;
    priceBucket: number;
    valueAreaFraction?: number;
    imbalance?: Partial<ImbalanceConfigV1>;
}

interface SegmentInput {
    segmentId: string;
    startBoundaries: TradeCaptureBoundaryV1[];
    trades: ClassifiedTradeV1[];
}

interface MutableTotals {
    tradeCount: number;
    buyVolumeBtc: number;
    sellVolumeBtc: number;
    buyNotionalUsd: number;
    sellNotionalUsd: number;
}

function emptyTotals(): MutableTotals {
    return {
        tradeCount: 0,
        buyVolumeBtc: 0,
        sellVolumeBtc: 0,
        buyNotionalUsd: 0,
        sellNotionalUsd: 0,
    };
}

function addTrade(totals: MutableTotals, trade: ClassifiedTradeV1): void {
    totals.tradeCount += 1;
    if (trade.aggressor === 'BUY') {
        totals.buyVolumeBtc += trade.quantityBtc;
        totals.buyNotionalUsd += trade.notionalUsd;
    } else {
        totals.sellVolumeBtc += trade.quantityBtc;
        totals.sellNotionalUsd += trade.notionalUsd;
    }
}

function finalizeTotals(totals: MutableTotals): TrueFlowTotalsV1 {
    return TrueFlowTotalsV1Schema.parse({
        ...totals,
        totalNotionalUsd: totals.buyNotionalUsd + totals.sellNotionalUsd,
        deltaNotionalUsd: totals.buyNotionalUsd - totals.sellNotionalUsd,
    });
}

function normalize(value: number): number {
    return Number(value.toFixed(12));
}

function bucketLow(bucketIndex: number, priceBucket: number): number {
    return normalize(bucketIndex * priceBucket);
}

function intervalOpen(tradeTime: number, intervalMs: number): number {
    return Math.floor(tradeTime / intervalMs) * intervalMs;
}

function coverageForTrades(base: CaptureCoverageV1, trades: readonly ClassifiedTradeV1[]): CaptureCoverageV1 {
    if (trades.length === 0) return base;
    const eventTime = Math.max(...trades.map((trade) => trade.eventTime));
    return {
        ...base,
        eventTime,
        coverageStart: Math.min(...trades.map((trade) => trade.tradeTime)),
        coverageEnd: Math.max(...trades.map((trade) => trade.tradeTime)),
        freshnessMs: Math.max(0, base.capturedAt - eventTime),
    };
}

function firstTradeAfter(
    trades: readonly ClassifiedTradeV1[],
    aggregateTradeId: number | null,
): number | null {
    if (aggregateTradeId === null) return trades[0]?.aggregateTradeId ?? null;
    let start = 0;
    let end = trades.length;
    while (start < end) {
        const middle = start + Math.floor((end - start) / 2);
        if (trades[middle].aggregateTradeId <= aggregateTradeId) start = middle + 1;
        else end = middle;
    }
    return trades[start]?.aggregateTradeId ?? null;
}

export function partitionTrueFlowSegments(
    trades: readonly ClassifiedTradeV1[],
    boundaries: readonly TradeCaptureBoundaryV1[],
): SegmentInput[] {
    if (trades.length === 0) return [];
    const sortedTrades = [...trades].sort((left, right) => left.aggregateTradeId - right.aggregateTradeId);
    const boundariesBefore = new Map<number, TradeCaptureBoundaryV1[]>();

    for (const boundary of boundaries) {
        const nextId = boundary.reason === 'AGGREGATE_ID_GAP'
            ? boundary.nextAggregateTradeId
            : firstTradeAfter(sortedTrades, boundary.previousAggregateTradeId);
        if (nextId === null) continue;
        const existing = boundariesBefore.get(nextId) ?? [];
        existing.push(boundary);
        boundariesBefore.set(nextId, existing);
    }

    if (!boundariesBefore.has(sortedTrades[0].aggregateTradeId)) {
        const syntheticCapture = boundaries.find((boundary) => boundary.reason === 'CAPTURE_START');
        if (syntheticCapture) boundariesBefore.set(sortedTrades[0].aggregateTradeId, [syntheticCapture]);
    }

    const segments: SegmentInput[] = [];
    let current: SegmentInput | null = null;
    for (const trade of sortedTrades) {
        const startBoundaries = boundariesBefore.get(trade.aggregateTradeId) ?? [];
        if (!current || startBoundaries.some((boundary) => boundary.reason !== 'CAPTURE_START')) {
            current = {
                segmentId: `segment-${segments.length + 1}`,
                startBoundaries: startBoundaries.length > 0 ? startBoundaries : [boundaries[0]].filter(Boolean),
                trades: [],
            };
            segments.push(current);
        } else if (current.trades.length === 0 && startBoundaries.length > 0) {
            current.startBoundaries = startBoundaries;
        }
        current.trades.push(trade);
    }
    return segments;
}

function buildCvdSegments(
    segments: readonly SegmentInput[],
    interval: TrueFlowInterval,
    baseCoverage: CaptureCoverageV1,
) {
    const intervalMs = TRUE_FLOW_INTERVAL_MS[interval];
    return segments.map((segment) => {
        const grouped = new Map<number, ClassifiedTradeV1[]>();
        for (const trade of segment.trades) {
            const openTime = intervalOpen(trade.tradeTime, intervalMs);
            const group = grouped.get(openTime) ?? [];
            group.push(trade);
            grouped.set(openTime, group);
        }
        let cumulativeDelta = 0;
        const bars = [...grouped.entries()]
            .sort(([left], [right]) => left - right)
            .map(([openTime, trades]) => {
                const mutable = emptyTotals();
                for (const trade of trades) addTrade(mutable, trade);
                const totals = finalizeTotals(mutable);
                cumulativeDelta += totals.deltaNotionalUsd;
                return CvdBarV1Schema.parse({
                    ...totals,
                    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                    openTime,
                    closeTime: openTime + intervalMs,
                    interval,
                    cumulativeDeltaNotionalUsd: cumulativeDelta,
                });
            });
        return CvdSegmentV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            segmentId: segment.segmentId,
            startBoundaryIds: segment.startBoundaries.map((boundary) => boundary.boundaryId),
            startReasons: segment.startBoundaries.map((boundary) => boundary.reason),
            bars,
            finalCumulativeDeltaNotionalUsd: cumulativeDelta,
            coverage: coverageForTrades(baseCoverage, segment.trades),
        });
    });
}

function buildFootprintBars(
    segments: readonly SegmentInput[],
    interval: TrueFlowInterval,
    priceBucket: number,
    baseCoverage: CaptureCoverageV1,
    imbalanceConfig?: Partial<ImbalanceConfigV1>,
) {
    const intervalMs = TRUE_FLOW_INTERVAL_MS[interval];
    return segments.flatMap((segment) => {
        const grouped = new Map<number, ClassifiedTradeV1[]>();
        for (const trade of segment.trades) {
            const openTime = intervalOpen(trade.tradeTime, intervalMs);
            const group = grouped.get(openTime) ?? [];
            group.push(trade);
            grouped.set(openTime, group);
        }
        return [...grouped.entries()]
            .sort(([left], [right]) => left - right)
            .map(([openTime, trades], barIndex) => {
                const cellGroups = new Map<number, ClassifiedTradeV1[]>();
                let observation: ObservedCandle | undefined;
                let runningDelta = 0;
                let minRunningDelta = 0;
                let maxRunningDelta = 0;
                for (const trade of trades.sort((left, right) => left.aggregateTradeId - right.aggregateTradeId)) {
                    observation = addObservedTrade(observation, trade);
                    const bucketIndex = footprintPriceBucketIndex(trade.price, priceBucket);
                    const group = cellGroups.get(bucketIndex) ?? [];
                    group.push(trade);
                    cellGroups.set(bucketIndex, group);
                    runningDelta += trade.aggressor === 'BUY' ? trade.notionalUsd : -trade.notionalUsd;
                    minRunningDelta = Math.min(minRunningDelta, runningDelta);
                    maxRunningDelta = Math.max(maxRunningDelta, runningDelta);
                }
                const rawCells = [...cellGroups.entries()]
                    .sort(([left], [right]) => left - right)
                    .map(([bucketIndex, cellTrades]) => {
                        const priceLow = bucketLow(bucketIndex, priceBucket);
                        const mutable = emptyTotals();
                        for (const trade of cellTrades) addTrade(mutable, trade);
                        const totals = finalizeTotals(mutable);
                        return FootprintCellV1Schema.parse({
                            priceLow,
                            priceHigh: normalize(priceLow + priceBucket),
                            priceMid: normalize(priceLow + priceBucket / 2),
                            ...totals,
                            buyImbalance: false,
                            sellImbalance: false,
                            imbalanceRatio: null,
                        });
                    });
                const cells = imbalanceConfig
                    ? calculateDiagonalImbalance(rawCells, imbalanceConfig)
                    : rawCells;
                const totalNotionalUsd = cells.reduce((sum, cell) => sum + cell.totalNotionalUsd, 0);
                const deltaNotionalUsd = cells.reduce((sum, cell) => sum + cell.deltaNotionalUsd, 0);
                const poc = [...cells].sort((left, right) =>
                    right.totalNotionalUsd - left.totalNotionalUsd || left.priceMid - right.priceMid
                )[0];
                const footprint = FootprintBarV1Schema.parse({
                    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                    openTime,
                    closeTime: openTime + intervalMs,
                    interval,
                    priceBucket,
                    cells,
                    ...(observation ? candleObservation(observation) : {}),
                    totalNotionalUsd,
                    deltaNotionalUsd,
                    pocPrice: poc?.priceMid ?? null,
                    minRunningDeltaUsd: minRunningDelta,
                    maxRunningDeltaUsd: maxRunningDelta,
                    coverage: coverageForTrades(baseCoverage, trades),
                });
                return SegmentedFootprintBarV1Schema.parse({
                    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                    segmentId: segment.segmentId,
                    startBoundaryIds: barIndex === 0
                        ? segment.startBoundaries.map((boundary) => boundary.boundaryId)
                        : [],
                    footprint,
                });
            });
    });
}

function buildTradeVolumeProfile(
    trades: readonly ClassifiedTradeV1[],
    priceBucket: number,
    valueAreaFraction: number,
    coverage: CaptureCoverageV1,
    hasContinuityBreak: boolean,
) {
    const groups = new Map<number, ClassifiedTradeV1[]>();
    const totals = emptyTotals();
    for (const trade of trades) {
        addTrade(totals, trade);
        const bucketIndex = footprintPriceBucketIndex(trade.price, priceBucket);
        const group = groups.get(bucketIndex) ?? [];
        group.push(trade);
        groups.set(bucketIndex, group);
    }
    const rows = [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([bucketIndex, rowTrades]) => {
            const priceLow = bucketLow(bucketIndex, priceBucket);
            const rowTotals = emptyTotals();
            for (const trade of rowTrades) addTrade(rowTotals, trade);
            return TradeVolumeProfileRowV1Schema.parse({
                ...finalizeTotals(rowTotals),
                bucketIndex,
                priceLow,
                priceHigh: normalize(priceLow + priceBucket),
                priceMid: normalize(priceLow + priceBucket / 2),
            });
        });
    const poc = [...rows].sort((left, right) =>
        right.totalNotionalUsd - left.totalNotionalUsd || left.priceMid - right.priceMid
    )[0];
    let valueAreaLowIndex = poc ? rows.findIndex((row) => row.bucketIndex === poc.bucketIndex) : -1;
    let valueAreaHighIndex = valueAreaLowIndex;
    let selectedNotional = poc?.totalNotionalUsd ?? 0;
    const valueAreaTarget = finalizeTotals(totals).totalNotionalUsd * valueAreaFraction;
    while (valueAreaLowIndex >= 0 && selectedNotional < valueAreaTarget) {
        const lower = rows[valueAreaLowIndex - 1];
        const upper = rows[valueAreaHighIndex + 1];
        if (!lower && !upper) break;
        if (lower && (!upper || lower.totalNotionalUsd >= upper.totalNotionalUsd)) {
            valueAreaLowIndex -= 1;
            selectedNotional += lower.totalNotionalUsd;
        } else if (upper) {
            valueAreaHighIndex += 1;
            selectedNotional += upper.totalNotionalUsd;
        }
    }
    return TradeVolumeProfileV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        priceBucket,
        coverageKind: coverage.gapCount > 0 || hasContinuityBreak ? 'CAPTURED_WITH_GAPS' : 'CAPTURED_EXACT',
        rows,
        totals: finalizeTotals(totals),
        pocPrice: poc?.priceMid ?? null,
        valueAreaFraction,
        vahPrice: valueAreaHighIndex >= 0 ? rows[valueAreaHighIndex].priceHigh : null,
        valPrice: valueAreaLowIndex >= 0 ? rows[valueAreaLowIndex].priceLow : null,
        coverage,
    });
}

/**
 * Derives all UX16.2 true-flow views from the same validated capture snapshot.
 * Empty time intervals are not manufactured, and each continuity boundary
 * starts a new CVD segment rather than bridging unknown trade history.
 */
export function deriveTrueFlowSnapshotV1(
    capture: AggregateTradeCaptureSnapshotV1,
    options: TrueFlowOptions,
): TrueFlowSnapshotV1 {
    const interval = TrueFlowIntervalSchema.parse(options.interval);
    if (!Number.isFinite(options.priceBucket) || options.priceBucket <= 0) {
        throw new RangeError('priceBucket must be a positive finite number');
    }
    const valueAreaFraction = options.valueAreaFraction ?? 0.7;
    if (!Number.isFinite(valueAreaFraction) || valueAreaFraction < 0.5 || valueAreaFraction > 0.99) {
        throw new RangeError('valueAreaFraction must be between 0.5 and 0.99');
    }
    const trades = [...capture.trades].sort((left, right) => left.aggregateTradeId - right.aggregateTradeId);
    const segments = partitionTrueFlowSegments(trades, capture.boundaries);
    const totals = emptyTotals();
    for (const trade of trades) addTrade(totals, trade);
    const coverage = coverageForTrades(capture.coverage, trades);

    return TrueFlowSnapshotV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        interval,
        priceBucket: options.priceBucket,
        cvdSegments: buildCvdSegments(segments, interval, coverage),
        footprintBars: buildFootprintBars(segments, interval, options.priceBucket, coverage, options.imbalance),
        tradeVolumeProfile: buildTradeVolumeProfile(
            trades,
            options.priceBucket,
            valueAreaFraction,
            coverage,
            segments.length > 1,
        ),
        totals: finalizeTotals(totals),
        coverage,
    });
}
