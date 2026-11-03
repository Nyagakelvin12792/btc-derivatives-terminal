'use client';

import React, { useEffect, useRef } from 'react';
import type { LiquidityHeatmapFrame, LiquiditySequenceState } from '../../lib/binance/types';
import type {
    LiquidityDensityMode,
    LiquiditySurfaceSettings,
    ProjectedLiquiditySurfaceCell,
} from '../../lib/binance/liquidity-surface-contracts';
import { cn } from '../../lib/ui/cn';

const MAX_VISIBLE_COLUMNS = 120;
const MAX_LEVELS_PER_COLUMN = 36;
const HEATMAP_LEFT_FRACTION = 0.52;
const HEATMAP_RIGHT_PADDING = 64;

export interface LiquidityHeatmapCell {
    x: number;
    y: number;
    width: number;
    height: number;
    intensity: number;
    side: 'BID' | 'ASK';
    latest: boolean;
    price?: number;
    notionalUsd?: number;
    persistent?: boolean;
}

export interface LiquidityHeatmapProjectionOptions {
    width: number;
    height: number;
    priceToY: (price: number) => number | null;
    timeToX?: (timeSeconds: number) => number | null;
    maxColumns?: number;
    maxLevelsPerColumn?: number;
    timeframeSeconds?: number;
    densityMode?: LiquidityDensityMode;
    minPercentile?: number;
    contrast?: number;
}

export interface LiquiditySurfaceV2ProjectionOptions {
    width: number;
    height: number;
    timeToX: (timeSeconds: number) => number | null;
    priceToY: (price: number) => number | null;
    settings?: Partial<LiquiditySurfaceSettings>;
    maxColumns?: number;
    maxLevelsPerColumn?: number;
    timeframeSeconds?: number;
}

/**
 * Projects historical depth frames directly onto chart coordinates (X = time, Y = price).
 * Complies with UX16.3:
 * - Heatmap X coordinates match chart event times.
 * - Heatmap Y coordinates match the price scale through pan/zoom/resize.
 * - No right-side rectangular strip.
 * - Sequence gaps produce honest visual whitespace.
 * - Neutral graphite-to-amber sequential ramp (no green/red).
 * - Focused vs Full density filtering.
 */
export function projectLiquiditySurfaceV2(
    frames: readonly LiquidityHeatmapFrame[],
    options: LiquiditySurfaceV2ProjectionOptions,
): ProjectedLiquiditySurfaceCell[] {
    const { width, height, timeToX, priceToY } = options;
    if (!frames.length || width <= 0 || height <= 0) return [];

    const densityMode = options.settings?.densityMode ?? 'FOCUSED';
    const minPercentile = options.settings?.minPercentile ?? 0.80;
    const contrast = options.settings?.contrast ?? 1.2;
    const maxLevels = Math.max(1, Math.floor(options.maxLevelsPerColumn ?? MAX_LEVELS_PER_COLUMN));
    const timeframeSec = options.timeframeSeconds ?? 60;

    // Filter frames visible in viewport
    const visibleFrames = frames.filter((frame) => {
        const timeSec = Math.floor(frame.eventTime / 1000);
        const x = timeToX(timeSec);
        return x !== null && x >= -80 && x <= width + 80;
    });

    if (!visibleFrames.length) return [];

    // Filter levels by density mode (FOCUSED keeps +/- 200 bps from mid)
    const bpsLimit = (options.settings?.focusedBpsRange ?? 200) / 10_000;
    const filteredLevelsPerFrame = visibleFrames.map((frame) => {
        const mid = frame.midPrice;
        const valid = frame.levels.filter((level) => {
            if (!Number.isFinite(level.notionalUsd) || level.notionalUsd <= 0) return false;
            if (densityMode === 'FOCUSED') {
                const distanceRatio = Math.abs(level.price - mid) / mid;
                if (distanceRatio > bpsLimit) return false;
            }
            return true;
        });
        return { frame, levels: valid };
    });

    // Compute robust percentile cutoff across all visible levels
    const allNotionals = filteredLevelsPerFrame
        .flatMap((item) => item.levels.map((lvl) => lvl.notionalUsd))
        .sort((a, b) => a - b);

    if (!allNotionals.length) return [];

    const cutoffIndex = Math.min(allNotionals.length - 1, Math.floor(allNotionals.length * minPercentile));
    const minNotional = allNotionals[cutoffIndex] || 1;
    const highIndex = Math.min(allNotionals.length - 1, Math.floor(allNotionals.length * 0.98));
    const robustMax = Math.max(allNotionals[highIndex], minNotional + 1);

    return filteredLevelsPerFrame.flatMap(({ frame, levels }) => {
        const timeSec = Math.floor(frame.eventTime / 1000);
        const x = timeToX(timeSec);
        if (x === null) return [];

        const nextX = timeToX(timeSec + timeframeSec);
        const colWidth = nextX !== null && nextX > x ? Math.max(1.5, nextX - x) : 6;

        return levels
            .filter((lvl) => lvl.notionalUsd >= minNotional)
            .sort((a, b) => b.notionalUsd - a.notionalUsd)
            .slice(0, maxLevels)
            .flatMap((level) => {
                const y = priceToY(level.price);
                if (y === null || y < -4 || y > height + 4) return [];

                // Normalization: log1p scaled by contrast
                const normalized = Math.min(1, Math.log1p(level.notionalUsd) / Math.log1p(robustMax));
                const intensity = Math.min(1, Math.pow(normalized, 1 / contrast));

                return [{
                    x,
                    y,
                    width: colWidth,
                    height: 2.8,
                    intensity,
                    side: level.side,
                    price: level.price,
                    notionalUsd: level.notionalUsd,
                    bucketStart: frame.eventTime,
                    persistent: level.notionalUsd >= robustMax * 0.85,
                } satisfies ProjectedLiquiditySurfaceCell];
            });
    });
}

/**
 * Projects bounded depth frames.
 * If timeToX is provided, uses V2 chart-aligned coordinates;
 * otherwise preserves legacy right-side session strip for backward compatibility.
 */
export function projectLiquidityHeatmapFrames(
    frames: readonly LiquidityHeatmapFrame[],
    options: LiquidityHeatmapProjectionOptions,
): LiquidityHeatmapCell[] {
    const { width, height, priceToY, timeToX } = options;
    if (!frames.length || width <= 0 || height <= 0) return [];

    // If timeToX is provided, map through V2 time coordinates
    if (typeof timeToX === 'function') {
        const v2Cells = projectLiquiditySurfaceV2(frames, {
            width,
            height,
            timeToX,
            priceToY,
            timeframeSeconds: options.timeframeSeconds,
            settings: {
                densityMode: options.densityMode ?? 'FOCUSED',
                minPercentile: options.minPercentile ?? 0.80,
                contrast: options.contrast ?? 1.2,
            },
            maxColumns: options.maxColumns,
            maxLevelsPerColumn: options.maxLevelsPerColumn,
        });

        const latestTime = frames.at(-1)?.eventTime ?? 0;
        return v2Cells.map((cell) => ({
            x: cell.x,
            y: cell.y,
            width: cell.width,
            height: cell.height,
            intensity: cell.intensity,
            side: cell.side,
            latest: Math.abs(cell.bucketStart - latestTime) < 5_000,
            price: cell.price,
            notionalUsd: cell.notionalUsd,
            persistent: cell.persistent,
        }));
    }

    // Legacy fallback: right-side session strip
    const maxColumns = Math.max(1, Math.floor(options.maxColumns ?? MAX_VISIBLE_COLUMNS));
    const maxLevels = Math.max(1, Math.floor(options.maxLevelsPerColumn ?? MAX_LEVELS_PER_COLUMN));
    const stride = Math.max(1, Math.ceil(frames.length / maxColumns));
    const columns = frames.filter((_, index) => index % stride === 0 || index === frames.length - 1).slice(-maxColumns);
    const visibleLevels = columns.flatMap((frame) => frame.levels
        .filter((level) => Number.isFinite(level.notionalUsd) && level.notionalUsd > 0)
        .sort((left, right) => right.notionalUsd - left.notionalUsd)
        .slice(0, maxLevels));
    if (!visibleLevels.length) return [];

    const orderedNotionals = visibleLevels.map((level) => level.notionalUsd).sort((left, right) => left - right);
    const robustIndex = Math.min(orderedNotionals.length - 1, Math.floor(orderedNotionals.length * 0.98));
    const robustMax = Math.max(orderedNotionals[robustIndex], 1);
    const left = width * HEATMAP_LEFT_FRACTION;
    const plotWidth = Math.max(1, width - left - HEATMAP_RIGHT_PADDING);
    const columnWidth = Math.max(1.25, plotWidth / Math.max(columns.length, 1));

    return columns.flatMap((frame, columnIndex) => {
        const x = left + columnIndex * columnWidth;
        const latest = columnIndex === columns.length - 1;
        return frame.levels
            .filter((level) => Number.isFinite(level.notionalUsd) && level.notionalUsd > 0)
            .sort((leftLevel, rightLevel) => rightLevel.notionalUsd - leftLevel.notionalUsd)
            .slice(0, maxLevels)
            .flatMap((level) => {
                const y = priceToY(level.price);
                if (y === null || y < -2 || y > height + 2) return [];
                const intensity = Math.min(1, Math.log1p(level.notionalUsd) / Math.log1p(robustMax));
                return [{
                    x,
                    y,
                    width: latest ? columnWidth + 18 : columnWidth + 0.5,
                    height: 2.4,
                    intensity,
                    side: level.side,
                    latest,
                    price: level.price,
                    notionalUsd: level.notionalUsd,
                } satisfies LiquidityHeatmapCell];
            });
    });
}

export interface LiquidityHeatmapOverlayProps {
    cells: readonly LiquidityHeatmapCell[];
    width: number;
    height: number;
    state: LiquiditySequenceState;
    connected: boolean;
    paused: boolean;
    frameCount: number;
    warmupPercent: number;
    errorMessage?: string | null;
    densityMode?: LiquidityDensityMode;
    onToggleDensityMode?: () => void;
}

function stateTone(state: LiquiditySequenceState, connected: boolean, paused: boolean) {
    if (paused) return 'border-amber-400/40 bg-amber-400/10 text-amber-300';
    if (state === 'LIVE' && connected) return 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200';
    if (state === 'BUFFERING') return 'border-amber-400/35 bg-amber-400/10 text-amber-200';
    if (state === 'GAP' || state === 'OFFLINE') return 'border-rose-400/35 bg-rose-400/10 text-rose-200';
    return 'border-sky-400/35 bg-sky-400/10 text-sky-200';
}

export default function LiquidityHeatmapOverlay({
    cells,
    width,
    height,
    state,
    connected,
    paused,
    frameCount,
    warmupPercent,
    errorMessage,
    densityMode = 'FOCUSED',
    onToggleDensityMode,
}: LiquidityHeatmapOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);

        // Subordinate blending beneath candles: neutral graphite-to-amber ramp
        context.globalCompositeOperation = 'source-over';

        for (const cell of cells) {
            // Sequential graphite-to-amber ramp
            // Low intensity -> subtle slate/graphite
            // High intensity -> glowing amber (#E5A83B)
            const alpha = Math.min(0.75, 0.08 + Math.pow(cell.intensity, 1.3) * 0.62);

            if (cell.intensity > 0.85) {
                // High liquidity concentration: Amber
                context.fillStyle = `rgba(229, 168, 59, ${alpha})`;
            } else if (cell.intensity > 0.5) {
                // Moderate liquidity: Bronze/Ochre
                context.fillStyle = `rgba(180, 130, 45, ${alpha * 0.85})`;
            } else {
                // Baseline liquidity: Graphite/Slate
                context.fillStyle = `rgba(50, 65, 85, ${alpha * 0.7})`;
            }

            context.fillRect(cell.x, cell.y - cell.height / 2, cell.width, cell.height);

            // Subtle outline for persistent resting walls
            if (cell.persistent) {
                context.strokeStyle = `rgba(245, 190, 65, ${alpha * 0.9})`;
                context.lineWidth = 0.75;
                context.strokeRect(cell.x, cell.y - cell.height / 2, cell.width, cell.height);
            }
        }
    }, [cells, height, width]);

    const status = paused ? 'PAUSED' : state;
    return (
        <div
            className="pointer-events-none absolute inset-0 z-[12] overflow-hidden"
            data-testid="liquidity-heatmap"
            data-state={status}
            data-frame-count={frameCount}
            data-cell-count={cells.length}
            data-density-mode={densityMode}
            aria-label={`Liquidity surface ${status.toLowerCase()}, ${frameCount} retained frames, ${densityMode.toLowerCase()} density`}
        >
            <canvas ref={canvasRef} className="absolute inset-0 size-full opacity-80" aria-hidden="true" />
            <div
                className={cn(
                    'absolute right-16 top-10 flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[8px] font-semibold shadow-sm backdrop-blur-sm pointer-events-auto',
                    stateTone(state, connected, paused),
                )}
                title={errorMessage ?? 'Sequence-validated Binance Spot historical depth. Aligned to chart time and price.'}
            >
                <span>LIQUIDITY {status}</span>
                <span className="opacity-65">·</span>
                <span>{frameCount.toLocaleString()} FR</span>
                <span className="opacity-65">·</span>
                <span>{Math.round(warmupPercent)}%</span>
                {onToggleDensityMode && (
                    <>
                        <span className="opacity-65">·</span>
                        <button
                            type="button"
                            onClick={onToggleDensityMode}
                            className="rounded bg-[#18212C] px-1 py-0.2 hover:text-white"
                            data-testid="toggle-liquidity-density"
                        >
                            {densityMode}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
