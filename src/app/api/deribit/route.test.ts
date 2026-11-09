import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDeribitOptionChainCacheForTests } from '../../../lib/deribit/client.server';
import { GET } from './route';

const time = new Date('2026-11-09T07:59:59.000Z');
const contract = (expiry: string, mark_iv: number | null = 45) => ({
    instrument_name: `BTC-${expiry}-70000-C`,
    open_interest: 2,
    volume: 3,
    volume_usd: 122,
    mark_iv,
    creation_timestamp: time.getTime(),
});
const request = (query = '') => GET(new NextRequest(`http://localhost/api/deribit${query}`));
const fixture = (options: unknown[], indexAvailable = true) => {
    const fetchMock = vi.fn(async (url: string) => url.includes('get_index_price')
        ? indexAvailable ? Response.json({ result: { index_price: 70_000 } }) : new Response('', { status: 503 })
        : Response.json({ result: options }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

describe('/api/deribit route through live normalization', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(time);
        clearDeribitOptionChainCacheForTests();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('fails closed on index failure even with a valid chain', async () => {
        fixture([contract('13NOV26')], false);
        const response = await request('?strict=1');
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ error: 'Deribit live data unavailable', dataMode: 'DEGRADED' });
    });

    it('drops invalid IV, retains independent BTC and USD volume, and filters the entire chain', async () => {
        fixture([contract('13NOV26'), contract('25DEC26'), contract('14NOV26', null), { ...contract('15NOV26'), open_interest: null }]);
        const response = await request('?expiries=7,14,30');
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.expirations).toEqual(['13NOV26']);
        expect(data.sourceTime).toBe(time.toISOString());
        expect(data.coverage).toEqual({ received: 4, valid: 2, selected: 1 });
        expect(data.keyContracts[0]).toMatchObject({ volume: 3, volumeUsd: 122, openInterestUsd: 140_000 });
        expect((await (await request('?expiry=25DEC26')).json()).expirations).toEqual(['25DEC26']);
        expect((await (await request('?expiry=1JAN27')).json()).summary.contractsCount).toBe(0);
    });

    it('excludes an expired option from a still-cached chain at 08:00 UTC', async () => {
        const fetchMock = fixture([contract('9NOV26'), contract('13NOV26')]);
        expect((await (await request()).json()).expirations).toContain('9NOV26');
        vi.setSystemTime(new Date('2026-11-09T08:00:00.000Z'));
        expect((await (await request()).json()).expirations).toEqual(['13NOV26']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rejects stale and entirely invalid chains', async () => {
        fixture([{ ...contract('13NOV26'), creation_timestamp: time.getTime() - 60_001 }]);
        expect((await request()).status).toBe(503);
        fixture([contract('13NOV26', null)]);
        expect((await request()).status).toBe(503);
    });

    it('uses synthetic data only in explicit demo mode and rejects unsupported windows', async () => {
        const fetchMock = fixture([]);
        expect((await (await request('?mode=demo')).json()).dataMode).toBe('DEMO');
        expect((await request('?dte=90D')).status).toBe(400);
        expect((await request('?expiries=7,foo')).status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
