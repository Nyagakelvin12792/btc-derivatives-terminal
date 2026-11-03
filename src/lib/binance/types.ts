export const BINANCE_MARKET_SCHEMA_VERSION = 1 as const;

export type BinanceInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type BinanceProfileInterval = '1s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type MarketFeedState = 'CONNECTING' | 'LIVE' | 'STALE' | 'OFFLINE';
export type LiquiditySequenceState = 'BUFFERING' | 'LIVE' | 'STALE' | 'GAP' | 'OFFLINE';

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

export interface BinanceDepthSnapshot {
    schemaVersion: typeof BINANCE_MARKET_SCHEMA_VERSION;
    dataMode: 'LIVE';
    source: 'BINANCE_SPOT';
    symbol: 'BTCUSDT';
    timestamp: string;
    upstreamLatencyMs: number;
    depthLimit: number;
    book: BinanceOrderBook;
}

export interface BinanceDepthLevelUpdate {
    price: number;
    quantity: number;
}

export interface BinanceDepthDiffEvent {
    eventTime: number;
    symbol: 'BTCUSDT';
    firstUpdateId: number;
    finalUpdateId: number;
    bids: BinanceDepthLevelUpdate[];
    asks: BinanceDepthLevelUpdate[];
}

export interface LiquidityHeatmapLevel {
    side: 'BID' | 'ASK';
    price: number;
    quantity: number;
    notionalUsd: number;
}

export interface LiquidityHeatmapFrame {
    schemaVersion: typeof BINANCE_MARKET_SCHEMA_VERSION;
    source: 'BINANCE_SPOT';
    symbol: 'BTCUSDT';
    venue: 'BINANCE_SPOT';
    capturedAt: number;
    eventTime: number;
    lastUpdateId: number;
    bestBid: number;
    bestAsk: number;
    midPrice: number;
    levels: LiquidityHeatmapLevel[];
}

export interface LiquidityHeatmapCoverage {
    startedAt: number | null;
    endedAt: number | null;
    frameCount: number;
    frameCapacity: number;
    warmupPercent: number;
}

export interface LiquiditySequenceStatus {
    state: LiquiditySequenceState;
    lastUpdateId: number | null;
    lastEventTime: number | null;
    bufferedEventCount: number;
    gapCount: number;
    successfulBootstrapCount: number;
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

export interface BinanceHistorySnapshot {
    schemaVersion: typeof BINANCE_MARKET_SCHEMA_VERSION;
    dataMode: 'LIVE';
    source: 'BINANCE_SPOT';
    symbol: 'BTCUSDT';
    interval: BinanceInterval;
    timestamp: string;
    candles: BinanceMarketBar[];
    nextEndTime: number | null;
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
