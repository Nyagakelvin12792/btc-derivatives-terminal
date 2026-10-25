import {
    LiquidityHeatmapBuffer,
    SequenceSafeOrderBook,
    parseBinanceDepthDiffEvent,
    type LiquidityBootstrapResult,
    type LiquidityHeatmapBufferOptions,
    type LiquidityIngestResult,
    type SequenceSafeOrderBookOptions,
} from './liquidity-depth';
import type {
    BinanceDepthSnapshot,
    BinanceOrderBook,
    LiquidityHeatmapCoverage,
    LiquidityHeatmapFrame,
    LiquiditySequenceStatus,
} from './types';

const DEFAULT_CAPTURE_DEPTH = 1_000;
const DEFAULT_STALE_AFTER_MS = 5_000;

export interface BinanceLiquidityEngineOptions {
    orderBook?: SequenceSafeOrderBookOptions;
    heatmap: LiquidityHeatmapBufferOptions;
    captureDepth?: number;
    staleAfterMs?: number;
}

export interface BinanceLiquidityEngineState {
    sequence: LiquiditySequenceStatus;
    coverage: LiquidityHeatmapCoverage;
    frames: readonly LiquidityHeatmapFrame[];
    book: BinanceOrderBook | null;
    resyncRequired: boolean;
}

export interface BinanceLiquidityEngineTelemetry {
    sequence: LiquiditySequenceStatus;
    coverage: LiquidityHeatmapCoverage;
    resyncRequired: boolean;
}

function positiveInteger(value: number | undefined, fallback: number, field: string): number {
    const resolved = value ?? fallback;
    if (!Number.isSafeInteger(resolved) || resolved < 1) throw new RangeError(`${field} must be a positive integer`);
    return resolved;
}

/**
 * Integration boundary for the future liquidity worker/hook. It intentionally
 * performs no networking: the caller owns WebSocket lifecycle and fresh REST
 * snapshot fetching, while this engine owns deterministic sequence validity.
 */
export class BinanceLiquidityEngine {
    private readonly orderBook: SequenceSafeOrderBook;
    private readonly heatmap: LiquidityHeatmapBuffer;
    private readonly captureDepth: number;
    private readonly staleAfterMs: number;
    private resyncRequired = false;
    private lastObservedEventTime: number | null = null;

    constructor(options: BinanceLiquidityEngineOptions) {
        this.orderBook = new SequenceSafeOrderBook(options.orderBook);
        this.heatmap = new LiquidityHeatmapBuffer(options.heatmap);
        this.captureDepth = positiveInteger(options.captureDepth, DEFAULT_CAPTURE_DEPTH, 'captureDepth');
        this.staleAfterMs = positiveInteger(options.staleAfterMs, DEFAULT_STALE_AFTER_MS, 'staleAfterMs');
    }

    ingestPayload(payload: unknown): LiquidityIngestResult {
        const event = parseBinanceDepthDiffEvent(payload);
        this.lastObservedEventTime = event.eventTime;
        const result = this.orderBook.ingest(event);
        if (result === 'RESYNC_REQUIRED') this.requireResync();
        return result;
    }

    bootstrap(snapshot: BinanceDepthSnapshot): LiquidityBootstrapResult {
        if (snapshot.dataMode !== 'LIVE' || snapshot.source !== 'BINANCE_SPOT' || snapshot.symbol !== 'BTCUSDT') {
            throw new TypeError('Unsupported Binance depth snapshot contract');
        }
        const result = this.orderBook.bootstrap(snapshot.book);
        if (result.state === 'RESYNC_REQUIRED') {
            this.requireResync();
            return result;
        }
        const snapshotTime = Date.parse(snapshot.timestamp);
        if (Number.isFinite(snapshotTime) && this.lastObservedEventTime === null) this.lastObservedEventTime = snapshotTime;
        this.resyncRequired = false;
        return result;
    }

    capture(now = Date.now()): LiquidityHeatmapFrame | null {
        const status = this.orderBook.getStatus(now, this.staleAfterMs);
        if (status.state !== 'LIVE' || this.resyncRequired) return null;
        const book = this.orderBook.getBook(this.captureDepth);
        if (!book) return null;
        return this.heatmap.append(book, now, this.lastObservedEventTime ?? now);
    }

    beginReconnect(): void {
        this.orderBook.startResync();
        this.resyncRequired = true;
        this.lastObservedEventTime = null;
        this.heatmap.clear();
    }

    markOffline(): void {
        this.orderBook.markOffline();
        this.resyncRequired = true;
    }

    clearHistory(): void {
        this.heatmap.clear();
    }

    getState(now = Date.now()): BinanceLiquidityEngineState {
        return {
            sequence: this.orderBook.getStatus(now, this.staleAfterMs),
            coverage: this.heatmap.getCoverage(),
            frames: this.heatmap.getFrames(),
            book: this.orderBook.getBook(this.captureDepth),
            resyncRequired: this.resyncRequired,
        };
    }

    getTelemetry(now = Date.now()): BinanceLiquidityEngineTelemetry {
        return {
            sequence: this.orderBook.getStatus(now, this.staleAfterMs),
            coverage: this.heatmap.getCoverage(),
            resyncRequired: this.resyncRequired,
        };
    }

    private requireResync(): void {
        this.resyncRequired = true;
        this.heatmap.clear();
    }
}
