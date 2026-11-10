import { AggregateTradeCaptureSnapshotV1Schema, type AggregateTradeCaptureSnapshotV1 } from './contracts';
import { buildFootprintReplaySnapshot } from './footprint-workspace';
import type { TrueFlowInterval, TrueFlowSnapshotV1 } from './true-flow-contracts';

export type FootprintReplayCommand =
    | { type: 'load'; file: File }
    | { type: 'seek'; requestId: number; cursorMs: number; main: TrueFlowInterval; footprint: TrueFlowInterval };

export type FootprintReplayEvent =
    | { type: 'loaded'; times: number[]; fileName: string }
    | { type: 'view'; requestId: number; cursorMs: number; main: TrueFlowSnapshotV1; footprint: TrueFlowSnapshotV1 | null }
    | { type: 'error'; message: string };

let tape: AggregateTradeCaptureSnapshotV1 | null = null;

function send(event: FootprintReplayEvent) {
    self.postMessage(event);
}

self.onmessage = async ({ data }: MessageEvent<FootprintReplayCommand>) => {
    try {
        if (data.type === 'load') {
            if (data.file.size > 16 * 1024 * 1024) throw new Error('Replay tape must be at most 16 MiB.');
            const parsed = AggregateTradeCaptureSnapshotV1Schema.safeParse(JSON.parse(await data.file.text()));
            if (!parsed.success || !parsed.data.trades.length || parsed.data.trades.length > 50_000) {
                throw new Error('Choose a valid BTCUSDT Spot capture JSON with 1 to 50,000 trade messages.');
            }
            const trades = parsed.data.trades.sort((a, b) => a.aggregateTradeId - b.aggregateTradeId);
            const boundaries = new Set(parsed.data.boundaries.filter((boundary) => boundary.reason === 'AGGREGATE_ID_GAP')
                .map((boundary) => `${boundary.previousAggregateTradeId}:${boundary.nextAggregateTradeId}`));
            for (let index = 1; index < trades.length; index++) {
                const previous = trades[index - 1].aggregateTradeId;
                const next = trades[index].aggregateTradeId;
                if (previous === next) throw new Error('Replay tape contains duplicate aggregate trade IDs.');
                if (next > previous + 1 && !boundaries.has(`${previous}:${next}`)) {
                    throw new Error('Replay tape has an aggregate trade ID gap without a matching boundary.');
                }
            }
            tape = parsed.data;
            const times = [...new Set(tape.trades.map((trade) => Math.max(trade.eventTime, trade.tradeTime)))].sort((a, b) => a - b);
            send({ type: 'loaded', times, fileName: data.file.name });
        } else if (tape) {
            const snapshot = (interval: TrueFlowInterval) => buildFootprintReplaySnapshot(tape!, data.cursorMs, {
                interval, priceBucket: 10, valueAreaFraction: 0.7,
            });
            send({ type: 'view', requestId: data.requestId, cursorMs: data.cursorMs, main: snapshot(data.main),
                footprint: data.footprint === data.main ? null : snapshot(data.footprint) });
        }
    } catch (error) {
        send({ type: 'error', message: error instanceof SyntaxError ? 'Replay tape is not valid JSON.'
            : error instanceof Error ? error.message : 'Replay tape could not be read.' });
    }
};
