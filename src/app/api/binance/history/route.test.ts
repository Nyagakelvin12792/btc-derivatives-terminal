import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/binance/client.server', () => ({ fetchBinanceHistoryPage: vi.fn() }));

const { fetchBinanceHistoryPage } = await import('@/lib/binance/client.server');
const { GET } = await import('./route');
const mockedFetch = vi.mocked(fetchBinanceHistoryPage);

describe('/api/binance/history route', () => {
    beforeEach(() => mockedFetch.mockReset());

    it('validates the interval, page size, and cursor', async () => {
        const badInterval = await GET(new NextRequest('http://localhost/api/binance/history?interval=2m'));
        const badLimit = await GET(new NextRequest('http://localhost/api/binance/history?limit=1001'));
        const badCursor = await GET(new NextRequest('http://localhost/api/binance/history?endTime=-1'));
        expect([badInterval.status, badLimit.status, badCursor.status]).toEqual([400, 400, 400]);
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('returns a cursor-addressable Binance history page', async () => {
        mockedFetch.mockResolvedValue({ dataMode: 'LIVE', source: 'BINANCE_SPOT', candles: [], nextEndTime: 123 } as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/history?interval=15m&limit=1000&endTime=456'));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('public, max-age=10, s-maxage=60, stale-while-revalidate=300');
        expect(mockedFetch).toHaveBeenCalledWith('15m', 1000, 456);
    });

    it('fails explicitly instead of substituting fabricated history', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedFetch.mockResolvedValue(null as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/history'));
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual(expect.objectContaining({ dataMode: 'OFFLINE' }));
    });
});
