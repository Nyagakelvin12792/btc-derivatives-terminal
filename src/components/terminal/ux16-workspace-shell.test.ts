import { describe, expect, it } from 'vitest';
import {
    CALM_TOKENS,
    type DataIntegrityStatus,
    getDataIntegrityBadgeClasses,
    getDataIntegrityDotClasses,
} from './terminal-theme';
import { useTerminalStore } from '../../lib/dashboard/store';
import { UX16_DATA_INTEGRITY_STATUS_FIXTURES_V1, UX16_REPLAY_CONTRACT_FIXTURE_V1 } from '../../lib/orderflow/fixtures';
import { resolveUx16PublicFeatureFlags } from '../../lib/orderflow/feature-flags';

describe('UX16.0 Calm Analytical Instrument Visual Tokens', () => {
    it('defines restrained dark neutral canvas and surface tokens', () => {
        expect(CALM_TOKENS.canvas).toBe('#070A0F');
        expect(CALM_TOKENS.surfaceRaised).toBe('#0C1118');
        expect(CALM_TOKENS.grid).toBe('#18212C');
        expect(CALM_TOKENS.border).toBe('#18212C');
    });

    it('defines single neutral text hierarchy', () => {
        expect(CALM_TOKENS.textPrimary).toBe('#D8DEE8');
        expect(CALM_TOKENS.textSecondary).toBe('#8390A0');
        expect(CALM_TOKENS.textMuted).toBe('#5C697A');
    });

    it('restricts green and red exclusively to directional executions', () => {
        expect(CALM_TOKENS.bullish).toBe('#2CC7A0');
        expect(CALM_TOKENS.bearish).toBe('#E06379');
    });

    it('defines interaction blue and attention amber tokens', () => {
        expect(CALM_TOKENS.interaction).toBe('#39A9F5');
        expect(CALM_TOKENS.attention).toBe('#E6B450');
        expect(CALM_TOKENS.stale).toBe('#8E98A6');
    });
});

describe('UX16.0 Data Integrity Strip State Matrix', () => {
    const allStatuses: DataIntegrityStatus[] = [
        'LOADING',
        'READY',
        'PARTIAL',
        'STALE',
        'UNAVAILABLE',
        'ERROR',
        'REPLAY',
        'SHADOW',
    ];

    it.each(allStatuses)('generates valid styling classes for status: %s', (status) => {
        const badgeClasses = getDataIntegrityBadgeClasses(status);
        const dotClasses = getDataIntegrityDotClasses(status);

        expect(badgeClasses).toBeDefined();
        expect(badgeClasses.length).toBeGreaterThan(0);
        expect(dotClasses).toBeDefined();
        expect(dotClasses.startsWith('bg-')).toBe(true);
    });

    it('contains every integrity status as a contract-validated UI fixture', () => {
        expect(UX16_DATA_INTEGRITY_STATUS_FIXTURES_V1.map((fixture) => fixture.status)).toEqual(allStatuses);
    });

    it('verifies Jev remains explicitly shadow-only in the replay contract', () => {
        const jevDomain = UX16_REPLAY_CONTRACT_FIXTURE_V1.integrity.find((domain) => domain.key === 'JEV');
        expect(jevDomain).toBeDefined();
        expect(jevDomain?.status).toBe('SHADOW');
        expect(jevDomain?.coverage.venue).toBe('NOT_APPLICABLE');
    });

    it('keeps all public UX16 feature flags off by default', () => {
        expect(resolveUx16PublicFeatureFlags()).toEqual({
            calmWorkspace: false,
            liquiditySurfaceV2: false,
            footprint: false,
            setupDock: false,
        });
    });
});

describe('UX16.1 SPOT TAPE Data Integrity Presentation', () => {
    it('verifies SPOT TAPE / TRADES domain integrity fixture exists', () => {
        const tradeDomain = UX16_REPLAY_CONTRACT_FIXTURE_V1.integrity.find((domain) => domain.key === 'TRADES');
        expect(tradeDomain).toBeDefined();
        expect(tradeDomain?.coverage.precision).toBe('TRADE');
        expect(tradeDomain?.coverage.approximation).toBe('NONE');
        expect(tradeDomain?.coverage.venue).toBe('BINANCE_SPOT');
    });

    it('verifies SPOT TAPE theme badge and dot classes for each capture lifecycle status', () => {
        // Disabled / Offline -> UNAVAILABLE
        expect(getDataIntegrityBadgeClasses('UNAVAILABLE')).toContain('text-[#5C697A]');
        expect(getDataIntegrityDotClasses('UNAVAILABLE')).toBe('bg-[#5C697A]');

        // Checking capability / Stream buffering -> LOADING
        expect(getDataIntegrityBadgeClasses('LOADING')).toContain('text-[#8390A0]');
        expect(getDataIntegrityDotClasses('LOADING')).toBe('bg-[#8390A0]');

        // Active accepted capture -> READY (neutral text, green status dot)
        expect(getDataIntegrityBadgeClasses('READY')).toContain('text-[#D8DEE8]');
        expect(getDataIntegrityDotClasses('READY')).toBe('bg-[#2CC7A0]');

        // Sequence jump / gap -> PARTIAL
        expect(getDataIntegrityBadgeClasses('PARTIAL')).toContain('text-[#E6B450]');
        expect(getDataIntegrityDotClasses('PARTIAL')).toBe('bg-[#E6B450]');

        // No trade for > 15s -> STALE
        expect(getDataIntegrityBadgeClasses('STALE')).toContain('text-[#8E98A6]');
        expect(getDataIntegrityDotClasses('STALE')).toBe('bg-[#8E98A6]');

        // Worker or network error -> ERROR
        expect(getDataIntegrityBadgeClasses('ERROR')).toContain('text-[#E06379]');
        expect(getDataIntegrityDotClasses('ERROR')).toBe('bg-[#E06379]');
    });
});

describe('UX16.0 Terminal Store Workspace Modes and Attention Budget', () => {
    it('defaults to CONTEXT workspace mode', () => {
        const store = useTerminalStore.getState();
        expect(store.workspaceMode).toBe('CONTEXT');
    });

    it('allows switching between CONTEXT, FLOW, and SETUP modes', () => {
        const { setWorkspaceMode } = useTerminalStore.getState();

        setWorkspaceMode('FLOW');
        expect(useTerminalStore.getState().workspaceMode).toBe('FLOW');

        setWorkspaceMode('SETUP');
        expect(useTerminalStore.getState().workspaceMode).toBe('SETUP');

        setWorkspaceMode('CONTEXT');
        expect(useTerminalStore.getState().workspaceMode).toBe('CONTEXT');
    });

    it('resets workspace UI back to CONTEXT mode and calm layer budget defaults', () => {
        const { setWorkspaceMode, resetWorkspaceUi, toggleChartLayer } = useTerminalStore.getState();

        setWorkspaceMode('FLOW');
        toggleChartLayer('secondaryWalls');

        resetWorkspaceUi();

        const state = useTerminalStore.getState();
        expect(state.workspaceMode).toBe('CONTEXT');
        // Attention budget: secondary walls and max pain are false by default
        expect(state.chartLayers.secondaryWalls).toBe(false);
        expect(state.chartLayers.maxPain).toBe(false);
        // Primary walls, gammaFlip, and avwap are active
        expect(state.chartLayers.walls).toBe(true);
        expect(state.chartLayers.gammaFlip).toBe(true);
        expect(state.chartLayers.avwap).toBe(true);
    });
});
