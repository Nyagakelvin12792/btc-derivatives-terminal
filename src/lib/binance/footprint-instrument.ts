import { z } from 'zod';

export const FootprintInstrumentSchema = z.object({
    venue: z.literal('BINANCE_SPOT'),
    symbol: z.literal('BTCUSDT'),
    tickSize: z.number().finite().positive(),
}).strict();

const ExchangeInfoSchema = z.object({
    symbols: z.array(z.object({
        symbol: z.string(),
        filters: z.array(z.object({ filterType: z.string(), tickSize: z.string().optional() })),
    })),
});

export function normalizeFootprintInstrument(payload: unknown) {
    const symbol = ExchangeInfoSchema.parse(payload).symbols.find((entry) => entry.symbol === 'BTCUSDT');
    const filter = symbol?.filters.find((entry) => entry.filterType === 'PRICE_FILTER');
    return FootprintInstrumentSchema.parse({ venue: 'BINANCE_SPOT', symbol: 'BTCUSDT', tickSize: Number(filter?.tickSize) });
}
