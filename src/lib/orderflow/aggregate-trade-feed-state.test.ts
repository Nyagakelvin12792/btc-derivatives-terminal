import { describe, expect, it } from 'vitest';
import { AggregateTradeTape } from './aggregate-trade-tape';
import { createInitialAggregateTradeFeedState, reduceAggregateTradeFeedEvent } from './aggregate-trade-feed-state';

function trade(id: number) {
    const tape = new AggregateTradeTape();
    const result = tape.ingest({
        e: 'aggTrade', E: 1_761_350_400_000 + id, s: 'BTCUSDT', a: id,
        p: '80000', q: '1', f: id, l: id, T: 1_761_350_400_000 + id,
        m: false, M: true,
    }, 1_761_350_500_000 + id);
    if (result.status !== 'ACCEPTED') throw new Error('fixture trade was not accepted');
    return result;
}

describe('aggregate-trade feed reducer', () => {
    it('bounds trade batches and preserves visible capture boundaries', () => {
        let state = createInitialAggregateTradeFeedState(2, 2);
        const first = trade(1);
        const second = trade(2);
        const third = trade(3);
        state = reduceAggregateTradeFeedEvent(state, { type: 'TRADE_BATCH', trades: [first.trade, second.trade, third.trade] });
        state = reduceAggregateTradeFeedEvent(state, { type: 'BOUNDARY', boundary: first.boundary! });

        expect(state.trades.map((item) => item.aggregateTradeId)).toEqual([2, 3]);
        expect(state.boundaries).toEqual([expect.objectContaining({ reason: 'CAPTURE_START' })]);
    });

    it('updates telemetry and keeps worker errors sanitized', () => {
        let state = createInitialAggregateTradeFeedState(10, 10);
        state = reduceAggregateTradeFeedEvent(state, {
            type: 'ERROR', code: 'INVALID_EVENT', message: 'An invalid aggregate-trade event was ignored.', recoverable: true,
        });
        expect(state.error).toEqual(expect.objectContaining({ code: 'INVALID_EVENT', recoverable: true }));
    });
});
