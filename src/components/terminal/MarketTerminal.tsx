'use client';

import type { TerrainDataContractV2 } from '../../lib/terrain/types';
import { resolveUx16PublicFeatureFlags } from '../../lib/orderflow/feature-flags';
import CalmMarketTerminal from './CalmMarketTerminal';
import LegacyMarketTerminal from './LegacyMarketTerminal';

export { DRAWING_TOOLS } from './CalmMarketTerminal';

interface MarketTerminalProps {
    data: TerrainDataContractV2;
    isError: boolean;
}

const ux16Flags = resolveUx16PublicFeatureFlags({
    NEXT_PUBLIC_UX16_CALM_WORKSPACE: process.env.NEXT_PUBLIC_UX16_CALM_WORKSPACE,
    NEXT_PUBLIC_UX16_LIQUIDITY_SURFACE_V2: process.env.NEXT_PUBLIC_UX16_LIQUIDITY_SURFACE_V2,
    NEXT_PUBLIC_UX16_FOOTPRINT: process.env.NEXT_PUBLIC_UX16_FOOTPRINT,
    NEXT_PUBLIC_UX16_SETUP_DOCK: process.env.NEXT_PUBLIC_UX16_SETUP_DOCK,
});

/**
 * UX16.0 is an opt-in presentation shell. When its flag is absent or false,
 * the previously accepted terminal remains the safe fallback.
 */
export default function MarketTerminal(props: MarketTerminalProps) {
    return ux16Flags.calmWorkspace
        ? <CalmMarketTerminal {...props} />
        : <LegacyMarketTerminal {...props} />;
}
