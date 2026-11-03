import {
    BINANCE_MARKET_SCHEMA_VERSION,
    type BinanceBookLevel,
    type BinanceInterval,
    type BinanceMarketBar,
    type BinanceMarketSnapshot,
    type BinanceOrderBook,
    type BinanceTicker24h,
} from './types';

export class BinancePayloadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BinancePayloadError';
    }
}
function finiteNumber(value: unknown, field: string): number {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isFinite(parsed)) throw new BinancePayloadError(`Invalid Binance ${field}`);
    return parsed;
}

export function normalizeBinanceKlines(payload: unknown): BinanceMarketBar[] {
    if (!Array.isArray(payload)) throw new BinancePayloadError('Binance klines payload was not an array');

    return payload.map((entry, index) => {
        if (!Array.isArray(entry) || entry.length < 11) {
            throw new BinancePayloadError(`Invalid Binance kline at index ${index}`);
        }

        const volume = finiteNumber(entry[5], 'kline volume');
        const takerBuyVolume = finiteNumber(entry[9], 'kline taker buy volume');
        const takerSellVolume = Math.max(0, volume - takerBuyVolume);

        return {
            time: Math.floor(finiteNumber(entry[0], 'kline open time') / 1000),
            closeTime: finiteNumber(entry[6], 'kline close time'),
            open: finiteNumber(entry[1], 'kline open'),
            high: finiteNumber(entry[2], 'kline high'),
            low: finiteNumber(entry[3], 'kline low'),
            close: finiteNumber(entry[4], 'kline close'),
            volume,
            quoteVolume: finiteNumber(entry[7], 'kline quote volume'),
            trades: finiteNumber(entry[8], 'kline trade count'),
            takerBuyVolume,
            takerSellVolume,
            delta: takerBuyVolume - takerSellVolume,
        };
    });
}

function normalizeBookSide(payload: unknown, side: 'bid' | 'ask'): BinanceBookLevel[] {
    if (!Array.isArray(payload)) throw new BinancePayloadError(`Binance ${side} book was not an array`);
    return payload.map((entry, index) => {
        if (!Array.isArray(entry) || entry.length < 2) {
            throw new BinancePayloadError(`Invalid Binance ${side} level at index ${index}`);
        }
        const price = finiteNumber(entry[0], `${side} price`);
        const quantity = finiteNumber(entry[1], `${side} quantity`);
        return { price, quantity, notionalUsd: price * quantity };
    }).filter((level) => level.price > 0 && level.quantity >= 0);
}

export function normalizeBinanceOrderBook(payload: unknown): BinanceOrderBook {
    if (!payload || typeof payload !== 'object') throw new BinancePayloadError('Binance order book was not an object');
    const record = payload as Record<string, unknown>;
    const bids = normalizeBookSide(record.bids, 'bid');
    const asks = normalizeBookSide(record.asks, 'ask');
    if (!bids.length || !asks.length) throw new BinancePayloadError('Binance order book had no bid or ask levels');

    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const bidDepthUsd = bids.reduce((sum, level) => sum + level.notionalUsd, 0);
    const askDepthUsd = asks.reduce((sum, level) => sum + level.notionalUsd, 0);
    const combinedDepth = bidDepthUsd + askDepthUsd;

    return {
        lastUpdateId: finiteNumber(record.lastUpdateId, 'order book update ID'),
        bids,
        asks,
        bestBid,
        bestAsk,
        midPrice,
        spread,
        spreadBps: midPrice > 0 ? (spread / midPrice) * 10_000 : 0,
        bidDepthUsd,
        askDepthUsd,
        imbalance: combinedDepth > 0 ? (bidDepthUsd - askDepthUsd) / combinedDepth : 0,
    };
}

export function normalizeBinanceTicker(payload: unknown): BinanceTicker24h {
    if (!payload || typeof payload !== 'object') throw new BinancePayloadError('Binance ticker was not an object');
    const record = payload as Record<string, unknown>;
    return {
        lastPrice: finiteNumber(record.lastPrice, 'ticker last price'),
        priceChange: finiteNumber(record.priceChange, 'ticker price change'),
        priceChangePercent: finiteNumber(record.priceChangePercent, 'ticker price change percent'),
        highPrice: finiteNumber(record.highPrice, 'ticker high'),
        lowPrice: finiteNumber(record.lowPrice, 'ticker low'),
        volume: finiteNumber(record.volume, 'ticker volume'),
        quoteVolume: finiteNumber(record.quoteVolume, 'ticker quote volume'),
        tradeCount: finiteNumber(record.count, 'ticker trade count'),
        closeTime: finiteNumber(record.closeTime, 'ticker close time'),
    };
}

export function buildBinanceMarketSnapshot(params: {
    interval: BinanceInterval;
    now: Date;
    startedAtMs: number;
    klinePayload: unknown;
    bookPayload: unknown;
    tickerPayload: unknown;
}): BinanceMarketSnapshot {
    return {
        schemaVersion: BINANCE_MARKET_SCHEMA_VERSION,
        dataMode: 'LIVE',
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        interval: params.interval,
        timestamp: params.now.toISOString(),
        upstreamLatencyMs: Math.max(0, Date.now() - params.startedAtMs),
        candles: normalizeBinanceKlines(params.klinePayload),
        book: normalizeBinanceOrderBook(params.bookPayload),
        ticker: normalizeBinanceTicker(params.tickerPayload),
    };
}
