import { describe, expect, it } from 'vitest';
import { createInitialAggregateTradeFeedState, reduceAggregateTradeFeedEvent } from './aggregate-trade-feed-state';
import { AggregateTradeTape } from './aggregate-trade-tape';
import { buildFootprintReplaySnapshot, buildFootprintWorkspace, resolveFootprintDisplayStep } from './footprint-workspace';
import { footprintPriceBucketIndex } from './price-bucket';
import { deriveTrueFlowSnapshotV1 } from './true-flow';
import { TrueFlowSessionAccumulator } from './true-flow-session';

const start = Date.UTC(2026, 9, 30, 12);
const hour = 60 * 60 * 1_000;
const options = { interval: '1h', priceBucket: 10 } as const;

function event(id: number, offsetMs: number, price: string, quantity: string, bid: boolean, lastId = id, lag = 0) {
    const time = start + offsetMs;
    return { e: 'aggTrade', E: time + lag, T: time, s: 'BTCUSDT', a: id, f: id, l: lastId, p: price, q: quantity, m: bid };
}

function makeTape(trades: ReturnType<typeof event>[]) {
    const tape = new AggregateTradeTape();
    for (const trade of trades) expect(tape.ingest(trade, trade.E).status).toBe('ACCEPTED');
    return tape;
}

describe('UX21 observed Footprint workspace', () => {
    it('keeps exchange prices on the correct side of decimal bin boundaries', () => {
        expect(footprintPriceBucketIndex(0.3, 0.1)).toBe(3);
        expect(footprintPriceBucketIndex(80000.01, 0.01)).toBe(8_000_001);
        expect(footprintPriceBucketIndex(80000.00999999998, 0.01)).toBe(8_000_000);
        expect(footprintPriceBucketIndex(1e-7, 1e-8)).toBe(10);
    });

    it('preserves Bid, Ask, BTC/USDT delta and aggregate count when regrouping and omits empty price rows', () => {
        const tape = makeTape([
            event(1, 0, '80000', '0.00004', false),
            event(2, 2, '80010', '1.2', true),
            event(3, 4, '80101', '1', false),
            event(4, 6, '80118', '1', false, 7),
        ]);
        const snapshot = deriveTrueFlowSnapshotV1(tape.snapshot(start + 10), options);
        const [fine] = buildFootprintWorkspace(snapshot, 10, start + 10);
        const [coarse] = buildFootprintWorkspace(snapshot, 19, start + 10);

        expect(coarse).toMatchObject({
            open: 80000, high: 80118, low: 80000, close: 80118,
            aggregateTradeCount: 4, executionCount: null, developing: true, coverageStatus: 'PARTIAL',
            pocPrice: 80110,
        });
        expect(coarse.askVolumeBtc).toBeCloseTo(2.00004, 10);
        expect(coarse.bidVolumeBtc).toBeCloseTo(1.2, 10);
        expect(coarse.totalVolumeBtc).toBeCloseTo(3.20004, 10);
        expect(coarse.deltaBtc).toBeCloseTo(0.80004, 10);
        expect(coarse.deltaPercent).toBeCloseTo((0.80004 / 3.20004) * 100, 10);
        expect(fine.cells.map((cell) => cell.priceLow)).toEqual([80000, 80010, 80100, 80110]);
        expect(coarse.cells.map((cell) => cell.priceLow)).toEqual([80000, 80100]);
        expect(fine.pocPrice).toBe(80015);
        expect(coarse.cells[0].buyVolumeBtc).toBeCloseTo(0.00004, 10);
        expect(coarse.cells[1].sellVolumeBtc).toBe(0);
        expect(coarse.cells.reduce((sum, cell) => sum + cell.deltaNotionalUsd, 0)).toBeCloseTo(snapshot.totals.deltaNotionalUsd);
        expect(resolveFootprintDisplayStep(0.1, 0.3)).toBeCloseTo(0.3);
    });

    it('holds closed OHLC and extrema stable while the next developing H1 candle updates', () => {
        const tape = new AggregateTradeTape();
        const session = new TrueFlowSessionAccumulator(options);
        const ingest = (trade: ReturnType<typeof event>) => {
            const result = tape.ingest(trade, trade.E);
            if (result.status !== 'ACCEPTED') throw new Error('Bad fixture');
            if (result.boundary) session.recordBoundary(result.boundary);
            session.ingest(result.trade);
        };
        ingest(event(1, 0, '80000', '1', false));
        ingest(event(2, hour - 1, '80020', '2', true));
        ingest(event(3, hour, '80030', '1', false));
        const initial = buildFootprintWorkspace(session.snapshot(tape.telemetry(start + hour).coverage), 10, start + hour);
        ingest(event(4, hour + 5, '80040', '2', false));
        const updated = buildFootprintWorkspace(session.snapshot(tape.telemetry(start + hour + 5).coverage), 10, start + hour + 5);

        expect(initial[0]).toEqual(updated[0]);
        expect(initial[0]).toMatchObject({
            openTime: start, closeTime: start + hour, executionCount: 2, developing: false,
            maxDeltaUsdt: 80000, minDeltaUsdt: -80040, cumulativeDeltaBtc: -1,
        });
        expect(initial[1]).toMatchObject({ executionCount: 1, close: 80030, developing: true });
        expect(updated[1]).toMatchObject({ executionCount: 2, close: 80040, deltaBtc: 3, cumulativeDeltaBtc: 2 });
    });

    it('regroups only changed cells after a worker snapshot refresh', () => {
        const tape = makeTape([
            event(1, 0, '80000', '1', false),
            event(2, hour, '80020', '1', false),
        ]);
        const before = deriveTrueFlowSnapshotV1(tape.snapshot(start + hour), options);
        const firstState = reduceAggregateTradeFeedEvent(createInitialAggregateTradeFeedState(10, 10),
            { type: 'FOOTPRINT_SNAPSHOT', snapshot: before });
        const first = buildFootprintWorkspace(firstState.footprintFlow, 20, start + hour);

        const nextTrade = event(3, hour, '80021', '2', true);
        tape.ingest(nextTrade, nextTrade.E);
        const after = deriveTrueFlowSnapshotV1(tape.snapshot(nextTrade.E), options);
        const secondState = reduceAggregateTradeFeedEvent(firstState, { type: 'FOOTPRINT_SNAPSHOT', snapshot: after });
        const second = buildFootprintWorkspace(secondState.footprintFlow, 20, nextTrade.E);
        expect(second[0].cells).toBe(first[0].cells);
        expect(second[1].cells).not.toBe(first[1].cells);
        expect(second[1].deltaBtc).toBe(-1);
        expect(buildFootprintWorkspace(secondState.footprintFlow, 30, nextTrade.E)[0].cells).not.toBe(first[0].cells);
    });

    it.each([
        ['1h', 80, 120, 11.25, 3.75],
        ['4h', 20, 480, 45, 15],
    ] as const)('reconciles all observed %s statistics against 9,600 reference executions', (interval, candleCount, messages, ask, bid) => {
        const tape = new AggregateTradeTape();
        for (let index = 0; index < 9_600; index++) {
            const trade = event(index + 1, index * 30_000, String(76_000 + index % 751 * 5), '0.125', index % 4 === 0);
            tape.ingest(trade, trade.E);
        }
        const capturedAt = start + 80 * hour;
        const snapshot = deriveTrueFlowSnapshotV1(tape.snapshot(capturedAt), { interval, priceBucket: 10 });
        const candles = buildFootprintWorkspace(snapshot, 50, capturedAt);
        expect(candles).toHaveLength(candleCount);
        for (const candle of candles) {
            expect(candle).toMatchObject({
                aggregateTradeCount: messages, executionCount: messages,
                askVolumeBtc: ask, bidVolumeBtc: bid, totalVolumeBtc: ask + bid,
                deltaBtc: ask - bid, deltaPercent: 50, developing: false,
            });
            expect(candle.cells.reduce((sum, cell) => sum + cell.tradeCount, 0)).toBe(messages);
        }
    });

    it('preserves fragments at a capture break and resets continuous statistics', () => {
        const tape = makeTape([
            event(1, 1, '80000', '3', true),
            event(3, 2, '80020', '2', false),
            event(4, hour + 1, '80030', '1', false),
        ]);
        const snapshot = deriveTrueFlowSnapshotV1(tape.snapshot(start + hour + 1), options);
        const [broken, next] = buildFootprintWorkspace(snapshot, 20, start + hour + 1);
        expect(broken).toMatchObject({
            askVolumeBtc: 2, bidVolumeBtc: 3, deltaBtc: -1, coverageStatus: 'GAPPED',
            cumulativeDeltaBtc: null, minDeltaUsdt: null, maxDeltaUsdt: null,
        });
        expect(next.cumulativeDeltaBtc).toBe(3);
    });

    it('compares only neighboring price bins and rejects tiny opposing notional', () => {
        const tape = makeTape([
            event(1, 0, '80001', '1', true),
            event(2, 1, '80020', '0.000001', true),
            event(3, 2, '80020', '5', false),
            event(4, 3, '80030', '5', false),
        ]);
        const snapshot = deriveTrueFlowSnapshotV1(tape.snapshot(start + 3), options);
        const [candle] = buildFootprintWorkspace(snapshot, 10, start + 3, { minDominantNotionalUsd: 1 });
        expect(candle.cells.every((cell) => !cell.buyImbalance && !cell.sellImbalance)).toBe(true);
    });

    it('rebuckets H4 and 30m using UTC boundaries and replays only the available trade prefix', () => {
        const tape = makeTape([
            event(1, 0, '80000', '1', false),
            event(2, 1_000, '80010', '2', true, 2, 1_000),
            event(3, 30 * 60_000, '81000', '4', false),
            event(4, 4 * hour, '83000', '8', false),
        ]);
        const full = tape.snapshot(start + 4 * hour);
        const h4 = { interval: '4h', priceBucket: 10 } as const;
        expect(buildFootprintWorkspace(buildFootprintReplaySnapshot(full, start + 1_000, h4), 10, start + 1_000))
            .toMatchObject([{ openTime: start, developing: true, aggregateTradeCount: 1, close: 80000, deltaBtc: 1 }]);
        expect(buildFootprintWorkspace(buildFootprintReplaySnapshot(full, start + 2_000, h4), 10, start + 2_000))
            .toMatchObject([{ openTime: start, developing: true, aggregateTradeCount: 2, close: 80010, deltaBtc: -1 }]);
        const fullH4 = buildFootprintWorkspace(deriveTrueFlowSnapshotV1(full, h4), 50, start + 4 * hour);
        expect(fullH4.map(({ openTime, deltaBtc }) => [openTime, deltaBtc]))
            .toEqual([[start, 3], [start + 4 * hour, 8]]);
        const halfHour = buildFootprintWorkspace(deriveTrueFlowSnapshotV1(full, { ...h4, interval: '30m' }), 10, start + 4 * hour);
        expect(halfHour.map(({ openTime, aggregateTradeCount }) => [openTime, aggregateTradeCount]))
            .toEqual([[start, 2], [start + 30 * 60_000, 1], [start + 4 * hour, 1]]);
        expect(buildFootprintWorkspace(null, 10, start)).toEqual([]);
    });
});
