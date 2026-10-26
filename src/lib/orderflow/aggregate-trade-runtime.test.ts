import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BinanceAggregateTradeRuntime, type AggregateTradeRuntimeSocket } from './aggregate-trade-runtime';
import { createAggregateTradeWorkerConfig, type AggregateTradeWorkerEvent } from './aggregate-trade-worker-protocol';

const BASE_TIME = 1_761_350_400_000;

function trade(id: number, buyerIsMaker = false) {
    return JSON.stringify({
        stream: 'btcusdt@aggTrade',
        data: {
            e: 'aggTrade', E: BASE_TIME + id, s: 'BTCUSDT', a: id,
            p: '80250.00', q: '0.750', f: 90_000 + id, l: 90_000 + id,
            T: BASE_TIME + id, m: buyerIsMaker, M: true,
        },
    });
}

class FakeSocket implements AggregateTradeRuntimeSocket {
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

describe('BinanceAggregateTradeRuntime', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('batches validated trades without sending every socket message to React', async () => {
        const socket = new FakeSocket();
        const events: AggregateTradeWorkerEvent[] = [];
        let now = BASE_TIME + 100;
        const runtime = new BinanceAggregateTradeRuntime({
            createSocket: () => socket,
            emit: (event) => events.push(event),
            now: () => now,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });
        runtime.start(createAggregateTradeWorkerConfig({ flushIntervalMs: 250 }));
        socket.open();
        socket.message(trade(100));
        now += 1;
        socket.message(trade(101, true));

        expect(events.filter((event) => event.type === 'TRADE_BATCH')).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(250);
        const batches = events.filter((event) => event.type === 'TRADE_BATCH');
        expect(batches).toHaveLength(1);
        expect(batches[0]).toEqual(expect.objectContaining({
            trades: [
                expect.objectContaining({ aggregateTradeId: 100, aggressor: 'BUY' }),
                expect.objectContaining({ aggregateTradeId: 101, aggressor: 'SELL' }),
            ],
        }));
    });

    it('ignores malformed, duplicate, and out-of-order messages without stopping capture', async () => {
        const socket = new FakeSocket();
        const events: AggregateTradeWorkerEvent[] = [];
        let now = BASE_TIME + 100;
        const runtime = new BinanceAggregateTradeRuntime({
            createSocket: () => socket,
            emit: (event) => events.push(event),
            now: () => now,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });
        runtime.start(createAggregateTradeWorkerConfig({ flushIntervalMs: 100, statusIntervalMs: 100 }));
        socket.open();
        socket.message('{broken');
        socket.message(trade(200));
        socket.message(trade(200));
        socket.message(trade(199));
        now += 1;
        socket.message(trade(201));
        await vi.advanceTimersByTimeAsync(100);

        expect(events).toContainEqual(expect.objectContaining({ type: 'ERROR', code: 'INVALID_EVENT' }));
        expect(events.findLast((event) => event.type === 'STATUS')).toEqual(expect.objectContaining({
            retainedTradeCount: 2,
            stats: expect.objectContaining({ invalidCount: 1, duplicateCount: 1, outOfOrderCount: 1 }),
        }));
    });

    it('emits one visible reconnect boundary per continuity break and reconnects with backoff', async () => {
        const sockets: FakeSocket[] = [];
        const events: AggregateTradeWorkerEvent[] = [];
        let now = BASE_TIME + 100;
        const runtime = new BinanceAggregateTradeRuntime({
            createSocket: () => {
                const socket = new FakeSocket();
                sockets.push(socket);
                return socket;
            },
            emit: (event) => events.push(event),
            now: () => now,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });
        runtime.start(createAggregateTradeWorkerConfig({ reconnectBaseMs: 250, reconnectMaxMs: 1_000 }));
        sockets[0].open();
        sockets[0].message(trade(300));
        now += 10;
        sockets[0].disconnect();

        expect(events.filter((event) => event.type === 'BOUNDARY')).toEqual([
            expect.objectContaining({ boundary: expect.objectContaining({ reason: 'CAPTURE_START' }) }),
            expect.objectContaining({ boundary: expect.objectContaining({ reason: 'RECONNECT', previousAggregateTradeId: 300 }) }),
        ]);
        await vi.advanceTimersByTimeAsync(250);
        expect(sockets).toHaveLength(2);
        sockets[1].disconnect();
        expect(events.filter((event) => event.type === 'BOUNDARY' && event.boundary.reason === 'RECONNECT')).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(500);
        expect(sockets).toHaveLength(3);
        sockets[2].open();
        now += 10;
        sockets[2].message(trade(301));
        sockets[2].disconnect();
        expect(events.filter((event) => event.type === 'BOUNDARY' && event.boundary.reason === 'RECONNECT')).toHaveLength(2);
    });

    it('reports socket failures with sanitized recoverable errors', () => {
        const events: AggregateTradeWorkerEvent[] = [];
        const runtime = new BinanceAggregateTradeRuntime({
            createSocket: () => { throw new Error('sensitive upstream detail'); },
            emit: (event) => events.push(event),
            now: () => BASE_TIME,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        });
        runtime.start(createAggregateTradeWorkerConfig());
        expect(events).toContainEqual({
            type: 'ERROR',
            code: 'SOCKET_UNAVAILABLE',
            message: 'Live aggregate-trade stream could not be opened.',
            recoverable: true,
        });
    });
});
