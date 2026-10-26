import { describe, expect, it } from 'vitest';
import { UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1 } from './aggregate-trade-replay-fixtures';
import { replayAggregateTradeCapture } from './aggregate-trade-replay';

describe('aggregate-trade deterministic replay', () => {
    it('reproduces identical snapshots and explicit capture boundaries', () => {
        const first = replayAggregateTradeCapture(UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1);
        const second = replayAggregateTradeCapture(UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1);

        expect(second).toEqual(first);
        expect(first.outcomes.map((outcome) => outcome.status)).toEqual([
            'ACCEPTED',
            'ACCEPTED',
            'DUPLICATE',
            'OUT_OF_ORDER',
            'ACCEPTED',
            'INVALID',
        ]);
        expect(first.snapshot.boundaries.map((boundary) => boundary.reason)).toEqual([
            'CAPTURE_START',
            'RECONNECT',
            'AGGREGATE_ID_GAP',
        ]);
        expect(first.snapshot.stats).toEqual({
            acceptedCount: 3,
            duplicateCount: 1,
            outOfOrderCount: 1,
            invalidCount: 1,
            reconnectCount: 1,
        });
    });

    it('rejects chronologically reversed replay records', () => {
        expect(() => replayAggregateTradeCapture([
            { kind: 'OFFLINE', capturedAt: 20 },
            { kind: 'RECONNECT', capturedAt: 19 },
        ])).toThrow('ordered by capturedAt');
    });
});
