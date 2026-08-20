import { NextResponse } from 'next/server';
import { FALLBACK_SPOT_PRICE, fetchDeribitOptionChain } from '@/lib/deribit/client.server';
import { buildDemoTerrainDataContract, buildTerrainDataContract } from '@/lib/terrain/engine';

const DERIBIT_RESPONSE_CACHE_CONTROL = 'public, max-age=5, s-maxage=15, stale-while-revalidate=30';

export async function GET() {
    const now = new Date();

    try {
        const chain = await fetchDeribitOptionChain(now);
        return NextResponse.json(
            buildTerrainDataContract({
                options: chain.options,
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
