import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    env: {
        NEXT_PUBLIC_UX16_CALM_WORKSPACE: process.env.NEXT_PUBLIC_UX16_CALM_WORKSPACE ?? 'true',
        NEXT_PUBLIC_UX16_LIQUIDITY_SURFACE_V2: process.env.NEXT_PUBLIC_UX16_LIQUIDITY_SURFACE_V2 ?? 'true',
        NEXT_PUBLIC_UX16_FOOTPRINT: process.env.NEXT_PUBLIC_UX16_FOOTPRINT ?? 'true',
        NEXT_PUBLIC_UX16_SETUP_DOCK: process.env.NEXT_PUBLIC_UX16_SETUP_DOCK ?? 'true',
        ORDERFLOW_AGGTRADE_ENABLED: process.env.ORDERFLOW_AGGTRADE_ENABLED ?? 'true',
        ORDERFLOW_SETUP_ENGINE_SHADOW: process.env.ORDERFLOW_SETUP_ENGINE_SHADOW ?? 'true',
        JEV_SHADOW_ENABLED: process.env.JEV_SHADOW_ENABLED ?? 'true',
    },
};

export default nextConfig;
