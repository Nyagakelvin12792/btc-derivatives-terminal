import { describe, expect, it } from 'vitest';
import {
    UX16_PUBLIC_FEATURE_FLAG_KEYS,
    UX16_SERVER_FEATURE_FLAG_KEYS,
    resolveUx16PublicFeatureFlags,
    resolveUx16ServerFeatureFlags,
} from './feature-flags';

describe('UX16 feature flags', () => {
    it('defaults every UX16 feature off', () => {
        expect(resolveUx16PublicFeatureFlags()).toEqual({
            calmWorkspace: false,
            liquiditySurfaceV2: false,
            footprint: false,
            setupDock: false,
        });
        expect(resolveUx16ServerFeatureFlags()).toEqual({
            aggregateTrade: false,
            setupEngineShadow: false,
            jevShadow: false,
        });
    });

    it('enables only the exact case-insensitive true value', () => {
        expect(resolveUx16PublicFeatureFlags({
            NEXT_PUBLIC_UX16_CALM_WORKSPACE: ' TRUE ',
            NEXT_PUBLIC_UX16_LIQUIDITY_SURFACE_V2: '1',
            NEXT_PUBLIC_UX16_FOOTPRINT: 'yes',
            NEXT_PUBLIC_UX16_SETUP_DOCK: 'false',
        })).toEqual({
            calmWorkspace: true,
            liquiditySurfaceV2: false,
            footprint: false,
            setupDock: false,
        });
    });

    it('keeps public and server flag names in separate contracts', () => {
        expect(Object.values(UX16_PUBLIC_FEATURE_FLAG_KEYS).every((key) => key.startsWith('NEXT_PUBLIC_'))).toBe(true);
        expect(Object.values(UX16_SERVER_FEATURE_FLAG_KEYS).every((key) => !key.startsWith('NEXT_PUBLIC_'))).toBe(true);
        expect(resolveUx16PublicFeatureFlags({ JEV_SHADOW_ENABLED: 'true' }).calmWorkspace).toBe(false);
        expect(resolveUx16ServerFeatureFlags({ JEV_SHADOW_ENABLED: 'true' }).jevShadow).toBe(true);
    });
});
