import {
    normalizeBookSummaryPayload,
    normalizeDeribitOptions,
    normalizeIndexPricePayload,
} from './normalization';
import type { NormalizedDeribitChain } from './types';

const DERIBIT_BASE_URL = 'https://www.deribit.com/api/v2/public';
const BTC_INDEX_URL = `${DERIBIT_BASE_URL}/get_index_price?index_name=btc_usd`;
const BTC_OPTIONS_BOOK_URL = `${DERIBIT_BASE_URL}/get_book_summary_by_currency?currency=BTC&kind=option`;
const REVALIDATE_SECONDS = 15;
const REQUEST_TIMEOUT_MS = 8000;

export const FALLBACK_SPOT_PRICE = 69000;

type NextFetchInit = RequestInit & {
    next?: {
        revalidate?: number;
    };
};

export class DeribitUpstreamError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeribitUpstreamError';
    }
}

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
        next: {
            revalidate: REVALIDATE_SECONDS,
        },
        signal: requestSignal(),
    } satisfies NextFetchInit);

    if (!response.ok) {
        throw new DeribitUpstreamError(`Deribit request failed with ${response.status}`);
    }

    return response.json();
}

export async function fetchDeribitOptionChain(now: Date): Promise<NormalizedDeribitChain> {
    const [indexResult, bookPayload] = await Promise.all([
        fetchJson(BTC_INDEX_URL).catch(() => null),
        fetchJson(BTC_OPTIONS_BOOK_URL),
    ]);

    const spotPrice = normalizeIndexPricePayload(indexResult, FALLBACK_SPOT_PRICE);
    const bookItems = normalizeBookSummaryPayload(bookPayload);
    const options = normalizeDeribitOptions(bookItems, now);

    if (options.length === 0) {
        throw new DeribitUpstreamError('Deribit returned no active BTC option contracts');
    }

    return {
        spotPrice,
        options,
    };
}
