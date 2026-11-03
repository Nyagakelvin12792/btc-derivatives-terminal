import type { DataIntegrityStatus } from '../../lib/orderflow/contracts';

/**
 * Calm Analytical Instrument Design Tokens (UX16.0)
 *
 * Rules:
 * - Flat, precise, quiet, and tool-like.
 * - Restrained dark neutral canvas (#070A0F).
 * - Single neutral foreground hierarchy (#D8DEE8 primary, #8390A0 secondary, #5C697A muted).
 * - Directional meaning only for green (#2CC7A0) and red (#E06379).
 * - Blue (#39A9F5) for selection and interaction.
 * - Amber (#E6B450) for attention, watch state, and warnings.
 * - Stale/unavailable (#8E98A6) for missing or degraded states.
 * - No glassmorphism, no neon glow, no looping animations.
 */

export const CALM_TOKENS = {
    canvas: '#070A0F',
    surfaceRaised: '#0C1118',
    surfaceSubtle: '#090D14',
    grid: '#18212C',
    border: '#18212C',
    borderSubtle: '#141B24',
    borderHover: '#263445',
    textPrimary: '#D8DEE8',
    textSecondary: '#8390A0',
    textMuted: '#5C697A',
    interaction: '#39A9F5',
    interactionSubtle: 'rgba(57, 169, 245, 0.12)',
    interactionBorder: 'rgba(57, 169, 245, 0.40)',
    attention: '#E6B450',
    attentionSubtle: 'rgba(230, 180, 80, 0.12)',
    attentionBorder: 'rgba(230, 180, 80, 0.35)',
    bullish: '#2CC7A0',
    bullishSubtle: 'rgba(44, 199, 160, 0.12)',
    bullishBorder: 'rgba(44, 199, 160, 0.35)',
    bearish: '#E06379',
    bearishSubtle: 'rgba(224, 99, 121, 0.12)',
    bearishBorder: 'rgba(224, 99, 121, 0.35)',
    stale: '#8E98A6',
    staleSubtle: 'rgba(142, 152, 166, 0.12)',
    staleBorder: 'rgba(142, 152, 166, 0.30)',
} as const;

export type { DataIntegrityStatus } from '../../lib/orderflow/contracts';

export function getDataIntegrityBadgeClasses(status: DataIntegrityStatus): string {
    switch (status) {
        case 'READY':
            return 'border-[#18212C] bg-[#0C1118] text-[#D8DEE8]';
        case 'LOADING':
            return 'border-[#18212C] bg-[#0C1118] text-[#8390A0]';
        case 'PARTIAL':
            return 'border-[#E6B450]/40 bg-[#E6B450]/10 text-[#E6B450]';
        case 'STALE':
            return 'border-[#8E98A6]/40 bg-[#8E98A6]/10 text-[#8E98A6]';
        case 'UNAVAILABLE':
            return 'border-[#18212C] bg-[#0C1118] text-[#5C697A]';
        case 'ERROR':
            return 'border-[#E06379]/40 bg-[#E06379]/10 text-[#E06379]';
        case 'REPLAY':
            return 'border-[#39A9F5]/40 bg-[#39A9F5]/10 text-[#39A9F5]';
        case 'SHADOW':
            return 'border-[#39A9F5]/30 bg-[#0C1118] text-[#8390A0]';
        default:
            return 'border-[#18212C] bg-[#0C1118] text-[#8390A0]';
    }
}

export function getDataIntegrityDotClasses(status: DataIntegrityStatus): string {
    switch (status) {
        case 'READY':
            return 'bg-[#2CC7A0]';
        case 'LOADING':
            return 'bg-[#8390A0]';
        case 'PARTIAL':
            return 'bg-[#E6B450]';
        case 'STALE':
            return 'bg-[#8E98A6]';
        case 'UNAVAILABLE':
            return 'bg-[#5C697A]';
        case 'ERROR':
            return 'bg-[#E06379]';
        case 'REPLAY':
            return 'bg-[#39A9F5]';
        case 'SHADOW':
            return 'bg-[#39A9F5]';
        default:
            return 'bg-[#5C697A]';
    }
}
