import { describe, expect, it } from 'vitest';
import { createAggregateTradeWorkerConfig } from './aggregate-trade-worker-protocol';

describe('aggregate-trade worker configuration', () => {
    it('creates the safe, bounded Binance Spot configuration', () => {
        expect(createAggregateTradeWorkerConfig()).toEqual(expect.objectContaining({
            streamUrl: 'wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade',
            maxTrades: 50_000,
            maxBoundaries: 1_000,
            flushIntervalMs: 250,
        }));
    });

    it('rejects unsupported URLs, unbounded sizes, and reversed reconnect limits', () => {
        expect(() => createAggregateTradeWorkerConfig({ streamUrl: 'https://example.com' })).toThrow('ws or wss');
        expect(() => createAggregateTradeWorkerConfig({ maxTrades: 0 })).toThrow('positive integer');
        expect(() => createAggregateTradeWorkerConfig({ reconnectBaseMs: 2_000, reconnectMaxMs: 1_000 }))
            .toThrow('greater than or equal');
    });
});
