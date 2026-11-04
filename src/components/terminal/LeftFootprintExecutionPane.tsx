'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Columns2, Eye, Flame, Layers, Lock, RefreshCw, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import type { DemoMarketBar } from '../../lib/ui/market-fixtures';
import type { TrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow-contracts';
import type { LiquidityHeatmapFrame } from '../../lib/binance/types';
import { computeNicePriceTicks } from '../../lib/market-structure/label-layout';
import { cn } from '../../lib/ui/cn';

export type LeftExecutionViewMode = 'FOOTPRINT' | 'DELTA_LADDER' | 'CANDLE_VP' | 'HEATMAP_IMBALANCE';

export interface SkeletonExecutionCell {
    price: number;
    buyVolume: number;
    sellVolume: number;
    totalVolume: number;
    delta: number;
    buyImbalance: boolean;
    sellImbalance: boolean;
    isPoc: boolean;
    heatIntensity: number; // 0..1 resting liquidity intensity
}

export interface SkeletonExecutionBar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    delta: number;
    pocPrice: number;
    vahPrice: number;
    valPrice: number;
    maxLevelVolume: number;
    source: 'LIVE_TAPE' | 'INTRABAR_PROFILE';
    cells: SkeletonExecutionCell[];
}

export interface LeftFootprintExecutionPaneProps {
    bars: DemoMarketBar[];
    timeframeSeconds: number;
    trueFlowSnapshot?: TrueFlowSnapshotV1 | null;
    liquidityFrames?: LiquidityHeatmapFrame[];
    visibleLogicalRange?: { from: number; to: number } | null;
    mainChartPriceRange?: { min: number; max: number } | null;
    hoveredPrice: number | null;
    hoveredTime?: number | null;
    onHoverCrosshair?: (point: { price: number | null; time: number | null }) => void;
    onPanRange?: (deltaBars: number) => void;
    onZoomBars?: (deltaZoom: number) => void;
    onInspectCandle?: (barTime: number) => void;
    onClosePane?: () => void;
    className?: string;
}

function choosePriceBucketStep(bars: DemoMarketBar[], ladderRowsTarget = 14): number {
    if (!bars.length) return 10;
    const recent = bars.slice(-24);
    const avgRange = recent.reduce((sum, b) => sum + Math.max(1, b.high - b.low), 0) / recent.length;
    const rawStep = avgRange / Math.max(6, ladderRowsTarget);
    const niceSteps = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 250, 500];
    return niceSteps.find((s) => s >= rawStep) ?? 500;
}

export function buildSkeletonExecutionBars(
    bars: DemoMarketBar[],
    visibleBarCount: number,
    timeframeSeconds: number,
    trueFlowSnapshot?: TrueFlowSnapshotV1 | null,
    liquidityFrames?: LiquidityHeatmapFrame[],
    ladderRowsTarget = 14,
    visibleLogicalRange?: { from: number; to: number } | null,
    syncWithMain = true,
    mainChartPriceRange?: { min: number; max: number } | null,
    syncPriceScale = true,
    priceScaleZoom = 1.0,
    priceScaleOffset = 0,
): { executionBars: SkeletonExecutionBar[]; bucketStep: number; minPrice: number; maxPrice: number } {
    if (!bars.length) {
        return { executionBars: [], bucketStep: 10, minPrice: 0, maxPrice: 0 };
    }

    let slice: DemoMarketBar[];
    if (syncWithMain && visibleLogicalRange && Number.isFinite(visibleLogicalRange.from) && Number.isFinite(visibleLogicalRange.to)) {
        const rawFrom = Math.max(0, Math.floor(visibleLogicalRange.from));
        const rawTo = Math.min(bars.length - 1, Math.ceil(visibleLogicalRange.to));
        const count = rawTo - rawFrom + 1;
        if (count <= visibleBarCount) {
            slice = bars.slice(rawFrom, rawTo + 1);
        } else {
            // Main chart is zoomed out to many bars: show the focus window at the visible edge
            const end = rawTo + 1;
            const start = Math.max(0, end - visibleBarCount);
            slice = bars.slice(start, end);
        }
    } else {
        slice = bars.slice(-Math.max(4, visibleBarCount));
    }

    if (!slice.length) {
        slice = bars.slice(-Math.max(4, visibleBarCount));
    }

    const bucketStep = choosePriceBucketStep(slice, ladderRowsTarget);
    let minPrice: number;
    let maxPrice: number;

    const rawLow = Math.min(...slice.map((b) => b.low));
    const rawHigh = Math.max(...slice.map((b) => b.high));
    const sliceSpan = Math.max(bucketStep * 4, rawHigh - rawLow);

    if (
        syncPriceScale &&
        mainChartPriceRange &&
        Number.isFinite(mainChartPriceRange.min) &&
        Number.isFinite(mainChartPriceRange.max) &&
        mainChartPriceRange.max > mainChartPriceRange.min &&
        mainChartPriceRange.max - mainChartPriceRange.min <= Math.max(8_000, sliceSpan * 4.5)
    ) {
        minPrice = Math.floor(mainChartPriceRange.min / bucketStep) * bucketStep;
        maxPrice = Math.ceil(mainChartPriceRange.max / bucketStep) * bucketStep;
    } else {
        const center = (rawHigh + rawLow) / 2 + priceScaleOffset;
        const halfSpan = (sliceSpan * 0.58) * priceScaleZoom;
        minPrice = Math.floor((center - halfSpan) / bucketStep) * bucketStep;
        maxPrice = Math.ceil((center + halfSpan) / bucketStep) * bucketStep;
    }

    // Index captured footprint bars by openTime in seconds
    const capturedByTime = new Map<number, TrueFlowSnapshotV1['footprintBars'][number]>();
    if (trueFlowSnapshot?.footprintBars) {
        for (const fb of trueFlowSnapshot.footprintBars) {
            const sec = Math.floor(fb.footprint.openTime / 1_000);
            capturedByTime.set(sec, fb);
        }
    }

    // Build resting liquidity lookup map by bucketed price
    const latestDepthByBucket = new Map<number, number>();
    let maxDepthQty = 1e-6;
    if (liquidityFrames && liquidityFrames.length > 0) {
        const latestFrame = liquidityFrames[liquidityFrames.length - 1];
        for (const lvl of latestFrame.levels ?? []) {
            const bucket = Math.round(lvl.price / bucketStep) * bucketStep;
            const totalQty = lvl.quantity ?? 0;
            const nextQty = (latestDepthByBucket.get(bucket) ?? 0) + totalQty;
            latestDepthByBucket.set(bucket, nextQty);
            if (nextQty > maxDepthQty) maxDepthQty = nextQty;
        }
    }

    const executionBars: SkeletonExecutionBar[] = slice.map((bar) => {
        const timeSec = Number(bar.time);
        const captured = capturedByTime.get(timeSec);

        const barLowBucket = Math.floor(bar.low / bucketStep) * bucketStep;
        const barHighBucket = Math.ceil(bar.high / bucketStep) * bucketStep;

        const cellMap = new Map<number, { buy: number; sell: number; buyImb: boolean; sellImb: boolean }>();
        for (let p = barLowBucket; p <= barHighBucket; p += bucketStep) {
            cellMap.set(p, { buy: 0, sell: 0, buyImb: false, sellImb: false });
        }

        let source: 'LIVE_TAPE' | 'INTRABAR_PROFILE' = 'INTRABAR_PROFILE';
        if (captured && captured.footprint.cells.length > 0) {
            source = 'LIVE_TAPE';
            for (const c of captured.footprint.cells) {
                const bucket = Math.round(c.priceMid / bucketStep) * bucketStep;
                const existing = cellMap.get(bucket) ?? { buy: 0, sell: 0, buyImb: false, sellImb: false };
                existing.buy += c.buyVolumeBtc;
                existing.sell += c.sellVolumeBtc;
                existing.buyImb = existing.buyImb || c.buyImbalance;
                existing.sellImb = existing.sellImb || c.sellImbalance;
                cellMap.set(bucket, existing);
            }
        } else {
            // Deterministic high-resolution intrabar price ladder distribution from candle anatomy
            const prices = Array.from(cellMap.keys()).sort((a, b) => a - b);
            const isBull = bar.close >= bar.open;
            const bodyLow = Math.min(bar.open, bar.close);
            const bodyHigh = Math.max(bar.open, bar.close);
            const typicalPrice = (bar.high + bar.low + bar.close) / 3;
            const totalBuy = bar.takerBuyVolume ?? bar.volume * (isBull ? 0.56 : 0.44);
            const totalSell = Math.max(0, bar.volume - totalBuy);

            const weights = prices.map((p) => {
                const distFromTypical = Math.abs(p - typicalPrice) / Math.max(bucketStep, bar.high - bar.low);
                const inBody = p >= bodyLow - bucketStep * 0.5 && p <= bodyHigh + bucketStep * 0.5;
                return (inBody ? 1.65 : 0.65) * Math.exp(-distFromTypical * 1.9);
            });
            const weightSum = weights.reduce((s, w) => s + w, 0) || 1;

            prices.forEach((p, idx) => {
                const share = weights[idx] / weightSum;
                const relPos = prices.length > 1 ? idx / (prices.length - 1) : 0.5;
                const buyBias = isBull ? 0.38 + relPos * 0.32 : 0.62 - relPos * 0.32;
                const levelVol = bar.volume * share;
                const buy = levelVol * Math.max(0.12, Math.min(0.88, buyBias + (totalBuy / Math.max(bar.volume, 1e-6) - 0.5)));
                const sell = Math.max(0, levelVol - buy);
                cellMap.set(p, { buy, sell, buyImb: false, sellImb: false });
            });
        }

        const sortedPrices = Array.from(cellMap.keys()).sort((a, b) => b - a); // High to low
        let pocPrice = sortedPrices[0] ?? bar.close;
        let maxCellVol = -1;

        for (const p of sortedPrices) {
            const entry = cellMap.get(p)!;
            const total = entry.buy + entry.sell;
            if (total > maxCellVol) {
                maxCellVol = total;
                pocPrice = p;
            }
        }

        // Compute diagonal imbalances (ATAS standard: Ask[p] >= 2.8 * Bid[p - step])
        const cells: SkeletonExecutionCell[] = sortedPrices.map((p) => {
            const curr = cellMap.get(p)!;
            const lower = cellMap.get(p - bucketStep);
            const upper = cellMap.get(p + bucketStep);
            const totalVolume = curr.buy + curr.sell;
            const minImbalanceThreshold = Math.max(0.15, bar.volume * 0.045);

            const diagBuyImb = curr.buyImb || (
                lower !== undefined
                && curr.buy >= minImbalanceThreshold
                && curr.buy >= Math.max(0.05, lower.sell) * 2.8
            );
            const diagSellImb = curr.sellImb || (
                upper !== undefined
                && curr.sell >= minImbalanceThreshold
                && curr.sell >= Math.max(0.05, upper.buy) * 2.8
            );

            const depthQty = latestDepthByBucket.get(p) ?? 0;
            const heatIntensity = depthQty > 0
                ? Math.min(1, depthQty / maxDepthQty)
                : Math.min(0.85, totalVolume / Math.max(maxCellVol, 1e-6));

            return {
                price: p,
                buyVolume: curr.buy,
                sellVolume: curr.sell,
                totalVolume,
                delta: curr.buy - curr.sell,
                buyImbalance: diagBuyImb,
                sellImbalance: diagSellImb,
                isPoc: p === pocPrice,
                heatIntensity,
            };
        });

        // Compute Value Area (70% volume) for this individual candle
        let barTotalVol = 0;
        let barMaxVol = 1e-6;
        for (const c of cells) {
            barTotalVol += c.totalVolume;
            if (c.totalVolume > barMaxVol) barMaxVol = c.totalVolume;
        }

        const sortedByPriceAsc = [...cells].sort((a, b) => a.price - b.price);
        const pocAscIdx = sortedByPriceAsc.findIndex((c) => c.price === pocPrice);
        let includedVol = sortedByPriceAsc[pocAscIdx]?.totalVolume ?? 0;
        let lowVaIdx = pocAscIdx >= 0 ? pocAscIdx : 0;
        let highVaIdx = pocAscIdx >= 0 ? pocAscIdx : 0;
        const targetVa = barTotalVol * 0.7;

        while (includedVol < targetVa && (lowVaIdx > 0 || highVaIdx < sortedByPriceAsc.length - 1)) {
            const prevVol = lowVaIdx > 0 ? sortedByPriceAsc[lowVaIdx - 1].totalVolume : -1;
            const nextVol = highVaIdx < sortedByPriceAsc.length - 1 ? sortedByPriceAsc[highVaIdx + 1].totalVolume : -1;
            if (nextVol >= prevVol && highVaIdx < sortedByPriceAsc.length - 1) {
                highVaIdx++;
                includedVol += sortedByPriceAsc[highVaIdx].totalVolume;
            } else if (lowVaIdx > 0) {
                lowVaIdx--;
                includedVol += sortedByPriceAsc[lowVaIdx].totalVolume;
            } else {
                break;
            }
        }
        const valPrice = sortedByPriceAsc[lowVaIdx]?.price ?? bar.low;
        const vahPrice = sortedByPriceAsc[highVaIdx]?.price ?? bar.high;
        const totalDelta = cells.reduce((sum, c) => sum + c.delta, 0);

        return {
            time: timeSec,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            delta: totalDelta,
            pocPrice,
            vahPrice,
            valPrice,
            maxLevelVolume: barMaxVol,
            source,
            cells,
        };
    });

    return { executionBars, bucketStep, minPrice, maxPrice };
}

function formatQty(v: number): string {
    if (v >= 100) return v.toFixed(0);
    if (v >= 10) return v.toFixed(1);
    return v.toFixed(2);
}

function formatSignedDelta(v: number): string {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    const abs = Math.abs(v);
    if (abs >= 100) return `${sign}${abs.toFixed(0)}`;
    if (abs >= 10) return `${sign}${abs.toFixed(1)}`;
    return `${sign}${abs.toFixed(2)}`;
}

function formatTimeHHMM(seconds: number): string {
    const d = new Date(seconds * 1_000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

export default function LeftFootprintExecutionPane({
    bars,
    timeframeSeconds,
    trueFlowSnapshot,
    liquidityFrames,
    visibleLogicalRange,
    mainChartPriceRange,
    hoveredPrice,
    hoveredTime,
    onHoverCrosshair,
    onPanRange,
    onZoomBars,
    onInspectCandle,
    onClosePane,
    className,
}: LeftFootprintExecutionPaneProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const yToPriceRef = useRef<((y: number) => number) | null>(null);
    const [viewMode, setViewMode] = useState<LeftExecutionViewMode>('FOOTPRINT');
    const [visibleBarsCount, setVisibleBarsCount] = useState<number>(10);
    const [syncWithMain, setSyncWithMain] = useState<boolean>(true);
    const [syncPriceScale, setSyncPriceScale] = useState<boolean>(true);
    const [priceScaleZoom, setPriceScaleZoom] = useState<number>(1.0);
    const [priceScaleOffset, setPriceScaleOffset] = useState<number>(0);
    const isDraggingPriceAxisRef = useRef<boolean>(false);
    const dragStartYRef = useRef<number>(0);
    const dragStartZoomRef = useRef<number>(1.0);
    const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 520, height: 460 });
    const [localHover, setLocalHover] = useState<{ x: number; y: number; price: number; barTime: number | null } | null>(null);

    // Drag-to-pan tracking state
    const isDraggingRef = useRef<boolean>(false);
    const dragStartXRef = useRef<number>(0);
    const dragAccumulatedBarsRef = useRef<number>(0);

    useEffect(() => {
        const el = hostRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect && rect.width > 10 && rect.height > 10) {
                setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const { executionBars, bucketStep, minPrice, maxPrice } = useMemo(
        () => buildSkeletonExecutionBars(
            bars,
            visibleBarsCount,
            timeframeSeconds,
            trueFlowSnapshot,
            liquidityFrames,
            14,
            visibleLogicalRange,
            syncWithMain,
            mainChartPriceRange,
            syncPriceScale,
            priceScaleZoom,
            priceScaleOffset,
        ),
        [bars, liquidityFrames, mainChartPriceRange, priceScaleOffset, priceScaleZoom, syncPriceScale, syncWithMain, timeframeSeconds, trueFlowSnapshot, visibleBarsCount, visibleLogicalRange],
    );

    const imbalanceCount = useMemo(
        () => executionBars.reduce((sum, b) => sum + b.cells.filter((c) => c.buyImbalance || c.sellImbalance).length, 0),
        [executionBars],
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { width, height } = dimensions;
        if (width <= 0 || height <= 0) return;

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = '#060A10';
        ctx.fillRect(0, 0, width, height);

        const topPad = 36;
        const bottomFooterH = 44;
        const rightAxisW = 58;
        const plotW = Math.max(60, width - rightAxisW);
        const plotH = Math.max(60, height - topPad - bottomFooterH);

        if (!executionBars.length || maxPrice <= minPrice) {
            ctx.restore();
            return;
        }

        const priceSpan = Math.max(bucketStep, maxPrice - minPrice);
        const priceToY = (p: number) => topPad + ((maxPrice - p) / priceSpan) * plotH;
        const yToPrice = (y: number) => maxPrice - ((y - topPad) / plotH) * priceSpan;

        const cellHeight = Math.max(10, Math.min(28, (bucketStep / priceSpan) * plotH));
        const colW = plotW / executionBars.length;

        // Horizontal price grid lines & collision-free nice price axis ticks
        ctx.strokeStyle = 'rgba(24, 33, 44, 0.45)';
        ctx.lineWidth = 1;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const niceTicks = computeNicePriceTicks(minPrice, maxPrice, Math.max(6, Math.floor(plotH / 34)));
        for (const p of niceTicks) {
            const y = priceToY(p);
            if (y < topPad + 6 || y > topPad + plotH - 6) continue;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(plotW, y);
            ctx.stroke();

            ctx.fillStyle = '#8390A0';
            ctx.fillText(p.toFixed(0), plotW + 6, y);
        }

        // Global max cell volume & delta across visible bars
        let globalMaxVol = 1e-6;
        let globalMaxAbsDelta = 1e-6;
        for (const bar of executionBars) {
            for (const c of bar.cells) {
                if (c.totalVolume > globalMaxVol) globalMaxVol = c.totalVolume;
                if (Math.abs(c.delta) > globalMaxAbsDelta) globalMaxAbsDelta = Math.abs(c.delta);
            }
        }

        // Render each Skeleton Candle + View Mode
        executionBars.forEach((bar, idx) => {
            const centerX = (idx + 0.5) * colW;
            const colLeft = idx * colW + 3;
            const colRight = (idx + 1) * colW - 3;
            const innerW = Math.max(16, colRight - colLeft);
            const halfW = (innerW - 8) / 2;

            const isBull = bar.close >= bar.open;
            const spineColor = isBull ? '#27d3aa' : '#ef5d73';
            const highY = priceToY(bar.high);
            const lowY = priceToY(bar.low);
            const openY = priceToY(bar.open);
            const closeY = priceToY(bar.close);
            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.max(2, Math.abs(closeY - openY));

            // Vertical column separator
            ctx.strokeStyle = 'rgba(24, 33, 44, 0.7)';
            ctx.beginPath();
            ctx.moveTo((idx + 1) * colW, topPad);
            ctx.lineTo((idx + 1) * colW, topPad + plotH + bottomFooterH);
            ctx.stroke();

            // 1. Render cells per price level
            for (const cell of bar.cells) {
                const cy = priceToY(cell.price);
                const top = cy - cellHeight * 0.46;
                const h = Math.max(8, cellHeight * 0.92);

                if (viewMode === 'FOOTPRINT') {
                    // Left = Bid (Sell), Right = Ask (Buy) around the central skeleton spine
                    const sellFrac = Math.min(1, cell.sellVolume / globalMaxVol);
                    const buyFrac = Math.min(1, cell.buyVolume / globalMaxVol);
                    const sellBarW = Math.max(2, sellFrac * halfW);
                    const buyBarW = Math.max(2, buyFrac * halfW);

                    // Row background
                    ctx.fillStyle = 'rgba(13, 20, 30, 0.78)';
                    ctx.fillRect(colLeft, top, innerW, h);

                    // Left Sell bar
                    ctx.fillStyle = cell.sellImbalance ? 'rgba(240, 97, 82, 0.55)' : 'rgba(239, 93, 115, 0.28)';
                    ctx.fillRect(centerX - 4 - sellBarW, top + 1, sellBarW, h - 2);

                    // Right Buy bar
                    ctx.fillStyle = cell.buyImbalance ? 'rgba(44, 199, 160, 0.55)' : 'rgba(39, 211, 170, 0.28)';
                    ctx.fillRect(centerX + 4, top + 1, buyBarW, h - 2);

                    // Numbers (Bid x Ask)
                    if (innerW >= 42 && h >= 10) {
                        ctx.font = `${cell.sellImbalance ? 'bold ' : ''}9.5px "JetBrains Mono", monospace`;
                        ctx.textAlign = 'right';
                        ctx.fillStyle = cell.sellImbalance ? '#FF8A80' : '#E2959E';
                        ctx.fillText(formatQty(cell.sellVolume), centerX - 6, cy + 0.5);

                        ctx.font = `${cell.buyImbalance ? 'bold ' : ''}9.5px "JetBrains Mono", monospace`;
                        ctx.textAlign = 'left';
                        ctx.fillStyle = cell.buyImbalance ? '#69F0AE' : '#8CE5CE';
                        ctx.fillText(formatQty(cell.buyVolume), centerX + 6, cy + 0.5);
                    }
                } else if (viewMode === 'DELTA_LADDER') {
                    // Colored Delta Ladder
                    const deltaFrac = Math.min(1, Math.abs(cell.delta) / globalMaxAbsDelta);
                    const alpha = 0.16 + deltaFrac * 0.62;
                    ctx.fillStyle = cell.delta >= 0
                        ? `rgba(39, 211, 170, ${alpha.toFixed(2)})`
                        : `rgba(239, 93, 115, ${alpha.toFixed(2)})`;
                    ctx.fillRect(colLeft, top + 0.5, innerW, h - 1);

                    const barFillW = deltaFrac * halfW;
                    ctx.fillStyle = cell.delta >= 0 ? 'rgba(44, 199, 160, 0.45)' : 'rgba(240, 97, 82, 0.45)';
                    if (cell.delta >= 0) {
                        ctx.fillRect(centerX + 3, top + 1, barFillW, h - 2);
                    } else {
                        ctx.fillRect(centerX - 3 - barFillW, top + 1, barFillW, h - 2);
                    }

                    if (innerW >= 38 && h >= 10) {
                        ctx.font = `${cell.isPoc || cell.buyImbalance || cell.sellImbalance ? 'bold ' : ''}9.5px "JetBrains Mono", monospace`;
                        ctx.textAlign = 'center';
                        ctx.fillStyle = cell.delta >= 0 ? '#D4FFF2' : '#FFD9DE';
                        ctx.fillText(formatSignedDelta(cell.delta), centerX, cy + 0.5);
                    }
                } else if (viewMode === 'CANDLE_VP') {
                    // CANDLE_VP: Intra-bar Volume Profile Histogram inside this individual candle
                    const volFrac = Math.min(1, cell.totalVolume / Math.max(bar.maxLevelVolume, 1e-6));
                    const vpBarW = Math.max(2, volFrac * (innerW - 4));
                    const inVa = cell.price >= bar.valPrice && cell.price <= bar.vahPrice;

                    // Row background
                    ctx.fillStyle = inVa ? 'rgba(57, 169, 245, 0.12)' : 'rgba(13, 20, 30, 0.72)';
                    ctx.fillRect(colLeft, top, innerW, h);

                    // Intra-bar profile histogram: two-tone buy/sell
                    const upShare = cell.totalVolume > 0 ? cell.buyVolume / cell.totalVolume : 0.5;
                    const buyW = vpBarW * upShare;
                    const sellW = vpBarW * (1 - upShare);

                    // Buy portion (emerald)
                    ctx.fillStyle = inVa ? 'rgba(44, 199, 160, 0.72)' : 'rgba(39, 211, 170, 0.42)';
                    ctx.fillRect(colLeft + 2, top + 1, buyW, h - 2);

                    // Sell portion (rose)
                    ctx.fillStyle = inVa ? 'rgba(240, 97, 82, 0.72)' : 'rgba(239, 93, 115, 0.42)';
                    ctx.fillRect(colLeft + 2 + buyW, top + 1, sellW, h - 2);

                    if (innerW >= 40 && h >= 10) {
                        ctx.font = `${cell.isPoc ? 'bold ' : ''}9.5px "JetBrains Mono", monospace`;
                        ctx.textAlign = 'right';
                        ctx.fillStyle = inVa ? '#FFFFFF' : '#A0AEC0';
                        ctx.fillText(formatQty(cell.totalVolume), colRight - 4, cy + 0.5);
                    }
                } else {
                    // HEATMAP_IMBALANCE mode: Resting Liquidity Heatmap + Stacked Imbalances
                    const heatAlpha = 0.08 + cell.heatIntensity * 0.58;
                    ctx.fillStyle = `rgba(229, 168, 59, ${heatAlpha.toFixed(2)})`;
                    ctx.fillRect(colLeft, top + 0.5, innerW, h - 1);

                    if (cell.buyImbalance) {
                        ctx.fillStyle = 'rgba(44, 199, 160, 0.48)';
                        ctx.fillRect(centerX + 3, top + 1, halfW, h - 2);
                    }
                    if (cell.sellImbalance) {
                        ctx.fillStyle = 'rgba(240, 97, 82, 0.48)';
                        ctx.fillRect(colLeft + 1, top + 1, halfW, h - 2);
                    }

                    if (innerW >= 42 && h >= 10) {
                        ctx.font = '9px "JetBrains Mono", monospace';
                        ctx.textAlign = 'right';
                        ctx.fillStyle = cell.sellImbalance ? '#FF8A80' : '#D8DEE8';
                        ctx.fillText(formatQty(cell.sellVolume), centerX - 6, cy + 0.5);

                        ctx.textAlign = 'left';
                        ctx.fillStyle = cell.buyImbalance ? '#69F0AE' : '#D8DEE8';
                        ctx.fillText(formatQty(cell.buyVolume), centerX + 6, cy + 0.5);
                    }
                }

                // Golden POC Box around highest-volume cell in this candle
                if (cell.isPoc) {
                    ctx.strokeStyle = '#E5A83B';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(colLeft + 0.5, top + 0.5, innerW - 1, h - 1);
                }
            }

            // 2. Render the ATAS-style "Skeleton Candle" down the central spine of the bar
            ctx.strokeStyle = spineColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(centerX, highY);
            ctx.lineTo(centerX, lowY);
            ctx.stroke();

            // Hollow 6px Skeleton Candle Body between Open and Close
            const skeletonBodyW = 6;
            ctx.fillStyle = isBull ? 'rgba(39, 211, 170, 0.28)' : 'rgba(239, 93, 115, 0.28)';
            ctx.fillRect(centerX - skeletonBodyW / 2, bodyTop, skeletonBodyW, bodyH);
            ctx.strokeStyle = spineColor;
            ctx.lineWidth = 1.4;
            ctx.strokeRect(centerX - skeletonBodyW / 2, bodyTop, skeletonBodyW, bodyH);

            // 3. Per-Bar Delta & Volume Summary Footer Row
            const footerTop = topPad + plotH;
            ctx.fillStyle = bar.delta >= 0 ? 'rgba(39, 211, 170, 0.14)' : 'rgba(239, 93, 115, 0.14)';
            ctx.fillRect(colLeft, footerTop + 2, innerW, 20);

            ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = bar.delta >= 0 ? '#2CC7A0' : '#F06152';
            ctx.fillText(`Δ ${formatSignedDelta(bar.delta)}`, centerX, footerTop + 12);

            ctx.font = '8.5px "JetBrains Mono", monospace';
            ctx.fillStyle = '#7E8B9B';
            ctx.fillText(formatTimeHHMM(bar.time), centerX, footerTop + 32);
        });

        // Footer divider line
        ctx.strokeStyle = '#18212C';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, topPad + plotH);
        ctx.lineTo(width, topPad + plotH);
        ctx.stroke();

        yToPriceRef.current = yToPrice;
        (canvas as HTMLCanvasElement & { __yToPrice?: (y: number) => number }).__yToPrice = yToPrice;

        ctx.restore();
    }, [
        bucketStep,
        dimensions,
        executionBars,
        maxPrice,
        minPrice,
        viewMode,
    ]);

    // Fast-path Layer 1: Dedicated crosshair and hover overlay canvas (Zero cell redraw on hover)
    useEffect(() => {
        const overlay = overlayCanvasRef.current;
        if (!overlay) return;
        const { width, height } = dimensions;
        if (width <= 0 || height <= 0) return;

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        if (overlay.width !== Math.floor(width * dpr) || overlay.height !== Math.floor(height * dpr)) {
            overlay.width = Math.floor(width * dpr);
            overlay.height = Math.floor(height * dpr);
        }

        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const topPad = 36;
        const bottomFooterH = 44;
        const rightAxisW = 58;
        const plotW = Math.max(60, width - rightAxisW);
        const plotH = Math.max(60, height - topPad - bottomFooterH);

        if (!executionBars.length || maxPrice <= minPrice) {
            ctx.restore();
            return;
        }

        const priceSpan = Math.max(bucketStep, maxPrice - minPrice);
        const priceToY = (p: number) => topPad + ((maxPrice - p) / priceSpan) * plotH;
        const colW = plotW / executionBars.length;

        // 1. Synchronized Horizontal Crosshair (Price Line & Axis Tag)
        const activePrice = localHover?.price ?? (syncWithMain ? hoveredPrice : null);
        if (activePrice !== null && activePrice >= minPrice && activePrice <= maxPrice) {
            const cy = priceToY(activePrice);
            ctx.save();
            ctx.strokeStyle = 'rgba(57, 169, 245, 0.85)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(plotW, cy);
            ctx.stroke();

            // Price pill on right axis
            ctx.fillStyle = '#39A9F5';
            ctx.fillRect(plotW, cy - 9, rightAxisW, 18);
            ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
            ctx.fillStyle = '#060A10';
            ctx.textAlign = 'left';
            ctx.fillText(activePrice.toFixed(0), plotW + 5, cy + 0.5);
            ctx.restore();
        }

        // 2. Synchronized Vertical Crosshair (Time Line on Matching Bar)
        const activeTime = localHover?.barTime ?? (syncWithMain ? (hoveredTime ?? null) : null);
        if (typeof activeTime === 'number') {
            const matchIdx = executionBars.findIndex((b) => Math.abs(b.time - activeTime) <= timeframeSeconds * 0.7);
            if (matchIdx >= 0) {
                const cx = (matchIdx + 0.5) * colW;
                ctx.save();
                ctx.strokeStyle = 'rgba(57, 169, 245, 0.65)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(cx, topPad);
                ctx.lineTo(cx, topPad + plotH + bottomFooterH);
                ctx.stroke();
                ctx.restore();
            }
        }

        ctx.restore();
    }, [
        bucketStep,
        dimensions,
        executionBars,
        hoveredPrice,
        hoveredTime,
        localHover,
        maxPrice,
        minPrice,
        syncWithMain,
        timeframeSeconds,
    ]);

    function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const plotW = Math.max(60, dimensions.width - 58);

        if (x >= plotW) {
            isDraggingPriceAxisRef.current = true;
            dragStartYRef.current = event.clientY;
            dragStartZoomRef.current = priceScaleZoom;
            setSyncPriceScale(false);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
        }

        isDraggingRef.current = true;
        dragStartXRef.current = event.clientX;
        dragAccumulatedBarsRef.current = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
        const overlay = overlayCanvasRef.current;
        if (!overlay || !yToPriceRef.current) return;
        const rect = overlay.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const plotW = Math.max(60, dimensions.width - 58);

        if (x >= plotW) {
            overlay.style.cursor = 'ns-resize';
        } else {
            overlay.style.cursor = 'crosshair';
        }

        if (isDraggingPriceAxisRef.current) {
            const dy = event.clientY - dragStartYRef.current;
            const newZoom = Math.max(0.15, Math.min(8.0, dragStartZoomRef.current * (1 + dy * 0.008)));
            setPriceScaleZoom(newZoom);
            return;
        }

        if (isDraggingRef.current) {
            const dx = event.clientX - dragStartXRef.current;
            const colW = plotW / Math.max(1, executionBars.length);
            const barShift = -Math.round(dx / Math.max(12, colW));

            if (barShift !== 0 && barShift !== dragAccumulatedBarsRef.current) {
                const delta = barShift - dragAccumulatedBarsRef.current;
                dragAccumulatedBarsRef.current = barShift;
                onPanRange?.(delta);
            }
            return;
        }

        const rawPrice = yToPriceRef.current(y);
        const snappedPrice = Math.round(rawPrice / bucketStep) * bucketStep;
        const colIdx = Math.min(executionBars.length - 1, Math.max(0, Math.floor((x / plotW) * executionBars.length)));
        const barTime = executionBars[colIdx]?.time ?? null;

        setLocalHover({ x, y, price: snappedPrice, barTime });
        if (syncWithMain) {
            onHoverCrosshair?.({ price: snappedPrice, time: barTime });
        }
    }

    function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
        const wasClick =
            isDraggingRef.current &&
            Math.abs(event.clientX - dragStartXRef.current) < 5 &&
            dragAccumulatedBarsRef.current === 0;
        if (wasClick && onInspectCandle && executionBars.length > 0) {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const plotW = Math.max(60, dimensions.width - 58);
            if (x >= 0 && x < plotW) {
                const colIdx = Math.min(
                    executionBars.length - 1,
                    Math.max(0, Math.floor((x / plotW) * executionBars.length)),
                );
                const clickedTime = executionBars[colIdx]?.time;
                if (typeof clickedTime === 'number') {
                    onInspectCandle(clickedTime);
                }
            }
        }
        isDraggingRef.current = false;
        isDraggingPriceAxisRef.current = false;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // ignore
        }
    }

    function handlePointerLeave() {
        if (isDraggingRef.current || isDraggingPriceAxisRef.current) return;
        setLocalHover(null);
        if (syncWithMain) {
            onHoverCrosshair?.({ price: null, time: null });
        }
    }

    function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
        const plotW = Math.max(60, dimensions.width - 58);
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;

        if (x >= plotW) {
            event.preventDefault();
            const zoomDelta = event.deltaY < 0 ? 0.9 : 1.1;
            setSyncPriceScale(false);
            setPriceScaleZoom((z) => Math.max(0.15, Math.min(8.0, z * zoomDelta)));
            return;
        }

        event.preventDefault();
        const zoomDelta = event.deltaY < 0 ? -1 : 1;
        setVisibleBarsCount((c) => Math.max(4, Math.min(30, c + zoomDelta)));
        if (syncWithMain && onZoomBars) {
            onZoomBars(zoomDelta);
        }
    }

    const liveTapeCount = executionBars.filter((b) => b.source === 'LIVE_TAPE').length;

    return (
        <div
            ref={hostRef}
            className={cn('relative flex h-full min-h-[240px] w-full flex-col overflow-hidden border-r border-[#18212C] bg-[#060A10]', className)}
            data-testid="left-footprint-execution-pane"
            data-view-mode={viewMode}
            data-visible-bars={visibleBarsCount}
            data-bucket-step={bucketStep}
            data-sync-with-main={syncWithMain}
        >
            {/* Layer 0: Heavy Footprint Cells & ATAS Skeleton Candles (Redraws only on data change) */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 size-full pointer-events-none"
            />
            {/* Layer 1: High-Performance Crosshair & Hover Overlay (Zero cell redraw on hover) */}
            <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 size-full cursor-crosshair select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onWheel={handleWheel}
                onDoubleClick={() => {
                    setSyncPriceScale(true);
                    setPriceScaleZoom(1.0);
                    setPriceScaleOffset(0);
                }}
            />

            {/* Top Execution Controls Bar */}
            <div className="pointer-events-auto relative z-10 flex h-9 shrink-0 items-center justify-between gap-1.5 border-b border-[#18212C] bg-[#080D14]/95 px-2.5 font-mono text-[9px]">
                <div className="flex items-center gap-1" role="tablist" aria-label="Execution view mode">
                    <button
                        type="button"
                        data-testid="exec-mode-footprint"
                        onClick={() => setViewMode('FOOTPRINT')}
                        title="ATAS Bid x Ask Footprint Clusters"
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-1 font-bold transition-colors',
                            viewMode === 'FOOTPRINT'
                                ? 'bg-[#39A9F5]/20 text-[#39A9F5] ring-1 ring-[#39A9F5]/40'
                                : 'text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]',
                        )}
                    >
                        <Columns2 className="size-3" />
                        <span>FOOTPRINT</span>
                    </button>
                    <button
                        type="button"
                        data-testid="exec-mode-delta-ladder"
                        onClick={() => setViewMode('DELTA_LADDER')}
                        title="Colored Net Delta Ladder per Price Level"
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-1 font-bold transition-colors',
                            viewMode === 'DELTA_LADDER'
                                ? 'bg-[#2CC7A0]/20 text-[#2CC7A0] ring-1 ring-[#2CC7A0]/40'
                                : 'text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]',
                        )}
                    >
                        <Layers className="size-3" />
                        <span>DELTA LADDER</span>
                    </button>
                    <button
                        type="button"
                        data-testid="exec-mode-candle-vp"
                        onClick={() => setViewMode('CANDLE_VP')}
                        title="Intra-Bar Volume Profile Histogram per Candle with POC & Value Area"
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-1 font-bold transition-colors',
                            viewMode === 'CANDLE_VP'
                                ? 'bg-[#A855F7]/20 text-[#C084FC] ring-1 ring-[#A855F7]/40'
                                : 'text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]',
                        )}
                    >
                        <BarChart3 className="size-3" />
                        <span>CANDLE VP</span>
                    </button>
                    <button
                        type="button"
                        data-testid="exec-mode-heatmap-imbalance"
                        onClick={() => setViewMode('HEATMAP_IMBALANCE')}
                        title="Resting Liquidity Depth Heatmap + Stacked Imbalances"
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-1 font-bold transition-colors',
                            viewMode === 'HEATMAP_IMBALANCE'
                                ? 'bg-[#E5A83B]/20 text-[#E5A83B] ring-1 ring-[#E5A83B]/40'
                                : 'text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]',
                        )}
                    >
                        <Flame className="size-3" />
                        <span>HEATMAP + IMB</span>
                    </button>
                </div>

                <div className="flex items-center gap-1.5 text-[8.5px] text-[#8390A0]">
                    <span className="hidden rounded border border-[#18212C] bg-[#0B111A] px-1.5 py-0.5 text-[#D8DEE8] sm:inline">
                        STEP ${bucketStep}
                    </span>
                    {imbalanceCount > 0 && (
                        <span className="hidden rounded border border-[#E5A83B]/35 bg-[#E5A83B]/10 px-1.5 py-0.5 font-bold text-[#E5A83B] lg:inline">
                            {imbalanceCount} IMB
                        </span>
                    )}
                    <span className="hidden rounded border border-[#2CC7A0]/30 bg-[#2CC7A0]/10 px-1.5 py-0.5 text-[#2CC7A0] xl:inline">
                        {liveTapeCount > 0 ? `LIVE TAPE (${liveTapeCount}b)` : 'SKELETON LADDER'}
                    </span>

                    <div className="flex items-center rounded border border-[#18212C] bg-[#0B111A]">
                        <button
                            type="button"
                            title="Zoom in (fewer, wider skeleton candles)"
                            data-testid="exec-zoom-in"
                            onClick={() => {
                                setVisibleBarsCount((c) => Math.max(4, c - 2));
                                if (syncWithMain && onZoomBars) onZoomBars(-1);
                            }}
                            className="p-1 text-[#8390A0] hover:text-white"
                        >
                            <ZoomIn className="size-3" />
                        </button>
                        <span className="px-1 font-bold text-[#D8DEE8]">{visibleBarsCount}B</span>
                        <button
                            type="button"
                            title="Zoom out (more skeleton candles)"
                            data-testid="exec-zoom-out"
                            onClick={() => {
                                setVisibleBarsCount((c) => Math.min(30, c + 2));
                                if (syncWithMain && onZoomBars) onZoomBars(1);
                            }}
                            className="p-1 text-[#8390A0] hover:text-white"
                        >
                            <ZoomOut className="size-3" />
                        </button>
                    </div>

                    <button
                        type="button"
                        data-testid="exec-sync-toggle"
                        title={syncWithMain ? 'Synced with main candlestick chart (Click to decouple)' : 'Independent navigation (Click to sync with main)'}
                        onClick={() => setSyncWithMain((v) => !v)}
                        className={cn(
                            'flex items-center gap-1 rounded border px-1.5 py-1',
                            syncWithMain
                                ? 'border-[#39A9F5]/40 bg-[#39A9F5]/15 text-[#39A9F5]'
                                : 'border-[#18212C] text-[#8390A0]',
                        )}
                    >
                        <RefreshCw className={cn('size-2.5', syncWithMain && 'text-[#39A9F5]')} />
                        <span className="text-[8px] font-bold">{syncWithMain ? 'SYNCED' : 'UNSYNC'}</span>
                    </button>

                    <button
                        type="button"
                        data-testid="exec-price-sync-toggle"
                        title={syncPriceScale ? 'Price scale locked 1:1 to candlestick chart. Drag axis or click to scale freely.' : 'Price scale free. Click or double-click price axis to re-sync 1:1 with main chart.'}
                        onClick={() => {
                            setSyncPriceScale((v) => {
                                if (!v) {
                                    setPriceScaleZoom(1.0);
                                    setPriceScaleOffset(0);
                                }
                                return !v;
                            });
                        }}
                        className={cn(
                            'flex items-center gap-1 rounded border px-1.5 py-1',
                            syncPriceScale
                                ? 'border-[#39A9F5]/40 bg-[#39A9F5]/15 text-[#39A9F5]'
                                : 'border-amber-500/40 bg-amber-500/15 text-amber-300',
                        )}
                    >
                        <span className="text-[8px] font-bold">{syncPriceScale ? 'PRICE SYNC' : 'FREE SCALE'}</span>
                    </button>

                    {onClosePane && (
                        <button
                            type="button"
                            title="Hide Left Execution Footprint Pane"
                            onClick={onClosePane}
                            className="rounded border border-[#18212C] p-1 text-[#8390A0] hover:bg-white/5 hover:text-white"
                        >
                            <Eye className="size-3" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
