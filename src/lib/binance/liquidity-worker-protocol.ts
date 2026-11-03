import type { LiquidityHeatmapBufferOptions, SequenceSafeOrderBookOptions } from './liquidity-depth';
import type {
    LiquidityHeatmapCoverage,
    LiquidityHeatmapFrame,
    LiquiditySequenceStatus,
} from './types';

export type LiquidityResetReason = 'CLEAR' | 'GAP' | 'RECONNECT';
export type LiquidityWorkerErrorCode = 'INVALID_CONFIG' | 'INVALID_EVENT' | 'SNAPSHOT_UNAVAILABLE' | 'SOCKET_UNAVAILABLE';

export interface LiquidityWorkerConfig {
    snapshotUrl: string;
    streamUrl: string;
    captureIntervalMs: number;
    statusIntervalMs: number;
    snapshotRetryMs: number;
    reconnectBaseMs: number;
    reconnectMaxMs: number;
    captureDepth: number;
    staleAfterMs: number;
    maxClientFrames: number;
    orderBook: SequenceSafeOrderBookOptions;
    heatmap: LiquidityHeatmapBufferOptions;
}

export type LiquidityWorkerConfigOverrides = Partial<Omit<LiquidityWorkerConfig, 'heatmap' | 'orderBook'>> & {
    heatmap?: Partial<LiquidityHeatmapBufferOptions>;
    orderBook?: SequenceSafeOrderBookOptions;
};

export type LiquidityWorkerCommand =
    | { type: 'START'; config: LiquidityWorkerConfig }
    | { type: 'PAUSE' }
    | { type: 'RESUME' }
    | { type: 'CLEAR' }
    | { type: 'STOP' };

export type LiquidityWorkerEvent =
    | {
        type: 'STATUS';
        connected: boolean;
        paused: boolean;
        reconnectAttempt: number;
        resyncRequired: boolean;
        sequence: LiquiditySequenceStatus;
        coverage: LiquidityHeatmapCoverage;
    }
    | { type: 'FRAME'; frame: LiquidityHeatmapFrame; coverage: LiquidityHeatmapCoverage }
    | { type: 'RESET'; reason: LiquidityResetReason }
    | { type: 'ERROR'; code: LiquidityWorkerErrorCode; message: string; recoverable: boolean };

const DEFAULT_CONFIG: LiquidityWorkerConfig = {
    snapshotUrl: '/api/binance/depth?limit=500',
    streamUrl: 'wss://stream.binance.com:9443/ws/btcusdt@depth@100ms',
    captureIntervalMs: 500,
    statusIntervalMs: 2_000,
    snapshotRetryMs: 500,
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 15_000,
    captureDepth: 1_000,
    staleAfterMs: 5_000,
    maxClientFrames: 1_800,
    orderBook: { maxBufferedEvents: 5_000, maxLevelsPerSide: 5_000 },
    heatmap: {
        tickSize: 10,
        visibleDepthBps: 100,
        minNotionalUsd: 0,
        maxFrames: 1_800,
        bucketMs: 500,
        maxLevelsPerSide: 400,
    },
};

function positiveInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${field} must be a positive integer`);
    return value;
}

function supportedUrl(value: string, protocol: 'http' | 'ws', field: string): string {
    if (!value || typeof value !== 'string') throw new TypeError(`${field} must be a non-empty URL`);
    if (value.startsWith('/')) {
        if (protocol !== 'http') throw new TypeError(`${field} must use ws or wss`);
        return value;
    }
    const parsed = new URL(value);
    const supported = protocol === 'http'
        ? parsed.protocol === 'http:' || parsed.protocol === 'https:'
        : parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    if (!supported) throw new TypeError(`${field} used an unsupported protocol`);
    return parsed.toString();
}

export function createLiquidityWorkerConfig(overrides: LiquidityWorkerConfigOverrides = {}): LiquidityWorkerConfig {
    const config: LiquidityWorkerConfig = {
        ...DEFAULT_CONFIG,
        ...overrides,
        orderBook: { ...DEFAULT_CONFIG.orderBook, ...overrides.orderBook },
        heatmap: { ...DEFAULT_CONFIG.heatmap, ...overrides.heatmap },
    };
    config.snapshotUrl = supportedUrl(config.snapshotUrl, 'http', 'snapshotUrl');
    config.streamUrl = supportedUrl(config.streamUrl, 'ws', 'streamUrl');
    config.captureIntervalMs = positiveInteger(config.captureIntervalMs, 'captureIntervalMs');
    config.statusIntervalMs = positiveInteger(config.statusIntervalMs, 'statusIntervalMs');
    config.snapshotRetryMs = positiveInteger(config.snapshotRetryMs, 'snapshotRetryMs');
    config.reconnectBaseMs = positiveInteger(config.reconnectBaseMs, 'reconnectBaseMs');
    config.reconnectMaxMs = positiveInteger(config.reconnectMaxMs, 'reconnectMaxMs');
    config.captureDepth = positiveInteger(config.captureDepth, 'captureDepth');
    config.staleAfterMs = positiveInteger(config.staleAfterMs, 'staleAfterMs');
    config.maxClientFrames = positiveInteger(config.maxClientFrames, 'maxClientFrames');
    if (config.reconnectMaxMs < config.reconnectBaseMs) {
        throw new RangeError('reconnectMaxMs must be greater than or equal to reconnectBaseMs');
    }
    return config;
}
