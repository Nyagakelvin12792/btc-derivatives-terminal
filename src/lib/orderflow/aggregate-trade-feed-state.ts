import { createCaptureCoverageV1 } from './provenance';
import type {
    AggregateTradeCaptureStatsV1,
    CaptureCoverageV1,
    ClassifiedTradeV1,
    TradeCaptureBoundaryV1,
} from './contracts';
import type { AggregateTradeWorkerErrorCode, AggregateTradeWorkerEvent } from './aggregate-trade-worker-protocol';

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
