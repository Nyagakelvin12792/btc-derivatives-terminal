import type { LiquidityResetReason, LiquidityWorkerErrorCode, LiquidityWorkerEvent } from './liquidity-worker-protocol';
import type { LiquidityHeatmapCoverage, LiquidityHeatmapFrame, LiquiditySequenceStatus } from './types';

export interface LiquidityFeedError {
    code: LiquidityWorkerErrorCode;
    message: string;
    recoverable: boolean;
}

export interface LiquidityFeedState {
    frames: LiquidityHeatmapFrame[];
    coverage: LiquidityHeatmapCoverage;
    sequence: LiquiditySequenceStatus;
    connected: boolean;
    paused: boolean;
    reconnectAttempt: number;
    resyncRequired: boolean;
    maxClientFrames: number;
    lastResetReason: LiquidityResetReason | null;
    error: LiquidityFeedError | null;
}

export function createInitialLiquidityFeedState(maxClientFrames: number): LiquidityFeedState {
    return {
        frames: [],
        coverage: { startedAt: null, endedAt: null, frameCount: 0, frameCapacity: maxClientFrames, warmupPercent: 0 },
        sequence: { state: 'OFFLINE', lastUpdateId: null, lastEventTime: null, bufferedEventCount: 0, gapCount: 0, successfulBootstrapCount: 0 },
        connected: false,
        paused: false,
        reconnectAttempt: 0,
        resyncRequired: true,
        maxClientFrames,
        lastResetReason: null,
        error: null,
    };
}

export function reduceLiquidityFeedEvent(state: LiquidityFeedState, event: LiquidityWorkerEvent): LiquidityFeedState {
    switch (event.type) {
        case 'FRAME':
            return {
                ...state,
                frames: [...state.frames, event.frame].slice(-state.maxClientFrames),
                coverage: event.coverage,
            };
        case 'RESET':
            return { ...state, frames: [], lastResetReason: event.reason };
        case 'ERROR':
            return { ...state, error: { code: event.code, message: event.message, recoverable: event.recoverable } };
        case 'STATUS':
            return {
                ...state,
                frames: event.coverage.startedAt === null && event.coverage.frameCount === 0 ? [] : state.frames,
                connected: event.connected,
                paused: event.paused,
                reconnectAttempt: event.reconnectAttempt,
                resyncRequired: event.resyncRequired,
                sequence: event.sequence,
                coverage: event.coverage,
                error: event.sequence.state === 'LIVE' ? null : state.error,
            };
    }
}
