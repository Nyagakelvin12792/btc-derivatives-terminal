import { calculateFeeInclusivePositionSize, DEFAULT_PAPER_FEE_SCHEDULE, type PaperFeeSchedule } from '../execution/paper-ledger';
import { getNewYorkWallClock } from '../market-data/us-context';

const ROW = 25;
const MINUTE = 60_000;
type Available = { id: string; timeMs: number; availableAtMs: number };
type Trade = Available & { price: number; btc: number; side: 'BUY' | 'SELL' };
type Bar = Available & { startMs: number; high: number; low: number; close: number };
type Quote = Available & { bid: number; ask: number; askBtc: number };
type OptionWall = { expiryMs: number; strike: number; callGex: number };
type Chain = Available & { validCoverage: boolean; calls: readonly OptionWall[] };
type Session = { openMs: number; closeMs: number; full: boolean };
type Phase = 'WAIT' | 'ABSTAIN' | 'REJECTED';

export type PointInTimeRetestInput = {
    cutoffMs: number;
    session: Session;
    priorSession: Session;
    calendarVerified: boolean;
    tapeComplete: boolean;
    priorTrades: readonly Trade[];
    sessionTrades: readonly Trade[];
    fiveMinute: readonly Bar[];
    oneMinute: readonly Bar[];
    quotes: readonly Quote[];
    chain?: Chain;
    variant: 'PRICE_LOCATION' | 'EXECUTED_FLOW' | 'OPTIONS_VETO';
    latencyMs?: 100 | 250 | 1000;
    approvalMs?: number;
    alreadyFilled: boolean;
    equityUsdt: number;
    freeCashUsdt: number;
    weeklyFloorUsdt: number;
    fees?: PaperFeeSchedule;
};

const visible = (event: Available, cutoff: number) =>
    event.timeMs <= cutoff && event.timeMs <= event.availableAtMs && event.availableAtMs <= cutoff;
const validTrade = (trade: Trade) => Number.isFinite(trade.price) && trade.price > 0 && Number.isFinite(trade.btc) && trade.btc > 0;
const rowIndex = (price: number) => Math.floor(price / ROW);
const result = (status: Phase, reason: string) => ({ status, reason } as const);

export function freezePriorValueArea(trades: readonly Trade[]) {
    if (!trades.length || trades.some((trade) => !validTrade(trade))) return null;
    const rows = new Map<number, number>();
    let total = 0;
    for (const trade of trades) {
        const row = rowIndex(trade.price);
        rows.set(row, (rows.get(row) ?? 0) + trade.btc);
        total += trade.btc;
    }
    if (!Number.isFinite(total)) return null;
    const indices = [...rows.keys()].sort((a, b) => a - b);
    const poc = indices.reduce((best, row) => rows.get(row)! > rows.get(best)! ? row : best);
    let low = poc, high = poc, included = rows.get(poc)!;
    const first = indices[0], last = indices.at(-1)!;
    if (last - first > 10_000) return null;
    while (included < total * 0.7 && (low > first || high < last)) {
        const below = low > first ? rows.get(low - 1) ?? 0 : -1;
        const above = high < last ? rows.get(high + 1) ?? 0 : -1;
        if (below >= above) { low--; included += below; }
        else { high++; included += above; }
    }
    return { poc: (poc + 0.5) * ROW, val: low * ROW, vah: (high + 1) * ROW };
}

function flowPass(trades: readonly Trade[]) {
    const buys = new Map<number, number>();
    const sells = new Map<number, number>();
    let signed = 0, gross = 0;
    for (const trade of trades) {
        const amount = trade.price * trade.btc;
        const rows = trade.side === 'BUY' ? buys : sells;
        const row = rowIndex(trade.price);
        rows.set(row, (rows.get(row) ?? 0) + amount);
        signed += trade.side === 'BUY' ? amount : -amount;
        gross += amount;
    }
    const qualifying = (row: number) => {
        const buy = buys.get(row) ?? 0;
        const sell = sells.get(row - 1) ?? 0;
        return buy >= 10_000 && sell > 0 && buy >= 3 * sell;
    };
    return gross > 0 && signed >= gross * 0.1 && [...buys.keys()].some((row) =>
        qualifying(row) && qualifying(row + 1) && qualifying(row + 2)
    );
}

function validBar(bar: Bar, duration: number, open: number) {
    return bar.timeMs - bar.startMs === duration && bar.startMs >= open
        && (bar.startMs - open) % duration === 0
        && [bar.low, bar.high, bar.close].every((price) => Number.isFinite(price) && price > 0)
        && bar.low <= bar.close && bar.close <= bar.high;
}

/** Evaluate the frozen long-only strategy from point-in-time inputs. */
export function evaluatePointInTimeNyValueRetest(input: PointInTimeRetestInput) {
    const { cutoffMs, session, priorSession } = input;
    const open = session.openMs;
    const entryStart = open + 15 * MINUTE;
    const entryEnd = open + 120 * MINUTE;
    if (![cutoffMs, open, session.closeMs, priorSession.openMs, priorSession.closeMs].every(Number.isFinite)
        || !input.calendarVerified || !session.full || !priorSession.full || priorSession.closeMs > open
        || session.closeMs - open !== 390 * MINUTE || priorSession.closeMs - priorSession.openMs !== 390 * MINUTE
        || !input.tapeComplete) return result('ABSTAIN', 'MISSING_CALENDAR_OR_TAPE');
    const ny = getNewYorkWallClock(open);
    if (ny.hour !== 9 || ny.minute !== 30) return result('ABSTAIN', 'INVALID_NY_OPEN');
    if (input.alreadyFilled) return result('REJECTED', 'SESSION_ENTRY_ALREADY_FILLED');
    if (cutoffMs < entryStart) return result('WAIT', 'ENTRY_WINDOW_NOT_OPEN');
    if (cutoffMs >= entryEnd) return result('REJECTED', 'ENTRY_WINDOW_CLOSED');

    const prior = input.priorTrades.filter((trade) => visible(trade, open)
        && trade.timeMs >= priorSession.openMs && trade.timeMs < priorSession.closeMs);
    const value = freezePriorValueArea(prior);
    const tape = input.sessionTrades.filter((trade) => visible(trade, cutoffMs) && trade.timeMs >= open);
    if (!value || tape.some((trade) => !validTrade(trade))) return result('ABSTAIN', 'INVALID_EXECUTED_PROFILE');
    const { vah } = value;
    const fives = input.fiveMinute.filter((bar) => visible(bar, cutoffMs)).sort((a, b) => a.timeMs - b.timeMs);
    const ones = input.oneMinute.filter((bar) => visible(bar, cutoffMs)).sort((a, b) => a.timeMs - b.timeMs);
    if (fives.some((bar) => !validBar(bar, 5 * MINUTE, open)) || ones.some((bar) => !validBar(bar, MINUTE, open)))
        return result('ABSTAIN', 'INVALID_BAR_BOUNDARY');

    let breakout: Bar | undefined;
    let armedUntil = 0;
    for (const bar of fives) {
        if (bar.startMs < armedUntil) continue;
        const trades = tape.filter((trade) => trade.timeMs < bar.timeMs && visible(trade, bar.availableAtMs));
        const btc = trades.reduce((sum, trade) => sum + trade.btc, 0);
        if (btc <= 0) continue;
        const vwap = trades.reduce((sum, trade) => sum + trade.price * trade.btc, 0) / btc;
        if (breakout && (bar.timeMs - breakout.timeMs > 15 * MINUTE || bar.close <= vah)) breakout = undefined;
        if (!breakout) {
            if (bar.close > vah && bar.close > vwap) breakout = bar;
            continue;
        }
        if (bar.timeMs <= breakout.timeMs || bar.low > vah + ROW || bar.high < vah - ROW
            || bar.close <= vwap || Math.abs(vwap - vah) > ROW) continue;
        if (input.variant !== 'PRICE_LOCATION' && !flowPass(trades.filter((trade) => trade.timeMs >= bar.startMs))) continue;

        const priorBreakout = breakout;
        breakout = undefined;
        armedUntil = bar.timeMs + 3 * MINUTE;
        for (let slot = 1; slot <= 3; slot++) {
            const trigger = ones.find((one) => one.timeMs === bar.timeMs + slot * MINUTE);
            if (!trigger) return cutoffMs < bar.timeMs + slot * MINUTE
                ? result('WAIT', 'WAITING_FOR_TRIGGER') : result('ABSTAIN', 'MISSING_TRIGGER_BAR');
            if (trigger.close <= vah) break;
            if (trigger.close <= bar.high || trigger.availableAtMs < entryStart) continue;

            const submit = input.approvalMs ?? trigger.availableAtMs;
            const expiry = Math.min(trigger.availableAtMs + MINUTE, entryEnd);
            if (submit < trigger.availableAtMs || cutoffMs >= expiry) return result('REJECTED', 'TICKET_EXPIRED');
            const quote = input.quotes
                .filter((candidate) => visible(candidate, cutoffMs)
                    && candidate.availableAtMs >= submit + (input.latencyMs ?? 250) && candidate.availableAtMs < expiry)
                .sort((a, b) => a.availableAtMs - b.availableAtMs || a.timeMs - b.timeMs)[0];
            if (!quote) return result('WAIT', 'WAITING_FOR_EXECUTABLE_ASK');
            if (![quote.bid, quote.ask, quote.askBtc].every((price) => Number.isFinite(price) && price > 0)
                || quote.bid > quote.ask || quote.availableAtMs - quote.timeMs > 2_000
                || (quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2) > 0.0005
                || quote.ask / trigger.close - 1 > 0.001) return result('REJECTED', 'UNRELIABLE_QUOTE_OR_DRIFT');

            const stop = Math.min(vah, bar.low) - ROW;
            if (quote.ask - stop < 2 * ROW) return result('REJECTED', 'STOP_TOO_CLOSE');
            const fees = input.fees ?? DEFAULT_PAPER_FEE_SCHEDULE;
            const sizing = calculateFeeInclusivePositionSize({
                equityUsdt: input.equityUsdt, availableCashUsdt: input.freeCashUsdt,
                riskBudgetCapUsdt: input.equityUsdt - input.weeklyFloorUsdt,
                entryPrice: quote.ask, stopPrice: stop, entryIsMaker: false, schedule: fees,
            });
            if (!sizing.valid) return result('REJECTED', 'RISK_OR_CASH_LIMIT');
            const target = Math.ceil((quote.ask * (1 + sizing.entryFeeRate) + 2 * sizing.lossPerBtcUsdt)
                / (1 - fees.takerFeeRate) / (1 - fees.stopSlippageRate) * 100) / 100;
            let optionsReason = 'OPTIONS_NOT_REQUIRED';
            if (input.variant === 'OPTIONS_VETO') {
                const chain = input.chain;
                const at = quote.availableAtMs;
                if (!chain?.validCoverage || !visible(chain, at) || at - chain.timeMs > MINUTE)
                    return result('ABSTAIN', 'OPTIONS_SNAPSHOT_UNAVAILABLE');
                const exposure = new Map<number, number>();
                for (const call of chain.calls) {
                    if (call.expiryMs <= at || call.expiryMs > at + 2 * 86_400_000 || !(call.callGex > 0)) continue;
                    exposure.set(call.strike, (exposure.get(call.strike) ?? 0) + call.callGex);
                }
                const overhead = [...exposure].sort(([a, x], [b, y]) => y - x || a - b).slice(0, 3)
                    .map(([strike]) => strike).filter((strike) => strike > quote.ask).sort((a, b) => a - b)[0];
                if (overhead !== undefined && overhead <= target) return result('REJECTED', 'CALL_WALL_BEFORE_NET_TARGET');
                optionsReason = overhead === undefined ? 'NO_OVERHEAD_WALL' : 'WALL_ABOVE_TARGET';
            }
            return {
                status: 'PAPER_READY' as const, reason: optionsReason,
                setupId: `NY_VALUE_RETEST_V1:${input.variant}:BINANCE_SPOT:BTCUSDT:${ny.nyIsoDate}:${priorBreakout.timeMs}:${bar.timeMs}`,
                cutoffMs: quote.availableAtMs, expiryMs: expiry, timeExitMs: open + 150 * MINUTE,
                entry: quote.ask, stop, target, plannedBtc: sizing.finalQuantityBtc,
                firstFillCapBtc: Math.min(quote.askBtc, sizing.finalQuantityBtc),
                initialRiskUsdt: sizing.estimatedStopLossUsdt,
                sourceEventIds: [priorBreakout.id, bar.id, trigger.id, quote.id, ...(input.variant === 'OPTIONS_VETO' && input.chain ? [input.chain.id] : [])],
            };
        }
    }
    return result('WAIT', 'NO_QUALIFYING_SETUP');
}
