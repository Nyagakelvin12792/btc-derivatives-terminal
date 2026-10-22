import type { CandlestickData, HistogramData, UTCTimestamp } from 'lightweight-charts';
import type { BinanceMarketBar, BinanceOrderBook } from './types';

export interface CvdBar extends CandlestickData<UTCTimestamp> {
    delta: number;
}
export interface LiquidityLevel {
    side: 'BID' | 'ASK';
    price: number;
    quantity: number;
    notionalUsd: number;
    share: number;
}

export function buildCvdBars(bars: readonly BinanceMarketBar[]): CvdBar[] {
    let cumulative = 0;
    return bars.map((bar) => {
        const open = cumulative;
        const close = open + bar.delta;
        cumulative = close;
        return {
            time: bar.time as UTCTimestamp,
            open,
            high: Math.max(open, close),
            low: Math.min(open, close),
            close,
            delta: bar.delta,
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
