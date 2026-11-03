import { describe, expect, it } from 'vitest';
import { BinanceAggregateTradePayloadError, parseBinanceAggregateTrade } from './trade-classifier';

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        e: 'aggTrade',
        E: 1_761_350_400_010,
        s: 'BTCUSDT',
        a: 40_001,
        p: '80250.00',
        q: '0.750',
        f: 70_001,
        l: 70_003,
        T: 1_761_350_400_000,
        m: false,
        M: true,
        ...overrides,
    };
}

describe('Binance aggregate-trade parsing and classification', () => {
    it('classifies buyer-maker false as an aggressive buy', () => {
        expect(parseBinanceAggregateTrade(payload())).toEqual({
            schemaVersion: 1,
            venue: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            aggregateTradeId: 40_001,
            firstTradeId: 70_001,
            lastTradeId: 70_003,
            eventTime: 1_761_350_400_010,
            tradeTime: 1_761_350_400_000,
            price: 80_250,
            quantityBtc: 0.75,
            notionalUsd: 60_187.5,
            aggressor: 'BUY',
            buyerIsMaker: false,
        });
    });

    it('classifies buyer-maker true as an aggressive sell', () => {
        expect(parseBinanceAggregateTrade(payload({ m: true })).aggressor).toBe('SELL');
    });

    it('rejects duplicates and out-of-order aggregate IDs deterministically', () => {
        expect(() => parseBinanceAggregateTrade(payload(), { previousAggregateTradeId: 40_001 }))
            .toThrow(BinanceAggregateTradePayloadError);
        expect(() => parseBinanceAggregateTrade(payload({ a: 40_000 }), { previousAggregateTradeId: 40_001 }))
            .toThrow('duplicate or out of order');
    });

    it('rejects unsupported symbols, types, reversed IDs, and extra fields', () => {
        expect(() => parseBinanceAggregateTrade(payload({ s: 'ETHUSDT' }))).toThrow(BinanceAggregateTradePayloadError);
        expect(() => parseBinanceAggregateTrade(payload({ e: 'trade' }))).toThrow(BinanceAggregateTradePayloadError);
        expect(() => parseBinanceAggregateTrade(payload({ f: 70_004, l: 70_003 }))).toThrow('range was reversed');
        expect(() => parseBinanceAggregateTrade({ ...payload(), unexpected: true })).toThrow(BinanceAggregateTradePayloadError);
    });

    it('rejects zero, negative, malformed, and unsafe numeric values', () => {
        expect(() => parseBinanceAggregateTrade(payload({ p: '0' }))).toThrow('price must be positive');
        expect(() => parseBinanceAggregateTrade(payload({ q: '-1' }))).toThrow(BinanceAggregateTradePayloadError);
        expect(() => parseBinanceAggregateTrade(payload({ p: 'NaN' }))).toThrow(BinanceAggregateTradePayloadError);
        expect(() => parseBinanceAggregateTrade(payload({ a: Number.MAX_SAFE_INTEGER + 1 }))).toThrow(BinanceAggregateTradePayloadError);
    });
});
