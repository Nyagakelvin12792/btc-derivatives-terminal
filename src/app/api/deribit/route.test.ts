import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { NormalizedDeribitChain } from '@/lib/deribit/types';

vi.mock('@/lib/deribit/client.server', () => ({
    FALLBACK_SPOT_PRICE: 69000,
    fetchDeribitOptionChain: vi.fn(),
}));

vi.mock('@/lib/deribit/dte-filter', () => ({
    isDeribitDteFilter: (value: string) => ['0-2D', '7D', '14D', '30D', 'ALL'].includes(value),
    filterDeribitOptionsByDte: (options: NormalizedDeribitChain['options'], filter: string) => {
        const limit = filter === '0-2D' ? 2 : filter === '7D' ? 7 : filter === '14D' ? 14 : filter === '30D' ? 30 : Number.POSITIVE_INFINITY;
        return options.filter((option) => option.dte <= limit);
    },
}));

vi.mock('@/lib/terrain/engine', () => ({
    buildTerrainDataContract: vi.fn((params: { dataMode: string }) => ({
        schemaVersion: 2,
        dataMode: params.dataMode,
        assumptionModel: 'OI_SIGN_PROXY_V1',
        surfaceGrid: [],
    })),
    buildDemoTerrainDataContract: vi.fn(() => ({
        schemaVersion: 2,
        dataMode: 'DEMO',
        assumptionModel: 'OI_SIGN_PROXY_V1',
        surfaceGrid: [],
    })),
}));

const { fetchDeribitOptionChain } = await import('@/lib/deribit/client.server');
const { buildDemoTerrainDataContract, buildTerrainDataContract } = await import('@/lib/terrain/engine');
const { GET } = await import('./route');

const mockedFetchDeribitOptionChain = vi.mocked(fetchDeribitOptionChain);
const mockedBuildTerrainDataContract = vi.mocked(buildTerrainDataContract);
const mockedBuildDemoTerrainDataContract = vi.mocked(buildDemoTerrainDataContract);
const responseTime = new Date(Date.UTC(2026, 7, 20, 8, 0, 0));

describe('/api/deribit route', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(responseTime);
        mockedFetchDeribitOptionChain.mockReset();
        mockedBuildTerrainDataContract.mockClear();
        mockedBuildDemoTerrainDataContract.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns LIVE Terrain Data Contract V2 with cache headers', async () => {
        mockedFetchDeribitOptionChain.mockResolvedValue({
            spotPrice: 68000,
            options: [],
        } as unknown as NormalizedDeribitChain);

        const response = await GET();
        const body = await response.json();

        expect(response.headers.get('cache-control')).toBe(
            'public, max-age=5, s-maxage=15, stale-while-revalidate=30'
        );
        expect(mockedFetchDeribitOptionChain).toHaveBeenCalledWith(responseTime);
        expect(mockedBuildTerrainDataContract).toHaveBeenCalledWith({
            options: [],
            spotPrice: 68000,
            now: responseTime,
            dataMode: 'LIVE',
        });
        expect(body).toEqual({
            schemaVersion: 2,
            dataMode: 'LIVE',
            assumptionModel: 'OI_SIGN_PROXY_V1',
            surfaceGrid: [],
        });
    });

    it('filters the live chain by the requested cumulative DTE horizon', async () => {
        const near = { dte: 1 } as unknown as NormalizedDeribitChain['options'][number];
        const far = { dte: 21 } as unknown as NormalizedDeribitChain['options'][number];
        mockedFetchDeribitOptionChain.mockResolvedValue({ spotPrice: 68000, options: [near, far] } as unknown as NormalizedDeribitChain);

        const response = await GET(new NextRequest('http://localhost/api/deribit?dte=7D'));

        expect(response.status).toBe(200);
        expect(mockedBuildTerrainDataContract).toHaveBeenCalledWith(expect.objectContaining({ options: [near] }));
    });

    it('serves explicit demo mode without contacting Deribit', async () => {
        const response = await GET(new NextRequest('http://localhost/api/deribit?mode=demo&dte=ALL'));

        expect(response.status).toBe(200);
        expect(mockedFetchDeribitOptionChain).not.toHaveBeenCalled();
        expect(mockedBuildDemoTerrainDataContract).toHaveBeenCalledWith(69000, responseTime);
    });

    it('rejects unsupported DTE filters', async () => {
        const response = await GET(new NextRequest('http://localhost/api/deribit?dte=90D'));
        expect(response.status).toBe(400);
        expect(mockedFetchDeribitOptionChain).not.toHaveBeenCalled();
    });

    it('returns explicit DEMO fallback with no-store headers when upstream fails', async () => {
        mockedFetchDeribitOptionChain.mockRejectedValue(new Error('upstream unavailable'));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const response = await GET();
        const body = await response.json();

        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mockedBuildDemoTerrainDataContract).toHaveBeenCalledWith(69000, responseTime);
        expect(consoleError).toHaveBeenCalledOnce();
        expect(body).toEqual({
            schemaVersion: 2,
            dataMode: 'DEMO',
            assumptionModel: 'OI_SIGN_PROXY_V1',
            surfaceGrid: [],
        });
    });
});
