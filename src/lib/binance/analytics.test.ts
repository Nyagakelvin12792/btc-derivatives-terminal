import { describe, expect, it } from 'vitest';
import { buildCvdBars, buildDeltaHistogram, selectLiquidityLevels } from './analytics';
import type { BinanceMarketBar, BinanceOrderBook } from './types';

const bars = [
    { time: 1, delta: 2 },
    { time: 2, delta: -5 },
] as BinanceMarketBar[];

describe('Binance order-flow analytics', () => {
    it('builds deterministic cumulative volume delta from observed bar delta', () => {
        expect(buildCvdBars(bars)).toEqual([
            expect.objectContaining({ open: 0, close: 2, high: 2, low: 0 }),
            expect.objectContaining({ open: 2, close: -3, high: 2, low: -3 }),
        ]);
    });

    it('resets cumulative delta at real UTC anchor boundaries', () => {
        const anchored = buildCvdBars([
            { time: Date.UTC(2026, 0, 1, 23, 59) / 1_000, delta: 2 },
            { time: Date.UTC(2026, 0, 2, 0, 0) / 1_000, delta: -5 },
        ] as BinanceMarketBar[], 'UTC_DAY');
        expect(anchored).toEqual([
            expect.objectContaining({ open: 0, close: 2, reset: true }),
            expect.objectContaining({ open: 0, close: -5, reset: true }),
        ]);
    });

    it('builds signed delta histogram values', () => {
        expect(buildDeltaHistogram(bars).map((bar) => bar.value)).toEqual([2, -5]);
    });

    it('selects the largest observed depth levels without inventing liquidity', () => {
        const book = { bids: [{ price: 100, quantity: 2, notionalUsd: 200 }], asks: [{ price: 101, quantity: 3, notionalUsd: 303 }] } as BinanceOrderBook;
        expect(selectLiquidityLevels(book, 1)).toEqual([expect.objectContaining({ side: 'ASK', price: 101, share: 1 })]);
    });
});
