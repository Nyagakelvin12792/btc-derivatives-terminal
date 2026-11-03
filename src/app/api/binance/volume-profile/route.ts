import { NextRequest, NextResponse } from 'next/server';
import { fetchBinanceVolumeProfileBars } from '@/lib/binance/client.server';
import type { BinanceProfileInterval } from '@/lib/binance/types';

const INTERVAL_MS: Record<BinanceProfileInterval, number> = {
    '1s': 1_000,
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
};
const CACHE_CONTROL = 'public, max-age=2, s-maxage=5, stale-while-revalidate=10';

function integerParam(request: NextRequest, name: string): number | null {
    const raw = request.nextUrl.searchParams.get(name);
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : null;
}

export async function GET(request: NextRequest) {
    const interval = request.nextUrl.searchParams.get('interval') as BinanceProfileInterval | null;
    const startTime = integerParam(request, 'startTime');
    const endTime = integerParam(request, 'endTime');
    if (!interval || !(interval in INTERVAL_MS)) {
        return NextResponse.json({ error: 'Unsupported Binance profile interval' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (startTime === null || endTime === null || endTime <= startTime) {
        return NextResponse.json({ error: 'A valid startTime and endTime range is required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const estimatedBars = Math.ceil((endTime - startTime + 1) / INTERVAL_MS[interval]);
    if (estimatedBars > 5_000) {
        return NextResponse.json({ error: 'Volume profile range exceeds the 5000-bar safety limit' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const snapshot = await fetchBinanceVolumeProfileBars(interval, startTime, endTime).catch(() => null);
    if (snapshot === null) {
        console.error('Binance volume profile request failed');
        return NextResponse.json(
            { error: 'Binance volume profile data is temporarily unavailable', dataMode: 'OFFLINE', timestamp: new Date().toISOString() },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': CACHE_CONTROL } });
}
