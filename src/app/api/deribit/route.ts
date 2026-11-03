import { NextRequest, NextResponse } from 'next/server';
import { FALLBACK_SPOT_PRICE, fetchDeribitOptionChain } from '@/lib/deribit/client.server';
import { filterDeribitOptionsByDte, isDeribitDteFilter } from '@/lib/deribit/dte-filter';
import { buildDemoTerrainDataContract, buildTerrainDataContract } from '@/lib/terrain/engine';

const DERIBIT_RESPONSE_CACHE_CONTROL = 'public, max-age=5, s-maxage=15, stale-while-revalidate=30';

export async function GET(request: NextRequest) {
    const now = new Date();
    const mode = request.nextUrl.searchParams.get('mode');
    const dteParam = request.nextUrl.searchParams.get('dte') ?? 'ALL';
    if (!isDeribitDteFilter(dteParam)) {
        return NextResponse.json({ error: 'Unsupported DTE filter' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    if (mode === 'demo') {
        return NextResponse.json(buildDemoTerrainDataContract(FALLBACK_SPOT_PRICE, now), {
            headers: { 'Cache-Control': 'no-store' },
        });
    }

    try {
        const chain = await fetchDeribitOptionChain(now);
        const filteredOptions = filterDeribitOptionsByDte(chain.options, dteParam);
        return NextResponse.json(
            buildTerrainDataContract({
                options: filteredOptions,
                spotPrice: chain.spotPrice,
                now,
                dataMode: 'LIVE',
            }),
            {
                headers: {
                    'Cache-Control': DERIBIT_RESPONSE_CACHE_CONTROL,
                },
            }
        );
    } catch (err: unknown) {
        console.error('Error fetching Deribit data:', err);
        return NextResponse.json(buildDemoTerrainDataContract(FALLBACK_SPOT_PRICE, now), {
            headers: {
                'Cache-Control': 'no-store',
            },
        });
    }
}
