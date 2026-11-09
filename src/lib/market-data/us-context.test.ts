import { describe, expect, it } from 'vitest';
import { evaluateUsMarketContext } from './us-context';

describe('UX20.6-US-01 US Session Clock, DST, and Macro Blackout Gate', () => {
    it('identifies NY Opening Range (09:30-10:00 ET) and Decision Window (10:00-11:30 ET) across EDT and EST', () => {
        // July 15, 2026 14:15 UTC -> 10:15 EDT (DST active, inside NY Decision Window)
        const summerTs = Date.UTC(2026, 6, 15, 14, 15, 0);
        const summerSnap = evaluateUsMarketContext(summerTs);
        expect(summerSnap.isDstActive).toBe(true);
        expect(summerSnap.nyHour).toBe(10);
        expect(summerSnap.nyMinute).toBe(15);
        expect(summerSnap.inNyDecisionWindow).toBe(true);
        expect(summerSnap.sessionPhase).toBe('NY_DECISION_WINDOW');

        // November 10, 2026 14:45 UTC -> 09:45 EST (Standard time, inside NY Opening Range)
        const winterTs = Date.UTC(2026, 10, 10, 14, 45, 0);
        const winterSnap = evaluateUsMarketContext(winterTs);
        expect(winterSnap.isDstActive).toBe(false);
        expect(winterSnap.nyHour).toBe(9);
        expect(winterSnap.nyMinute).toBe(45);
        expect(winterSnap.inNyOpeningRangeWindow).toBe(true);
        expect(winterSnap.sessionPhase).toBe('NY_OPEN_DISCOVERY');
    });

    it('blocks setups within +-30 minutes of a scheduled CPI/FOMC/NFP release', () => {
        const cpiReleaseTs = Date.UTC(2026, 10, 12, 13, 30, 0); // 08:30 EST CPI release
        const checkTs = cpiReleaseTs + 15 * 60_000; // 15 mins after CPI
        const snap = evaluateUsMarketContext(checkTs, [
            {
                id: 'cpi-2026-11',
                name: 'CPI',
                timestampMs: cpiReleaseTs,
                suppressMinutesBefore: 30,
                suppressMinutesAfter: 30,
            },
        ]);
        expect(snap.activeMacroBlock.blocked).toBe(true);
        expect(snap.activeMacroBlock.eventName).toBe('CPI');
    });
});
