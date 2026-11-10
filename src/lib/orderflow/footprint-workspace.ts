import type { AggregateTradeCaptureSnapshotV1, FootprintCellV1 } from './contracts';
import { calculateDiagonalImbalance, detectStackedImbalances } from './microstructure';
import { DEFAULT_IMBALANCE_CONFIG, type ImbalanceConfigV1, type StackedImbalanceZoneV1 } from './microstructure-contracts';
import { createCaptureCoverageV1 } from './provenance';
import { deriveTrueFlowSnapshotV1, type TrueFlowOptions } from './true-flow';
import { TRUE_FLOW_INTERVAL_MS, type SegmentedFootprintBarV1, type TrueFlowSnapshotV1 } from './true-flow-contracts';

export interface FootprintWorkspaceCandle {
    openTime: number;
    closeTime: number;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    cells: FootprintCellV1[];
    askVolumeBtc: number;
    bidVolumeBtc: number;
    totalVolumeBtc: number;
    deltaBtc: number;
    deltaPercent: number | null;
    aggregateTradeCount: number;
    executionCount: number | null;
    pocPrice: number | null;
    maxDeltaUsdt: number | null;
    minDeltaUsdt: number | null;
    cumulativeDeltaBtc: number | null;
    segmentId: string;
    developing: boolean;
    coverageStart: number | null;
    coverageEnd: number | null;
    coverageStatus: 'PARTIAL' | 'GAPPED' | 'OBSERVED';
    stackedImbalances: StackedImbalanceZoneV1[];
}

/** The display grid only merges complete source bins. A finer grid needs raw trades. */
export function resolveFootprintDisplayStep(sourceStep: number, requestedStep: number): number {
    if (!Number.isFinite(sourceStep) || sourceStep <= 0 || !Number.isFinite(requestedStep) || requestedStep <= 0) {
        throw new RangeError('Footprint steps must be positive finite numbers');
    }
    const ratio = requestedStep / sourceStep;
    const nearest = Math.round(ratio);
    const groups = Math.max(1, Math.abs(ratio - nearest) < 1e-9 ? nearest : Math.ceil(ratio));
    if (!Number.isSafeInteger(groups) || !Number.isFinite(groups * sourceStep)) {
        throw new RangeError('Footprint display step exceeds safe limits');
    }
    return groups * sourceStep;
}

function groupCells(
    bars: readonly SegmentedFootprintBarV1[],
    sourceStep: number,
    displayStep: number,
): FootprintCellV1[] {
    const groups = Math.round(displayStep / sourceStep);
    const bins = new Map<number, FootprintCellV1>();
    for (const { footprint } of bars) {
        for (const cell of footprint.cells) {
            if (cell.tradeCount === 0) continue;
            const sourceIndex = Math.round(cell.priceLow / sourceStep);
            const index = Math.floor(sourceIndex / groups);
            let bin = bins.get(index);
            if (!bin) {
                bin = {
                    priceLow: index * displayStep,
                    priceHigh: (index + 1) * displayStep,
                    priceMid: (index + 0.5) * displayStep,
                    buyVolumeBtc: 0,
                    sellVolumeBtc: 0,
                    buyNotionalUsd: 0,
                    sellNotionalUsd: 0,
                    totalNotionalUsd: 0,
                    deltaNotionalUsd: 0,
                    tradeCount: 0,
                    buyImbalance: false,
                    sellImbalance: false,
                    imbalanceRatio: null,
                };
                bins.set(index, bin);
            }
            bin.buyVolumeBtc += cell.buyVolumeBtc;
            bin.sellVolumeBtc += cell.sellVolumeBtc;
            bin.buyNotionalUsd += cell.buyNotionalUsd;
            bin.sellNotionalUsd += cell.sellNotionalUsd;
            bin.tradeCount += cell.tradeCount;
        }
    }
    return [...bins.values()].sort((a, b) => a.priceLow - b.priceLow).map((bin) => ({
        ...bin,
        totalNotionalUsd: bin.buyNotionalUsd + bin.sellNotionalUsd,
        deltaNotionalUsd: bin.buyNotionalUsd - bin.sellNotionalUsd,
    }));
}

interface GroupedClusters {
    cells: FootprintCellV1[];
    stackedImbalances: StackedImbalanceZoneV1[];
    askVolumeBtc: number;
    bidVolumeBtc: number;
    aggregateTradeCount: number;
    pocPrice: number | null;
}
const groupCache = new WeakMap<FootprintCellV1[], { key: string; result: GroupedClusters }>();

function projectClusters(
    bars: readonly SegmentedFootprintBarV1[],
    sourceStep: number,
    step: number,
    key: string,
    imbalanceConfig: Partial<ImbalanceConfigV1>,
): GroupedClusters {
    const sourceCells = bars.length === 1 ? bars[0].footprint.cells : undefined;
    const cacheKey = `${bars[0].footprint.openTime}:${key}`;
    const cached = sourceCells && groupCache.get(sourceCells);
    if (cached && cached.key === cacheKey) return cached.result;
    const cells = calculateDiagonalImbalance(groupCells(bars, sourceStep, step), imbalanceConfig, {
        requireAdjacent: true,
        minOpposingNotionalUsd: 1,
    });
    const stackedImbalances = detectStackedImbalances(cells, bars[0].footprint.openTime,
        imbalanceConfig.stackedRowCount ?? DEFAULT_IMBALANCE_CONFIG.stackedRowCount);
    let askVolumeBtc = 0;
    let bidVolumeBtc = 0;
    let aggregateTradeCount = 0;
    let poc: FootprintCellV1 | undefined;
    for (const cell of cells) {
        askVolumeBtc += cell.buyVolumeBtc;
        bidVolumeBtc += cell.sellVolumeBtc;
        aggregateTradeCount += cell.tradeCount;
        const volume = cell.buyVolumeBtc + cell.sellVolumeBtc;
        const maximum = poc ? poc.buyVolumeBtc + poc.sellVolumeBtc : 0;
        if (!poc || volume - maximum > Math.max(1e-12, maximum * 1e-12)) poc = cell;
    }
    const result = {
        cells, stackedImbalances, askVolumeBtc, bidVolumeBtc, aggregateTradeCount, pocPrice: poc?.priceMid ?? null,
    };
    if (sourceCells) groupCache.set(sourceCells, { key: cacheKey, result });
    return result;
}

/**
 * Projects only observed aggressive trades. An as-of cursor earlier than a
 * fragment's last trade excludes the whole fragment. For developing historical
 * candles, derive a snapshot from a causally filtered raw tape first.
 */
export function buildFootprintWorkspace(
    snapshot: TrueFlowSnapshotV1 | null | undefined,
    requestedStep: number,
    asOfMs: number,
    imbalanceConfig: Partial<ImbalanceConfigV1> = {},
): FootprintWorkspaceCandle[] {
    if (!snapshot || !Number.isFinite(asOfMs)) return [];
    const step = resolveFootprintDisplayStep(snapshot.priceBucket, requestedStep);
    const settingsKey = JSON.stringify([snapshot.priceBucket, step, imbalanceConfig]);
    const groups = new Map<number, SegmentedFootprintBarV1[]>();
    for (const fragment of snapshot.footprintBars) {
        const { openTime, coverage } = fragment.footprint;
        if (openTime > asOfMs || coverage.coverageEnd === null || coverage.coverageEnd > asOfMs) continue;
        const group = groups.get(openTime) ?? [];
        group.push(fragment);
        groups.set(openTime, group);
    }

    const observedSegments = snapshot.cvdSegments.filter((segment) =>
        segment.coverage.coverageStart !== null && segment.coverage.coverageStart <= asOfMs);
    const segments = new Map(observedSegments.map((segment, index) => [segment.segmentId, {
        startsAfterGap: segment.startReasons.some((reason) => reason !== 'CAPTURE_START'),
        endsBeforeGap: index < observedSegments.length - 1,
        coverageStart: segment.coverage.coverageStart,
        coverageEnd: segment.coverage.coverageEnd,
    }]));
    let previousSegment: string | undefined;
    let previousDay: number | undefined;
    let cumulative = 0;

    return [...groups.entries()].sort(([a], [b]) => a - b).map(([openTime, bars]) => {
        const first = bars[0];
        const last = bars[bars.length - 1];
        const segmentId = last.segmentId;
        const closeTime = first.footprint.closeTime;
        const developing = asOfMs < closeTime;
        const segment = segments.get(first.segmentId);
        const gapped = bars.length > 1 || Boolean(segment && (
            segment.startsAfterGap && segment.coverageStart !== null && segment.coverageStart > openTime
                && segment.coverageStart < closeTime
            || segment.endsBeforeGap && segment.coverageEnd !== null && segment.coverageEnd >= openTime
                && segment.coverageEnd < closeTime
        ));
        const coverageStart = Math.min(...bars.map((bar) => bar.footprint.coverage.coverageStart ?? openTime));
        const coverageEnd = Math.max(...bars.map((bar) => bar.footprint.coverage.coverageEnd ?? openTime));
        const partial = developing
            || snapshot.coverage.coverageStart === null || snapshot.coverage.coverageStart > openTime
            || snapshot.coverage.coverageEnd === null || snapshot.coverage.coverageEnd < closeTime;

        const { cells, stackedImbalances, askVolumeBtc, bidVolumeBtc, aggregateTradeCount, pocPrice } =
            projectClusters(bars, snapshot.priceBucket, step, settingsKey, imbalanceConfig);
        const totalVolumeBtc = askVolumeBtc + bidVolumeBtc;
        const deltaBtc = askVolumeBtc - bidVolumeBtc;
        const observed = bars.map((bar) => bar.footprint.observedOhlc);
        const completeOhlc = observed.every((value) => value !== undefined);
        const exactExecutionCounts = bars.map((bar) => bar.footprint.executionCount);
        const day = Math.floor(openTime / TRUE_FLOW_INTERVAL_MS['1d']);
        if (day !== previousDay || previousSegment !== segmentId) cumulative = 0;
        // In a split candle the final segment remains continuous with the next candle.
        const lastSegmentDelta = bars.length > 1
            ? last.footprint.cells.reduce((sum, cell) => sum + cell.buyVolumeBtc - cell.sellVolumeBtc, 0)
            : deltaBtc;
        cumulative += lastSegmentDelta;
        previousSegment = segmentId;
        previousDay = day;

        return {
            openTime, closeTime,
            open: completeOhlc ? observed[0]!.open : null,
            high: completeOhlc ? Math.max(...observed.map((ohlc) => ohlc!.high)) : null,
            low: completeOhlc ? Math.min(...observed.map((ohlc) => ohlc!.low)) : null,
            close: completeOhlc ? observed[observed.length - 1]!.close : null,
            cells, askVolumeBtc, bidVolumeBtc, totalVolumeBtc, deltaBtc,
            deltaPercent: totalVolumeBtc > 0 ? deltaBtc / totalVolumeBtc * 100 : null,
            aggregateTradeCount,
            executionCount: exactExecutionCounts.every((count) => typeof count === 'number')
                ? exactExecutionCounts.reduce((sum: number, count) => sum + (count ?? 0), 0) : null,
            pocPrice,
            maxDeltaUsdt: gapped ? null : first.footprint.maxRunningDeltaUsd,
            minDeltaUsdt: gapped ? null : first.footprint.minRunningDeltaUsd,
            cumulativeDeltaBtc: gapped ? null : cumulative,
            segmentId, developing, coverageStart, coverageEnd,
            coverageStatus: gapped ? 'GAPPED' : partial ? 'PARTIAL' : 'OBSERVED',
            stackedImbalances,
        };
    });
}

/** Recompute a historical candle from its known trade prefix, including a developing candle. */
export function buildFootprintReplaySnapshot(
    capture: AggregateTradeCaptureSnapshotV1,
    cursorMs: number,
    options: TrueFlowOptions,
): TrueFlowSnapshotV1 {
    if (!Number.isSafeInteger(cursorMs) || cursorMs < 0) throw new RangeError('Invalid footprint replay cursor');
    const trades = capture.trades.filter((trade) => trade.tradeTime <= cursorMs && trade.eventTime <= cursorMs);
    const boundaries = capture.boundaries.filter((boundary) => boundary.occurredAt <= cursorMs);
    const gapCount = boundaries.filter((boundary) => boundary.reason !== 'CAPTURE_START').length;
    const coverage = createCaptureCoverageV1({
        ...capture.coverage,
        dataMode: 'REPLAY',
        capturedAt: cursorMs,
        eventTime: trades.reduce((latest, trade) => Math.max(latest, trade.eventTime), 0),
        coverageStart: trades.length ? trades.reduce((first, trade) => Math.min(first, trade.tradeTime), cursorMs) : null,
        coverageEnd: trades.length ? trades.reduce((last, trade) => Math.max(last, trade.tradeTime), 0) : null,
        sequenceState: gapCount > 0 ? 'GAP' : trades.length ? 'LIVE' : 'OFFLINE',
        gapCount,
        freshnessMs: undefined,
        quality: undefined,
    });
    return deriveTrueFlowSnapshotV1({
        ...capture, trades, boundaries, coverage,
        stats: {
            acceptedCount: trades.length, duplicateCount: 0, invalidCount: 0, outOfOrderCount: 0,
            reconnectCount: boundaries.filter((boundary) => boundary.reason === 'RECONNECT').length,
        },
        lastAggregateTradeId: trades.at(-1)?.aggregateTradeId ?? null,
    }, options);
}
