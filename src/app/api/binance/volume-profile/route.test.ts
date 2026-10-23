import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/binance/client.server', () => ({ fetchBinanceVolumeProfileBars: vi.fn() }));

const { fetchBinanceVolumeProfileBars } = await import('@/lib/binance/client.server');
const { GET } = await import('./route');
const mockedFetch = vi.mocked(fetchBinanceVolumeProfileBars);

describe('/api/binance/volume-profile route', () => {
    beforeEach(() => mockedFetch.mockReset());

    it('validates the interval, time range, and 5000-bar ceiling', async () => {
        const badInterval = await GET(new NextRequest('http://localhost/api/binance/volume-profile?interval=2m&startTime=1&endTime=1000'));
        const badRange = await GET(new NextRequest('http://localhost/api/binance/volume-profile?interval=1m&startTime=1000&endTime=1'));
        const tooLarge = await GET(new NextRequest('http://localhost/api/binance/volume-profile?interval=1m&startTime=1&endTime=400000000'));
        expect([badInterval.status, badRange.status, tooLarge.status]).toEqual([400, 400, 400]);
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('returns a validated bounded live profile snapshot', async () => {
        mockedFetch.mockResolvedValue({ dataMode: 'LIVE', source: 'BINANCE_SPOT', interval: '5m', candles: [] } as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/volume-profile?interval=5m&startTime=1000&endTime=601000'));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('public, max-age=2, s-maxage=5, stale-while-revalidate=10');
        expect(mockedFetch).toHaveBeenCalledWith('5m', 1000, 601000);
    });

    it('fails explicitly instead of returning fabricated profile bars', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedFetch.mockResolvedValue(null as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/volume-profile?interval=1m&startTime=1000&endTime=601000'));
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual(expect.objectContaining({ dataMode: 'OFFLINE' }));
    });
});
