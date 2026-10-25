import { z } from 'zod';
import {
    ClassifiedTradeV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    type ClassifiedTradeV1,
} from './contracts';

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const numericString = z.string().trim().min(1).max(32).regex(/^\d+(?:\.\d+)?$/);

const BinanceAggregateTradePayloadSchema = z.object({
    e: z.literal('aggTrade'),
    E: safeInteger,
    s: z.literal('BTCUSDT'),
    a: safeInteger,
    p: numericString,
    q: numericString,
    f: safeInteger,
    l: safeInteger,
    T: safeInteger,
    m: z.boolean(),
    M: z.boolean().optional(),
}).strict();

export class BinanceAggregateTradePayloadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BinanceAggregateTradePayloadError';
    }
}

function positiveNumber(value: string, field: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new BinanceAggregateTradePayloadError(`Binance aggregate trade ${field} must be positive`);
    }
    return parsed;
}

export interface ParseAggregateTradeOptions {
    previousAggregateTradeId?: number;
}

export function parseBinanceAggregateTrade(
    payload: unknown,
    options: ParseAggregateTradeOptions = {},
): ClassifiedTradeV1 {
    const parsed = BinanceAggregateTradePayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new BinanceAggregateTradePayloadError('Binance aggregate trade payload was invalid');
    }
    if (parsed.data.l < parsed.data.f) {
        throw new BinanceAggregateTradePayloadError('Binance aggregate trade ID range was reversed');
    }
    if (options.previousAggregateTradeId !== undefined) {
        if (!Number.isSafeInteger(options.previousAggregateTradeId) || options.previousAggregateTradeId < 0) {
            throw new BinanceAggregateTradePayloadError('Previous aggregate trade ID was invalid');
        }
        if (parsed.data.a <= options.previousAggregateTradeId) {
            throw new BinanceAggregateTradePayloadError('Binance aggregate trade was duplicate or out of order');
        }
    }

    const price = positiveNumber(parsed.data.p, 'price');
    const quantityBtc = positiveNumber(parsed.data.q, 'quantity');
    const notionalUsd = price * quantityBtc;
    if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
        throw new BinanceAggregateTradePayloadError('Binance aggregate trade notional was invalid');
    }

    return ClassifiedTradeV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        venue: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        aggregateTradeId: parsed.data.a,
        firstTradeId: parsed.data.f,
        lastTradeId: parsed.data.l,
        eventTime: parsed.data.E,
        tradeTime: parsed.data.T,
        price,
        quantityBtc,
        notionalUsd,
        aggressor: parsed.data.m ? 'SELL' : 'BUY',
        buyerIsMaker: parsed.data.m,
    });
}
