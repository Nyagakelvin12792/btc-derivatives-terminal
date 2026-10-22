export const BINANCE_MARKET_SCHEMA_VERSION = 1 as const;

export type BinanceInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type BinanceProfileInterval = '1s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type MarketFeedState = 'CONNECTING' | 'LIVE' | 'STALE' | 'OFFLINE';

export interface BinanceMarketBar {
    time: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
    trades: number;
    takerBuyVolume: number;
    takerSellVolume: number;
    delta: number;
}

export interface BinanceBookLevel {
    price: number;
    quantity: number;
    notionalUsd: number;
}

export interface BinanceOrderBook {
    lastUpdateId: number;
    bids: BinanceBookLevel[];
    asks: BinanceBookLevel[];
    bestBid: number;
    bestAsk: number;
    midPrice: number;
    spread: number;
    spreadBps: number;
    bidDepthUsd: number;
    askDepthUsd: number;
    imbalance: number;
}

export interface BinanceTicker24h {
    lastPrice: number;
    priceChange: number;
    priceChangePercent: number;
    highPrice: number;
    lowPrice: number;
    volume: number;
    quoteVolume: number;
    tradeCount: number;
    closeTime: number;
}

export interface BinanceMarketSnapshot {
    schemaVersion: typeof BINANCE_MARKET_SCHEMA_VERSION;
    dataMode: 'LIVE';
    source: 'BINANCE_SPOT';
    symbol: 'BTCUSDT';
    interval: BinanceInterval;
    timestamp: string;
    upstreamLatencyMs: number;
    candles: BinanceMarketBar[];
    book: BinanceOrderBook;
    ticker: BinanceTicker24h;
}

export interface BinanceVolumeProfileSnapshot {
    schemaVersion: typeof BINANCE_MARKET_SCHEMA_VERSION;
    dataMode: 'LIVE';
    source: 'BINANCE_SPOT';
    symbol: 'BTCUSDT';
    interval: BinanceProfileInterval;
    startTime: number;
    endTime: number;
    timestamp: string;
    candles: BinanceMarketBar[];
}

export interface BinanceKlineStreamEvent {
    eventTime: number;
    bar: BinanceMarketBar;
}
