import {
    AggregateTradeTape,
    createAggregateTradeTapeOptions,
    type AggregateTradeIngestResult,
    type AggregateTradeTapeOptions,
} from './aggregate-trade-tape';
import type { AggregateTradeCaptureSnapshotV1 } from './contracts';

export type AggregateTradeReplayRecord =
    | { kind: 'TRADE'; capturedAt: number; payload: unknown }
    | { kind: 'RECONNECT'; capturedAt: number }
    | { kind: 'OFFLINE'; capturedAt: number };

export interface AggregateTradeReplayResult {
    snapshot: AggregateTradeCaptureSnapshotV1;
    outcomes: AggregateTradeIngestResult[];
}

function assertReplayTime(value: number, previous: number | null): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError('Replay capturedAt must be a non-negative safe integer');
    }
    if (previous !== null && value < previous) {
        throw new RangeError('Replay records must be ordered by capturedAt');
    }
}

/** Replays only recorded inputs; it performs no wall-clock reads or network I/O. */
export function replayAggregateTradeCapture(
    records: readonly AggregateTradeReplayRecord[],
    options: Partial<AggregateTradeTapeOptions> = {},
): AggregateTradeReplayResult {
    const checkedOptions = createAggregateTradeTapeOptions(options);
    const tape = new AggregateTradeTape(checkedOptions);
    const outcomes: AggregateTradeIngestResult[] = [];
    let replayTime: number | null = null;

    for (const record of records) {
        assertReplayTime(record.capturedAt, replayTime);
        replayTime = record.capturedAt;
        if (record.kind === 'TRADE') outcomes.push(tape.ingest(record.payload, record.capturedAt));
        if (record.kind === 'RECONNECT') tape.markReconnect(record.capturedAt);
        if (record.kind === 'OFFLINE') tape.markOffline();
    }

    return {
        snapshot: tape.snapshot(replayTime ?? 0),
        outcomes,
    };
}
