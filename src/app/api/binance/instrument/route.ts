import { NextResponse } from 'next/server';
import { fetchFootprintInstrument } from '@/lib/binance/client.server';

export async function GET() {
    try {
        const metadata = await fetchFootprintInstrument();
        return NextResponse.json(metadata, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });
    } catch {
        return NextResponse.json({ error: 'Binance Spot instrument metadata unavailable' }, { status: 503 });
    }
}
