import { expect, it } from 'vitest';
import { evaluatePointInTimeNyValueRetest, freezePriorValueArea, type PointInTimeRetestInput } from './ny-value-retest-point-in-time';

const minute = 60_000;
const open = Date.parse('2026-11-09T14:30:00Z');
const priorOpen = Date.parse('2026-11-06T14:30:00Z');
function fixture(): PointInTimeRetestInput {
    const priorTs = priorOpen + minute;
    const triggerTs = open + 16 * minute;
    return {
        cutoffMs: triggerTs + 250,
        session: { openMs: open, closeMs: open + 390 * minute, full: true },
        priorSession: { openMs: priorOpen, closeMs: priorOpen + 390 * minute, full: true },
        calendarVerified: true, tapeComplete: true, alreadyFilled: false, variant: 'PRICE_LOCATION',
        priorTrades: [{ id: 'prior', timeMs: priorTs, availableAtMs: priorTs, price: 69_990, btc: 1, side: 'BUY' }],
        sessionTrades: [
            { id: 'trade', timeMs: open + minute, availableAtMs: open + minute, price: 70_000, btc: 1, side: 'BUY' },
        ],
        fiveMinute: [
            { id: 'setup', startMs: open + 5 * minute, timeMs: open + 10 * minute, availableAtMs: open + 10 * minute, low: 69_995, high: 70_055, close: 70_050 },
            { id: 'retest', startMs: open + 10 * minute, timeMs: open + 15 * minute, availableAtMs: open + 15 * minute, low: 69_975, high: 70_030, close: 70_025 },
        ],
        oneMinute: [{ id: 'trigger', startMs: triggerTs - minute, timeMs: triggerTs, availableAtMs: triggerTs, low: 70_025, high: 70_050, close: 70_045 }],
        quotes: [{ id: 'quote', timeMs: triggerTs + 250, availableAtMs: triggerTs + 250, bid: 70_044, ask: 70_045, askBtc: 1 }],
        equityUsdt: 10_000, freeCashUsdt: 10_000, weeklyFloorUsdt: 9_850,
    };
}

it('uses a half-open price bucket and lower POC ties', () => {
    const a = fixture().priorTrades[0];
    expect(freezePriorValueArea([a, { ...a, price: 70_000 }])).toEqual({ poc: 69_987.5, val: 69_975, vah: 70_025 });
});

it('waits for quote availability and produces a long-only fee-aware ticket', () => {
    const input = fixture();
    expect(evaluatePointInTimeNyValueRetest({ ...input, cutoffMs: input.cutoffMs - 1 })).toMatchObject({ status: 'WAIT' });
    expect(evaluatePointInTimeNyValueRetest(input)).toMatchObject({
        status: 'PAPER_READY', entry: 70_045, stop: 69_950, sourceEventIds: ['setup', 'retest', 'trigger', 'quote'],
    });
    expect(evaluatePointInTimeNyValueRetest({ ...input, variant: 'EXECUTED_FLOW' })).toMatchObject({ status: 'WAIT' });
    expect(evaluatePointInTimeNyValueRetest({ ...input, cutoffMs: open + 120 * minute })).toMatchObject({ reason: 'ENTRY_WINDOW_CLOSED' });
});
