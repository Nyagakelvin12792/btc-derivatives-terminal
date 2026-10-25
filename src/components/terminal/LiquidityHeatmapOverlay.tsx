'use client';

import React, { useEffect, useRef } from 'react';
import type { LiquidityHeatmapFrame, LiquiditySequenceState } from '../../lib/binance/types';
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
}

export interface LiquidityHeatmapProjectionOptions {
    width: number;
    height: number;
    priceToY: (price: number) => number | null;
    maxColumns?: number;
    maxLevelsPerColumn?: number;
}

/**
 * Projects bounded, sequence-validated depth frames into a compact session strip.
 * X represents retained session order (oldest to newest), not candle history.
 */
export function projectLiquidityHeatmapFrames(
    frames: readonly LiquidityHeatmapFrame[],
    options: LiquidityHeatmapProjectionOptions,
): LiquidityHeatmapCell[] {
    const { width, height, priceToY } = options;
    if (!frames.length || width <= 0 || height <= 0) return [];

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
                } satisfies LiquidityHeatmapCell];
            });
    });
}

interface LiquidityHeatmapOverlayProps {
    cells: readonly LiquidityHeatmapCell[];
    width: number;
    height: number;
    state: LiquiditySequenceState;
    connected: boolean;
    paused: boolean;
    frameCount: number;
    warmupPercent: number;
    errorMessage?: string | null;
}

function stateTone(state: LiquiditySequenceState, connected: boolean) {
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
        context.globalCompositeOperation = 'lighter';

        for (const cell of cells) {
            const alpha = Math.min(0.78, 0.05 + Math.pow(cell.intensity, 1.45) * (cell.latest ? 0.68 : 0.48));
            context.fillStyle = cell.side === 'BID'
                ? `rgba(20, 236, 174, ${alpha})`
                : `rgba(255, 82, 112, ${alpha})`;
            context.fillRect(cell.x, cell.y - cell.height / 2, cell.width, cell.height);
        }
        context.globalCompositeOperation = 'source-over';
    }, [cells, height, width]);

    const status = paused ? 'PAUSED' : state;
    return (
        <div
            className="pointer-events-none absolute inset-0 z-[15] overflow-hidden"
            data-testid="liquidity-heatmap"
            data-state={status}
            data-frame-count={frameCount}
            data-cell-count={cells.length}
            aria-label={`Liquidity heatmap ${status.toLowerCase()}, ${frameCount} retained frames`}
        >
            <canvas ref={canvasRef} className="absolute inset-0 size-full opacity-90" aria-hidden="true" />
            <div
                className={cn(
                    'absolute right-16 top-10 flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[8px] font-semibold shadow-sm backdrop-blur-sm',
                    stateTone(state, connected),
                )}
                title={errorMessage ?? 'Session-local Binance Spot depth. History begins when this browser session connects.'}
            >
                <span>LIQUIDITY {status}</span>
                <span className="opacity-65">·</span>
                <span>{frameCount.toLocaleString()} FR</span>
                <span className="opacity-65">·</span>
                <span>{Math.round(warmupPercent)}%</span>
            </div>
        </div>
    );
}
