'use client';

import React, { useEffect, useRef } from 'react';
import type { SegmentedFootprintBarV1, TradeVolumeProfileV1 } from '../../lib/orderflow/true-flow-contracts';
import type { FootprintZoomLevel } from './FootprintChartOverlay';
import { cn } from '../../lib/ui/cn';

export interface ProjectedCandleFootprintCell {
    priceLow: number;
    priceHigh: number;
    priceMid: number;
    yTop: number;
    yBottom: number;
    yMid: number;
    buyVolumeBtc: number;
    sellVolumeBtc: number;
    buyNotionalUsd: number;
    sellNotionalUsd: number;
    totalNotionalUsd: number;
    deltaNotionalUsd: number;
    isPoc: boolean;
    buyImbalance: boolean;
    sellImbalance: boolean;
}

export interface ProjectedCandleFootprintBar {
    openTime: number;
    segmentId: string;
    xCenter: number;
    columnWidth: number;
    deltaNotionalUsd: number;
    totalNotionalUsd: number;
    pocPrice: number | null;
    maxCellVolumeBtc: number;
    cells: ProjectedCandleFootprintCell[];
}

export interface ProjectedTradeVpRow {
    priceLow: number;
    priceHigh: number;
    priceMid: number;
    yTop: number;
    yBottom: number;
    yMid: number;
    buyVolumeBtc: number;
    sellVolumeBtc: number;
    totalNotionalUsd: number;
    isPoc: boolean;
    inValueArea: boolean;
}

export interface ProjectedTradeVpLayout {
    rows: ProjectedTradeVpRow[];
    maxVolumeBtc: number;
    pocPrice: number | null;
    pocY: number | null;
    vahPrice: number | null;
    vahY: number | null;
    valPrice: number | null;
    valY: number | null;
    coverageKind: TradeVolumeProfileV1['coverageKind'];
    tradeCount: number;
    totalNotionalUsd: number;
}

export interface CandleFootprintProjectionOptions {
    width: number;
    height: number;
    timeframeSeconds: number;
    timeToX: (timeSeconds: number) => number | null;
    priceToY: (price: number) => number | null;
}

/**
 * Projects segmented footprint bars directly onto the main price chart's
 * time (X) and price (Y) coordinate system (ATAS / NinjaTrader style).
 */
export function projectFootprintBarsToChart(
    bars: readonly SegmentedFootprintBarV1[],
    options: CandleFootprintProjectionOptions,
): ProjectedCandleFootprintBar[] {
    const { width, height, timeframeSeconds, timeToX, priceToY } = options;
    if (!bars.length || width <= 0 || height <= 0) return [];

    return bars.flatMap((segBar) => {
        const fp = segBar.footprint;
        if (!fp.cells.length) return [];

        const timeSec = Math.floor(fp.openTime / 1_000);
        const xCenter = timeToX(timeSec);
        if (xCenter === null || xCenter < -120 || xCenter > width + 120) return [];

        const nextX = timeToX(timeSec + timeframeSeconds);
        const prevX = timeToX(timeSec - timeframeSeconds);
        const spacing = nextX !== null && nextX > xCenter
            ? nextX - xCenter
            : prevX !== null && xCenter > prevX
                ? xCenter - prevX
                : 48;

        const columnWidth = Math.max(18, Math.min(140, spacing * 0.88));
        const maxCellVolumeBtc = Math.max(
            ...fp.cells.map((c) => Math.max(c.buyVolumeBtc, c.sellVolumeBtc)),
            0.0001,
        );

        const projectedCells: ProjectedCandleFootprintCell[] = fp.cells.flatMap((cell) => {
            const yHigh = priceToY(cell.priceHigh);
            const yLow = priceToY(cell.priceLow);
            const yMid = priceToY(cell.priceMid);
            if (yMid === null) return [];

            const rawTop = yHigh !== null ? Math.min(yHigh, yLow ?? yHigh) : yMid - 7;
            const rawBottom = yLow !== null ? Math.max(yLow, yHigh ?? yLow) : yMid + 7;
            const cellHeight = Math.max(8, Math.min(32, rawBottom - rawTop));
            const yTop = yMid - cellHeight / 2;
            const yBottom = yMid + cellHeight / 2;

            if (yBottom < -20 || yTop > height + 20) return [];

            const isPoc = fp.pocPrice !== null && (
                Math.abs(cell.priceMid - fp.pocPrice) < 0.001 ||
                (cell.priceLow <= fp.pocPrice && cell.priceHigh >= fp.pocPrice)
            );

            return [{
                priceLow: cell.priceLow,
                priceHigh: cell.priceHigh,
                priceMid: cell.priceMid,
                yTop,
                yBottom,
                yMid,
                buyVolumeBtc: cell.buyVolumeBtc,
                sellVolumeBtc: cell.sellVolumeBtc,
                buyNotionalUsd: cell.buyNotionalUsd,
                sellNotionalUsd: cell.sellNotionalUsd,
                totalNotionalUsd: cell.totalNotionalUsd,
                deltaNotionalUsd: cell.deltaNotionalUsd,
                isPoc,
                buyImbalance: cell.buyImbalance,
                sellImbalance: cell.sellImbalance,
            }];
        });

        if (!projectedCells.length) return [];

        return [{
            openTime: fp.openTime,
            segmentId: segBar.segmentId,
            xCenter,
            columnWidth,
            deltaNotionalUsd: fp.deltaNotionalUsd,
            totalNotionalUsd: fp.totalNotionalUsd,
            pocPrice: fp.pocPrice,
            maxCellVolumeBtc,
            cells: projectedCells,
        }];
    });
}

/**
 * Projects captured trade volume profile rows directly onto the main chart's Y price axis.
 */
export function projectTradeVolumeProfileToChart(
    profile: TradeVolumeProfileV1 | null | undefined,
    priceToY: (price: number) => number | null,
    height: number,
): ProjectedTradeVpLayout | null {
    if (!profile || !profile.rows.length || height <= 0) return null;

    const maxVolumeBtc = Math.max(
        ...profile.rows.map((r) => r.buyVolumeBtc + r.sellVolumeBtc),
        0.0001,
    );

    const rows: ProjectedTradeVpRow[] = profile.rows.flatMap((row) => {
        const yHigh = priceToY(row.priceHigh);
        const yLow = priceToY(row.priceLow);
        const yMid = priceToY(row.priceMid);
        if (yMid === null) return [];

        const rawTop = yHigh !== null ? Math.min(yHigh, yLow ?? yHigh) : yMid - 5;
        const rawBottom = yLow !== null ? Math.max(yLow, yHigh ?? yLow) : yMid + 5;
        const rowH = Math.max(5, Math.min(28, rawBottom - rawTop));
        const yTop = yMid - rowH / 2;
        const yBottom = yMid + rowH / 2;

        if (yBottom < -20 || yTop > height + 20) return [];

        const isPoc = profile.pocPrice !== null && Math.abs(row.priceMid - profile.pocPrice) < 0.001;
        const inValueArea = profile.vahPrice !== null
            && profile.valPrice !== null
            && row.priceMid >= profile.valPrice
            && row.priceMid <= profile.vahPrice;

        return [{
            priceLow: row.priceLow,
            priceHigh: row.priceHigh,
            priceMid: row.priceMid,
            yTop,
            yBottom,
            yMid,
            buyVolumeBtc: row.buyVolumeBtc,
            sellVolumeBtc: row.sellVolumeBtc,
            totalNotionalUsd: row.totalNotionalUsd,
            isPoc,
            inValueArea,
        }];
    });

    return {
        rows,
        maxVolumeBtc,
        pocPrice: profile.pocPrice,
        pocY: profile.pocPrice !== null ? priceToY(profile.pocPrice) : null,
        vahPrice: profile.vahPrice,
        vahY: profile.vahPrice !== null ? priceToY(profile.vahPrice) : null,
        valPrice: profile.valPrice,
        valY: profile.valPrice !== null ? priceToY(profile.valPrice) : null,
        coverageKind: profile.coverageKind,
        tradeCount: profile.totals.tradeCount,
        totalNotionalUsd: profile.totals.totalNotionalUsd,
    };
}

function formatVol(val: number): string {
    if (val === 0) return '0';
    if (val >= 100) return val.toFixed(0);
    if (val >= 10) return val.toFixed(1);
    if (val >= 1) return val.toFixed(2);
    return val.toFixed(3);
}

function formatUsdCompact(val: number): string {
    const sign = val > 0 ? '+' : val < 0 ? '−' : '';
    const abs = Math.abs(val);
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

export interface CandleFootprintCanvasOverlayProps {
    projectedBars: ProjectedCandleFootprintBar[];
    projectedTradeVp: ProjectedTradeVpLayout | null;
    showFootprint: boolean;
    showTradeVp: boolean;
    width: number;
    height: number;
    zoomMode?: 'AUTO' | FootprintZoomLevel;
    onCycleZoomMode?: () => void;
    tradeVpPlacement?: 'LEFT' | 'RIGHT';
    onToggleTradeVpPlacement?: () => void;
    overlayOpacity?: number;
    onOverlayOpacityChange?: (opacity: number) => void;
}

export default function CandleFootprintCanvasOverlay({
    projectedBars,
    projectedTradeVp,
    showFootprint,
    showTradeVp,
    width,
    height,
    zoomMode = 'AUTO',
    onCycleZoomMode,
    tradeVpPlacement = 'RIGHT',
    onToggleTradeVpPlacement,
    overlayOpacity = 85,
    onOverlayOpacityChange,
}: CandleFootprintCanvasOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastAutomaticZoom = useRef<FootprintZoomLevel>('OVERVIEW');

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = Math.max(0.1, Math.min(1, overlayOpacity / 100));

        // 1. Draw ATAS/NinjaTrader-style Captured Trade Volume Profile on the right or left price axis
        if (showTradeVp && projectedTradeVp && projectedTradeVp.rows.length > 0) {
            const rightEdge = Math.max(60, width - 64);
            const leftEdge = 8;
            const maxBarWidth = Math.min(200, Math.max(85, width * 0.16));
            const isLeft = tradeVpPlacement === 'LEFT';

            for (const row of projectedTradeVp.rows) {
                const totalBtc = row.buyVolumeBtc + row.sellVolumeBtc;
                const widthRatio = Math.min(1, totalBtc / projectedTradeVp.maxVolumeBtc);
                const totalW = Math.max(3, widthRatio * maxBarWidth);
                const sellFraction = totalBtc > 0 ? row.sellVolumeBtc / totalBtc : 0.5;
                const sellW = totalW * sellFraction;
                const buyW = totalW - sellW;
                const cellH = Math.max(3, row.yBottom - row.yTop - 1);
                const xStart = isLeft ? leftEdge : rightEdge - totalW;

                // Sell portion
                ctx.fillStyle = row.isPoc
                    ? 'rgba(240, 97, 82, 0.72)'
                    : row.inValueArea
                        ? 'rgba(224, 99, 121, 0.45)'
                        : 'rgba(224, 99, 121, 0.22)';
                ctx.fillRect(xStart, row.yTop, sellW, cellH);

                // Buy portion
                ctx.fillStyle = row.isPoc
                    ? 'rgba(44, 199, 160, 0.78)'
                    : row.inValueArea
                        ? 'rgba(44, 199, 160, 0.50)'
                        : 'rgba(44, 199, 160, 0.25)';
                ctx.fillRect(xStart + sellW, row.yTop, buyW, cellH);

                if (row.isPoc) {
                    ctx.strokeStyle = 'rgba(229, 168, 59, 0.95)';
                    ctx.lineWidth = 1.25;
                    ctx.strokeRect(xStart, row.yTop, totalW, cellH);
                }
            }

            // Draw Trade VP POC / VAH / VAL horizontal guide lines across the profile zone
            const drawLevelLine = (y: number | null, label: string, color: string) => {
                if (y === null || y < 0 || y > height) return;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                if (isLeft) {
                    ctx.moveTo(leftEdge, y);
                    ctx.lineTo(leftEdge + maxBarWidth + 16, y);
                } else {
                    ctx.moveTo(rightEdge - maxBarWidth - 16, y);
                    ctx.lineTo(rightEdge, y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#070A0F';
                if (isLeft) {
                    ctx.fillRect(leftEdge + 2, y - 10, 72, 10);
                    ctx.fillStyle = color;
                    ctx.font = 'bold 8px ui-monospace, monospace';
                    ctx.textAlign = 'left';
                    ctx.fillText(label, leftEdge + 4, y - 2);
                } else {
                    ctx.fillRect(rightEdge - 74, y - 10, 72, 10);
                    ctx.fillStyle = color;
                    ctx.font = 'bold 8px ui-monospace, monospace';
                    ctx.textAlign = 'right';
                    ctx.fillText(label, rightEdge - 4, y - 2);
                }
                ctx.restore();
            };

            if (projectedTradeVp.pocPrice !== null) {
                drawLevelLine(projectedTradeVp.pocY, `T-POC ${projectedTradeVp.pocPrice.toFixed(0)}`, '#E5A83B');
            }
            if (projectedTradeVp.vahPrice !== null) {
                drawLevelLine(projectedTradeVp.vahY, `T-VAH ${projectedTradeVp.vahPrice.toFixed(0)}`, '#39A9F5');
            }
            if (projectedTradeVp.valPrice !== null) {
                drawLevelLine(projectedTradeVp.valY, `T-VAL ${projectedTradeVp.valPrice.toFixed(0)}`, '#39A9F5');
            }
        }

        // 2. Draw ATAS/NinjaTrader-style Footprint clusters directly on each candle
        if (showFootprint && projectedBars.length > 0) {
            const previous = lastAutomaticZoom.current;
            const column = projectedBars[Math.floor(projectedBars.length / 2)].columnWidth;
            const autoZoom = column >= (previous === 'DETAILED' ? 48 : 54) ? 'DETAILED'
                : column >= (previous === 'OVERVIEW' ? 28 : 24) ? 'COMPACT' : 'OVERVIEW';
            lastAutomaticZoom.current = autoZoom;
            const effectiveZoom = zoomMode === 'AUTO' ? autoZoom : zoomMode;
            for (const bar of projectedBars) {
                const halfW = bar.columnWidth / 2;
                const xLeft = bar.xCenter - halfW;
                const xRight = bar.xCenter + halfW;

                // Find top and bottom of the bar cluster
                const minY = Math.min(...bar.cells.map((c) => c.yTop));
                const maxY = Math.max(...bar.cells.map((c) => c.yBottom));

                if (effectiveZoom === 'OVERVIEW') {
                    if (bar.cells.some((cell) => cell.buyImbalance || cell.sellImbalance)) {
                        ctx.fillStyle = bar.deltaNotionalUsd >= 0 ? '#2CC7A0' : '#E06379';
                        ctx.fillRect(bar.xCenter - 2, maxY + 3, 4, 3);
                    }
                    continue;
                }

                // Subtle cluster container background
                ctx.fillStyle = 'rgba(7, 10, 15, 0.78)';
                ctx.fillRect(xLeft, minY - 1, bar.columnWidth, Math.max(4, maxY - minY + 2));
                ctx.strokeStyle = 'rgba(57, 169, 245, 0.28)';
                ctx.lineWidth = 0.75;
                ctx.strokeRect(xLeft, minY - 1, bar.columnWidth, Math.max(4, maxY - minY + 2));

                for (const cell of bar.cells) {
                    const cellH = Math.max(6, cell.yBottom - cell.yTop - 0.5);
                    const sellRatio = Math.min(1, cell.sellVolumeBtc / bar.maxCellVolumeBtc);
                    const buyRatio = Math.min(1, cell.buyVolumeBtc / bar.maxCellVolumeBtc);

                    const sellBarW = Math.max(1.5, sellRatio * (halfW - 2));
                    const buyBarW = Math.max(1.5, buyRatio * (halfW - 2));

                    // Left side of candle spine = Sell volume (Bid hits, red)
                    ctx.fillStyle = cell.sellImbalance
                        ? 'rgba(240, 97, 82, 0.58)'
                        : 'rgba(224, 99, 121, 0.30)';
                    ctx.fillRect(bar.xCenter - sellBarW - 1, cell.yTop, sellBarW, cellH);

                    // Right side of candle spine = Buy volume (Ask lifts, emerald)
                    ctx.fillStyle = cell.buyImbalance
                        ? 'rgba(44, 199, 160, 0.58)'
                        : 'rgba(44, 199, 160, 0.30)';
                    ctx.fillRect(bar.xCenter + 1, cell.yTop, buyBarW, cellH);

                    // Center divider spine
                    ctx.fillStyle = 'rgba(131, 144, 160, 0.35)';
                    ctx.fillRect(bar.xCenter - 0.5, cell.yTop, 1, cellH);

                    // POC Golden Box outline (ATAS style)
                    if (cell.isPoc) {
                        ctx.strokeStyle = '#E5A83B';
                        ctx.lineWidth = 1.4;
                        ctx.strokeRect(xLeft + 0.5, cell.yTop + 0.5, bar.columnWidth - 1, cellH - 1);
                    }

                    // Numbers inside each price cell (Sell x Buy)
                    if (effectiveZoom === 'DETAILED' && cellH >= 8) {
                        ctx.font = `${cell.isPoc || cell.buyImbalance || cell.sellImbalance ? 'bold ' : ''}8px ui-monospace, monospace`;
                        ctx.textBaseline = 'middle';

                        // Sell volume on left of center spine
                        ctx.fillStyle = cell.sellImbalance ? '#FF8A80' : '#F4B4BE';
                        ctx.textAlign = 'right';
                        ctx.fillText(formatVol(cell.sellVolumeBtc), bar.xCenter - 3, cell.yMid);

                        // Buy volume on right of center spine
                        ctx.fillStyle = cell.buyImbalance ? '#69F0AE' : '#A7F3D0';
                        ctx.textAlign = 'left';
                        ctx.fillText(formatVol(cell.buyVolumeBtc), bar.xCenter + 3, cell.yMid);
                    } else if (effectiveZoom === 'COMPACT' && cellH >= 7) {
                        // Compact mode: show net cell delta or POC marker
                        ctx.font = 'bold 7px ui-monospace, monospace';
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = 'center';
                        ctx.fillStyle = cell.isPoc
                            ? '#E5A83B'
                            : cell.deltaNotionalUsd >= 0
                                ? '#2CC7A0'
                                : '#E06379';
                        ctx.fillText(formatUsdCompact(cell.deltaNotionalUsd), bar.xCenter, cell.yMid);
                    }
                }

                // Draw bar delta summary tag beneath the candle footprint cluster
                const deltaY = Math.min(height - 10, maxY + 9);
                ctx.font = 'bold 8px ui-monospace, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const deltaText = `Δ ${formatUsdCompact(bar.deltaNotionalUsd)}`;
                const textW = Math.max(36, ctx.measureText(deltaText).width + 8);
                ctx.fillStyle = 'rgba(12, 17, 24, 0.92)';
                ctx.fillRect(bar.xCenter - textW / 2, deltaY - 6, textW, 12);
                ctx.strokeStyle = bar.deltaNotionalUsd >= 0 ? 'rgba(44, 199, 160, 0.45)' : 'rgba(224, 99, 121, 0.45)';
                ctx.lineWidth = 0.75;
                ctx.strokeRect(bar.xCenter - textW / 2, deltaY - 6, textW, 12);
                ctx.fillStyle = bar.deltaNotionalUsd >= 0 ? '#2CC7A0' : '#E06379';
                ctx.fillText(deltaText, bar.xCenter, deltaY);

                void xRight;
            }
        }
        ctx.globalAlpha = 1;
    }, [height, overlayOpacity, projectedBars, projectedTradeVp, showFootprint, showTradeVp, tradeVpPlacement, width, zoomMode]);

    if (!showFootprint && !showTradeVp) return null;

    return (
        <div
            className="pointer-events-none absolute inset-0 z-[24] overflow-hidden"
            data-testid="candle-footprint-canvas-overlay"
            data-footprint-bars={projectedBars.length}
            data-trade-vp-rows={projectedTradeVp?.rows.length ?? 0}
            data-zoom-mode={zoomMode}
            data-trade-vp-placement={tradeVpPlacement}
            data-overlay-opacity={overlayOpacity}
        >
            <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />

            {/* Top-left interactive HUD pill for On-Candle Footprint & Trade VP */}
            <div
                className={cn(
                    'pointer-events-auto absolute left-3 top-10 flex flex-wrap items-center gap-1.5 rounded border border-[#39A9F5]/35 bg-[#070c13]/90 px-2 py-1 font-mono text-[8px] font-semibold text-[#D8DEE8] shadow-sm backdrop-blur-sm',
                )}
            >
                {showFootprint && (
                    <>
                        <span className="text-[#39A9F5]">FOOTPRINT ON-CHART</span>
                        <span className="opacity-60">·</span>
                        <span>
                            {projectedBars.length > 0
                                ? `${projectedBars.length} BAR${projectedBars.length === 1 ? '' : 'S'}`
                                : 'CAPTURE WARMING UP'}
                        </span>
                        {onCycleZoomMode && (
                            <>
                                <span className="opacity-60">·</span>
                                <button
                                    type="button"
                                    onClick={onCycleZoomMode}
                                    className="rounded bg-[#18212C] px-1.5 py-0.5 text-[#39A9F5] hover:text-white"
                                    data-testid="cycle-onchart-footprint-zoom"
                                    title="Cycle on-chart footprint display density (AUTO / DETAILED / COMPACT / OVERVIEW)"
                                >
                                    {zoomMode}
                                </button>
                            </>
                        )}
                    </>
                )}
                {showFootprint && showTradeVp && <span className="opacity-60">|</span>}
                {showTradeVp && (
                    <>
                        <span>
                            <span className="text-[#E5A83B]">TRADE VP</span>{' '}
                            {projectedTradeVp && projectedTradeVp.pocPrice !== null
                                ? `POC ${projectedTradeVp.pocPrice.toFixed(0)} (${projectedTradeVp.tradeCount} trades)`
                                : 'WAITING FOR TRADES'}
                        </span>
                        {onToggleTradeVpPlacement && (
                            <button
                                type="button"
                                onClick={onToggleTradeVpPlacement}
                                className="rounded bg-[#18212C] px-1.5 py-0.5 text-[#E5A83B] hover:text-white"
                                data-testid="toggle-trade-vp-placement"
                                title="Switch Trade Volume Profile between Left and Right side"
                            >
                                {tradeVpPlacement}
                            </button>
                        )}
                    </>
                )}
                {onOverlayOpacityChange && (
                    <label className="ml-1 flex items-center gap-1 text-[8px] text-[#8390A0]">
                        <span>OPACITY</span>
                        <input
                            type="range"
                            min={15}
                            max={100}
                            step={5}
                            value={overlayOpacity}
                            onChange={(e) => onOverlayOpacityChange(Number(e.target.value))}
                            className="h-1.5 w-14 accent-[#39A9F5]"
                            aria-label="On-chart footprint and trade VP opacity"
                            data-testid="onchart-footprint-opacity-slider"
                        />
                        <span className="w-6 text-right text-[#D8DEE8]">{overlayOpacity}%</span>
                    </label>
                )}
            </div>
        </div>
    );
}
