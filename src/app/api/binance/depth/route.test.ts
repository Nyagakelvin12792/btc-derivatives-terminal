import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/binance/client.server', () => ({ fetchBinanceDepthSnapshot: vi.fn() }));

const { fetchBinanceDepthSnapshot } = await import('@/lib/binance/client.server');
const { GET } = await import('./route');
const mockedFetch = vi.mocked(fetchBinanceDepthSnapshot);

describe('/api/binance/depth route', () => {
    beforeEach(() => mockedFetch.mockReset());

    it('validates the requested depth limit before contacting Binance', async () => {
        const tooSmall = await GET(new NextRequest('http://localhost/api/binance/depth?limit=20'));
        const tooLarge = await GET(new NextRequest('http://localhost/api/binance/depth?limit=5000'));
        const fractional = await GET(new NextRequest('http://localhost/api/binance/depth?limit=500.5'));
        expect(tooSmall.status).toBe(400);
        expect(tooLarge.status).toBe(400);
        expect(fractional.status).toBe(400);
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('returns a fresh, explicitly uncached bootstrap snapshot', async () => {
        mockedFetch.mockResolvedValue({
            schemaVersion: 1,
            dataMode: 'LIVE',
            source: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            timestamp: '2026-10-25T00:00:00.000Z',
            upstreamLatencyMs: 20,
            depthLimit: 500,
            book: { lastUpdateId: 100, bids: [], asks: [] },
        } as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/depth'));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mockedFetch).toHaveBeenCalledWith(500);
        expect(await response.json()).toEqual(expect.objectContaining({ dataMode: 'LIVE', depthLimit: 500 }));
    });

    it('fails explicitly without returning a stale or demo snapshot', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedFetch.mockResolvedValue(null as never);
        const response = await GET(new NextRequest('http://localhost/api/binance/depth?limit=1000'));
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual(expect.objectContaining({ dataMode: 'OFFLINE' }));
    });
});
