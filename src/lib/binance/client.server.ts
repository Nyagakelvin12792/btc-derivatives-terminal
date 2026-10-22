import { buildBinanceMarketSnapshot } from './normalization';
import type { BinanceInterval, BinanceMarketSnapshot } from './types';

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
