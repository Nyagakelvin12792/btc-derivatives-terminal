/**
 * TradingView-Aligned Anchored VWAP Settings & State Architecture (UX19.1)
 *
 * Implements full TradingView parity for Anchored VWAP:
 * - Anchor: Manual timestamp/candle, Swing Low, Swing High, Session Open, Reset
 * - Calculation: Price source (HLC3, HL2, OHLC4, CLOSE, OPEN), Volume source
 * - Bands: Up to 3 standard deviation or percentage bands with independent multipliers,
 *   styles, colors, and optional fills
 * - Style: Line color, width, style, opacity, marker visibility, label visibility
 * - Behavior: Lock drawing, hide, save as default, restore defaults
 */

import { z } from 'zod';

export const AvwapPriceSourceSchema = z.enum(['HLC3', 'HL2', 'OHLC4', 'CLOSE', 'OPEN']);
export type AvwapPriceSource = z.infer<typeof AvwapPriceSourceSchema>;

export const AvwapAnchorModeSchema = z.enum([
    'MANUAL',
    'SWING_LOW',
    'SWING_HIGH',
    'SESSION_OPEN',
    'WEEK_OPEN',
]);
export type AvwapAnchorMode = z.infer<typeof AvwapAnchorModeSchema>;

export const AvwapLineStyleSchema = z.enum(['SOLID', 'DASHED', 'DOTTED']);
export type AvwapLineStyle = z.infer<typeof AvwapLineStyleSchema>;

export const AvwapBandConfigSchema = z.object({
    enabled: z.boolean(),
    multiplier: z.number().positive(),
    color: z.string(),
    lineWidth: z.number().min(1).max(4),
    lineStyle: AvwapLineStyleSchema,
});
export type AvwapBandConfig = z.infer<typeof AvwapBandConfigSchema>;

export const AvwapSettingsSchema = z.object({
    anchorMode: AvwapAnchorModeSchema.default('SWING_LOW'),
    anchorTime: z.number().nonnegative().default(0), // UTC timestamp in seconds
    priceSource: AvwapPriceSourceSchema.default('HLC3'),
    lineColor: z.string().default('#32aef4'),
    lineWidth: z.number().min(1).max(4).default(2),
    lineStyle: AvwapLineStyleSchema.default('SOLID'),
    lineOpacity: z.number().min(10).max(100).default(100),
    bandsEnabled: z.boolean().default(true),
    bandMode: z.enum(['STD_DEV', 'PERCENTAGE']).default('STD_DEV'),
    fillBands: z.boolean().default(false),
    bandFillOpacity: z.number().min(0).max(100).default(15),
    bandFillsColor: z.string().default('rgba(50, 174, 244, 0.15)'),
    band1: AvwapBandConfigSchema.default({
        enabled: true,
        multiplier: 1.0,
        color: 'rgba(115, 190, 235, 0.70)',
        lineWidth: 1,
        lineStyle: 'DASHED',
    }),
    band2: AvwapBandConfigSchema.default({
        enabled: true,
        multiplier: 2.0,
        color: 'rgba(115, 190, 235, 0.45)',
        lineWidth: 1,
        lineStyle: 'DASHED',
    }),
    band3: AvwapBandConfigSchema.default({
        enabled: false,
        multiplier: 3.0,
        color: 'rgba(115, 190, 235, 0.25)',
        lineWidth: 1,
        lineStyle: 'DOTTED',
    }),
    showAnchorMarker: z.boolean().default(true),
    showLabel: z.boolean().default(true),
    locked: z.boolean().default(false),
});
export type AvwapSettings = z.infer<typeof AvwapSettingsSchema>;

export const DEFAULT_AVWAP_SETTINGS: AvwapSettings = AvwapSettingsSchema.parse({});

export const AVWAP_SETTINGS_STORAGE_KEY = 'btc-terminal-avwap-settings-v2';

let memoryStorage: Record<string, string> = {};

export function loadPersistedAvwapSettings(): AvwapSettings {
    try {
        const raw = typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem(AVWAP_SETTINGS_STORAGE_KEY)
            : memoryStorage[AVWAP_SETTINGS_STORAGE_KEY];
        if (!raw) return DEFAULT_AVWAP_SETTINGS;
        const parsed = JSON.parse(raw);
        return AvwapSettingsSchema.parse(parsed);
    } catch {
        return DEFAULT_AVWAP_SETTINGS;
    }
}

export function savePersistedAvwapSettings(settings: AvwapSettings): void {
    const payload = JSON.stringify(settings);
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(AVWAP_SETTINGS_STORAGE_KEY, payload);
        } else {
            memoryStorage[AVWAP_SETTINGS_STORAGE_KEY] = payload;
        }
    } catch {
        memoryStorage[AVWAP_SETTINGS_STORAGE_KEY] = payload;
    }
}

/**
 * Extracts the calculation price from a candle according to priceSource.
 */
export function getBarPriceBySource(
    bar: { open: number; high: number; low: number; close: number },
    source: AvwapPriceSource = 'HLC3'
): number {
    switch (source) {
        case 'HLC3':
            return (bar.high + bar.low + bar.close) / 3;
        case 'HL2':
            return (bar.high + bar.low) / 2;
        case 'OHLC4':
            return (bar.open + bar.high + bar.low + bar.close) / 4;
        case 'CLOSE':
            return bar.close;
        case 'OPEN':
            return bar.open;
        default:
            return (bar.high + bar.low + bar.close) / 3;
    }
}

/**
 * Finds the swing high in the search window.
 */
export function findRecentSwingHighIndex(bars: readonly { high: number }[], searchWindow = 60): number {
    const len = bars.length;
    if (len === 0) return 0;
    const end = len - 1;
    const start = Math.max(0, end - searchWindow);
    let maxHigh = -Infinity;
    let maxIdx = Math.max(0, end - 35);
    for (let i = start; i <= end - 5; i++) {
        if (bars[i].high > maxHigh) {
            maxHigh = bars[i].high;
            maxIdx = i;
        }
    }
    return maxIdx;
}
