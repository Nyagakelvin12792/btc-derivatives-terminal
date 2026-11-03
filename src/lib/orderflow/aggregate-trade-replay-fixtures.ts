import type { AggregateTradeReplayRecord } from './aggregate-trade-replay';

const START = 1_761_350_400_000;

function aggregateTrade(id: number, buyerIsMaker: boolean) {
    return {
        e: 'aggTrade',
        E: START + id,
        s: 'BTCUSDT',
        a: id,
        p: id % 2 === 0 ? '80250.00' : '80255.00',
        q: id % 2 === 0 ? '0.750' : '0.250',
        f: 90_000 + id,
        l: 90_000 + id,
        T: START + id,
        m: buyerIsMaker,
        M: true,
    };
}

export const UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1: readonly AggregateTradeReplayRecord[] = Object.freeze([
    { kind: 'TRADE', capturedAt: START + 100, payload: aggregateTrade(100, false) },
    { kind: 'TRADE', capturedAt: START + 101, payload: aggregateTrade(101, true) },
    { kind: 'TRADE', capturedAt: START + 102, payload: aggregateTrade(101, true) },
    { kind: 'TRADE', capturedAt: START + 103, payload: aggregateTrade(99, false) },
    { kind: 'RECONNECT', capturedAt: START + 104 },
    { kind: 'TRADE', capturedAt: START + 105, payload: aggregateTrade(105, false) },
    { kind: 'TRADE', capturedAt: START + 106, payload: { e: 'aggTrade', s: 'BTCUSDT' } },
]);
