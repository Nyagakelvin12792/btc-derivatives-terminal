import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/binance/client.server', () => ({ fetchBinanceMarketSnapshot: vi.fn() }));

const { fetchBinanceMarketSnapshot } = await import('@/lib/binance/client.server');
const { GET } = await import('./route');
const mockedFetch = vi.mocked(fetchBinanceMarketSnapshot);

describe('/api/binance/market route', () => {
    beforeEach(() => mockedFetch.mockReset());

    it('validates the interval and limit', async () => {
        const badInterval = await GET(new NextRequest('http://localhost/api/binance/market?interval=2m'));
        const badLimit = await GET(new NextRequest('http://localhost/api/binance/market?interval=1m&limit=5'));
        expect(badInterval.status).toBe(400);
        expect(badLimit.status).toBe(400);
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('returns the normalized live snapshot with short cache headers', async () => {
        mockedFetch.mockResolvedValue({ dataMode: 'LIVE', source: 'BINANCE_SPOT', candles: [] } as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/market?interval=15m&limit=1000'));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('public, max-age=1, s-maxage=2, stale-while-revalidate=4');
        expect(mockedFetch).toHaveBeenCalledWith('15m', 1000);
    });

    it('returns an explicit offline error without demo data when no snapshot is available', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedFetch.mockResolvedValue(null as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/market'));
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual(expect.objectContaining({ dataMode: 'OFFLINE' }));
    });
});
