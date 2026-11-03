import { describe, expect, it } from 'vitest';
import {
    BinanceDepthPayloadError,
    LiquidityHeatmapBuffer,
    SequenceSafeOrderBook,
    parseBinanceDepthDiffEvent,
} from './liquidity-depth';
import type { BinanceDepthDiffEvent, BinanceOrderBook } from './types';

function book(lastUpdateId = 100): BinanceOrderBook {
    return {
        lastUpdateId,
        bids: [
            { price: 100, quantity: 2, notionalUsd: 200 },
            { price: 99, quantity: 1, notionalUsd: 99 },
        ],
        asks: [
            { price: 101, quantity: 2, notionalUsd: 202 },
            { price: 102, quantity: 1, notionalUsd: 102 },
        ],
        bestBid: 100,
        bestAsk: 101,
        midPrice: 100.5,
        spread: 1,
        spreadBps: 99.50248756218905,
        bidDepthUsd: 299,
        askDepthUsd: 304,
        imbalance: -5 / 603,
    };
}

function event(
    firstUpdateId: number,
    finalUpdateId = firstUpdateId,
    overrides: Partial<BinanceDepthDiffEvent> = {},
): BinanceDepthDiffEvent {
    return {
        eventTime: 1_000 + finalUpdateId,
        symbol: 'BTCUSDT',
        firstUpdateId,
        finalUpdateId,
        bids: [],
        asks: [],
        ...overrides,
    };
}

describe('Binance diff-depth parsing', () => {
    it('normalizes the official U/u diff-depth payload contract', () => {
        expect(parseBinanceDepthDiffEvent({
            e: 'depthUpdate', E: 1_700_000_000_000, s: 'BTCUSDT', U: 101, u: 103,
            b: [['100.5', '2.25'], ['99', '0']],
            a: [['101', '3']],
        })).toEqual({
            eventTime: 1_700_000_000_000,
            symbol: 'BTCUSDT',
            firstUpdateId: 101,
            finalUpdateId: 103,
            bids: [{ price: 100.5, quantity: 2.25 }, { price: 99, quantity: 0 }],
            asks: [{ price: 101, quantity: 3 }],
        });
    });

    it('rejects unsupported symbols, reversed IDs, negative quantities, and unsafe IDs', () => {
        const valid = { e: 'depthUpdate', E: 1, s: 'BTCUSDT', U: 1, u: 1, b: [], a: [] };
        expect(() => parseBinanceDepthDiffEvent({ ...valid, s: 'ETHUSDT' })).toThrow(BinanceDepthPayloadError);
        expect(() => parseBinanceDepthDiffEvent({ ...valid, U: 2, u: 1 })).toThrow(BinanceDepthPayloadError);
        expect(() => parseBinanceDepthDiffEvent({ ...valid, b: [['100', '-1']] })).toThrow(BinanceDepthPayloadError);
        expect(() => parseBinanceDepthDiffEvent({ ...valid, u: Number.MAX_SAFE_INTEGER + 1 })).toThrow(BinanceDepthPayloadError);
    });
});

describe('SequenceSafeOrderBook', () => {
    it('buffers stream events, bridges the snapshot update ID, and applies insert/update/delete atomically', () => {
        const local = new SequenceSafeOrderBook();
        expect(local.ingest(event(101, 102, {
            bids: [{ price: 100, quantity: 3 }, { price: 98, quantity: 4 }],
            asks: [{ price: 102, quantity: 0 }, { price: 103, quantity: 5 }],
        }))).toBe('BUFFERED');

        expect(local.bootstrap(book())).toEqual({
            state: 'LIVE',
            appliedBufferedEvents: 1,
            discardedStaleEvents: 0,
        });
        const synchronized = local.getBook();
        expect(synchronized?.lastUpdateId).toBe(102);
        expect(synchronized?.bids).toEqual([
            { price: 100, quantity: 3, notionalUsd: 300 },
            { price: 99, quantity: 1, notionalUsd: 99 },
            { price: 98, quantity: 4, notionalUsd: 392 },
        ]);
        expect(synchronized?.asks).toEqual([
            { price: 101, quantity: 2, notionalUsd: 202 },
            { price: 103, quantity: 5, notionalUsd: 515 },
        ]);
        expect(local.getStatus(1_102, 5_000)).toEqual(expect.objectContaining({
            state: 'LIVE', lastUpdateId: 102, gapCount: 0, successfulBootstrapCount: 1,
        }));
    });

    it('discards buffered and live events already covered by the current book', () => {
        const local = new SequenceSafeOrderBook();
        local.ingest(event(90, 100));
        expect(local.bootstrap(book())).toEqual({
            state: 'LIVE',
            appliedBufferedEvents: 0,
            discardedStaleEvents: 1,
        });
        expect(local.ingest(event(99, 100))).toBe('IGNORED_STALE');
        expect(local.getBook()?.lastUpdateId).toBe(100);
    });

    it('invalidates the book immediately when a live sequence gap is detected', () => {
        const local = new SequenceSafeOrderBook();
        expect(local.bootstrap(book()).state).toBe('LIVE');
        expect(local.ingest(event(102))).toBe('RESYNC_REQUIRED');
        expect(local.getBook()).toBeNull();
        expect(local.getStatus(1_102)).toEqual(expect.objectContaining({
            state: 'GAP', lastUpdateId: null, bufferedEventCount: 1, gapCount: 1,
        }));
    });

    it('requires another snapshot when the snapshot is older than the first retained stream event', () => {
        const local = new SequenceSafeOrderBook({ maxBufferedEvents: 2 });
        local.ingest(event(101));
        local.ingest(event(102));
        local.ingest(event(103));
        expect(local.getStatus(1_103).bufferedEventCount).toBe(2);

        expect(local.bootstrap(book(100))).toEqual({
            state: 'RESYNC_REQUIRED',
            appliedBufferedEvents: 0,
            discardedStaleEvents: 0,
        });
        expect(local.getBook()).toBeNull();
    });

    it('recovers from a detected gap only after a fresh snapshot bridges the buffered event', () => {
        const local = new SequenceSafeOrderBook();
        local.bootstrap(book());
        local.ingest(event(105, 106, { bids: [{ price: 100, quantity: 7 }] }));
        expect(local.getStatus(1_106).state).toBe('GAP');

        expect(local.bootstrap(book(104))).toEqual({
            state: 'LIVE',
            appliedBufferedEvents: 1,
            discardedStaleEvents: 0,
        });
        expect(local.getBook()?.lastUpdateId).toBe(106);
        expect(local.getBook()?.bids[0].quantity).toBe(7);
    });

    it('reports stale state without mutating or fabricating a replacement book', () => {
        const local = new SequenceSafeOrderBook();
        local.ingest(event(101, 101, { eventTime: 1_000 }));
        local.bootstrap(book());
        expect(local.getStatus(7_001, 5_000).state).toBe('STALE');
        expect(local.getBook()?.lastUpdateId).toBe(101);
    });

    it('bounds retained levels to the closest configured prices', () => {
        const local = new SequenceSafeOrderBook({ maxLevelsPerSide: 1 });
        local.bootstrap(book());
        expect(local.getBook()).toEqual(expect.objectContaining({
            bids: [{ price: 100, quantity: 2, notionalUsd: 200 }],
            asks: [{ price: 101, quantity: 2, notionalUsd: 202 }],
        }));
    });

    it('rejects malformed snapshot levels before they can seed the local book', () => {
        const local = new SequenceSafeOrderBook();
        const malformed = book();
        malformed.bids = [{ price: Number.NaN, quantity: 2, notionalUsd: Number.NaN }];
        expect(() => local.bootstrap(malformed)).toThrow(BinanceDepthPayloadError);
        expect(local.getBook()).toBeNull();
    });
});

describe('LiquidityHeatmapBuffer', () => {
    const heatmapBook: BinanceOrderBook = {
        ...book(200),
        bids: [
            { price: 99.9, quantity: 2, notionalUsd: 199.8 },
            { price: 99.6, quantity: 3, notionalUsd: 298.8 },
            { price: 98, quantity: 100, notionalUsd: 9_800 },
        ],
        asks: [
            { price: 100.1, quantity: 4, notionalUsd: 400.4 },
            { price: 100.4, quantity: 5, notionalUsd: 502 },
            { price: 102, quantity: 100, notionalUsd: 10_200 },
        ],
        bestBid: 99.9,
        bestAsk: 100.1,
        midPrice: 100,
    };

    it('aggregates price levels into side-aware ticks and excludes levels outside visible depth', () => {
        const buffer = new LiquidityHeatmapBuffer({
            tickSize: 1,
            visibleDepthBps: 100,
            maxFrames: 10,
            bucketMs: 500,
        });
        const frame = buffer.append(heatmapBook, 10_000, 9_990);
        expect(frame?.levels).toHaveLength(2);
        expect(frame?.levels[0]).toEqual(expect.objectContaining({ side: 'BID', price: 99, quantity: 5 }));
        expect(frame?.levels[0].notionalUsd).toBeCloseTo(498.6);
        expect(frame?.levels[1]).toEqual(expect.objectContaining({ side: 'ASK', price: 101, quantity: 9 }));
        expect(frame?.levels[1].notionalUsd).toBeCloseTo(902.4);
    });

    it('applies a notional threshold after aggregation', () => {
        const buffer = new LiquidityHeatmapBuffer({
            tickSize: 1,
            visibleDepthBps: 100,
            minNotionalUsd: 500,
        });
        expect(buffer.append(heatmapBook, 10_000, 9_990)?.levels).toEqual([
            { side: 'ASK', price: 101, quantity: 9, notionalUsd: 902.4 },
        ]);
    });

    it('replaces the current time bucket, bounds history, and exposes honest session coverage', () => {
        const buffer = new LiquidityHeatmapBuffer({
            tickSize: 1,
            visibleDepthBps: 100,
            maxFrames: 2,
            bucketMs: 500,
        });
        buffer.append(heatmapBook, 1_000, 990);
        buffer.append({ ...heatmapBook, lastUpdateId: 201 }, 1_200, 1_190);
        buffer.append({ ...heatmapBook, lastUpdateId: 202 }, 1_500, 1_490);
        buffer.append({ ...heatmapBook, lastUpdateId: 203 }, 2_000, 1_990);

        expect(buffer.getFrames().map((frame) => frame.lastUpdateId)).toEqual([202, 203]);
        expect(buffer.getCoverage()).toEqual({
            startedAt: 1_500,
            endedAt: 2_000,
            frameCount: 2,
            frameCapacity: 2,
            warmupPercent: 100,
        });
        expect(buffer.append(heatmapBook, 1_900, 1_900)).toBeNull();
    });

    it('clears frames without manufacturing replacement history', () => {
        const buffer = new LiquidityHeatmapBuffer({ tickSize: 1, visibleDepthBps: 100 });
        buffer.append(heatmapBook, 1_000, 990);
        buffer.clear();
        expect(buffer.getFrames()).toEqual([]);
        expect(buffer.getCoverage()).toEqual(expect.objectContaining({
            startedAt: null, endedAt: null, frameCount: 0, warmupPercent: 0,
        }));
    });
});
