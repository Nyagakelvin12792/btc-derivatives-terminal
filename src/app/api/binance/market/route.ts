import { NextRequest, NextResponse } from 'next/server';
import { fetchBinanceMarketSnapshot } from '@/lib/binance/client.server';
import type { BinanceInterval } from '@/lib/binance/types';

const ALLOWED_INTERVALS = new Set<BinanceInterval>(['1m', '5m', '15m', '1h', '4h', '1d']);
const CACHE_CONTROL = 'public, max-age=1, s-maxage=2, stale-while-revalidate=4';

export async function GET(request: NextRequest) {
    const intervalParam = request.nextUrl.searchParams.get('interval') ?? '1h';
    const limitParam = request.nextUrl.searchParams.get('limit') ?? '1000';
    if (!ALLOWED_INTERVALS.has(intervalParam as BinanceInterval)) {
        return NextResponse.json({ error: 'Unsupported Binance interval' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 50 || limit > 1_000) {
        return NextResponse.json({ error: 'Limit must be an integer between 50 and 1000' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const snapshot = await fetchBinanceMarketSnapshot(intervalParam as BinanceInterval, limit).catch(() => null);
    if (snapshot === null) {
        console.error('Binance market data request failed');
        return NextResponse.json(
            { error: 'Binance market data is temporarily unavailable', dataMode: 'OFFLINE', timestamp: new Date().toISOString() },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    return NextResponse.json(snapshot, { headers: { 'Cache-Control': CACHE_CONTROL } });
}
