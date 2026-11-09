import type { TerrainDataContractV2 } from '../terrain/types';

export interface Candlestick {
    time: number;
    availableAtMs?: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    buyVolume?: number;
    sellVolume?: number;
    delta?: number;
}

export interface TradeTick {
    id?: string;
    timestamp: number;
    availableAtMs?: number;
    price: number;
    size: number;
    side: 'BUY' | 'SELL' | 'buy' | 'sell';
    isBlockTrade?: boolean;
}

export interface OrderBookSnapshot {
    availableAtMs?: number;
    bids: Array<{ price: number; size: number; total?: number }>;
    asks: Array<{ price: number; size: number; total?: number }>;
    midPrice?: number;
    spread?: number;
    totalBidDepth?: number;
    totalAskDepth?: number;
    imbalance?: number;
    imbalanceRatio?: number;
}

export type ReplaySpeedMultiplier = 0.5 | 1 | 2 | 4 | 10;

export interface ReplayDatasetV1 {
    datasetId: string;
    symbol: string;
    startTimeMs: number;
    endTimeMs: number;
    candles: Candlestick[];
    trades?: TradeTick[];
    bookSnapshots?: Array<OrderBookSnapshot & { timestampMs: number }>;
    releases?: Array<{ timestampMs: number; availableAtMs: number; id: string; value: number }>;
    optionsSnapshots?: Array<{ timestampMs: number; availableAtMs?: number; contract: TerrainDataContractV2 }>;
}

export interface ReplaySnapshotV1 {
    datasetId: string;
    cursorTimeMs: number;
    isPlaying: boolean;
    speed: ReplaySpeedMultiplier;
    visibleCandles: Candlestick[];
    visibleTrades: TradeTick[];
    latestBookSnapshot: (OrderBookSnapshot & { timestampMs: number }) | null;
    latestOptionsSnapshot: TerrainDataContractV2 | null;
    visibleReleases: NonNullable<ReplayDatasetV1['releases']>;
    deterministicRunHash: string;
}

/**
 * Deterministic 32-bit FNV-1a hash for replay verification.
 */
export function computeFnva32Hex(input: string): string {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(input);
    for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Master Replay Clock Engine (UX20.3-CLOCK-01).
 * Enforces strict causality (no future lookahead past cursorTimeMs) across
 * candlesticks, trade tape, L2 book snapshots, and options snapshots.
 */
export class ReplayClockEngine {
    private readonly dataset: ReplayDatasetV1;
    private cursorTimeMs: number;
    private isPlaying = false;
    private speed: ReplaySpeedMultiplier = 1;

    constructor(dataset: ReplayDatasetV1, initialCursorTimeMs?: number) {
        if (!dataset.datasetId || dataset.datasetId.trim().length === 0) {
            throw new Error('ReplayClockEngine requires a non-empty datasetId.');
        }
        if (![dataset.startTimeMs, dataset.endTimeMs, initialCursorTimeMs ?? dataset.startTimeMs].every(Number.isFinite)
            || dataset.startTimeMs > dataset.endTimeMs) throw new Error('Invalid replay bounds');
        dataset = structuredClone(dataset);
        this.dataset = {
            ...dataset,
            candles: [...dataset.candles].sort((a, b) => a.time - b.time),
            trades: dataset.trades ? [...dataset.trades].sort((a, b) => a.timestamp - b.timestamp) : [],
            bookSnapshots: dataset.bookSnapshots
                ? [...dataset.bookSnapshots].sort((a, b) => a.timestampMs - b.timestampMs)
                : [],
            optionsSnapshots: dataset.optionsSnapshots
                ? [...dataset.optionsSnapshots].sort((a, b) => a.timestampMs - b.timestampMs)
                : [],
        };
        const minTime = this.dataset.startTimeMs;
        const maxTime = this.dataset.endTimeMs;
        const initial = initialCursorTimeMs ?? minTime;
        this.cursorTimeMs = Math.max(minTime, Math.min(maxTime, initial));
    }

    public getCursorTimeMs(): number {
        return this.cursorTimeMs;
    }

    public getDatasetId(): string {
        return this.dataset.datasetId;
    }

    public play(): void {
        this.isPlaying = true;
    }

    public pause(): void {
        this.isPlaying = false;
    }

    public setSpeed(speed: ReplaySpeedMultiplier): void {
        this.speed = speed;
    }

    public seek(targetTimeMs: number): ReplaySnapshotV1 {
        if (!Number.isFinite(targetTimeMs)) {
            throw new Error(`Invalid replay seek timestamp: ${targetTimeMs}`);
        }
        this.cursorTimeMs = Math.max(
            this.dataset.startTimeMs,
            Math.min(this.dataset.endTimeMs, Math.floor(targetTimeMs))
        );
        return this.getSnapshot();
    }

    public stepByMs(deltaMs: number): ReplaySnapshotV1 {
        if (!Number.isFinite(deltaMs) || deltaMs < 0) {
            throw new Error(`Invalid replay step deltaMs: ${deltaMs}`);
        }
        return this.seek(this.cursorTimeMs + deltaMs);
    }

    public stepNextCandle(): ReplaySnapshotV1 {
        const next = this.dataset.candles.reduce((earliest, candle) => {
            const available = Math.max(candle.time * 1000, candle.availableAtMs ?? 0);
            return available > this.cursorTimeMs ? Math.min(earliest, available) : earliest;
        }, Infinity);
        if (Number.isFinite(next)) return this.seek(next);
        this.isPlaying = false;
        return this.seek(this.dataset.endTimeMs);
    }

    public getSnapshot(): ReplaySnapshotV1 {
        const visible = (event: number, available = event) =>
            event <= this.cursorTimeMs && available <= this.cursorTimeMs;
        const visibleCandles = this.dataset.candles.filter((c) => visible(c.time * 1000, c.availableAtMs));
        const visibleTrades = (this.dataset.trades ?? []).filter((t) => visible(t.timestamp, t.availableAtMs));
        const latestBookSnapshot = (this.dataset.bookSnapshots ?? []).filter((b) => visible(b.timestampMs, b.availableAtMs)).at(-1) ?? null;
        const latestOptions = (this.dataset.optionsSnapshots ?? []).filter((o) => visible(o.timestampMs, o.availableAtMs)).at(-1) ?? null;
        const visibleReleases = (this.dataset.releases ?? []).filter((r) => visible(r.timestampMs, r.availableAtMs));
        const payload = {
            datasetId: this.dataset.datasetId,
            cursorTimeMs: this.cursorTimeMs,
            visibleCandles,
            visibleTrades,
            latestBookSnapshot,
            latestOptionsSnapshot: latestOptions?.contract ?? null,
            visibleReleases,
        };
        return {
            ...structuredClone(payload),
            isPlaying: this.isPlaying,
            speed: this.speed,
            deterministicRunHash: computeFnva32Hex(JSON.stringify({ ...payload, optionsTime: latestOptions?.timestampMs })),
        };
    }
}
