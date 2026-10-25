import { describe, expect, it } from 'vitest';
import { BinanceLiquidityEngine } from './liquidity-engine';
import type { BinanceDepthSnapshot, BinanceOrderBook } from './types';

function snapshot(lastUpdateId = 100): BinanceDepthSnapshot {
    const book: BinanceOrderBook = {
        lastUpdateId,
        bids: [{ price: 100, quantity: 2, notionalUsd: 200 }],
        asks: [{ price: 101, quantity: 3, notionalUsd: 303 }],
        bestBid: 100,
        bestAsk: 101,
        midPrice: 100.5,
        spread: 1,
        spreadBps: 99.50248756218905,
        bidDepthUsd: 200,
        askDepthUsd: 303,
        imbalance: -103 / 503,
    };
    return {
        schemaVersion: 1,
        dataMode: 'LIVE',
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        timestamp: '2026-10-25T00:00:00.000Z',
        upstreamLatencyMs: 20,
        depthLimit: 500,
        book,
    };
}

function payload(firstUpdateId: number, finalUpdateId = firstUpdateId) {
    return {
        e: 'depthUpdate',
        E: 1_761_350_400_000 + finalUpdateId,
        s: 'BTCUSDT',
        U: firstUpdateId,
        u: finalUpdateId,
        b: [['100', '4']],
        a: [],
    };
}

function engine() {
    return new BinanceLiquidityEngine({
        heatmap: { tickSize: 1, visibleDepthBps: 200, maxFrames: 3, bucketMs: 500 },
        staleAfterMs: 5_000,
    });
}

describe('BinanceLiquidityEngine', () => {
    it('exposes one integration contract for buffering, bootstrap, capture, and coverage', () => {
        const subject = engine();
        expect(subject.ingestPayload(payload(101))).toBe('BUFFERED');
        expect(subject.bootstrap(snapshot())).toEqual({
            state: 'LIVE', appliedBufferedEvents: 1, discardedStaleEvents: 0,
        });
        const frame = subject.capture(1_761_350_400_500);
        expect(frame).toEqual(expect.objectContaining({
            source: 'BINANCE_SPOT', symbol: 'BTCUSDT', lastUpdateId: 101,
        }));
        expect(subject.getState(1_761_350_400_500)).toEqual(expect.objectContaining({
            resyncRequired: false,
            coverage: expect.objectContaining({ frameCount: 1, startedAt: 1_761_350_400_500 }),
            sequence: expect.objectContaining({ state: 'LIVE', lastUpdateId: 101 }),
        }));
    });

    it('clears heatmap continuity and requests a resync on a sequence gap', () => {
        const subject = engine();
        subject.ingestPayload(payload(101));
        subject.bootstrap(snapshot());
        subject.capture(1_761_350_400_500);

        expect(subject.ingestPayload(payload(103))).toBe('RESYNC_REQUIRED');
        expect(subject.capture(1_761_350_400_600)).toBeNull();
        expect(subject.getState(1_761_350_400_600)).toEqual(expect.objectContaining({
            resyncRequired: true,
            book: null,
            coverage: expect.objectContaining({ frameCount: 0, startedAt: null }),
            sequence: expect.objectContaining({ state: 'GAP', gapCount: 1 }),
        }));
    });

    it('resumes only when a fresh snapshot bridges the buffered post-gap event', () => {
        const subject = engine();
        subject.bootstrap(snapshot());
        subject.ingestPayload(payload(105));
        expect(subject.bootstrap(snapshot(104)).state).toBe('LIVE');
        expect(subject.getState(1_761_350_400_105).resyncRequired).toBe(false);
        expect(subject.capture(1_761_350_400_500)?.lastUpdateId).toBe(105);
    });

    it('does not capture stale or offline books', () => {
        const subject = engine();
        subject.ingestPayload(payload(101));
        subject.bootstrap(snapshot());
        expect(subject.capture(1_761_350_406_000)).toBeNull();
        expect(subject.getState(1_761_350_406_000).sequence.state).toBe('STALE');

        subject.markOffline();
        expect(subject.capture(1_761_350_406_100)).toBeNull();
        expect(subject.getState(1_761_350_406_100)).toEqual(expect.objectContaining({
            resyncRequired: true,
            book: null,
            sequence: expect.objectContaining({ state: 'OFFLINE' }),
        }));
    });

    it('starts reconnects with an empty book and an explicit new coverage window', () => {
        const subject = engine();
        subject.ingestPayload(payload(101));
        subject.bootstrap(snapshot());
        subject.capture(1_761_350_400_500);
        subject.beginReconnect();
        expect(subject.getState(1_761_350_400_600)).toEqual(expect.objectContaining({
            resyncRequired: true,
            book: null,
            coverage: expect.objectContaining({ frameCount: 0 }),
            sequence: expect.objectContaining({ state: 'BUFFERING' }),
        }));
    });

    it('rejects demo or mismatched snapshot contracts', () => {
        const subject = engine();
        expect(() => subject.bootstrap({ ...snapshot(), source: 'OTHER' } as never)).toThrow(TypeError);
    });
});
