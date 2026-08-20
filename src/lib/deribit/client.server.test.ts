import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDeribitOptionChainCacheForTests, fetchDeribitOptionChain } from './client.server';

const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

const indexPayload = {
    result: {
        index_price: 68000,
    },
};

const bookPayload = {
    result: [
        {
            instrument_name: 'BTC-25DEC26-70000-C',
            open_interest: 10,
            mark_iv: 60,
            volume: 1,
        },
    ],
};

function jsonResponse(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        headers: {
            'content-type': 'application/json',
        },
    });
}

function installDeribitFetchMock() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        return jsonResponse(url.includes('get_index_price') ? indexPayload : bookPayload);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

describe('Deribit client request caching', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        vi.useFakeTimers();
        vi.setSystemTime(now);
        clearDeribitOptionChainCacheForTests();
    });

    afterEach(() => {
        clearDeribitOptionChainCacheForTests();
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('reuses a fresh option chain without repeating Deribit requests', async () => {
        const fetchMock = installDeribitFetchMock();

        const first = await fetchDeribitOptionChain(now);
        vi.setSystemTime(new Date(now.getTime() + 5_000));
        const second = await fetchDeribitOptionChain(new Date(now.getTime() + 5_000));

        expect(first).toBe(second);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('refreshes Deribit requests after the cache window expires', async () => {
        const fetchMock = installDeribitFetchMock();

        await fetchDeribitOptionChain(now);
        vi.setSystemTime(new Date(now.getTime() + 16_000));
        await fetchDeribitOptionChain(new Date(now.getTime() + 16_000));

        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('shares concurrent option-chain requests through one upstream fetch pair', async () => {
        const fetchMock = installDeribitFetchMock();

        const first = fetchDeribitOptionChain(now);
        const second = fetchDeribitOptionChain(new Date(now.getTime() + 1_000));

        await Promise.all([first, second]);

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
