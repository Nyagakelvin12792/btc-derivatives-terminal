import {
    AggregateTradeCaptureSnapshotV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    TradeCaptureBoundaryV1Schema,
    type AggregateTradeCaptureSnapshotV1,
    type AggregateTradeCaptureStatsV1,
    type CaptureCoverageV1,
    type ClassifiedTradeV1,
    type TradeCaptureBoundaryReason,
    type TradeCaptureBoundaryV1,
} from './contracts';
import { createCaptureCoverageV1 } from './provenance';
import { BinanceAggregateTradePayloadError, parseBinanceAggregateTrade } from './trade-classifier';

export interface AggregateTradeTapeOptions {
    maxTrades: number;
    maxBoundaries: number;
    staleAfterMs: number;
}

export type AggregateTradeIngestResult =
    | { status: 'ACCEPTED'; trade: ClassifiedTradeV1; boundary: TradeCaptureBoundaryV1 | null }
    | { status: 'DUPLICATE' | 'OUT_OF_ORDER' | 'INVALID'; trade: null; boundary: null };

export interface AggregateTradeTelemetry {
    retainedTradeCount: number;
    lastAggregateTradeId: number | null;
    coverage: CaptureCoverageV1;
    stats: AggregateTradeCaptureStatsV1;
}

const DEFAULT_OPTIONS: AggregateTradeTapeOptions = Object.freeze({
    maxTrades: 50_000,
    maxBoundaries: 1_000,
    staleAfterMs: 5_000,
});

function positiveInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError(`${field} must be a positive safe integer`);
    }
    return value;
}

export function createAggregateTradeTapeOptions(
    overrides: Partial<AggregateTradeTapeOptions> = {},
): AggregateTradeTapeOptions {
    return {
        maxTrades: positiveInteger(overrides.maxTrades ?? DEFAULT_OPTIONS.maxTrades, 'maxTrades'),
        maxBoundaries: positiveInteger(overrides.maxBoundaries ?? DEFAULT_OPTIONS.maxBoundaries, 'maxBoundaries'),
        staleAfterMs: positiveInteger(overrides.staleAfterMs ?? DEFAULT_OPTIONS.staleAfterMs, 'staleAfterMs'),
    };
}

/**
 * Deterministic, session-local aggregate-trade authority.
 *
 * Binance aggregate IDs are treated as a monotonically increasing capture
 * sequence. Duplicates and late events are rejected, while forward jumps are
 * accepted only after an explicit continuity boundary is recorded. The tape
 * never invents trades to fill a missing range.
 */
export class AggregateTradeTape {
    private readonly options: AggregateTradeTapeOptions;
    private readonly trades: ClassifiedTradeV1[] = [];
    private readonly retainedIds = new Set<number>();
    private readonly boundaries: TradeCaptureBoundaryV1[] = [];
    private readonly stats: AggregateTradeCaptureStatsV1 = {
        acceptedCount: 0,
        duplicateCount: 0,
        outOfOrderCount: 0,
        invalidCount: 0,
        reconnectCount: 0,
    };
    private lastAggregateTradeId: number | null = null;
    private coverageStart: number | null = null;
    private coverageEnd: number | null = null;
    private latestEventTime: number | null = null;
    private gapCount = 0;
    private sequenceState: AggregateTradeCaptureSnapshotV1['coverage']['sequenceState'] = 'BUFFERING';
    private boundaryOrdinal = 0;
    private awaitingTradeAfterReconnect = false;

    constructor(options: Partial<AggregateTradeTapeOptions> = {}) {
        this.options = createAggregateTradeTapeOptions(options);
    }

    ingest(payload: unknown, capturedAt: number): AggregateTradeIngestResult {
        if (!Number.isSafeInteger(capturedAt) || capturedAt < 0) {
            this.stats.invalidCount += 1;
            return { status: 'INVALID', trade: null, boundary: null };
        }

        let trade: ClassifiedTradeV1;
        try {
            trade = parseBinanceAggregateTrade(payload);
        } catch (error) {
            if (error instanceof BinanceAggregateTradePayloadError || error instanceof Error) {
                this.stats.invalidCount += 1;
                return { status: 'INVALID', trade: null, boundary: null };
            }
            throw error;
        }

        if (this.retainedIds.has(trade.aggregateTradeId)) {
            this.stats.duplicateCount += 1;
            return { status: 'DUPLICATE', trade: null, boundary: null };
        }
        if (this.lastAggregateTradeId !== null && trade.aggregateTradeId < this.lastAggregateTradeId) {
            this.stats.outOfOrderCount += 1;
            return { status: 'OUT_OF_ORDER', trade: null, boundary: null };
        }
        if (this.lastAggregateTradeId !== null && trade.aggregateTradeId === this.lastAggregateTradeId) {
            this.stats.duplicateCount += 1;
            return { status: 'DUPLICATE', trade: null, boundary: null };
        }

        let boundary: TradeCaptureBoundaryV1 | null = null;
        if (this.lastAggregateTradeId === null) {
            boundary = this.addBoundary('CAPTURE_START', capturedAt, null, trade.aggregateTradeId, null);
        } else if (trade.aggregateTradeId > this.lastAggregateTradeId + 1) {
            const missingCount = trade.aggregateTradeId - this.lastAggregateTradeId - 1;
            boundary = this.addBoundary(
                'AGGREGATE_ID_GAP',
                capturedAt,
                this.lastAggregateTradeId,
                trade.aggregateTradeId,
                missingCount,
            );
            if (!this.awaitingTradeAfterReconnect) this.gapCount += 1;
            this.sequenceState = 'GAP';
        } else {
            this.sequenceState = 'LIVE';
        }

        this.trades.push(trade);
        this.retainedIds.add(trade.aggregateTradeId);
        while (this.trades.length > this.options.maxTrades) {
            const removed = this.trades.shift();
            if (removed) this.retainedIds.delete(removed.aggregateTradeId);
        }
        this.stats.acceptedCount += 1;
        this.lastAggregateTradeId = trade.aggregateTradeId;
        this.coverageStart = this.coverageStart === null
            ? trade.tradeTime
            : Math.min(this.coverageStart, trade.tradeTime);
        this.coverageEnd = this.coverageEnd === null
            ? trade.tradeTime
            : Math.max(this.coverageEnd, trade.tradeTime);
        this.latestEventTime = this.latestEventTime === null
            ? trade.eventTime
            : Math.max(this.latestEventTime, trade.eventTime);
        this.awaitingTradeAfterReconnect = false;
        if (boundary?.reason === 'CAPTURE_START') this.sequenceState = 'LIVE';

        return { status: 'ACCEPTED', trade, boundary };
    }

    markReconnect(occurredAt: number): TradeCaptureBoundaryV1 {
        const boundary = this.addBoundary(
            'RECONNECT',
            occurredAt,
            this.lastAggregateTradeId,
            null,
            null,
        );
        this.stats.reconnectCount += 1;
        if (this.lastAggregateTradeId !== null) {
            this.gapCount += 1;
            this.awaitingTradeAfterReconnect = true;
        }
        this.sequenceState = 'BUFFERING';
        return boundary;
    }

    markOffline(): void {
        this.sequenceState = 'OFFLINE';
    }

    markBuffering(): void {
        this.sequenceState = 'BUFFERING';
    }

    clear(): void {
        this.trades.length = 0;
        this.retainedIds.clear();
        this.boundaries.length = 0;
        this.stats.acceptedCount = 0;
        this.stats.duplicateCount = 0;
        this.stats.outOfOrderCount = 0;
        this.stats.invalidCount = 0;
        this.stats.reconnectCount = 0;
        this.lastAggregateTradeId = null;
        this.coverageStart = null;
        this.coverageEnd = null;
        this.latestEventTime = null;
        this.gapCount = 0;
        this.sequenceState = 'BUFFERING';
        this.boundaryOrdinal = 0;
        this.awaitingTradeAfterReconnect = false;
    }

    snapshot(capturedAt: number): AggregateTradeCaptureSnapshotV1 {
        const telemetry = this.telemetry(capturedAt);
        return AggregateTradeCaptureSnapshotV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            trades: this.trades,
            boundaries: this.boundaries,
            coverage: telemetry.coverage,
            stats: telemetry.stats,
            lastAggregateTradeId: telemetry.lastAggregateTradeId,
        });
    }

    telemetry(capturedAt: number): AggregateTradeTelemetry {
        if (!Number.isSafeInteger(capturedAt) || capturedAt < 0) {
            throw new RangeError('capturedAt must be a non-negative safe integer');
        }
        const eventTime = this.latestEventTime ?? capturedAt;
        const stale = this.sequenceState === 'LIVE' && capturedAt - eventTime > this.options.staleAfterMs;
        const sequenceState = stale ? 'STALE' : this.sequenceState;
        return {
            retainedTradeCount: this.trades.length,
            lastAggregateTradeId: this.lastAggregateTradeId,
            coverage: createCaptureCoverageV1({
                dataMode: 'LIVE',
                source: 'BINANCE_SPOT',
                venue: 'BINANCE_SPOT',
                symbol: 'BTCUSDT',
                capturedAt,
                eventTime,
                coverageStart: this.coverageStart,
                coverageEnd: this.coverageEnd,
                sequenceState,
                gapCount: this.gapCount,
                precision: 'TRADE',
                approximation: 'NONE',
            }),
            stats: { ...this.stats },
        };
    }

    private addBoundary(
        reason: TradeCaptureBoundaryReason,
        occurredAt: number,
        previousAggregateTradeId: number | null,
        nextAggregateTradeId: number | null,
        missingAggregateTradeCount: number | null,
    ): TradeCaptureBoundaryV1 {
        this.boundaryOrdinal += 1;
        const boundary = TradeCaptureBoundaryV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            boundaryId: `btcagg-${this.boundaryOrdinal}-${reason.toLowerCase()}`,
            reason,
            occurredAt,
            previousAggregateTradeId,
            nextAggregateTradeId,
            missingAggregateTradeCount,
        });
        this.boundaries.push(boundary);
        if (this.boundaries.length > this.options.maxBoundaries) this.boundaries.shift();
        return boundary;
    }
}
