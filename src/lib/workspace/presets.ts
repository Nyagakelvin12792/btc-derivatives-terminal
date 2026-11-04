import { z } from 'zod';
import {
    ChartSplitLayoutModeSchema,
    FootprintPresetIdSchema,
    OverlayDensityModeSchema,
    PriceScaleFitModeSchema,
    WorkspacePresetIdSchema,
    type ChartSplitLayoutMode,
    type FootprintPresetId,
    type OverlayDensityMode,
    type PriceScaleFitMode,
    type WorkspacePresetId,
} from '../ui/design-tokens';

export const WorkspacePresetConfigSchema = z.object({
    id: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(64),
    shortLabel: z.string().trim().min(1).max(24),
    description: z.string().trim().min(1).max(240),
    isCustom: z.boolean().default(false),
    splitLayoutMode: ChartSplitLayoutModeSchema,
    overlayDensity: OverlayDensityModeSchema,
    priceScaleFit: PriceScaleFitModeSchema,
    footprintPreset: FootprintPresetIdSchema,
    indicators: z.object({
        showVolumeProfile: z.boolean(),
        showAvwap: z.boolean(),
        showGammaRegime: z.boolean(),
        showOptionWalls: z.boolean(),
        showLiquidityHeatmap: z.boolean(),
        showTradingSessions: z.boolean(),
        showLowerStudy: z.boolean(),
    }),
});
export type WorkspacePresetConfig = z.infer<typeof WorkspacePresetConfigSchema>;

export const BUILTIN_WORKSPACE_PRESETS: Record<WorkspacePresetId, WorkspacePresetConfig> = {
    CLEAN_PRICE_ACTION: {
        id: 'CLEAN_PRICE_ACTION',
        label: 'Clean Price Action',
        shortLabel: 'Clean PA',
        description: 'Pure price candles with essential execution levels and zero secondary indicator noise.',
        isCustom: false,
        splitLayoutMode: 'MODE_A_CANDLE_ONLY',
        overlayDensity: 'MINIMAL',
        priceScaleFit: 'CANDLE_FIT',
        footprintPreset: 'CLEAN_FOOTPRINT',
        indicators: {
            showVolumeProfile: false,
            showAvwap: false,
            showGammaRegime: false,
            showOptionWalls: false,
            showLiquidityHeatmap: false,
            showTradingSessions: false,
            showLowerStudy: false,
        },
    },
    AUCTION_VOLUME_PROFILE: {
        id: 'AUCTION_VOLUME_PROFILE',
        label: 'Auction & Volume Profile',
        shortLabel: 'Auction VP',
        description: 'Market Profile / Volume Profile (POC, VAH, VAL), Anchored VWAP, and Trading Sessions.',
        isCustom: false,
        splitLayoutMode: 'MODE_A_CANDLE_ONLY',
        overlayDensity: 'STANDARD',
        priceScaleFit: 'CANDLE_FIT',
        footprintPreset: 'VOLUME_POC',
        indicators: {
            showVolumeProfile: true,
            showAvwap: true,
            showGammaRegime: false,
            showOptionWalls: false,
            showLiquidityHeatmap: false,
            showTradingSessions: true,
            showLowerStudy: true,
        },
    },
    ORDER_FLOW: {
        id: 'ORDER_FLOW',
        label: 'Order Flow & Footprint',
        shortLabel: 'Order Flow',
        description: 'Synchronized Left Footprint + Right Candlestick + Dual CVD subpanes with Delta & Imbalances.',
        isCustom: false,
        splitLayoutMode: 'MODE_C_DUAL_SYNC_CVD',
        overlayDensity: 'STANDARD',
        priceScaleFit: 'CANDLE_FIT',
        footprintPreset: 'DELTA_IMBALANCE',
        indicators: {
            showVolumeProfile: true,
            showAvwap: true,
            showGammaRegime: false,
            showOptionWalls: false,
            showLiquidityHeatmap: false,
            showTradingSessions: false,
            showLowerStudy: true,
        },
    },
    OPTIONS_CONTEXT: {
        id: 'OPTIONS_CONTEXT',
        label: 'Options & Gamma Context',
        shortLabel: 'Options',
        description: 'Deribit Call/Put Walls, Gamma Flip regime shading, and Anchored VWAP.',
        isCustom: false,
        splitLayoutMode: 'MODE_A_CANDLE_ONLY',
        overlayDensity: 'STANDARD',
        priceScaleFit: 'INCLUDE_WALLS',
        footprintPreset: 'CLEAN_FOOTPRINT',
        indicators: {
            showVolumeProfile: false,
            showAvwap: true,
            showGammaRegime: true,
            showOptionWalls: true,
            showLiquidityHeatmap: false,
            showTradingSessions: true,
            showLowerStudy: false,
        },
    },
    FULL_CONFLUENCE: {
        id: 'FULL_CONFLUENCE',
        label: 'Full Institutional Confluence',
        shortLabel: 'Confluence',
        description: 'Complete analytical stack: Synchronized Footprint, Dual CVD, Volume Profile, Walls, Heatmap, and Sessions.',
        isCustom: false,
        splitLayoutMode: 'MODE_C_DUAL_SYNC_CVD',
        overlayDensity: 'DETAILED',
        priceScaleFit: 'CANDLE_FIT',
        footprintPreset: 'DETAILED_RESEARCH',
        indicators: {
            showVolumeProfile: true,
            showAvwap: true,
            showGammaRegime: true,
            showOptionWalls: true,
            showLiquidityHeatmap: true,
            showTradingSessions: true,
            showLowerStudy: true,
        },
    },
    TRADE_EXECUTION: {
        id: 'TRADE_EXECUTION',
        label: 'Trade Execution & Risk',
        shortLabel: 'Execution',
        description: 'Focused execution workspace pairing Bid × Ask Footprint with clean levels and persistent Risk Terminal.',
        isCustom: false,
        splitLayoutMode: 'MODE_B_CANDLE_AND_FOOTPRINT',
        overlayDensity: 'MINIMAL',
        priceScaleFit: 'CANDLE_FIT',
        footprintPreset: 'BID_ASK',
        indicators: {
            showVolumeProfile: true,
            showAvwap: true,
            showGammaRegime: false,
            showOptionWalls: true,
            showLiquidityHeatmap: false,
            showTradingSessions: false,
            showLowerStudy: false,
        },
    },
};

export const CUSTOM_WORKSPACE_PRESETS_STORAGE_KEY = 'btc-terminal-custom-workspace-presets-v1' as const;

export function loadCustomWorkspacePresets(storage?: Pick<Storage, 'getItem'> | null): WorkspacePresetConfig[] {
    const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!targetStorage) return [];
    try {
        const raw = targetStorage.getItem(CUSTOM_WORKSPACE_PRESETS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = z.array(WorkspacePresetConfigSchema).safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : [];
    } catch {
        return [];
    }
}

export function saveCustomWorkspacePreset(
    preset: WorkspacePresetConfig,
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
): WorkspacePresetConfig[] {
    const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    const validated = WorkspacePresetConfigSchema.parse({ ...preset, isCustom: true });
    const existing = loadCustomWorkspacePresets(targetStorage).filter((p) => p.id !== validated.id);
    const updated = [...existing, validated].slice(-12);
    if (targetStorage) {
        try {
            targetStorage.setItem(CUSTOM_WORKSPACE_PRESETS_STORAGE_KEY, JSON.stringify(updated));
        } catch {
            // ignore quota errors
        }
    }
    return updated;
}
