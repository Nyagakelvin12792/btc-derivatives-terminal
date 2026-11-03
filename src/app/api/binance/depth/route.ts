import { NextRequest, NextResponse } from 'next/server';
import { fetchBinanceDepthSnapshot } from '@/lib/binance/client.server';

const DEFAULT_DEPTH_LIMIT = 500;
const MIN_DEPTH_LIMIT = 100;
const MAX_DEPTH_LIMIT = 1_000;
const NO_STORE = 'no-store';

export async function GET(request: NextRequest) {
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_DEPTH_LIMIT);
    if (!Number.isSafeInteger(limit) || limit < MIN_DEPTH_LIMIT || limit > MAX_DEPTH_LIMIT) {
        return NextResponse.json(
            { error: `Limit must be an integer between ${MIN_DEPTH_LIMIT} and ${MAX_DEPTH_LIMIT}` },
            { status: 400, headers: { 'Cache-Control': NO_STORE } },
        );
    }

    let snapshot = null;
    try {
        snapshot = await fetchBinanceDepthSnapshot(limit);
    } catch {
        // The response below deliberately exposes no upstream details.
    }
    if (snapshot === null) {
        console.error('Binance depth snapshot request failed');
        return NextResponse.json(
            { error: 'Binance depth snapshot is temporarily unavailable', dataMode: 'OFFLINE', timestamp: new Date().toISOString() },
            { status: 503, headers: { 'Cache-Control': NO_STORE } },
        );
    }

    return NextResponse.json(snapshot, { headers: { 'Cache-Control': NO_STORE } });
}
