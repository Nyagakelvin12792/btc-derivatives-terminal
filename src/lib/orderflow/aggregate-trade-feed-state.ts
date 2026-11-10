import { createCaptureCoverageV1 } from './provenance';
import type {
    AggregateTradeCaptureStatsV1,
    CaptureCoverageV1,
    ClassifiedTradeV1,
    TradeCaptureBoundaryV1,
} from './contracts';
import type { AggregateTradeWorkerErrorCode, AggregateTradeWorkerEvent } from './aggregate-trade-worker-protocol';
import type { TrueFlowSnapshotV1 } from './true-flow-contracts';

export type AggregateTradeCapabilityState = 'CHECKING' | 'DISABLED' | 'ENABLED' | 'ERROR';

export interface AggregateTradeFeedError {
    code: AggregateTradeWorkerErrorCode | 'CONFIG_UNAVAILABLE';
    message: string;
    recoverable: boolean;
}

export interface AggregateTradeFeedState {
    capability: AggregateTradeCapabilityState;
    trades: ClassifiedTradeV1[];
    boundaries: TradeCaptureBoundaryV1[];
    coverage: CaptureCoverageV1;
    stats: AggregateTradeCaptureStatsV1;
    connected: boolean;
    reconnectAttempt: number;
    retainedTradeCount: number;
    lastAggregateTradeId: number | null;
    maxClientTrades: number;
    maxClientBoundaries: number;
    error: AggregateTradeFeedError | null;
    trueFlow: TrueFlowSnapshotV1 | null;
    footprintFlow: TrueFlowSnapshotV1 | null;
}

function offlineCoverage(): CaptureCoverageV1 {
    return createCaptureCoverageV1({
        dataMode: 'SHADOW',
        source: 'BINANCE_SPOT',
        venue: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        capturedAt: 0,
        eventTime: 0,
        coverageStart: null,
        coverageEnd: null,
        sequenceState: 'OFFLINE',
        gapCount: 0,
        precision: 'TRADE',
        approximation: 'NONE',
    });
}

export function createInitialAggregateTradeFeedState(
    maxClientTrades: number,
    maxClientBoundaries: number,
): AggregateTradeFeedState {
    return {
        capability: 'CHECKING',
        trades: [],
        boundaries: [],
        coverage: offlineCoverage(),
        stats: { acceptedCount: 0, duplicateCount: 0, outOfOrderCount: 0, invalidCount: 0, reconnectCount: 0 },
        connected: false,
        reconnectAttempt: 0,
        retainedTradeCount: 0,
        lastAggregateTradeId: null,
        maxClientTrades,
        maxClientBoundaries,
        error: null,
        trueFlow: null,
        footprintFlow: null,
    };
}

/**
 * Structured-clone worker messages replace every object. Keep the validated
 * cells for unchanged candle fragments while accepting fresh coverage metadata.
 */
function reuseUnchangedCells(
    previous: TrueFlowSnapshotV1 | null,
    next: TrueFlowSnapshotV1 | null,
): TrueFlowSnapshotV1 | null {
    if (!previous || !next || previous.interval !== next.interval || previous.priceBucket !== next.priceBucket) {
        return next;
    }
    const previousBars = new Map(previous.footprintBars.map((bar) =>
        [`${bar.segmentId}:${bar.footprint.openTime}`, bar.footprint]));
    return {
        ...next,
        footprintBars: next.footprintBars.map((bar) => {
            const old = previousBars.get(`${bar.segmentId}:${bar.footprint.openTime}`);
            const current = bar.footprint;
            if (!old || old.firstAggregateTradeId === undefined || old.lastAggregateTradeId === undefined
                || old.firstAggregateTradeId !== current.firstAggregateTradeId
                || old.lastAggregateTradeId !== current.lastAggregateTradeId) return bar;
            return { ...bar, footprint: { ...current, cells: old.cells } };
        }),
    };
}

export function reduceAggregateTradeFeedEvent(
    state: AggregateTradeFeedState,
    event: AggregateTradeWorkerEvent,
): AggregateTradeFeedState {
    switch (event.type) {
        case 'TRADE_BATCH':
            return {
                ...state,
                trades: [...state.trades, ...event.trades].slice(-state.maxClientTrades),
            };
        case 'BOUNDARY':
            return {
                ...state,
                boundaries: [...state.boundaries, event.boundary].slice(-state.maxClientBoundaries),
            };
        case 'TRUE_FLOW_SNAPSHOT':
            return {
                ...state,
                trueFlow: reuseUnchangedCells(state.trueFlow, event.snapshot),
            };
        case 'FOOTPRINT_SNAPSHOT':
            return { ...state, footprintFlow: reuseUnchangedCells(state.footprintFlow, event.snapshot) };
        case 'STATUS':
            return {
                ...state,
                connected: event.connected,
                reconnectAttempt: event.reconnectAttempt,
                retainedTradeCount: event.retainedTradeCount,
                lastAggregateTradeId: event.lastAggregateTradeId,
                coverage: event.coverage,
                stats: event.stats,
                error: event.coverage.sequenceState === 'LIVE' ? null : state.error,
            };
        case 'RESET':
            return {
                ...createInitialAggregateTradeFeedState(state.maxClientTrades, state.maxClientBoundaries),
                capability: state.capability,
            };
        case 'ERROR':
            return {
                ...state,
                error: { code: event.code, message: event.message, recoverable: event.recoverable },
            };
    }
}
