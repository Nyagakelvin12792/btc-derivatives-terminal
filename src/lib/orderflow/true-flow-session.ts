import {
    FootprintBarV1Schema,
    FootprintCellV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
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
    TrueFlowIntervalSchema,
    TrueFlowSnapshotV1Schema,
    TrueFlowTotalsV1Schema,
    type TrueFlowInterval,
    type TrueFlowSnapshotV1,
    type TrueFlowTotalsV1,
} from './true-flow-contracts';

const INTERVAL_MS: Record<TrueFlowInterval, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
};

export interface TrueFlowSessionOptions {
    interval: TrueFlowInterval;
    priceBucket: number;
    valueAreaFraction: number;
    maxSegments: number;
    maxBars: number;
    maxCellsPerBar: number;
    maxProfileRows: number;
}

interface MutableTotals {
    tradeCount: number;
    buyVolumeBtc: number;
    sellVolumeBtc: number;
    buyNotionalUsd: number;
    sellNotionalUsd: number;
}

interface MutableCell extends MutableTotals {
    bucketIndex: number;
}

interface MutableBar extends MutableTotals {
    openTime: number;
    cells: Map<number, MutableCell>;
    runningDeltaUsd: number;
    minRunningDeltaUsd: number;
    maxRunningDeltaUsd: number;
    coverageStart: number;
    coverageEnd: number;
    eventTime: number;
}

interface MutableSegment {
    segmentId: string;
    startBoundaries: TradeCaptureBoundaryV1[];
    bars: Map<number, MutableBar>;
    coverageStart: number;
    coverageEnd: number;
    eventTime: number;
}

const DEFAULT_OPTIONS: TrueFlowSessionOptions = Object.freeze({
    interval: '1m',
    priceBucket: 10,
    valueAreaFraction: 0.7,
    maxSegments: 1_000,
    maxBars: 20_000,
    maxCellsPerBar: 5_000,
    maxProfileRows: 20_000,
});

function positiveInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${field} must be a positive safe integer`);
    return value;
}

export function createTrueFlowSessionOptions(
    overrides: Partial<TrueFlowSessionOptions> = {},
): TrueFlowSessionOptions {
    const options = { ...DEFAULT_OPTIONS, ...overrides };
    options.interval = TrueFlowIntervalSchema.parse(options.interval);
    if (!Number.isFinite(options.priceBucket) || options.priceBucket <= 0) {
        throw new RangeError('priceBucket must be a positive finite number');
    }
    if (!Number.isFinite(options.valueAreaFraction)
        || options.valueAreaFraction < 0.5
        || options.valueAreaFraction > 0.99) {
        throw new RangeError('valueAreaFraction must be between 0.5 and 0.99');
    }
    options.maxSegments = positiveInteger(options.maxSegments, 'maxSegments');
    options.maxBars = positiveInteger(options.maxBars, 'maxBars');
    options.maxCellsPerBar = positiveInteger(options.maxCellsPerBar, 'maxCellsPerBar');
    options.maxProfileRows = positiveInteger(options.maxProfileRows, 'maxProfileRows');
    return options;
}

function emptyTotals(): MutableTotals {
    return { tradeCount: 0, buyVolumeBtc: 0, sellVolumeBtc: 0, buyNotionalUsd: 0, sellNotionalUsd: 0 };
}

function addTrade(target: MutableTotals, trade: ClassifiedTradeV1): void {
    target.tradeCount += 1;
    if (trade.aggressor === 'BUY') {
        target.buyVolumeBtc += trade.quantityBtc;
        target.buyNotionalUsd += trade.notionalUsd;
    } else {
        target.sellVolumeBtc += trade.quantityBtc;
        target.sellNotionalUsd += trade.notionalUsd;
    }
}

function totals(target: MutableTotals): TrueFlowTotalsV1 {
    return TrueFlowTotalsV1Schema.parse({
        tradeCount: target.tradeCount,
        buyVolumeBtc: target.buyVolumeBtc,
        sellVolumeBtc: target.sellVolumeBtc,
        buyNotionalUsd: target.buyNotionalUsd,
        sellNotionalUsd: target.sellNotionalUsd,
        totalNotionalUsd: target.buyNotionalUsd + target.sellNotionalUsd,
        deltaNotionalUsd: target.buyNotionalUsd - target.sellNotionalUsd,
    });
}

function normalize(value: number): number {
    return Number(value.toFixed(12));
}

function bucketIndex(price: number, priceBucket: number): number {
    return Math.floor(price / priceBucket + 1e-12);
}

function bucketLow(index: number, priceBucket: number): number {
    return normalize(index * priceBucket);
}

function coverageSlice(
    base: CaptureCoverageV1,
    coverageStart: number,
    coverageEnd: number,
    eventTime: number,
): CaptureCoverageV1 {
    return {
        ...base,
        eventTime,
        coverageStart,
        coverageEnd,
        freshnessMs: Math.max(0, base.capturedAt - eventTime),
    };
}

/**
 * Incremental UX16.2 authority. It retains derived bars and profile rows, not
 * raw trades, so session totals do not shrink when the bounded tape evicts old
 * events. Hard limits fail closed rather than silently dropping derived data.
 */
export class TrueFlowSessionAccumulator {
    private readonly options: TrueFlowSessionOptions;
    private readonly sessionTotals = emptyTotals();
    private readonly profileRows = new Map<number, MutableCell>();
    private readonly segments: MutableSegment[] = [];
    private pendingBoundaries: TradeCaptureBoundaryV1[] = [];
    private currentSegment: MutableSegment | null = null;
    private lastAggregateTradeId: number | null = null;
    private totalBars = 0;

    constructor(options: Partial<TrueFlowSessionOptions> = {}) {
        this.options = createTrueFlowSessionOptions(options);
    }

    recordBoundary(boundary: TradeCaptureBoundaryV1): void {
        this.pendingBoundaries.push(boundary);
    }

    ingest(trade: ClassifiedTradeV1): void {
        if (this.lastAggregateTradeId !== null && trade.aggregateTradeId <= this.lastAggregateTradeId) {
            throw new RangeError('True-flow session requires strictly increasing accepted aggregate trade IDs');
        }
        const requiresNewSegment = this.currentSegment === null
            || this.pendingBoundaries.some((boundary) => boundary.reason !== 'CAPTURE_START');
        if (requiresNewSegment) this.startSegment(trade);
        if (!this.currentSegment) throw new Error('True-flow segment was not initialized');

        const intervalMs = INTERVAL_MS[this.options.interval];
        const openTime = Math.floor(trade.tradeTime / intervalMs) * intervalMs;
        let bar = this.currentSegment.bars.get(openTime);
        if (!bar && this.totalBars >= this.options.maxBars) {
            throw new RangeError('True-flow derived bar limit reached');
        }
        const index = bucketIndex(trade.price, this.options.priceBucket);
        const existingCell = bar?.cells.get(index);
        if (bar && !existingCell && bar.cells.size >= this.options.maxCellsPerBar) {
            throw new RangeError('True-flow footprint cell limit reached');
        }
        const existingProfile = this.profileRows.get(index);
        if (!existingProfile && this.profileRows.size >= this.options.maxProfileRows) {
            throw new RangeError('True-flow profile row limit reached');
        }

        if (!bar) {
            bar = {
                ...emptyTotals(),
                openTime,
                cells: new Map(),
                runningDeltaUsd: 0,
                minRunningDeltaUsd: 0,
                maxRunningDeltaUsd: 0,
                coverageStart: trade.tradeTime,
                coverageEnd: trade.tradeTime,
                eventTime: trade.eventTime,
            };
            this.currentSegment.bars.set(openTime, bar);
            this.totalBars += 1;
        }
        let cell = existingCell;
        if (!cell) {
            cell = { ...emptyTotals(), bucketIndex: index };
            bar.cells.set(index, cell);
        }
        let profile = existingProfile;
        if (!profile) {
            profile = { ...emptyTotals(), bucketIndex: index };
            this.profileRows.set(index, profile);
        }

        addTrade(this.sessionTotals, trade);
        addTrade(bar, trade);
        addTrade(cell, trade);
        addTrade(profile, trade);
        bar.runningDeltaUsd += trade.aggressor === 'BUY' ? trade.notionalUsd : -trade.notionalUsd;
        bar.minRunningDeltaUsd = Math.min(bar.minRunningDeltaUsd, bar.runningDeltaUsd);
        bar.maxRunningDeltaUsd = Math.max(bar.maxRunningDeltaUsd, bar.runningDeltaUsd);
        bar.coverageStart = Math.min(bar.coverageStart, trade.tradeTime);
        bar.coverageEnd = Math.max(bar.coverageEnd, trade.tradeTime);
        bar.eventTime = Math.max(bar.eventTime, trade.eventTime);
        this.currentSegment.coverageStart = Math.min(this.currentSegment.coverageStart, trade.tradeTime);
        this.currentSegment.coverageEnd = Math.max(this.currentSegment.coverageEnd, trade.tradeTime);
        this.currentSegment.eventTime = Math.max(this.currentSegment.eventTime, trade.eventTime);
        this.lastAggregateTradeId = trade.aggregateTradeId;
        this.pendingBoundaries = [];
    }

    clear(): void {
        Object.assign(this.sessionTotals, emptyTotals());
        this.profileRows.clear();
        this.segments.length = 0;
        this.pendingBoundaries = [];
        this.currentSegment = null;
        this.lastAggregateTradeId = null;
        this.totalBars = 0;
    }

    snapshot(baseCoverage: CaptureCoverageV1): TrueFlowSnapshotV1 {
        const intervalMs = INTERVAL_MS[this.options.interval];
        const cvdSegments = this.segments.map((segment) => {
            let cumulative = 0;
            const bars = [...segment.bars.values()]
                .sort((left, right) => left.openTime - right.openTime)
                .map((bar) => {
                    const barTotals = totals(bar);
                    cumulative += barTotals.deltaNotionalUsd;
                    return CvdBarV1Schema.parse({
                        ...barTotals,
                        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                        openTime: bar.openTime,
                        closeTime: bar.openTime + intervalMs,
                        interval: this.options.interval,
                        cumulativeDeltaNotionalUsd: cumulative,
                    });
                });
            return CvdSegmentV1Schema.parse({
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                segmentId: segment.segmentId,
                startBoundaryIds: segment.startBoundaries.map((boundary) => boundary.boundaryId),
                startReasons: segment.startBoundaries.map((boundary) => boundary.reason),
                bars,
                finalCumulativeDeltaNotionalUsd: cumulative,
                coverage: coverageSlice(baseCoverage, segment.coverageStart, segment.coverageEnd, segment.eventTime),
            });
        });

        const footprintBars = this.segments.flatMap((segment) =>
            [...segment.bars.values()]
                .sort((left, right) => left.openTime - right.openTime)
                .map((bar, index) => {
                    const cells = [...bar.cells.values()]
                        .sort((left, right) => left.bucketIndex - right.bucketIndex)
                        .map((cell) => {
                            const priceLow = bucketLow(cell.bucketIndex, this.options.priceBucket);
                            return FootprintCellV1Schema.parse({
                                ...totals(cell),
                                priceLow,
                                priceHigh: normalize(priceLow + this.options.priceBucket),
                                priceMid: normalize(priceLow + this.options.priceBucket / 2),
                                buyImbalance: false,
                                sellImbalance: false,
                                imbalanceRatio: null,
                            });
                        });
                    const poc = [...cells].sort((left, right) =>
                        right.totalNotionalUsd - left.totalNotionalUsd || left.priceMid - right.priceMid
                    )[0];
                    const barTotals = totals(bar);
                    return SegmentedFootprintBarV1Schema.parse({
                        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                        segmentId: segment.segmentId,
                        startBoundaryIds: index === 0
                            ? segment.startBoundaries.map((boundary) => boundary.boundaryId)
                            : [],
                        footprint: FootprintBarV1Schema.parse({
                            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                            openTime: bar.openTime,
                            closeTime: bar.openTime + intervalMs,
                            interval: this.options.interval,
                            priceBucket: this.options.priceBucket,
                            cells,
                            totalNotionalUsd: barTotals.totalNotionalUsd,
                            deltaNotionalUsd: barTotals.deltaNotionalUsd,
                            pocPrice: poc?.priceMid ?? null,
                            minRunningDeltaUsd: bar.minRunningDeltaUsd,
                            maxRunningDeltaUsd: bar.maxRunningDeltaUsd,
                            coverage: coverageSlice(baseCoverage, bar.coverageStart, bar.coverageEnd, bar.eventTime),
                        }),
                    });
                })
        );

        const rows = [...this.profileRows.values()]
            .sort((left, right) => left.bucketIndex - right.bucketIndex)
            .map((row) => {
                const priceLow = bucketLow(row.bucketIndex, this.options.priceBucket);
                return TradeVolumeProfileRowV1Schema.parse({
                    ...totals(row),
                    bucketIndex: row.bucketIndex,
                    priceLow,
                    priceHigh: normalize(priceLow + this.options.priceBucket),
                    priceMid: normalize(priceLow + this.options.priceBucket / 2),
                });
            });
        const poc = [...rows].sort((left, right) =>
            right.totalNotionalUsd - left.totalNotionalUsd || left.priceMid - right.priceMid
        )[0];
        let lowIndex = poc ? rows.findIndex((row) => row.bucketIndex === poc.bucketIndex) : -1;
        let highIndex = lowIndex;
        let selected = poc?.totalNotionalUsd ?? 0;
        const sessionTotals = totals(this.sessionTotals);
        const target = sessionTotals.totalNotionalUsd * this.options.valueAreaFraction;
        while (lowIndex >= 0 && selected < target) {
            const lower = rows[lowIndex - 1];
            const upper = rows[highIndex + 1];
            if (!lower && !upper) break;
            if (lower && (!upper || lower.totalNotionalUsd >= upper.totalNotionalUsd)) {
                lowIndex -= 1;
                selected += lower.totalNotionalUsd;
            } else if (upper) {
                highIndex += 1;
                selected += upper.totalNotionalUsd;
            }
        }
        const tradeVolumeProfile = TradeVolumeProfileV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            priceBucket: this.options.priceBucket,
            coverageKind: baseCoverage.gapCount > 0 ? 'CAPTURED_WITH_GAPS' : 'CAPTURED_EXACT',
            rows,
            totals: sessionTotals,
            pocPrice: poc?.priceMid ?? null,
            valueAreaFraction: this.options.valueAreaFraction,
            vahPrice: highIndex >= 0 ? rows[highIndex].priceHigh : null,
            valPrice: lowIndex >= 0 ? rows[lowIndex].priceLow : null,
            coverage: baseCoverage,
        });

        return TrueFlowSnapshotV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            interval: this.options.interval,
            priceBucket: this.options.priceBucket,
            cvdSegments,
            footprintBars,
            tradeVolumeProfile,
            totals: sessionTotals,
            coverage: baseCoverage,
        });
    }

    private startSegment(trade: ClassifiedTradeV1): void {
        if (this.segments.length >= this.options.maxSegments) throw new RangeError('True-flow segment limit reached');
        const segment: MutableSegment = {
            segmentId: `segment-${this.segments.length + 1}`,
            startBoundaries: this.pendingBoundaries,
            bars: new Map(),
            coverageStart: trade.tradeTime,
            coverageEnd: trade.tradeTime,
            eventTime: trade.eventTime,
        };
        this.segments.push(segment);
        this.currentSegment = segment;
    }
}
