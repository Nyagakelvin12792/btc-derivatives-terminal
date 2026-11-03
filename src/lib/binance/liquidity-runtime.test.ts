import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BinanceLiquidityRuntime, type LiquidityRuntimeSocket } from './liquidity-runtime';
import { createLiquidityWorkerConfig, type LiquidityWorkerEvent } from './liquidity-worker-protocol';
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

function depth(firstUpdateId: number, finalUpdateId = firstUpdateId) {
    return JSON.stringify({
        e: 'depthUpdate', E: 1_761_350_400_000 + finalUpdateId, s: 'BTCUSDT',
        U: firstUpdateId, u: finalUpdateId, b: [['100', '4']], a: [],
    });
}

class FakeSocket implements LiquidityRuntimeSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    close = vi.fn();

    open() { this.onopen?.(); }
    message(data: unknown) { this.onmessage?.({ data }); }
    fail() { this.onerror?.(); }
    disconnect() { this.onclose?.(); }
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('BinanceLiquidityRuntime', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('buffers socket events before bootstrap and emits bounded-cadence live frames', async () => {
        const sockets: FakeSocket[] = [];
        const events: LiquidityWorkerEvent[] = [];
        const bootstrap = deferred<BinanceDepthSnapshot>();
        const runtime = new BinanceLiquidityRuntime({
            createSocket: () => {
                const socket = new FakeSocket();
                sockets.push(socket);
                return socket;
            },
            fetchSnapshot: () => bootstrap.promise,
            emit: (event) => events.push(event),
            now: () => 1_761_350_400_500,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });

        runtime.start(createLiquidityWorkerConfig({ captureIntervalMs: 500, statusIntervalMs: 2_000 }));
        sockets[0].open();
        sockets[0].message(depth(101));
        bootstrap.resolve(snapshot(100));
        await flushPromises();

        await vi.advanceTimersByTimeAsync(500);
        expect(events.find((event) => event.type === 'FRAME')).toEqual(expect.objectContaining({
            type: 'FRAME',
            frame: expect.objectContaining({ lastUpdateId: 101, source: 'BINANCE_SPOT' }),
            coverage: expect.objectContaining({ frameCount: 1 }),
        }));
        expect(events.filter((event) => event.type === 'FRAME')).toHaveLength(1);
        expect(events.findLast((event) => event.type === 'STATUS')).toEqual(expect.objectContaining({
            type: 'STATUS', connected: true, paused: false,
            sequence: expect.objectContaining({ state: 'LIVE', lastUpdateId: 101 }),
        }));
    });

    it('keeps reconstructing while paused, resumes capture, and clears history on command', async () => {
        const socket = new FakeSocket();
        const events: LiquidityWorkerEvent[] = [];
        const runtime = new BinanceLiquidityRuntime({
            createSocket: () => socket,
            fetchSnapshot: async () => snapshot(100),
            emit: (event) => events.push(event),
            now: () => 1_761_350_400_500 + vi.getTimerCount(),
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });

        runtime.start(createLiquidityWorkerConfig({ captureIntervalMs: 500 }));
        socket.open();
        socket.message(depth(101));
        await flushPromises();
        runtime.pause();
        socket.message(depth(102));
        await vi.advanceTimersByTimeAsync(1_000);
        expect(events.filter((event) => event.type === 'FRAME')).toHaveLength(0);

        runtime.resume();
        await vi.advanceTimersByTimeAsync(500);
        expect(events.findLast((event) => event.type === 'FRAME')).toEqual(expect.objectContaining({
            frame: expect.objectContaining({ lastUpdateId: 102 }),
        }));

        runtime.clear();
        expect(events.findLast((event) => event.type === 'RESET')).toEqual({ type: 'RESET', reason: 'CLEAR' });
        expect(events.findLast((event) => event.type === 'STATUS')).toEqual(expect.objectContaining({
            coverage: expect.objectContaining({ frameCount: 0, startedAt: null }),
        }));
    });

    it('breaks continuity and obtains a fresh snapshot after a sequence gap', async () => {
        const socket = new FakeSocket();
        const events: LiquidityWorkerEvent[] = [];
        const snapshots = [snapshot(100), snapshot(102)];
        const fetchSnapshot = vi.fn(async () => snapshots.shift() ?? snapshot(102));
        const runtime = new BinanceLiquidityRuntime({
            createSocket: () => socket,
            fetchSnapshot,
            emit: (event) => events.push(event),
            now: () => 1_761_350_400_500,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });

        runtime.start(createLiquidityWorkerConfig({ snapshotRetryMs: 100 }));
        socket.open();
        socket.message(depth(101));
        await flushPromises();
        socket.message(depth(103));
        await flushPromises();

        expect(fetchSnapshot).toHaveBeenCalledTimes(2);
        expect(events).toContainEqual({ type: 'RESET', reason: 'GAP' });
        expect(events.findLast((event) => event.type === 'STATUS')).toEqual(expect.objectContaining({
            sequence: expect.objectContaining({ state: 'LIVE', lastUpdateId: 103, gapCount: 1 }),
            resyncRequired: false,
        }));
    });

    it('reports offline, backs off, and creates a new socket without leaking the old one', async () => {
        const sockets: FakeSocket[] = [];
        const events: LiquidityWorkerEvent[] = [];
        const runtime = new BinanceLiquidityRuntime({
            createSocket: () => {
                const socket = new FakeSocket();
                sockets.push(socket);
                return socket;
            },
            fetchSnapshot: async () => snapshot(),
            emit: (event) => events.push(event),
            now: () => 1_761_350_400_500,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });

        runtime.start(createLiquidityWorkerConfig({ reconnectBaseMs: 250, reconnectMaxMs: 1_000 }));
        sockets[0].open();
        await flushPromises();
        sockets[0].disconnect();
        expect(events.findLast((event) => event.type === 'STATUS')).toEqual(expect.objectContaining({
            connected: false, reconnectAttempt: 1,
            sequence: expect.objectContaining({ state: 'OFFLINE' }),
        }));

        await vi.advanceTimersByTimeAsync(249);
        expect(sockets).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(sockets).toHaveLength(2);
        expect(events).toContainEqual({ type: 'RESET', reason: 'RECONNECT' });

        runtime.stop();
        expect(sockets[1].close).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(sockets).toHaveLength(2);
    });

    it('retries a failed snapshot without replacing a healthy socket', async () => {
        const socket = new FakeSocket();
        const events: LiquidityWorkerEvent[] = [];
        const fetchSnapshot = vi.fn()
            .mockRejectedValueOnce(new Error('upstream details must not escape'))
            .mockResolvedValueOnce(snapshot());
        const runtime = new BinanceLiquidityRuntime({
            createSocket: () => socket,
            fetchSnapshot,
            emit: (event) => events.push(event),
            now: () => 1_761_350_400_500,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });

        runtime.start(createLiquidityWorkerConfig({ snapshotRetryMs: 200 }));
        socket.open();
        await flushPromises();
        expect(events.findLast((event) => event.type === 'ERROR')).toEqual({
            type: 'ERROR', code: 'SNAPSHOT_UNAVAILABLE', message: 'Live depth snapshot is temporarily unavailable.', recoverable: true,
        });
        await vi.advanceTimersByTimeAsync(200);
        await flushPromises();
        expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    });
});
