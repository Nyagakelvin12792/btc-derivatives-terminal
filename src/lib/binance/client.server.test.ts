import { afterEach, describe, expect, it, vi } from 'vitest';
import { BinanceUpstreamError, fetchBinanceDepthSnapshot } from './client.server';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('fetchBinanceDepthSnapshot', () => {
    it('requests an uncached public snapshot and returns the normalized bootstrap contract', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            lastUpdateId: 123,
            bids: [['100', '2'], ['99', '1']],
            asks: [['101', '3'], ['102', '1']],
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchBinanceDepthSnapshot(500, new Date('2026-10-25T00:00:00.000Z'));
        expect(fetchMock).toHaveBeenCalledWith(
            'https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=500',
            expect.objectContaining({ cache: 'no-store', headers: { accept: 'application/json' } }),
        );
        expect(result).toEqual(expect.objectContaining({
            schemaVersion: 1,
            dataMode: 'LIVE',
            source: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            timestamp: '2026-10-25T00:00:00.000Z',
            depthLimit: 500,
            book: expect.objectContaining({ lastUpdateId: 123, bestBid: 100, bestAsk: 101 }),
        }));
    });

    it('rejects invalid limits before making an upstream request', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(fetchBinanceDepthSnapshot(20)).rejects.toThrow(RangeError);
        await expect(fetchBinanceDepthSnapshot(1_001)).rejects.toThrow(RangeError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects non-JSON upstream responses instead of accepting an invalid snapshot', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('temporarily unavailable', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
        })));
        await expect(fetchBinanceDepthSnapshot(500)).rejects.toThrow(BinanceUpstreamError);
    });
});
