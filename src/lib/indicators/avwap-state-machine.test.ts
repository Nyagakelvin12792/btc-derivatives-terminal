import { beforeEach, describe, expect, it } from 'vitest';
import {
    AVWAP_STORAGE_KEY,
    avwapReducer,
    clearMemoryStorageForTesting,
    findNearestBarIndexByTime,
    loadPersistedAvwapAnchor,
    savePersistedAvwapAnchor,
    type AvwapAnchorConfig,
} from './avwap-state-machine';

describe('AVWAP State Machine & Persistence', () => {
    beforeEach(() => {
        clearMemoryStorageForTesting();
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.clear();
        }
    });

    it('manages full lifecycle transitions: IDLE -> SELECTED -> DRAGGING -> COMMITTED -> IDLE', () => {
        let state: AvwapAnchorConfig = {
            anchorTime: 1700000000,
            isManual: false,
            interactionState: 'IDLE',
            provisionalTime: null,
        };

        // Select
        state = avwapReducer(state, { type: 'SELECT' });
        expect(state.interactionState).toBe('SELECTED');

        // Start Drag
        state = avwapReducer(state, { type: 'START_DRAG' });
        expect(state.interactionState).toBe('DRAGGING');
        expect(state.provisionalTime).toBe(1700000000);

        // Drag Move
        state = avwapReducer(state, { type: 'DRAG_MOVE', timestamp: 1700003600 });
        expect(state.interactionState).toBe('DRAGGING');
        expect(state.provisionalTime).toBe(1700003600);
        expect(state.anchorTime).toBe(1700000000); // committed anchor remains unchanged during drag

        // Commit Drag
        state = avwapReducer(state, { type: 'COMMIT_DRAG', timestamp: 1700003600 });
        expect(state.interactionState).toBe('COMMITTED');
        expect(state.anchorTime).toBe(1700003600);
        expect(state.provisionalTime).toBeNull();
        expect(state.isManual).toBe(true);

        // Deselect
        state = avwapReducer(state, { type: 'DESELECT' });
        expect(state.interactionState).toBe('IDLE');
    });

    it('handles cancellation and restores canonical anchor position', () => {
        let state: AvwapAnchorConfig = {
            anchorTime: 1700000000,
            isManual: true,
            interactionState: 'DRAGGING',
            provisionalTime: 1700009999,
        };

        state = avwapReducer(state, { type: 'CANCEL_DRAG' });
        expect(state.interactionState).toBe('CANCELLED');
        expect(state.anchorTime).toBe(1700000000); // original anchor preserved
        expect(state.provisionalTime).toBeNull();
    });

    it('persists committed anchor to localStorage and reloads correctly', () => {
        savePersistedAvwapAnchor(1710005500);
        const loaded = loadPersistedAvwapAnchor();
        expect(loaded).toEqual({
            anchorTime: 1710005500,
            isManual: true,
        });
    });

    it('finds nearest bar index in O(log N) accurately using binary search', () => {
        const bars = [
            { time: 100 },
            { time: 200 },
            { time: 300 },
            { time: 400 },
            { time: 500 },
            { time: 600 },
        ];

        expect(findNearestBarIndexByTime(bars, 100)).toBe(0);
        expect(findNearestBarIndexByTime(bars, 300)).toBe(2);
        expect(findNearestBarIndexByTime(bars, 600)).toBe(5);

        // In between values
        expect(findNearestBarIndexByTime(bars, 240)).toBe(1); // closer to 200
        expect(findNearestBarIndexByTime(bars, 260)).toBe(2); // closer to 300
        expect(findNearestBarIndexByTime(bars, 50)).toBe(0);  // before first
        expect(findNearestBarIndexByTime(bars, 900)).toBe(5); // after last
    });
});
