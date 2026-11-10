import type { AggregateTradeTapeOptions } from './aggregate-trade-tape';
import type {
    AggregateTradeCaptureStatsV1,
    CaptureCoverageV1,
    ClassifiedTradeV1,
    TradeCaptureBoundaryV1,
} from './contracts';
import { TrueFlowIntervalSchema, type TrueFlowInterval, type TrueFlowSnapshotV1 } from './true-flow-contracts';

export type AggregateTradeWorkerErrorCode = 'INVALID_CONFIG' | 'INVALID_EVENT' | 'SOCKET_UNAVAILABLE' | 'DERIVATION_LIMIT';

export interface AggregateTradeWorkerConfig extends AggregateTradeTapeOptions {
    streamUrl: string;
    flushIntervalMs: number;
    statusIntervalMs: number;
    reconnectBaseMs: number;
    reconnectMaxMs: number;
    trueFlowInterval: TrueFlowInterval;
    trueFlowPriceBucket: number;
    trueFlowValueAreaFraction: number;
    maxDerivedSegments: number;
    maxDerivedBars: number;
    maxFootprintCellsPerBar: number;
    maxTradeProfileRows: number;
}

export type AggregateTradeWorkerConfigOverrides = Partial<AggregateTradeWorkerConfig>;

export type AggregateTradeWorkerCommand =
    | { type: 'START'; config: AggregateTradeWorkerConfig; footprintInterval?: TrueFlowInterval | null }
    | { type: 'SET_INTERVALS'; main: TrueFlowInterval; footprint: TrueFlowInterval | null }
    | { type: 'CLEAR' }
    | { type: 'STOP' };

export type AggregateTradeWorkerEvent =
    | { type: 'TRADE_BATCH'; trades: ClassifiedTradeV1[] }
    | { type: 'TRUE_FLOW_SNAPSHOT'; snapshot: TrueFlowSnapshotV1 | null }
    | { type: 'FOOTPRINT_SNAPSHOT'; snapshot: TrueFlowSnapshotV1 | null }
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
    streamUrl: 'wss://data-stream.binance.vision/stream?streams=btcusdt@aggTrade',
    flushIntervalMs: 250,
    statusIntervalMs: 1_000,
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 15_000,
    staleAfterMs: 5_000,
    maxTrades: 50_000,
    maxBoundaries: 1_000,
    trueFlowInterval: '1m',
    trueFlowPriceBucket: 10,
    trueFlowValueAreaFraction: 0.7,
    maxDerivedSegments: 1_000,
    maxDerivedBars: 20_000,
    maxFootprintCellsPerBar: 5_000,
    maxTradeProfileRows: 20_000,
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
    if (!TrueFlowIntervalSchema.safeParse(config.trueFlowInterval).success) {
        throw new RangeError('trueFlowInterval was invalid');
    }
    if (!Number.isFinite(config.trueFlowPriceBucket) || config.trueFlowPriceBucket <= 0) {
        throw new RangeError('trueFlowPriceBucket must be positive');
    }
    if (!Number.isFinite(config.trueFlowValueAreaFraction)
        || config.trueFlowValueAreaFraction < 0.5
        || config.trueFlowValueAreaFraction > 0.99) {
        throw new RangeError('trueFlowValueAreaFraction must be between 0.5 and 0.99');
    }
    config.maxDerivedSegments = positiveInteger(config.maxDerivedSegments, 'maxDerivedSegments');
    config.maxDerivedBars = positiveInteger(config.maxDerivedBars, 'maxDerivedBars');
    config.maxFootprintCellsPerBar = positiveInteger(config.maxFootprintCellsPerBar, 'maxFootprintCellsPerBar');
    config.maxTradeProfileRows = positiveInteger(config.maxTradeProfileRows, 'maxTradeProfileRows');
    if (config.reconnectMaxMs < config.reconnectBaseMs) {
        throw new RangeError('reconnectMaxMs must be greater than or equal to reconnectBaseMs');
    }
    return config;
}
