import { z } from 'zod';

export const LiquidityDensityModeSchema = z.enum(['FOCUSED', 'FULL']);
export type LiquidityDensityMode = z.infer<typeof LiquidityDensityModeSchema>;

export const LiquidityColorThemeSchema = z.enum(['GRAPHITE_AMBER', 'GRAYSCALE']);
export type LiquidityColorTheme = z.infer<typeof LiquidityColorThemeSchema>;

export const LiquiditySurfaceLevelSchema = z.object({
    side: z.enum(['BID', 'ASK']),
    price: z.number().positive(),
    quantity: z.number().nonnegative(),
    notionalUsd: z.number().nonnegative(),
    persistent: z.boolean().default(false),
});
export type LiquiditySurfaceLevel = z.infer<typeof LiquiditySurfaceLevelSchema>;

export const LiquiditySurfaceBucketSchema = z.object({
    bucketStart: z.number().int().nonnegative(),
    bucketEnd: z.number().int().nonnegative(),
    midPrice: z.number().positive(),
    bestBid: z.number().positive(),
    bestAsk: z.number().positive(),
    levels: z.array(LiquiditySurfaceLevelSchema),
    totalDepthNotionalUsd: z.number().nonnegative(),
});
export type LiquiditySurfaceBucket = z.infer<typeof LiquiditySurfaceBucketSchema>;

export const LiquiditySurfaceSettingsSchema = z.object({
    densityMode: LiquidityDensityModeSchema.default('FOCUSED'),
    colorTheme: LiquidityColorThemeSchema.default('GRAPHITE_AMBER'),
    minPercentile: z.number().min(0).max(1).default(0.80),
    highPercentile: z.number().min(0).max(1).default(0.90),
    opacity: z.number().min(0.05).max(1).default(0.65),
    contrast: z.number().min(0.5).max(3.0).default(1.2),
    focusedBpsRange: z.number().positive().default(200), // +/- 200 bps for FOCUSED mode
    priceGroupingStep: z.number().positive().default(10), // $10 grouping
    paused: z.boolean().default(false),
});
export type LiquiditySurfaceSettings = z.infer<typeof LiquiditySurfaceSettingsSchema>;

export interface ProjectedLiquiditySurfaceCell {
    x: number;
    y: number;
    width: number;
    height: number;
    intensity: number;
    side: 'BID' | 'ASK';
    price: number;
    notionalUsd: number;
    bucketStart: number;
    persistent: boolean;
}

export interface LiquiditySurfaceProjectionOptions {
    width: number;
    height: number;
    timeToX: (timeSeconds: number) => number | null;
    priceToY: (price: number) => number | null;
    settings?: Partial<LiquiditySurfaceSettings>;
    maxColumns?: number;
    maxLevelsPerColumn?: number;
}
