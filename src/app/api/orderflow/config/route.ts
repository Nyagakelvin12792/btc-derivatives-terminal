import { NextResponse } from 'next/server';
import { AggregateTradeCapabilityV1Schema, ORDERFLOW_SCHEMA_VERSION } from '../../../../lib/orderflow/contracts';
import { resolveUx16ServerFeatureFlags } from '../../../../lib/orderflow/feature-flags';

const NO_STORE = 'no-store';

export async function GET() {
    const flags = resolveUx16ServerFeatureFlags({
        ORDERFLOW_AGGTRADE_ENABLED: process.env.ORDERFLOW_AGGTRADE_ENABLED,
        ORDERFLOW_SETUP_ENGINE_SHADOW: process.env.ORDERFLOW_SETUP_ENGINE_SHADOW,
        JEV_SHADOW_ENABLED: process.env.JEV_SHADOW_ENABLED,
    });
    const capability = AggregateTradeCapabilityV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        enabled: flags.aggregateTrade,
        dataMode: 'SHADOW',
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
    });
    return NextResponse.json(capability, { headers: { 'Cache-Control': NO_STORE } });
}
