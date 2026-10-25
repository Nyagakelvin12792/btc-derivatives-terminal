export const UX16_PUBLIC_FEATURE_FLAG_KEYS = Object.freeze({
    calmWorkspace: 'NEXT_PUBLIC_UX16_CALM_WORKSPACE',
    liquiditySurfaceV2: 'NEXT_PUBLIC_UX16_LIQUIDITY_SURFACE_V2',
    footprint: 'NEXT_PUBLIC_UX16_FOOTPRINT',
    setupDock: 'NEXT_PUBLIC_UX16_SETUP_DOCK',
} as const);

export const UX16_SERVER_FEATURE_FLAG_KEYS = Object.freeze({
    aggregateTrade: 'ORDERFLOW_AGGTRADE_ENABLED',
    setupEngineShadow: 'ORDERFLOW_SETUP_ENGINE_SHADOW',
    jevShadow: 'JEV_SHADOW_ENABLED',
} as const);

export interface Ux16PublicFeatureFlags {
    calmWorkspace: boolean;
    liquiditySurfaceV2: boolean;
    footprint: boolean;
    setupDock: boolean;
}

export interface Ux16ServerFeatureFlags {
    aggregateTrade: boolean;
    setupEngineShadow: boolean;
    jevShadow: boolean;
}

type Environment = Readonly<Record<string, string | undefined>>;

function enabled(value: string | undefined): boolean {
    return value?.trim().toLowerCase() === 'true';
}

export function resolveUx16PublicFeatureFlags(environment: Environment = {}): Ux16PublicFeatureFlags {
    return {
        calmWorkspace: enabled(environment.NEXT_PUBLIC_UX16_CALM_WORKSPACE),
        liquiditySurfaceV2: enabled(environment.NEXT_PUBLIC_UX16_LIQUIDITY_SURFACE_V2),
        footprint: enabled(environment.NEXT_PUBLIC_UX16_FOOTPRINT),
        setupDock: enabled(environment.NEXT_PUBLIC_UX16_SETUP_DOCK),
    };
}

export function resolveUx16ServerFeatureFlags(environment: Environment = {}): Ux16ServerFeatureFlags {
    return {
        aggregateTrade: enabled(environment.ORDERFLOW_AGGTRADE_ENABLED),
        setupEngineShadow: enabled(environment.ORDERFLOW_SETUP_ENGINE_SHADOW),
        jevShadow: enabled(environment.JEV_SHADOW_ENABLED),
    };
}
