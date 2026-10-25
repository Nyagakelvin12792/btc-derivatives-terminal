import { describe, expect, it } from 'vitest';
import { AggregateTradeTape } from './aggregate-trade-tape';

const BASE_TIME = 1_761_350_400_000;

function payload(id: number, overrides: Record<string, unknown> = {}) {
    return {
        e: 'aggTrade',
        E: BASE_TIME + id,
        s: 'BTCUSDT',
        a: id,
        p: '80250.00',
        q: '0.750',
        f: 70_000 + id,
        l: 70_000 + id,
        T: BASE_TIME + id,
        m: false,
        M: true,
        ...overrides,
    };
}

describe('AggregateTradeTape', () => {
    it('classifies, orders, and retains an explicitly bounded trade tape', () => {
        const tape = new AggregateTradeTape({ maxTrades: 2 });
        expect(tape.ingest(payload(10), BASE_TIME + 100).status).toBe('ACCEPTED');
        expect(tape.ingest(payload(11, { m: true }), BASE_TIME + 101).status).toBe('ACCEPTED');
        expect(tape.ingest(payload(12), BASE_TIME + 102).status).toBe('ACCEPTED');

        const snapshot = tape.snapshot(BASE_TIME + 200);
        expect(snapshot.trades.map((trade) => trade.aggregateTradeId)).toEqual([11, 12]);
        expect(snapshot.trades.map((trade) => trade.aggressor)).toEqual(['SELL', 'BUY']);
        expect(snapshot.stats.acceptedCount).toBe(3);
        expect(snapshot.boundaries).toEqual([
            expect.objectContaining({ reason: 'CAPTURE_START', nextAggregateTradeId: 10 }),
        ]);
    });

    it('drops duplicates and late events without changing accepted totals', () => {
        const tape = new AggregateTradeTape();
        tape.ingest(payload(10), BASE_TIME + 100);
        tape.ingest(payload(11), BASE_TIME + 101);
        expect(tape.ingest(payload(11), BASE_TIME + 102).status).toBe('DUPLICATE');
        expect(tape.ingest(payload(9), BASE_TIME + 103).status).toBe('OUT_OF_ORDER');

        const snapshot = tape.snapshot(BASE_TIME + 200);
        expect(snapshot.trades).toHaveLength(2);
        expect(snapshot.stats).toEqual(expect.objectContaining({
            acceptedCount: 2,
            duplicateCount: 1,
            outOfOrderCount: 1,
        }));
    });

    it('accepts a forward jump only after recording an exact missing-ID boundary', () => {
        const tape = new AggregateTradeTape();
        tape.ingest(payload(20), BASE_TIME + 100);
        const result = tape.ingest(payload(24), BASE_TIME + 104);

        expect(result).toEqual(expect.objectContaining({
            status: 'ACCEPTED',
            boundary: expect.objectContaining({
                reason: 'AGGREGATE_ID_GAP',
                previousAggregateTradeId: 20,
                nextAggregateTradeId: 24,
                missingAggregateTradeCount: 3,
            }),
        }));
        expect(tape.snapshot(BASE_TIME + 200).coverage).toEqual(expect.objectContaining({
            gapCount: 1,
            sequenceState: 'GAP',
            quality: 'LOW',
        }));
    });

    it('records reconnect boundaries and never fabricates the missing range', () => {
        const tape = new AggregateTradeTape();
        tape.ingest(payload(30), BASE_TIME + 100);
        const boundary = tape.markReconnect(BASE_TIME + 110);
        tape.ingest(payload(31), BASE_TIME + 120);

        const snapshot = tape.snapshot(BASE_TIME + 200);
        expect(boundary).toEqual(expect.objectContaining({
            reason: 'RECONNECT',
            previousAggregateTradeId: 30,
            nextAggregateTradeId: null,
        }));
        expect(snapshot.stats.reconnectCount).toBe(1);
        expect(snapshot.coverage.gapCount).toBe(1);
        expect(snapshot.trades.map((trade) => trade.aggregateTradeId)).toEqual([30, 31]);
    });

    it('does not double-count an aggregate-ID jump that follows a reconnect boundary', () => {
        const tape = new AggregateTradeTape();
        tape.ingest(payload(50), BASE_TIME + 100);
        tape.markReconnect(BASE_TIME + 110);
        tape.ingest(payload(55), BASE_TIME + 120);

        const snapshot = tape.snapshot(BASE_TIME + 200);
        expect(snapshot.boundaries.map((boundary) => boundary.reason)).toEqual([
            'CAPTURE_START',
            'RECONNECT',
            'AGGREGATE_ID_GAP',
        ]);
        expect(snapshot.coverage.gapCount).toBe(1);
    });

    it('rejects malformed events, continues capture, and becomes stale deterministically', () => {
        const tape = new AggregateTradeTape({ staleAfterMs: 100 });
        expect(tape.ingest({ nope: true }, BASE_TIME + 1).status).toBe('INVALID');
        expect(tape.ingest(payload(40), BASE_TIME + 40).status).toBe('ACCEPTED');
        expect(tape.snapshot(BASE_TIME + 200).coverage.sequenceState).toBe('STALE');
        expect(tape.snapshot(BASE_TIME + 200).stats.invalidCount).toBe(1);
    });

    it('keeps coverage valid when exchange timestamps move backward inside ID order', () => {
        const tape = new AggregateTradeTape();
        tape.ingest(payload(60, { E: BASE_TIME + 60, T: BASE_TIME + 60 }), BASE_TIME + 100);
        tape.ingest(payload(61, { E: BASE_TIME + 59, T: BASE_TIME + 59 }), BASE_TIME + 101);
        const coverage = tape.snapshot(BASE_TIME + 200).coverage;
        expect(coverage.coverageStart).toBe(BASE_TIME + 59);
        expect(coverage.coverageEnd).toBe(BASE_TIME + 60);
        expect(coverage.eventTime).toBe(BASE_TIME + 60);
    });
});
