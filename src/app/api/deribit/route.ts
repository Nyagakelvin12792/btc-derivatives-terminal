import { NextRequest, NextResponse } from 'next/server';
import { FALLBACK_SPOT_PRICE, fetchDeribitOptionChain } from '../../../lib/deribit/client.server';
import { filterDeribitOptionsByDte, filterDeribitOptionsByExactExpiry, isDeribitDteFilter, refreshDeribitOptionDte } from '../../../lib/deribit/dte-filter';
import { buildDemoTerrainDataContract, buildTerrainDataContract } from '../../../lib/terrain/engine';

const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
    const now = new Date();
    const params = request.nextUrl.searchParams;
    const dte = params.get('dte') ?? 'ALL';
    const expiry = params.get('expiry');
    const windows = params.get('expiries')?.split(',');
    if (!isDeribitDteFilter(dte) || windows?.some((window) => !/^(2|7|14|30)$/.test(window))) {
        return NextResponse.json({ error: 'Unsupported DTE filter' }, { status: 400, headers });
    }
    const maxWindow = windows ? Math.max(...windows.map(Number)) : Infinity;
    const selectOptions = (options: Parameters<typeof filterDeribitOptionsByDte>[0]) =>
        filterDeribitOptionsByExactExpiry(filterDeribitOptionsByDte(options, dte), expiry)
            .filter((option) => option.dte <= maxWindow);
    if (params.get('mode') === 'demo') {
        return NextResponse.json(buildDemoTerrainDataContract(FALLBACK_SPOT_PRICE, now, selectOptions), { headers });
    }

    try {
        const chain = await fetchDeribitOptionChain(now);
        if (chain.sourceTimeMs === undefined || Date.now() - chain.sourceTimeMs > 60_000) {
            throw new Error('Deribit chain freshness unavailable');
        }
        const active = refreshDeribitOptionDte(chain.options, now);
        const filtered = selectOptions(active);
        const terrain = buildTerrainDataContract({ options: filtered, spotPrice: chain.spotPrice, now, dataMode: 'LIVE' });
        return NextResponse.json({
            ...terrain,
            sourceTime: new Date(chain.sourceTimeMs).toISOString(),
            coverage: { ...chain.coverage, selected: filtered.length },
        }, { headers });
    } catch {
        return NextResponse.json({ error: 'Deribit live data unavailable', dataMode: 'DEGRADED' }, { status: 503, headers });
    }
}
