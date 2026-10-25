import { BINANCE_MARKET_SCHEMA_VERSION } from './types';
import type {
    BinanceDepthDiffEvent,
    BinanceDepthLevelUpdate,
    BinanceOrderBook,
    LiquidityHeatmapCoverage,
    LiquidityHeatmapFrame,
    LiquidityHeatmapLevel,
    LiquiditySequenceState,
    LiquiditySequenceStatus,
} from './types';

const DEFAULT_MAX_BUFFERED_EVENTS = 5_000;
const DEFAULT_MAX_LEVELS_PER_SIDE = 5_000;
const DEFAULT_STALE_AFTER_MS = 5_000;

export class BinanceDepthPayloadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BinanceDepthPayloadError';
    }
}

function finiteNumber(value: unknown, field: string): number {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isFinite(parsed)) throw new BinanceDepthPayloadError(`Invalid Binance ${field}`);
    return parsed;
}

function nonNegativeSafeInteger(value: unknown, field: string): number {
    const parsed = finiteNumber(value, field);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new BinanceDepthPayloadError(`Invalid Binance ${field}`);
    }
    return parsed;
}

function parseLevelUpdates(payload: unknown, side: 'bid' | 'ask'): BinanceDepthLevelUpdate[] {
    if (!Array.isArray(payload)) throw new BinanceDepthPayloadError(`Binance ${side} updates were not an array`);
    return payload.map((entry, index) => {
        if (!Array.isArray(entry) || entry.length < 2) {
            throw new BinanceDepthPayloadError(`Invalid Binance ${side} update at index ${index}`);
        }
        const price = finiteNumber(entry[0], `${side} update price`);
        const quantity = finiteNumber(entry[1], `${side} update quantity`);
        if (price <= 0 || quantity < 0) {
            throw new BinanceDepthPayloadError(`Invalid Binance ${side} update at index ${index}`);
        }
        return { price, quantity };
    });
}

export function parseBinanceDepthDiffEvent(payload: unknown): BinanceDepthDiffEvent {
    if (!payload || typeof payload !== 'object') {
        throw new BinanceDepthPayloadError('Binance depth event was not an object');
    }
    const record = payload as Record<string, unknown>;
    if (record.e !== 'depthUpdate' || record.s !== 'BTCUSDT') {
        throw new BinanceDepthPayloadError('Binance depth event had an unsupported type or symbol');
    }
    const firstUpdateId = nonNegativeSafeInteger(record.U, 'depth first update ID');
    const finalUpdateId = nonNegativeSafeInteger(record.u, 'depth final update ID');
    if (finalUpdateId < firstUpdateId) {
        throw new BinanceDepthPayloadError('Binance depth update ID range was reversed');
    }
    return {
        eventTime: nonNegativeSafeInteger(record.E, 'depth event time'),
        symbol: 'BTCUSDT',
        firstUpdateId,
        finalUpdateId,
        bids: parseLevelUpdates(record.b, 'bid'),
        asks: parseLevelUpdates(record.a, 'ask'),
    };
}

export type LiquidityIngestResult = 'BUFFERED' | 'APPLIED' | 'IGNORED_STALE' | 'RESYNC_REQUIRED';

export interface LiquidityBootstrapResult {
    state: 'LIVE' | 'RESYNC_REQUIRED';
    appliedBufferedEvents: number;
    discardedStaleEvents: number;
}

export interface SequenceSafeOrderBookOptions {
    maxBufferedEvents?: number;
    maxLevelsPerSide?: number;
}

function positiveInteger(value: number | undefined, fallback: number, field: string): number {
    const resolved = value ?? fallback;
    if (!Number.isSafeInteger(resolved) || resolved < 1) throw new RangeError(`${field} must be a positive integer`);
    return resolved;
}

/**
 * Maintains a Binance Spot local order book using the official REST-snapshot +
 * diff-depth U/u sequence contract. A detected gap invalidates the current book
 * immediately; callers must fetch a fresh snapshot and bootstrap again.
 */
export class SequenceSafeOrderBook {
    private readonly maxBufferedEvents: number;
    private readonly maxLevelsPerSide: number;
    private readonly bids = new Map<number, number>();
    private readonly asks = new Map<number, number>();
    private bufferedEvents: BinanceDepthDiffEvent[] = [];
    private phase: Exclude<LiquiditySequenceState, 'STALE'> = 'BUFFERING';
    private lastUpdateId: number | null = null;
    private lastEventTime: number | null = null;
    private gapCount = 0;
    private successfulBootstrapCount = 0;

    constructor(options: SequenceSafeOrderBookOptions = {}) {
        this.maxBufferedEvents = positiveInteger(options.maxBufferedEvents, DEFAULT_MAX_BUFFERED_EVENTS, 'maxBufferedEvents');
        this.maxLevelsPerSide = positiveInteger(options.maxLevelsPerSide, DEFAULT_MAX_LEVELS_PER_SIDE, 'maxLevelsPerSide');
    }

    ingest(event: BinanceDepthDiffEvent): LiquidityIngestResult {
        this.assertEvent(event);
        this.lastEventTime = event.eventTime;
        if (this.phase !== 'LIVE' || this.lastUpdateId === null) {
            this.phase = this.phase === 'OFFLINE' ? 'BUFFERING' : this.phase;
            this.bufferEvent(event);
            return this.phase === 'GAP' ? 'RESYNC_REQUIRED' : 'BUFFERED';
        }
        return this.applyLiveEvent(event);
    }

    ingestPayload(payload: unknown): LiquidityIngestResult {
        return this.ingest(parseBinanceDepthDiffEvent(payload));
    }

    bootstrap(snapshot: BinanceOrderBook): LiquidityBootstrapResult {
        this.assertSnapshot(snapshot);
        const pending = this.bufferedEvents.filter((event) => event.finalUpdateId > snapshot.lastUpdateId);
        const discardedStaleEvents = this.bufferedEvents.length - pending.length;
        const nextUpdateId = snapshot.lastUpdateId + 1;

        if (pending.length > 0 && pending[0].firstUpdateId > nextUpdateId) {
            this.invalidateForGap(pending);
            return { state: 'RESYNC_REQUIRED', appliedBufferedEvents: 0, discardedStaleEvents };
        }

        this.replaceBook(snapshot);
        this.bufferedEvents = [];
        this.phase = 'LIVE';
        this.lastUpdateId = snapshot.lastUpdateId;
        let appliedBufferedEvents = 0;

        for (let index = 0; index < pending.length; index += 1) {
            const event = pending[index];
            const result = this.applyLiveEvent(event);
            if (result === 'RESYNC_REQUIRED') {
                for (const remaining of pending.slice(index + 1)) this.bufferEvent(remaining);
                return { state: 'RESYNC_REQUIRED', appliedBufferedEvents, discardedStaleEvents };
            }
            if (result === 'APPLIED') appliedBufferedEvents += 1;
        }

        this.successfulBootstrapCount += 1;
        return { state: 'LIVE', appliedBufferedEvents, discardedStaleEvents };
    }

    startResync(): void {
        this.phase = 'BUFFERING';
        this.lastUpdateId = null;
        this.bids.clear();
        this.asks.clear();
        this.bufferedEvents = [];
    }

    markOffline(): void {
        this.phase = 'OFFLINE';
        this.lastUpdateId = null;
        this.bids.clear();
        this.asks.clear();
        this.bufferedEvents = [];
    }

    getBook(depthLimit = this.maxLevelsPerSide): BinanceOrderBook | null {
        if (this.phase !== 'LIVE' || this.lastUpdateId === null) return null;
        const limit = positiveInteger(depthLimit, this.maxLevelsPerSide, 'depthLimit');
        const bids = [...this.bids.entries()]
            .sort((left, right) => right[0] - left[0])
            .slice(0, limit)
            .map(([price, quantity]) => ({ price, quantity, notionalUsd: price * quantity }));
        const asks = [...this.asks.entries()]
            .sort((left, right) => left[0] - right[0])
            .slice(0, limit)
            .map(([price, quantity]) => ({ price, quantity, notionalUsd: price * quantity }));
        if (!bids.length || !asks.length) return null;

        const bestBid = bids[0].price;
        const bestAsk = asks[0].price;
        const midPrice = (bestBid + bestAsk) / 2;
        const spread = bestAsk - bestBid;
        const bidDepthUsd = bids.reduce((sum, level) => sum + level.notionalUsd, 0);
        const askDepthUsd = asks.reduce((sum, level) => sum + level.notionalUsd, 0);
        const combinedDepth = bidDepthUsd + askDepthUsd;
        return {
            lastUpdateId: this.lastUpdateId,
            bids,
            asks,
            bestBid,
            bestAsk,
            midPrice,
            spread,
            spreadBps: midPrice > 0 ? (spread / midPrice) * 10_000 : 0,
            bidDepthUsd,
            askDepthUsd,
            imbalance: combinedDepth > 0 ? (bidDepthUsd - askDepthUsd) / combinedDepth : 0,
        };
    }

    getStatus(now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS): LiquiditySequenceStatus {
        if (!Number.isFinite(now) || now < 0) throw new RangeError('now must be a non-negative finite timestamp');
        if (!Number.isFinite(staleAfterMs) || staleAfterMs < 1) throw new RangeError('staleAfterMs must be positive');
        let state: LiquiditySequenceState = this.phase;
        if (state === 'LIVE' && this.lastEventTime !== null && now - this.lastEventTime > staleAfterMs) state = 'STALE';
        return {
            state,
            lastUpdateId: this.lastUpdateId,
            lastEventTime: this.lastEventTime,
            bufferedEventCount: this.bufferedEvents.length,
            gapCount: this.gapCount,
            successfulBootstrapCount: this.successfulBootstrapCount,
        };
    }

    private applyLiveEvent(event: BinanceDepthDiffEvent): LiquidityIngestResult {
        if (this.lastUpdateId === null) {
            this.bufferEvent(event);
            return 'BUFFERED';
        }
        if (event.finalUpdateId <= this.lastUpdateId) return 'IGNORED_STALE';
        const nextUpdateId = this.lastUpdateId + 1;
        if (event.firstUpdateId > nextUpdateId) {
            this.invalidateForGap([event]);
            return 'RESYNC_REQUIRED';
        }
        if (event.finalUpdateId < nextUpdateId) return 'IGNORED_STALE';

        this.applySide(this.bids, event.bids);
        this.applySide(this.asks, event.asks);
        this.pruneSides();
        this.lastUpdateId = event.finalUpdateId;
        this.lastEventTime = event.eventTime;
        return 'APPLIED';
    }

    private replaceBook(snapshot: BinanceOrderBook): void {
        this.bids.clear();
        this.asks.clear();
        snapshot.bids.forEach((level) => this.bids.set(level.price, level.quantity));
        snapshot.asks.forEach((level) => this.asks.set(level.price, level.quantity));
        this.pruneSides();
    }

    private applySide(side: Map<number, number>, updates: readonly BinanceDepthLevelUpdate[]): void {
        for (const update of updates) {
            if (update.quantity === 0) side.delete(update.price);
            else side.set(update.price, update.quantity);
        }
    }

    private pruneSides(): void {
        const keepBids = [...this.bids.keys()].sort((left, right) => right - left).slice(0, this.maxLevelsPerSide);
        const keepAsks = [...this.asks.keys()].sort((left, right) => left - right).slice(0, this.maxLevelsPerSide);
        const bidKeepSet = new Set(keepBids);
        const askKeepSet = new Set(keepAsks);
        for (const price of this.bids.keys()) if (!bidKeepSet.has(price)) this.bids.delete(price);
        for (const price of this.asks.keys()) if (!askKeepSet.has(price)) this.asks.delete(price);
    }

    private bufferEvent(event: BinanceDepthDiffEvent): void {
        this.bufferedEvents.push(event);
        if (this.bufferedEvents.length > this.maxBufferedEvents) {
            this.bufferedEvents.splice(0, this.bufferedEvents.length - this.maxBufferedEvents);
        }
    }

    private invalidateForGap(events: readonly BinanceDepthDiffEvent[]): void {
        this.gapCount += 1;
        this.phase = 'GAP';
        this.lastUpdateId = null;
        this.bids.clear();
        this.asks.clear();
        this.bufferedEvents = [];
        for (const event of events) this.bufferEvent(event);
    }

    private assertEvent(event: BinanceDepthDiffEvent): void {
        if (event.symbol !== 'BTCUSDT') throw new BinanceDepthPayloadError('Unsupported Binance depth symbol');
        if (!Number.isSafeInteger(event.firstUpdateId) || !Number.isSafeInteger(event.finalUpdateId)
            || event.firstUpdateId < 0 || event.finalUpdateId < event.firstUpdateId) {
            throw new BinanceDepthPayloadError('Invalid Binance depth update IDs');
        }
        if (!Number.isSafeInteger(event.eventTime) || event.eventTime < 0) {
            throw new BinanceDepthPayloadError('Invalid Binance depth event time');
        }
        for (const update of [...event.bids, ...event.asks]) {
            if (!Number.isFinite(update.price) || update.price <= 0 || !Number.isFinite(update.quantity) || update.quantity < 0) {
                throw new BinanceDepthPayloadError('Invalid Binance depth level update');
            }
        }
    }

    private assertSnapshot(snapshot: BinanceOrderBook): void {
        if (!Number.isSafeInteger(snapshot.lastUpdateId) || snapshot.lastUpdateId < 0) {
            throw new BinanceDepthPayloadError('Invalid Binance depth snapshot update ID');
        }
        if (!snapshot.bids.length || !snapshot.asks.length) {
            throw new BinanceDepthPayloadError('Binance depth snapshot was empty');
        }
        for (const level of [...snapshot.bids, ...snapshot.asks]) {
            if (!Number.isFinite(level.price) || level.price <= 0 || !Number.isFinite(level.quantity) || level.quantity < 0) {
                throw new BinanceDepthPayloadError('Invalid Binance depth snapshot level');
            }
        }
    }
}

export interface LiquidityHeatmapBufferOptions {
    tickSize: number;
    visibleDepthBps: number;
    minNotionalUsd?: number;
    maxFrames?: number;
    bucketMs?: number;
    maxLevelsPerSide?: number;
}

function positiveFinite(value: number | undefined, fallback: number, field: string): number {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved <= 0) throw new RangeError(`${field} must be positive`);
    return resolved;
}

export class LiquidityHeatmapBuffer {
    private readonly tickSize: number;
    private readonly visibleDepthBps: number;
    private readonly minNotionalUsd: number;
    private readonly maxFrames: number;
    private readonly bucketMs: number;
    private readonly maxLevelsPerSide: number;
    private frames: LiquidityHeatmapFrame[] = [];

    constructor(options: LiquidityHeatmapBufferOptions) {
        this.tickSize = positiveFinite(options.tickSize, 1, 'tickSize');
        this.visibleDepthBps = positiveFinite(options.visibleDepthBps, 100, 'visibleDepthBps');
        this.minNotionalUsd = options.minNotionalUsd ?? 0;
        if (!Number.isFinite(this.minNotionalUsd) || this.minNotionalUsd < 0) throw new RangeError('minNotionalUsd must be non-negative');
        this.maxFrames = positiveInteger(options.maxFrames, 1_800, 'maxFrames');
        this.bucketMs = positiveInteger(options.bucketMs, 500, 'bucketMs');
        this.maxLevelsPerSide = positiveInteger(options.maxLevelsPerSide, 400, 'maxLevelsPerSide');
    }

    append(book: BinanceOrderBook, capturedAt: number, eventTime: number): LiquidityHeatmapFrame | null {
        if (!Number.isSafeInteger(capturedAt) || capturedAt < 0 || !Number.isSafeInteger(eventTime) || eventTime < 0) {
            throw new RangeError('Heatmap timestamps must be non-negative safe integers');
        }
        const previous = this.frames[this.frames.length - 1];
        if (previous && capturedAt < previous.capturedAt) return null;

        const frame: LiquidityHeatmapFrame = {
            schemaVersion: BINANCE_MARKET_SCHEMA_VERSION,
            source: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            venue: 'BINANCE_SPOT',
            capturedAt,
            eventTime,
            lastUpdateId: book.lastUpdateId,
            bestBid: book.bestBid,
            bestAsk: book.bestAsk,
            midPrice: book.midPrice,
            levels: this.aggregateLevels(book),
        };

        const bucket = Math.floor(capturedAt / this.bucketMs);
        const previousBucket = previous ? Math.floor(previous.capturedAt / this.bucketMs) : null;
        if (previousBucket === bucket) this.frames[this.frames.length - 1] = frame;
        else this.frames.push(frame);
        if (this.frames.length > this.maxFrames) this.frames.splice(0, this.frames.length - this.maxFrames);
        return frame;
    }

    clear(): void {
        this.frames = [];
    }

    getFrames(): readonly LiquidityHeatmapFrame[] {
        return this.frames.map((frame) => ({ ...frame, levels: frame.levels.map((level) => ({ ...level })) }));
    }

    getCoverage(): LiquidityHeatmapCoverage {
        return {
            startedAt: this.frames[0]?.capturedAt ?? null,
            endedAt: this.frames[this.frames.length - 1]?.capturedAt ?? null,
            frameCount: this.frames.length,
            frameCapacity: this.maxFrames,
            warmupPercent: Math.min(100, (this.frames.length / this.maxFrames) * 100),
        };
    }

    private aggregateLevels(book: BinanceOrderBook): LiquidityHeatmapLevel[] {
        const lowerBound = book.midPrice * (1 - this.visibleDepthBps / 10_000);
        const upperBound = book.midPrice * (1 + this.visibleDepthBps / 10_000);
        const buckets = new Map<string, LiquidityHeatmapLevel>();

        const add = (side: 'BID' | 'ASK', price: number, quantity: number) => {
            if (price < lowerBound || price > upperBound) return;
            const scaled = price / this.tickSize;
            const binIndex = side === 'BID' ? Math.floor(scaled + Number.EPSILON) : Math.ceil(scaled - Number.EPSILON);
            const binPrice = binIndex * this.tickSize;
            const key = `${side}:${binIndex}`;
            const existing = buckets.get(key);
            if (existing) {
                existing.quantity += quantity;
                existing.notionalUsd += price * quantity;
            } else {
                buckets.set(key, { side, price: binPrice, quantity, notionalUsd: price * quantity });
            }
        };

        book.bids.forEach((level) => add('BID', level.price, level.quantity));
        book.asks.forEach((level) => add('ASK', level.price, level.quantity));

        const bids = [...buckets.values()]
            .filter((level) => level.side === 'BID' && level.notionalUsd >= this.minNotionalUsd)
            .sort((left, right) => right.price - left.price)
            .slice(0, this.maxLevelsPerSide);
        const asks = [...buckets.values()]
            .filter((level) => level.side === 'ASK' && level.notionalUsd >= this.minNotionalUsd)
            .sort((left, right) => left.price - right.price)
            .slice(0, this.maxLevelsPerSide);
        return [...bids, ...asks];
    }
}
