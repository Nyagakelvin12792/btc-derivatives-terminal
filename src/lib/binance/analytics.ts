import type { CandlestickData, HistogramData, UTCTimestamp } from 'lightweight-charts';
import type { BinanceMarketBar, BinanceOrderBook } from './types';

export interface CvdBar extends CandlestickData<UTCTimestamp> {
    delta: number;
    reset: boolean;
}
export type CvdAnchor = 'VISIBLE' | 'UTC_DAY' | 'UTC_WEEK' | 'UTC_MONTH';
export interface LiquidityLevel {
    side: 'BID' | 'ASK';
    price: number;
    quantity: number;
    notionalUsd: number;
    share: number;
}

function anchorKey(timeSeconds: number, anchor: CvdAnchor): string {
    if (anchor === 'VISIBLE') return 'visible';
    const date = new Date(timeSeconds * 1_000);
    if (anchor === 'UTC_DAY') return date.toISOString().slice(0, 10);
    if (anchor === 'UTC_MONTH') return date.toISOString().slice(0, 7);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return date.toISOString().slice(0, 10);
}

export function buildCvdBars(bars: readonly BinanceMarketBar[], anchor: CvdAnchor = 'VISIBLE'): CvdBar[] {
    let cumulative = 0;
    let previousAnchor: string | null = null;
    return bars.map((bar) => {
        const currentAnchor = anchorKey(bar.time, anchor);
        const reset = previousAnchor !== currentAnchor;
        if (reset) cumulative = 0;
        const open = cumulative;
        const close = open + bar.delta;
        cumulative = close;
        previousAnchor = currentAnchor;
        return {
            time: bar.time as UTCTimestamp,
            open,
            high: Math.max(open, close),
            low: Math.min(open, close),
            close,
            delta: bar.delta,
            reset,
        };
    });
}

export function buildDeltaHistogram(bars: readonly BinanceMarketBar[]): HistogramData<UTCTimestamp>[] {
    return bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.delta,
        color: bar.delta >= 0 ? 'rgba(39, 211, 170, 0.8)' : 'rgba(239, 93, 115, 0.8)',
    }));
}

export function selectLiquidityLevels(book: BinanceOrderBook | null, count = 8): LiquidityLevel[] {
    if (!book) return [];
    const levels = [
        ...book.bids.map((level) => ({ ...level, side: 'BID' as const })),
        ...book.asks.map((level) => ({ ...level, side: 'ASK' as const })),
    ].sort((a, b) => b.notionalUsd - a.notionalUsd).slice(0, count);
    const maxNotional = Math.max(...levels.map((level) => level.notionalUsd), 1);
    return levels.map((level) => ({ ...level, share: level.notionalUsd / maxNotional }));
}
