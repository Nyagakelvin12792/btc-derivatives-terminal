import type { TerrainDataContractV2 } from '../terrain/types';

export interface Candlestick {
    time: number;
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
    price: number;
    size: number;
    side: 'BUY' | 'SELL' | 'buy' | 'sell';
    isBlockTrade?: boolean;
}

export interface OrderBookSnapshot {
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
    optionsSnapshots?: Array<{ timestampMs: number; contract: TerrainDataContractV2 }>;
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
    deterministicRunHash: string;
}

/**
 * Deterministic 32-bit FNV-1a hash for replay verification.
 */
export function computeFnva32Hex(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
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
        const cursorSec = Math.floor(this.cursorTimeMs / 1000);
        const nextCandle = this.dataset.candles.find((c) => c.time > cursorSec);
        if (nextCandle) {
            return this.seek(nextCandle.time * 1000);
        }
        this.isPlaying = false;
        return this.seek(this.dataset.endTimeMs);
    }

    public getSnapshot(): ReplaySnapshotV1 {
        const cursorSec = Math.floor(this.cursorTimeMs / 1000);
        const visibleCandles = this.dataset.candles.filter((c) => c.time <= cursorSec);
        const visibleTrades = (this.dataset.trades ?? []).filter(
            (t) => t.timestamp <= this.cursorTimeMs
        );

        let latestBookSnapshot: (OrderBookSnapshot & { timestampMs: number }) | null = null;
        for (const snap of this.dataset.bookSnapshots ?? []) {
            if (snap.timestampMs <= this.cursorTimeMs) {
                latestBookSnapshot = snap;
            } else {
                break;
            }
        }

        let latestOptionsSnapshot: TerrainDataContractV2 | null = null;
        for (const opt of this.dataset.optionsSnapshots ?? []) {
            if (opt.timestampMs <= this.cursorTimeMs) {
                latestOptionsSnapshot = opt.contract;
            } else {
                break;
            }
        }

        const lastCandle = visibleCandles[visibleCandles.length - 1];
        const canonicalPayload = JSON.stringify({
            datasetId: this.dataset.datasetId,
            cursorTimeMs: this.cursorTimeMs,
            candleCount: visibleCandles.length,
            lastCandleTime: lastCandle?.time ?? null,
            lastCandleClose: lastCandle?.close ?? null,
            tradeCount: visibleTrades.length,
            bookTimestampMs: latestBookSnapshot?.timestampMs ?? null,
            optionsSpot: latestOptionsSnapshot?.spotPrice ?? null,
        });

        return {
            datasetId: this.dataset.datasetId,
            cursorTimeMs: this.cursorTimeMs,
            isPlaying: this.isPlaying,
            speed: this.speed,
            visibleCandles,
            visibleTrades,
            latestBookSnapshot,
            latestOptionsSnapshot,
            deterministicRunHash: computeFnva32Hex(canonicalPayload),
        };
    }
}
