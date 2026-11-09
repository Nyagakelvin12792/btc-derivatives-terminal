import {
    normalizeBookSummaryPayload,
    normalizeDeribitOptionsStrict,
    normalizeIndexPriceStrict,
} from './normalization';
import type { NormalizedDeribitChain, Usd } from './types';

const DERIBIT_BASE_URL = 'https://www.deribit.com/api/v2/public';
const BTC_INDEX_URL = `${DERIBIT_BASE_URL}/get_index_price?index_name=btc_usd`;
const BTC_OPTIONS_BOOK_URL = `${DERIBIT_BASE_URL}/get_book_summary_by_currency?currency=BTC&kind=option`;
const REVALIDATE_SECONDS = 15;
const CHAIN_CACHE_TTL_MS = REVALIDATE_SECONDS * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export const FALLBACK_SPOT_PRICE = 69000 as Usd;

export class DeribitUpstreamError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeribitUpstreamError';
    }
}

interface DeribitChainCacheEntry {
    readonly expiresAtMs: number;
    readonly chain: NormalizedDeribitChain;
}

let chainCache: DeribitChainCacheEntry | null = null;
let inFlightChain: Promise<NormalizedDeribitChain> | null = null;

function requestSignal(): AbortSignal | undefined {
    const abortSignal = AbortSignal as typeof AbortSignal & {
        timeout?: (milliseconds: number) => AbortSignal;
    };

    return abortSignal.timeout?.(REQUEST_TIMEOUT_MS);
}

async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
        headers: {
            accept: 'application/json',
        },
        cache: 'no-store',
        signal: requestSignal(),
    });

    if (!response.ok) {
        throw new DeribitUpstreamError(`Deribit request failed with ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
        throw new DeribitUpstreamError('Deribit response was not JSON');
    }

    try {
        return await response.json();
    } catch {
        throw new DeribitUpstreamError('Deribit response contained invalid JSON');
    }
}

export async function fetchDeribitOptionChain(now: Date): Promise<NormalizedDeribitChain> {
    const requestTimeMs = Date.now();
    if (chainCache && chainCache.expiresAtMs > requestTimeMs) {
        return chainCache.chain;
    }

    if (inFlightChain) return inFlightChain;

    inFlightChain = fetchFreshDeribitOptionChain(now)
        .then((chain) => {
            chainCache = {
                chain,
                expiresAtMs: requestTimeMs + CHAIN_CACHE_TTL_MS,
            };
            return chain;
        })
        .finally(() => {
            inFlightChain = null;
        });

    return inFlightChain;
}

async function fetchFreshDeribitOptionChain(now: Date): Promise<NormalizedDeribitChain> {
    const [indexResult, bookPayload] = await Promise.all([
        fetchJson(BTC_INDEX_URL),
        fetchJson(BTC_OPTIONS_BOOK_URL),
    ]);
    const spotPrice = normalizeIndexPriceStrict(indexResult);
    const bookItems = normalizeBookSummaryPayload(bookPayload);
    const asOf = Date.now();
    const fresh = bookItems.filter((item) =>
        item.sourceTimeMs !== undefined && item.sourceTimeMs <= asOf + 5_000 && asOf - item.sourceTimeMs <= 60_000
    );
    const { options } = normalizeDeribitOptionsStrict(fresh, now);
    if (options.length === 0) {
        throw new DeribitUpstreamError('No fresh BTC option contracts with valid OI and IV');
    }
    const validNames = new Set(options.map((option) => option.instrument));
    const sourceTimeMs = Math.min(...fresh.filter((item) => validNames.has(item.instrumentName)).map((item) => item.sourceTimeMs!));
    const received = (bookPayload as { result: unknown[] }).result.length;
    return { spotPrice, options, sourceTimeMs, coverage: { received, valid: options.length } };
}

export function clearDeribitOptionChainCacheForTests(): void {
    chainCache = null;
    inFlightChain = null;
}
