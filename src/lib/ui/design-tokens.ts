import { z } from 'zod';

export const OverlayDensityModeSchema = z.enum(['MINIMAL', 'STANDARD', 'DETAILED']);
export type OverlayDensityMode = z.infer<typeof OverlayDensityModeSchema>;

export const VisualPriorityTierSchema = z.enum(['PRIMARY', 'SECONDARY', 'TERTIARY']);
export type VisualPriorityTier = z.infer<typeof VisualPriorityTierSchema>;

export const ChartSplitLayoutModeSchema = z.enum([
    'MODE_A_CANDLE_ONLY',
    'MODE_B_CANDLE_AND_FOOTPRINT',
    'MODE_C_DUAL_SYNC_CVD',
]);
export type ChartSplitLayoutMode = z.infer<typeof ChartSplitLayoutModeSchema>;

export const PriceScaleFitModeSchema = z.enum(['CANDLE_FIT', 'INCLUDE_WALLS']);
export type PriceScaleFitMode = z.infer<typeof PriceScaleFitModeSchema>;

export const FootprintPresetIdSchema = z.enum([
    'CLEAN_FOOTPRINT',
    'BID_ASK',
    'DELTA_IMBALANCE',
    'VOLUME_POC',
    'ABSORPTION_ANALYSIS',
    'DETAILED_RESEARCH',
]);
export type FootprintPresetId = z.infer<typeof FootprintPresetIdSchema>;

export const WorkspacePresetIdSchema = z.enum([
    'CLEAN_PRICE_ACTION',
    'AUCTION_VOLUME_PROFILE',
    'ORDER_FLOW',
    'OPTIONS_CONTEXT',
    'FULL_CONFLUENCE',
    'TRADE_EXECUTION',
]);
export type WorkspacePresetId = z.infer<typeof WorkspacePresetIdSchema>;

export const TERMINAL_DESIGN_TOKENS = {
    colors: {
        canvas: {
            primary: '#070A0F',
            elevated: '#0C1118',
            subtle: '#101722',
            overlay: 'rgba(12, 17, 24, 0.92)',
        },
        border: {
            hairline: '#18212C',
            subtle: 'rgba(148, 163, 184, 0.12)',
            active: 'rgba(57, 169, 245, 0.45)',
        },
        grid: {
            vertical: 'rgba(148, 163, 184, 0.035)',
            horizontal: 'rgba(148, 163, 184, 0.035)',
        },
        text: {
            primary: '#D8DEE8',
            secondary: '#8390A0',
            muted: '#5C697A',
        },
        candle: {
            bullBody: '#2CC7A0',
            bullBorder: '#2CC7A0',
            bullWick: '#2CC7A0',
            bearBody: '#F06152',
            bearBorder: '#F06152',
            bearWick: '#F06152',
        },
        levels: {
            poc: '#F59E0B',
            sessionPoc: '#FBBF24',
            dailyPoc: '#F59E0B',
            weeklyPoc: '#A855F7',
            vahVal: '#38BDF8',
            vwap: '#60A5FA',
            callWall: '#2CC7A0',
            putWall: '#F06152',
            gammaFlip: '#39A9F5',
            entry: '#38BDF8',
            stopLoss: '#F06152',
            takeProfit: '#2CC7A0',
        },
        sessions: {
            ASIA: { fill: 'rgba(168, 85, 247, 0.03)', border: 'rgba(168, 85, 247, 0.22)', text: '#C084FC' },
            LONDON: { fill: 'rgba(56, 189, 248, 0.03)', border: 'rgba(56, 189, 248, 0.22)', text: '#38BDF8' },
            NEW_YORK: { fill: 'rgba(245, 158, 11, 0.03)', border: 'rgba(245, 158, 11, 0.22)', text: '#FBBF24' },
            OVERLAP: { fill: 'rgba(16, 185, 129, 0.045)', border: 'rgba(16, 185, 129, 0.28)', text: '#34D399' },
        },
    },
    typography: {
        fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        tabularNums: 'tabular-nums',
        sizes: {
            micro: '9px',
            compact: '10px',
            label: '11px',
            body: '12px',
            heading: '13px',
        },
    },
    spacing: {
        toolbarHeightPx: 36,
        priceAxisWidthPx: 68,
        minLabelGapPx: 16,
        maxVpWidthRatio: 0.22,
        maxVpWidthPx: 180,
        defaultFutureRightOffsetBars: 24,
    },
    tierOpacity: {
        PRIMARY: 1.0,
        SECONDARY: 0.78,
        TERTIARY: 0.35,
    },
} as const;

export interface OverlayVisibilityPolicy {
    showCandles: boolean;
    showCurrentPrice: boolean;
    showActiveTradeLevels: boolean;
    showSecondaryLevels: boolean;
    showSecondaryLabels: boolean;
    showHistoricalSessions: boolean;
    showSessionHighLowLines: boolean;
    showMinorAnnotations: boolean;
    volumeProfileOpacityMultiplier: number;
    sessionBoxOpacityMultiplier: number;
}

export function getOverlayPolicyForDensity(density: OverlayDensityMode): OverlayVisibilityPolicy {
    switch (density) {
        case 'MINIMAL':
            return {
                showCandles: true,
                showCurrentPrice: true,
                showActiveTradeLevels: true,
                showSecondaryLevels: true,
                showSecondaryLabels: false, // Line visible, right-edge label only on hover or POC
                showHistoricalSessions: false,
                showSessionHighLowLines: false,
                showMinorAnnotations: false,
                volumeProfileOpacityMultiplier: 0.65,
                sessionBoxOpacityMultiplier: 0.4,
            };
        case 'STANDARD':
            return {
                showCandles: true,
                showCurrentPrice: true,
                showActiveTradeLevels: true,
                showSecondaryLevels: true,
                showSecondaryLabels: true,
                showHistoricalSessions: true,
                showSessionHighLowLines: false,
                showMinorAnnotations: false,
                volumeProfileOpacityMultiplier: 1.0,
                sessionBoxOpacityMultiplier: 0.75,
            };
        case 'DETAILED':
            return {
                showCandles: true,
                showCurrentPrice: true,
                showActiveTradeLevels: true,
                showSecondaryLevels: true,
                showSecondaryLabels: true,
                showHistoricalSessions: true,
                showSessionHighLowLines: true,
                showMinorAnnotations: true,
                volumeProfileOpacityMultiplier: 1.15,
                sessionBoxOpacityMultiplier: 1.0,
            };
    }
}
