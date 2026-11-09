import { z } from 'zod';

const time = z.number().int().positive();
const price = z.number().positive();
const available = { id: z.string().min(1).max(160), timeMs: time, availableAtMs: time };
const trade = z.strictObject({ ...available, price, btc: price, side: z.enum(['BUY', 'SELL']) });
const bar = z.strictObject({ ...available, startMs: time, low: price, high: price, close: price });
const session = z.strictObject({ openMs: time, closeMs: time, full: z.boolean() });

export const LocalRetestInputSchema = z.strictObject({
    version: z.literal(1),
    datasetId: z.string().min(1).max(128),
    instrument: z.literal('BINANCE_SPOT:BTCUSDT'),
    cutoffMs: time,
    session,
    priorSession: session,
    calendarVerified: z.boolean(),
    tapeComplete: z.boolean(),
    alreadyFilled: z.boolean(),
    variant: z.enum(['PRICE_LOCATION', 'EXECUTED_FLOW', 'OPTIONS_VETO']),
    latencyMs: z.union([z.literal(100), z.literal(250), z.literal(1000)]).optional(),
    priorTrades: z.array(trade).max(100_000),
    sessionTrades: z.array(trade).max(100_000),
    fiveMinute: z.array(bar).max(78),
    oneMinute: z.array(bar).max(390),
    quotes: z.array(z.strictObject({ ...available, bid: price, ask: price, askBtc: price })).max(100_000),
    chain: z.strictObject({
        ...available,
        validCoverage: z.boolean(),
        calls: z.array(z.strictObject({ expiryMs: time, strike: price, callGex: z.number().nonnegative() })).max(10_000),
    }).optional(),
    equityUsdt: price,
    freeCashUsdt: z.number().nonnegative(),
    weeklyFloorUsdt: z.number().nonnegative(),
});
