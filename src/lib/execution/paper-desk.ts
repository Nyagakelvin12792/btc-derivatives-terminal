import { z } from 'zod';
import type { LiquidityHeatmapFrame } from '../binance/types';
import { PaperAccountLedger, type PaperAccountSnapshotV1 } from './paper-ledger';

const QUOTE_AGE_MS = 2_000;
const EXECUTION_DELAY_MS = 250;
const STORE_KEY = 'btc-paper-desk-events-v1';
const MAX_EVENTS = 4_096;
const price = z.number().positive();
const epoch = z.number().int().nonnegative();
const provenance = { timeMs: epoch, sequence: epoch, quoteEventMs: epoch };
const exitReason = z.enum(['STOP_LOSS', 'TAKE_PROFIT', 'TIME_EXIT']);
const eventSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ENTRY'), id: z.string().min(1).max(160), stop: price, target: price, ask: price, askBtc: price, ...provenance }),
    z.strictObject({ kind: z.literal('TRIGGER'), reason: exitReason, ...provenance }),
    z.strictObject({ kind: z.literal('EXIT'), reason: exitReason, bid: price, bidBtc: price, ...provenance }),
]);
type PaperEvent = z.infer<typeof eventSchema>;
export type PaperQuote = { timeMs: number; quoteEventMs: number; sequence: number; bid: number; ask: number; bidBtc: number; askBtc: number };
export type ManualPaperPlan = { id: string; entry: number; stop: number; target: number };
type ReconciledDesk = { ledger: PaperAccountLedger; pending: Extract<PaperEvent, { kind: 'TRIGGER' }> | null };

export function projectPaperDesk(events: readonly PaperEvent[]): ReconciledDesk {
    const ledger = new PaperAccountLedger({ accountId: 'btc-usdt-manual-paper-v1', initialTimestampMs: events[0]?.timeMs ?? 0 });
    let pending: ReconciledDesk['pending'] = null;
    let last: PaperEvent | undefined;
    for (const event of events) {
        if (event.quoteEventMs > event.timeMs || (last && (event.timeMs <= last.timeMs || event.sequence <= last.sequence))) {
            throw new Error('Paper event sequence failed reconciliation.');
        }
        const position = ledger.getSnapshot().openPosition;
        if (event.kind === 'ENTRY') {
            if (pending || position) throw new Error('Paper entry conflicts with an existing position.');
            const opened = ledger.openPositionWithSizing({
                tradeId: event.id, timestampMs: event.timeMs, side: 'LONG', entryPrice: event.ask,
                stopPrice: event.stop, targetPrice: event.target, entryIsMaker: false, strategyId: 'MANUAL_SPOT_V1',
            });
            if (!opened.accepted || (opened.sizing?.finalQuantityBtc ?? Infinity) > event.askBtc) {
                throw new Error(opened.reason ?? 'Top-of-book ask size is insufficient.');
            }
        } else if (event.kind === 'TRIGGER') {
            if (!position || pending) throw new Error('Paper protective trigger could not be reconciled.');
            pending = event;
        } else {
            if (!position || !pending || pending.reason !== event.reason || event.timeMs < pending.timeMs + EXECUTION_DELAY_MS
                || event.bidBtc < position.quantityBtc) throw new Error('Paper exit could not be reconciled.');
            ledger.closeOpenPosition({
                timestampMs: event.timeMs, exitPrice: event.bid, isMakerExit: false, exitReason: event.reason,
                notes: `BINANCE_SPOT:BTCUSDT depth sequence ${event.sequence}, event ${event.quoteEventMs} UTC ms`,
            });
            pending = null;
        }
        last = event;
    }
    return { ledger, pending };
}

export function paperQuoteFromFrame(frame: LiquidityHeatmapFrame | undefined, now = Date.now()): PaperQuote | null {
    if (!frame || frame.eventTime > now || now - frame.eventTime > QUOTE_AGE_MS
        || frame.capturedAt > now || frame.eventTime > frame.capturedAt
        || ![frame.bestBid, frame.bestAsk].every((value) => Number.isFinite(value) && value > 0)
        || frame.bestBid > frame.bestAsk) return null;
    const bidBtc = frame.levels.find((level) => level.side === 'BID' && level.price === frame.bestBid)?.quantity;
    const askBtc = frame.levels.find((level) => level.side === 'ASK' && level.price === frame.bestAsk)?.quantity;
    if (!bidBtc || !askBtc || !Number.isFinite(bidBtc) || !Number.isFinite(askBtc) || bidBtc < 0 || askBtc < 0) return null;
    return { timeMs: frame.capturedAt, quoteEventMs: frame.eventTime, sequence: frame.lastUpdateId, bid: frame.bestBid, ask: frame.bestAsk, bidBtc, askBtc };
}

export function readPaperDesk(): PaperEvent[] {
    const raw = localStorage.getItem(STORE_KEY);
    return raw === null ? [] : z.strictObject({ version: z.literal(1), events: z.array(eventSchema).max(MAX_EVENTS) }).parse(JSON.parse(raw)).events;
}

export async function updatePaperDesk(quote: PaperQuote, plan?: ManualPaperPlan): Promise<PaperAccountSnapshotV1> {
    if (!navigator.locks) throw new Error('Paper account requires a browser with cross-tab storage locks.');
    return navigator.locks.request(STORE_KEY, () => {
        const now = Date.now();
        if (quote.quoteEventMs > now || now - quote.quoteEventMs > QUOTE_AGE_MS) throw new Error('Paper quote expired.');
        const events = readPaperDesk();
        const { ledger, pending } = projectPaperDesk(events);
        const snapshot = ledger.getSnapshot();
        const position = snapshot.openPosition;
        const last = events.at(-1);
        const source = { timeMs: quote.timeMs, quoteEventMs: quote.quoteEventMs, sequence: quote.sequence };
        if (last && (quote.sequence <= last.sequence || quote.timeMs <= last.timeMs)) {
            if (plan) throw new Error('Wait for a new verified quote.');
            return snapshot;
        }

        let event: PaperEvent | undefined;
        if (plan) {
            if (position || pending || events.length > MAX_EVENTS - 3) throw new Error('Paper account cannot reserve a new entry.');
            if (![plan.entry, plan.stop, plan.target].every((value) => Number.isFinite(value) && value > 0)
                || quote.ask - plan.stop < 50 || quote.ask / plan.entry - 1 > 0.001
                || (quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2) > 0.0005) {
                throw new Error('Plan or quote exceeds the stop-distance, spread, or entry-drift limit.');
            }
            event = { ...source, kind: 'ENTRY', id: plan.id, stop: plan.stop, target: plan.target, ask: quote.ask, askBtc: quote.askBtc };
        } else if (position && pending) {
            if (quote.timeMs >= pending.timeMs + EXECUTION_DELAY_MS && quote.bidBtc >= position.quantityBtc) {
                event = { ...source, kind: 'EXIT', reason: pending.reason, bid: quote.bid, bidBtc: quote.bidBtc };
            }
        } else if (position) {
            const reason = quote.bid <= position.stopPrice ? 'STOP_LOSS' : quote.bid >= position.targetPrice ? 'TAKE_PROFIT'
                : position.maxHoldUntilMs !== null && quote.timeMs >= position.maxHoldUntilMs ? 'TIME_EXIT' : undefined;
            if (reason) event = { ...source, kind: 'TRIGGER', reason };
        }
        if (!event) return snapshot;
        const next = [...events, eventSchema.parse(event)];
        const reconciled = projectPaperDesk(next).ledger.getSnapshot();
        localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, events: next }));
        return reconciled;
    });
}
