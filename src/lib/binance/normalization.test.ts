import { describe, expect, it } from 'vitest';
import { normalizeBinanceKlines, normalizeBinanceOrderBook, normalizeBinanceTicker } from './normalization';

describe('Binance market normalization', () => {
    it('normalizes candles and derives aggressor delta from taker-buy volume', () => {
        const bars = normalizeBinanceKlines([[1_700_000_000_000, '100', '110', '90', '105', '12', 1_700_000_059_999, '1240', 42, '7', '735', '0']]);
        expect(bars).toEqual([expect.objectContaining({ time: 1_700_000_000, volume: 12, takerBuyVolume: 7, takerSellVolume: 5, delta: 2 })]);
    });

    it('normalizes book depth and calculates spread and imbalance', () => {
        const book = normalizeBinanceOrderBook({ lastUpdateId: 12, bids: [['100', '2'], ['99', '1']], asks: [['101', '1'], ['102', '2']] });
        expect(book.bestBid).toBe(100);
        expect(book.bestAsk).toBe(101);
        expect(book.spread).toBe(1);
        expect(book.bidDepthUsd).toBe(299);
        expect(book.askDepthUsd).toBe(305);
        expect(book.imbalance).toBeCloseTo(-6 / 604);
    });

    it('normalizes the 24-hour ticker', () => {
        const ticker = normalizeBinanceTicker({ lastPrice: '100', priceChange: '3', priceChangePercent: '3.09', highPrice: '105', lowPrice: '95', volume: '123', quoteVolume: '12400', count: 88, closeTime: 1_700_000_000_000 });
        expect(ticker).toEqual(expect.objectContaining({ lastPrice: 100, priceChangePercent: 3.09, tradeCount: 88 }));
    });
});
