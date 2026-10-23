import { NextRequest, NextResponse } from 'next/server';
import { fetchBinanceHistoryPage } from '@/lib/binance/client.server';
import type { BinanceInterval } from '@/lib/binance/types';

const ALLOWED_INTERVALS = new Set<BinanceInterval>(['1m', '5m', '15m', '1h', '4h', '1d']);
const CACHE_CONTROL = 'public, max-age=10, s-maxage=60, stale-while-revalidate=300';

export async function GET(request: NextRequest) {
    const intervalParam = request.nextUrl.searchParams.get('interval') ?? '1h';
    const limitParam = request.nextUrl.searchParams.get('limit') ?? '1000';
    const endTimeParam = request.nextUrl.searchParams.get('endTime');
    if (!ALLOWED_INTERVALS.has(intervalParam as BinanceInterval)) {
        return NextResponse.json({ error: 'Unsupported Binance interval' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
        return NextResponse.json({ error: 'Limit must be an integer between 1 and 1000' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const endTime = endTimeParam === null ? undefined : Number(endTimeParam);
    if (endTime !== undefined && (!Number.isSafeInteger(endTime) || endTime < 0)) {
        return NextResponse.json({ error: 'endTime must be a non-negative millisecond timestamp' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const page = await fetchBinanceHistoryPage(intervalParam as BinanceInterval, limit, endTime).catch(() => null);
    if (page === null) {
        console.error('Binance history request failed');
        return NextResponse.json(
            { error: 'Binance historical candles are temporarily unavailable', dataMode: 'OFFLINE', timestamp: new Date().toISOString() },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
    return NextResponse.json(page, { headers: { 'Cache-Control': CACHE_CONTROL } });
}
