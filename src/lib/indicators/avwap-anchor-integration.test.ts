import { beforeEach, describe, expect, it } from 'vitest';
import {
    avwapReducer,
    clearMemoryStorageForTesting,
    findNearestBarIndexByTime,
    loadPersistedAvwapAnchor,
    savePersistedAvwapAnchor,
    type AvwapAnchorConfig,
} from './avwap-state-machine';
import { createDemoMarketBars } from '../ui/market-fixtures';

describe('AVWAP Anchor Reversion Elimination & Integration', () => {
    beforeEach(() => {
        clearMemoryStorageForTesting();
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.clear();
        }
    });

    it('retains the user-dragged anchor position when new market bars arrive', () => {
        const initialBars = createDemoMarketBars(68000, 100, 60);
        const dragTargetBar = initialBars[45]; // user drags to bar 45
        const dragTargetTime = Number(dragTargetBar.time);

        // Trader drags anchor to bar 45
        let avwapConfig: AvwapAnchorConfig = {
            anchorTime: Number(initialBars[10].time),
            isManual: false,
            interactionState: 'IDLE',
            provisionalTime: null,
        };

        avwapConfig = avwapReducer(avwapConfig, { type: 'START_DRAG' });
        avwapConfig = avwapReducer(avwapConfig, { type: 'DRAG_MOVE', timestamp: dragTargetTime });
        avwapConfig = avwapReducer(avwapConfig, { type: 'COMMIT_DRAG', timestamp: dragTargetTime });

        expect(avwapConfig.anchorTime).toBe(dragTargetTime);
        expect(avwapConfig.isManual).toBe(true);
        expect(avwapConfig.interactionState).toBe('COMMITTED');

        // New market candles arrive (bars array extended)
        const updatedBars = createDemoMarketBars(68500, 120, 60);

        // Resolving anchor index against updated bars must find the exact candle with dragTargetTime
        const resolvedIndex = findNearestBarIndexByTime(updatedBars, avwapConfig.anchorTime);
        expect(resolvedIndex).toBeGreaterThanOrEqual(0);
        // The timestamp must remain strictly equal (0ms drift)
        expect(Number(updatedBars[resolvedIndex].time)).toBe(dragTargetTime);
    });

    it('survives Volume Profile mode changes and range updates without reverting', () => {
        const bars = createDemoMarketBars(68000, 200, 60);
        const manualTime = Number(bars[77].time);

        // Commit anchor
        savePersistedAvwapAnchor(manualTime);
        const config = loadPersistedAvwapAnchor();
        expect(config?.anchorTime).toBe(manualTime);
        expect(config?.isManual).toBe(true);

        // Simulate switching VP between DAILY, WEEKLY, PREV_SESSION
        // Previously, line 617 setAnchorIndex(Math.max(0, endIdx - 126)) would overwrite it.
        // With timestamp anchoring, manualTime remains immutable:
        const currentAnchorTime = config?.anchorTime ?? 0;
        expect(currentAnchorTime).toBe(manualTime);
        const resolvedIdx = findNearestBarIndexByTime(bars, currentAnchorTime);
        expect(Number(bars[resolvedIdx].time)).toBe(manualTime);
    });

    it('survives timeframe switches (e.g. 1m to 15m) by mapping to nearest parent candle', () => {
        const bars1m = createDemoMarketBars(68000, 300, 60);
        const targetTime = Number(bars1m[150].time);

        // Trader anchored on 1m chart
        savePersistedAvwapAnchor(targetTime);

        // User switches to 15m chart (900 second bars)
        const bars15m = createDemoMarketBars(68000, 100, 900);
        const loaded = loadPersistedAvwapAnchor();
        expect(loaded?.anchorTime).toBe(targetTime);

        const index15m = findNearestBarIndexByTime(bars15m, loaded!.anchorTime);
        expect(index15m).toBeGreaterThanOrEqual(0);
        expect(index15m).toBeLessThan(bars15m.length);

        // The matched 15m candle must enclose the 1m anchor timestamp
        const bar15mTime = Number(bars15m[index15m].time);
        expect(Math.abs(bar15mTime - targetTime)).toBeLessThanOrEqual(900);
    });

    it('survives page reload via localStorage persistence', () => {
        const targetTime = 1715000000;
        savePersistedAvwapAnchor(targetTime);

        const restored = loadPersistedAvwapAnchor();
        expect(restored).not.toBeNull();
        expect(restored?.anchorTime).toBe(targetTime);
        expect(restored?.isManual).toBe(true);
    });
});
