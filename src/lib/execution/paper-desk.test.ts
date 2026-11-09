import { expect, it } from 'vitest';
import { projectPaperDesk } from './paper-desk';

it('replays an immutable entry, protective trigger, and later adverse exit', () => {
    const entry = { kind: 'ENTRY' as const, id: 'manual-1', timeMs: 10_000, quoteEventMs: 9_950, sequence: 1, ask: 70_000, askBtc: 1, stop: 69_500, target: 71_200 };
    const trigger = { kind: 'TRIGGER' as const, timeMs: 11_000, quoteEventMs: 10_950, sequence: 2, reason: 'STOP_LOSS' as const };
    const exit = { kind: 'EXIT' as const, timeMs: 11_300, quoteEventMs: 11_250, sequence: 3, reason: 'STOP_LOSS' as const, bid: 69_350, bidBtc: 1 };
    const events = [entry, trigger, exit];
    const snapshot = projectPaperDesk(events).ledger.getSnapshot();
    expect(snapshot.openPosition).toBeNull();
    expect(snapshot.journal[0]).toMatchObject({ tradeId: 'manual-1', exitPrice: 69_350, accountScope: 'PAPER_ACCOUNT' });
    expect(snapshot.equityUsdt).toBeCloseTo(10_000 + snapshot.journal[0].netPnlUsdt, 3);
    expect(projectPaperDesk(structuredClone(events)).ledger.getSnapshot()).toEqual(snapshot);
    expect(() => projectPaperDesk([entry, entry])).toThrow('sequence');
    const partial = { ...exit, bidBtc: 0.001 };
    const remainder = projectPaperDesk([entry, trigger, partial]);
    expect(remainder.pending?.reason).toBe('STOP_LOSS');
    expect(remainder.ledger.getSnapshot().openPosition?.quantityBtc).toBeGreaterThan(0);
    const closed = projectPaperDesk([entry, trigger, partial, { ...exit, sequence: 4, timeMs: 11_600, bid: 69_300 }]);
    expect(closed.pending).toBeNull();
    expect(closed.ledger.getSnapshot().journal[0].quantityBtc).toBeCloseTo(snapshot.journal[0].quantityBtc, 10);
    expect(closed.ledger.getSnapshot().journal[0].exitPrice).toBeLessThan(69_350);
});
