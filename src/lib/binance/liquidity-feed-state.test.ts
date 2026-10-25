import { describe, expect, it } from 'vitest';
import { createInitialLiquidityFeedState, reduceLiquidityFeedEvent } from './liquidity-feed-state';
import type { LiquidityHeatmapFrame } from './types';

function frame(lastUpdateId: number): LiquidityHeatmapFrame {
    return {
        schemaVersion: 1,
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        venue: 'BINANCE_SPOT',
        capturedAt: lastUpdateId,
        eventTime: lastUpdateId,
        lastUpdateId,
        bestBid: 100,
        bestAsk: 101,
        midPrice: 100.5,
        levels: [],
    };
}

describe('liquidity feed reducer', () => {
    it('retains only the configured number of client frames', () => {
        let state = createInitialLiquidityFeedState(2);
        for (const updateId of [1, 2, 3]) {
            state = reduceLiquidityFeedEvent(state, {
                type: 'FRAME',
                frame: frame(updateId),
                coverage: { startedAt: 1, endedAt: updateId, frameCount: updateId, frameCapacity: 10, warmupPercent: updateId * 10 },
            });
        }
        expect(state.frames.map((entry) => entry.lastUpdateId)).toEqual([2, 3]);
        expect(state.coverage.frameCount).toBe(3);
    });

    it('clears discontinuous history but preserves the reason and latest status', () => {
        let state = reduceLiquidityFeedEvent(createInitialLiquidityFeedState(2), {
            type: 'FRAME', frame: frame(1),
            coverage: { startedAt: 1, endedAt: 1, frameCount: 1, frameCapacity: 10, warmupPercent: 10 },
        });
        state = reduceLiquidityFeedEvent(state, { type: 'RESET', reason: 'GAP' });
        expect(state.frames).toEqual([]);
        expect(state.lastResetReason).toBe('GAP');
    });

    it('stores a safe recoverable error and clears it after the feed returns live', () => {
        let state = reduceLiquidityFeedEvent(createInitialLiquidityFeedState(2), {
            type: 'ERROR', code: 'SOCKET_UNAVAILABLE', message: 'Live depth stream disconnected.', recoverable: true,
        });
        expect(state.error?.code).toBe('SOCKET_UNAVAILABLE');
        state = reduceLiquidityFeedEvent(state, {
            type: 'STATUS', connected: true, paused: false, reconnectAttempt: 0, resyncRequired: false,
            sequence: { state: 'LIVE', lastUpdateId: 1, lastEventTime: 1, bufferedEventCount: 0, gapCount: 0, successfulBootstrapCount: 1 },
            coverage: { startedAt: null, endedAt: null, frameCount: 0, frameCapacity: 10, warmupPercent: 0 },
        });
        expect(state.error).toBeNull();
        expect(state.sequence.state).toBe('LIVE');
    });
});
