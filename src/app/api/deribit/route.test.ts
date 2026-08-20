import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedDeribitChain, NormalizedDeribitOption } from '@/lib/deribit/types';

vi.mock('@/lib/deribit/client.server', () => ({
    FALLBACK_SPOT_PRICE: 69000,
    fetchDeribitOptionChain: vi.fn(),
}));

vi.mock('@/lib/quant/engine', () => ({
    calculateGreeks: vi.fn(() => ({
        delta: 0.5,
        gamma: 0.001,
        vanna: -0.1,
        charm: -0.01,
    })),
    calculateNetGEX: vi.fn((gamma: number, openInterest: number, spot: number, type: 'call' | 'put') => {
        const dollarGex = gamma * openInterest * spot * spot;
        return type === 'call' ? dollarGex : -dollarGex;
    }),
}));

const { fetchDeribitOptionChain } = await import('@/lib/deribit/client.server');
const { GET } = await import('./route');

const mockedFetchDeribitOptionChain = vi.mocked(fetchDeribitOptionChain);
const responseTime = new Date(Date.UTC(2026, 7, 20, 8, 0, 0));

function option(overrides: Partial<Record<keyof NormalizedDeribitOption, unknown>>): NormalizedDeribitOption {
    return {
        instrument: 'BTC-25DEC26-70000-C',
        currency: 'BTC',
        expiryStr: '25DEC26',
        expiryDate: new Date(Date.UTC(2026, 11, 25, 8, 0, 0)),
        strike: 70000,
        type: 'call',
        dte: 127,
        tte: 127 / 365,
        openInterest: 10,
        ivDecimal: 0.6,
        ivPercent: 60,
        volume: 1,
        ...overrides,
    } as unknown as NormalizedDeribitOption;
}

describe('/api/deribit route contract', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(responseTime);
        mockedFetchDeribitOptionChain.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns the visual-engine surface contract for live Deribit data', async () => {
        const chain = {
            spotPrice: 68000,
            options: [
                option({ instrument: 'BTC-25DEC26-70000-C', strike: 70000, type: 'call' }),
                option({
                    instrument: 'BTC-25DEC26-65000-P',
                    strike: 65000,
                    type: 'put',
                    openInterest: 8,
                    ivPercent: 55,
                    ivDecimal: 0.55,
                }),
                option({
                    instrument: 'BTC-26MAR27-70000-C',
                    expiryStr: '26MAR27',
                    expiryDate: new Date(Date.UTC(2027, 2, 26, 8, 0, 0)),
                    dte: 218,
                    tte: 218 / 365,
                    strike: 70000,
                    type: 'call',
                    openInterest: 6,
                }),
            ],
        } as unknown as NormalizedDeribitChain;
        mockedFetchDeribitOptionChain.mockResolvedValue(chain);

        const response = await GET();
        const body = await response.json();

        expect(response.headers.get('cache-control')).toBe(
            'public, max-age=5, s-maxage=15, stale-while-revalidate=30'
        );
        expect(mockedFetchDeribitOptionChain).toHaveBeenCalledWith(responseTime);
        expect(body.timestamp).toBe(responseTime.toISOString());
        expect(body.spotPrice).toBe(68000);
        expect(body.expirations).toEqual(['25DEC26', '26MAR27']);
        expect(body.strikes).toEqual([65000, 70000]);
        expect(body.surfaceGrid).toHaveLength(body.expirations.length);
        expect(body.surfaceGrid.every((row: unknown[]) => row.length === body.strikes.length)).toBe(true);
        expect(body.surfaceGrid[0][0]).toEqual(
            expect.objectContaining({
                strike: 65000,
                expiry: '25DEC26',
                openInterest: 8,
                iv: 55,
            })
        );
        expect(body.summary).toEqual(
            expect.objectContaining({
                totalOpenInterest: 24,
                contractsCount: 3,
            })
        );
        expect(body.topContracts[0]).toEqual(
            expect.objectContaining({
                instrument: expect.any(String),
                expiryDate: expect.any(String),
                delta: expect.any(Number),
                gamma: expect.any(Number),
                vanna: expect.any(Number),
                charm: expect.any(Number),
                gex: expect.any(Number),
            })
        );
    });

    it('returns no-store synthetic fallback with the same visual-engine shape when upstream fails', async () => {
        mockedFetchDeribitOptionChain.mockRejectedValue(new Error('upstream unavailable'));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const response = await GET();
        const body = await response.json();

        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(consoleError).toHaveBeenCalledOnce();
        expect(body.spotPrice).toBe(69000);
        expect(body.expirations).toEqual(['7D', '14D', '30D', '60D', '90D', '180D']);
        expect(body.surfaceGrid).toHaveLength(body.expirations.length);
        expect(body.surfaceGrid.every((row: unknown[]) => row.length === body.strikes.length)).toBe(true);
        expect(body.topContracts).toEqual([]);
        expect(body.summary.contractsCount).toBe(450);
    });
});
