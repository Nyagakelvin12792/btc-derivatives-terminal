import { buildBinanceMarketSnapshot, normalizeBinanceKlines } from './normalization';
import { BINANCE_MARKET_SCHEMA_VERSION, type BinanceHistorySnapshot, type BinanceInterval, type BinanceMarketSnapshot, type BinanceProfileInterval, type BinanceVolumeProfileSnapshot } from './types';

const BINANCE_MARKET_BASE_URL = 'https://data-api.binance.vision/api/v3';
const REQUEST_TIMEOUT_MS = 8_000;
const REVALIDATE_SECONDS = 2;

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

export class BinanceUpstreamError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BinanceUpstreamError';
    }
}
function requestSignal(): AbortSignal | undefined {
    const abortSignal = AbortSignal as typeof AbortSignal & { timeout?: (milliseconds: number) => AbortSignal };
    return abortSignal.timeout?.(REQUEST_TIMEOUT_MS);
}

async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
        headers: { accept: 'application/json' },
        next: { revalidate: REVALIDATE_SECONDS },
        signal: requestSignal(),
    } satisfies NextFetchInit);

    if (!response.ok) throw new BinanceUpstreamError(`Binance market request failed with ${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
        throw new BinanceUpstreamError('Binance market response was not JSON');
    }
    try {
        return await response.json();
    } catch {
        throw new BinanceUpstreamError('Binance market response contained invalid JSON');
    }
}

export async function fetchBinanceMarketSnapshot(interval: BinanceInterval, limit: number, now = new Date()): Promise<BinanceMarketSnapshot> {
    const startedAtMs = Date.now();
    const query = new URLSearchParams({ symbol: 'BTCUSDT' });
    const klineQuery = new URLSearchParams(query);
    klineQuery.set('interval', interval);
    klineQuery.set('limit', String(limit));
    const depthQuery = new URLSearchParams(query);
    depthQuery.set('limit', '100');

    const [klinePayload, bookPayload, tickerPayload] = await Promise.all([
        fetchJson(`${BINANCE_MARKET_BASE_URL}/klines?${klineQuery}`),
        fetchJson(`${BINANCE_MARKET_BASE_URL}/depth?${depthQuery}`),
        fetchJson(`${BINANCE_MARKET_BASE_URL}/ticker/24hr?${query}`),
    ]);

    return buildBinanceMarketSnapshot({ interval, now, startedAtMs, klinePayload, bookPayload, tickerPayload });
}

export async function fetchBinanceHistoryPage(
    interval: BinanceInterval,
    limit: number,
    endTime?: number,
    now = new Date(),
): Promise<BinanceHistorySnapshot> {
    const query = new URLSearchParams({
        symbol: 'BTCUSDT',
        interval,
        limit: String(limit),
    });
    if (endTime !== undefined) query.set('endTime', String(endTime));
    const candles = normalizeBinanceKlines(await fetchJson(`${BINANCE_MARKET_BASE_URL}/klines?${query}`));
    const earliest = candles[0];
    return {
        schemaVersion: BINANCE_MARKET_SCHEMA_VERSION,
        dataMode: 'LIVE',
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        interval,
        timestamp: now.toISOString(),
        candles,
        nextEndTime: earliest ? earliest.time * 1_000 - 1 : null,
    };
}

export async function fetchBinanceVolumeProfileBars(
    interval: BinanceProfileInterval,
    startTime: number,
    endTime: number,
    now = new Date(),
): Promise<BinanceVolumeProfileSnapshot> {
    const candles = [] as ReturnType<typeof normalizeBinanceKlines>;
    let cursor = startTime;

    while (cursor <= endTime && candles.length < 5_000) {
        const query = new URLSearchParams({
            symbol: 'BTCUSDT',
            interval,
            startTime: String(cursor),
            endTime: String(endTime),
            limit: String(Math.min(1_000, 5_000 - candles.length)),
        });
        const page = normalizeBinanceKlines(await fetchJson(`${BINANCE_MARKET_BASE_URL}/klines?${query}`));
        if (!page.length) break;
        const previousLength = candles.length;
        page.forEach((bar) => {
            if (!candles.length || bar.time > candles[candles.length - 1].time) candles.push(bar);
        });
        if (candles.length === previousLength) break;
        cursor = page[page.length - 1].closeTime + 1;
    }

    return {
        schemaVersion: BINANCE_MARKET_SCHEMA_VERSION,
        dataMode: 'LIVE',
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        interval,
        startTime,
        endTime,
        timestamp: now.toISOString(),
        candles,
    };
}
