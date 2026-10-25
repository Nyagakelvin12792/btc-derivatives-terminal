import type { AggregateTradeTapeOptions } from './aggregate-trade-tape';
import type {
    AggregateTradeCaptureStatsV1,
    CaptureCoverageV1,
    ClassifiedTradeV1,
    TradeCaptureBoundaryV1,
} from './contracts';

export type AggregateTradeWorkerErrorCode = 'INVALID_CONFIG' | 'INVALID_EVENT' | 'SOCKET_UNAVAILABLE';

export interface AggregateTradeWorkerConfig extends AggregateTradeTapeOptions {
    streamUrl: string;
    flushIntervalMs: number;
    statusIntervalMs: number;
    reconnectBaseMs: number;
    reconnectMaxMs: number;
}

export type AggregateTradeWorkerConfigOverrides = Partial<AggregateTradeWorkerConfig>;

export type AggregateTradeWorkerCommand =
    | { type: 'START'; config: AggregateTradeWorkerConfig }
    | { type: 'CLEAR' }
    | { type: 'STOP' };

export type AggregateTradeWorkerEvent =
    | { type: 'TRADE_BATCH'; trades: ClassifiedTradeV1[] }
    | { type: 'BOUNDARY'; boundary: TradeCaptureBoundaryV1 }
    | {
        type: 'STATUS';
        connected: boolean;
        reconnectAttempt: number;
        retainedTradeCount: number;
        lastAggregateTradeId: number | null;
        coverage: CaptureCoverageV1;
        stats: AggregateTradeCaptureStatsV1;
    }
    | { type: 'RESET' }
    | { type: 'ERROR'; code: AggregateTradeWorkerErrorCode; message: string; recoverable: boolean };

const DEFAULT_CONFIG: AggregateTradeWorkerConfig = Object.freeze({
    streamUrl: 'wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade',
    flushIntervalMs: 250,
    statusIntervalMs: 1_000,
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 15_000,
    staleAfterMs: 5_000,
    maxTrades: 50_000,
    maxBoundaries: 1_000,
});

function positiveInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${field} must be a positive integer`);
    return value;
}

function websocketUrl(value: string): string {
    if (!value || typeof value !== 'string') throw new TypeError('streamUrl must be a non-empty URL');
    const parsed = new URL(value);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
        throw new TypeError('streamUrl must use ws or wss');
    }
    return parsed.toString();
}

export function createAggregateTradeWorkerConfig(
    overrides: AggregateTradeWorkerConfigOverrides = {},
): AggregateTradeWorkerConfig {
    const config = { ...DEFAULT_CONFIG, ...overrides };
    config.streamUrl = websocketUrl(config.streamUrl);
    config.flushIntervalMs = positiveInteger(config.flushIntervalMs, 'flushIntervalMs');
    config.statusIntervalMs = positiveInteger(config.statusIntervalMs, 'statusIntervalMs');
    config.reconnectBaseMs = positiveInteger(config.reconnectBaseMs, 'reconnectBaseMs');
    config.reconnectMaxMs = positiveInteger(config.reconnectMaxMs, 'reconnectMaxMs');
    config.staleAfterMs = positiveInteger(config.staleAfterMs, 'staleAfterMs');
    config.maxTrades = positiveInteger(config.maxTrades, 'maxTrades');
    config.maxBoundaries = positiveInteger(config.maxBoundaries, 'maxBoundaries');
    if (config.reconnectMaxMs < config.reconnectBaseMs) {
        throw new RangeError('reconnectMaxMs must be greater than or equal to reconnectBaseMs');
    }
    return config;
}
