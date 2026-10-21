'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    CandlestickSeries,
    ColorType,
    createChart,
    CrosshairMode,
    LineSeries,
    LineStyle,
    type ISeriesApi,
} from 'lightweight-charts';
import { GripVertical, Lock, MoveHorizontal, RotateCcw } from 'lucide-react';
import type { TerrainDataContractV2 } from '@/lib/terrain/types';
import { useTerminalStore } from '@/lib/dashboard/store';
import {
    createDemoAvwap,
    createDemoCvd,
    createDemoMarketBars,
    createDemoVolumeProfile,
} from '@/lib/ui/market-fixtures';

type PriceSeries = ISeriesApi<'Candlestick'>;
type AvwapSeries = ISeriesApi<'Line'>;

interface MarketStructureChartProps {
    data: TerrainDataContractV2;
}

const chartOptions = {
    autoSize: true,
    layout: {
        background: { type: ColorType.Solid, color: '#080c13' },
        textColor: '#7f8b9d',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 10,
        attributionLogo: false,
    },
    grid: {
        vertLines: { color: 'rgba(50, 63, 82, 0.22)' },
        horzLines: { color: 'rgba(50, 63, 82, 0.22)' },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#1d2735', scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderColor: '#1d2735', timeVisible: true, secondsVisible: false, rightOffset: 4 },
};

function money(value: number) {
    return `$${Math.round(value).toLocaleString()}`;
}

function numeric(value: unknown, fallback?: number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function levelStrike(value: unknown): number | undefined {
    if (typeof value === 'number') return numeric(value);
    if (value && typeof value === 'object') return numeric((value as { strike?: unknown }).strike);
    return undefined;
}

export default function MarketStructureChart({ data }: MarketStructureChartProps) {
    const chartHostRef = useRef<HTMLDivElement>(null);
    const cvdHostRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<ReturnType<typeof createDemoVolumeProfile>>([]);
    const priceSeriesRef = useRef<PriceSeries | null>(null);
    const avwapSeriesRef = useRef<AvwapSeries | null>(null);
    const [overlayLayout, setOverlayLayout] = useState<{ flipY: number; profileRows: Array<{ price: number; y: number }> }>({
        flipY: 240,
        profileRows: [],
    });
    const [range, setRange] = useState({ start: 104, end: 178 });
    const [anchorIndex, setAnchorIndex] = useState(124);
    const [dragTarget, setDragTarget] = useState<'range-start' | 'range-end' | 'range-body' | 'anchor' | null>(null);
    const dragOriginRef = useRef<{ x: number; start: number; end: number } | null>(null);

    const { dataMode, chartLayers, activeOrderFlowStudy } = useTerminalStore();
    const summary = data.summary as unknown as Record<string, unknown>;
    const keyLevels = (data.keyLevels || {}) as unknown as Record<string, unknown>;
    const spot = numeric(data.spotPrice, numeric(summary.spotPrice, 68_000)) ?? 68_000;
    const bars = useMemo(() => createDemoMarketBars(spot), [spot]);
    const cvdBars = useMemo(() => createDemoCvd(bars), [bars]);
    const avwap = useMemo(() => createDemoAvwap(bars, anchorIndex), [bars, anchorIndex]);
    const profile = useMemo(() => createDemoVolumeProfile(bars, range.start, range.end), [bars, range]);

    const callWall = levelStrike(keyLevels.callWall) ?? numeric(summary.topPositiveGexStrike) ?? numeric(summary.callWall) ?? spot * 1.05;
    const putWall = levelStrike(keyLevels.putWall) ?? numeric(summary.topNegativeGexStrike) ?? numeric(summary.putWall) ?? spot * 0.95;
    const gammaFlip = levelStrike(keyLevels.gammaFlip) ?? numeric(summary.gammaFlip) ?? spot;
    const positiveGamma = (numeric(summary.netGex, 0) ?? 0) >= 0;

    useEffect(() => {
        profileRef.current = profile;
    }, [profile]);

    useEffect(() => {
        if (dataMode !== 'DEMO' || !chartHostRef.current) return;

        const chart = createChart(chartHostRef.current, chartOptions);
        const candles = chart.addSeries(CandlestickSeries, {
            upColor: '#31c5a0', downColor: '#ef6277', borderVisible: false,
            wickUpColor: '#31c5a0', wickDownColor: '#ef6277', priceLineVisible: false,
        });
        candles.setData(bars);
        const avwapSeries = chart.addSeries(LineSeries, {
            color: '#37b8ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        if (chartLayers.walls) {
            candles.createPriceLine({
                price: callWall, color: '#3fd6af', lineWidth: 2, lineStyle: LineStyle.Dashed,
                axisLabelVisible: true, title: 'CALL WALL',
            });
            candles.createPriceLine({
                price: putWall, color: '#ef6277', lineWidth: 2, lineStyle: LineStyle.Dashed,
                axisLabelVisible: true, title: 'PUT WALL',
            });
        }
        if (chartLayers.gammaFlip) {
            candles.createPriceLine({
                price: gammaFlip, color: '#e5b552', lineWidth: 2, lineStyle: LineStyle.Solid,
                axisLabelVisible: true, title: 'GAMMA FLIP',
            });
        }

        chart.timeScale().fitContent();
        const updateOverlayLayout = () => {
            const flipCoordinate = candles.priceToCoordinate(gammaFlip);
            const profileRows = profileRef.current.flatMap((row) => {
                const y = candles.priceToCoordinate(row.price);
                return y === null ? [] : [{ price: row.price, y }];
            });
            setOverlayLayout({
                flipY: flipCoordinate ?? (chartHostRef.current?.clientHeight || 460) * 0.52,
                profileRows,
            });
        };
        const scheduleOverlayUpdate = () => requestAnimationFrame(updateOverlayLayout);
        chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleOverlayUpdate);
        priceSeriesRef.current = candles;
        avwapSeriesRef.current = avwapSeries;
        const observer = new ResizeObserver(scheduleOverlayUpdate);
        observer.observe(chartHostRef.current);
        scheduleOverlayUpdate();

        return () => {
            observer.disconnect();
            chart.remove();
            priceSeriesRef.current = null;
            avwapSeriesRef.current = null;
        };
    }, [bars, dataMode, callWall, putWall, gammaFlip, chartLayers.walls, chartLayers.gammaFlip]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const series = priceSeriesRef.current;
            if (!series) return;
            const profileRows: Array<{ price: number; y: number }> = [];
            profile.forEach((row) => {
                const y = series.priceToCoordinate(row.price);
                if (y !== null) profileRows.push({ price: row.price, y: Number(y) });
            });
            setOverlayLayout((current) => ({ ...current, profileRows }));
        });
        return () => cancelAnimationFrame(frame);
    }, [profile]);

    useEffect(() => {
        avwapSeriesRef.current?.setData(chartLayers.avwap ? avwap : []);
    }, [avwap, chartLayers.avwap]);

    useEffect(() => {
        if (dataMode !== 'DEMO' || activeOrderFlowStudy !== 'CVD' || !cvdHostRef.current) return;
        const chart = createChart(cvdHostRef.current, {
            ...chartOptions,
            layout: { ...chartOptions.layout, background: { type: ColorType.Solid, color: '#070b11' } },
            rightPriceScale: { borderColor: '#1d2735', scaleMargins: { top: 0.12, bottom: 0.12 } },
        });
        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#2bb897', downColor: '#e05b70', borderVisible: false,
            wickUpColor: '#2bb897', wickDownColor: '#e05b70', priceLineVisible: false,
        });
        series.setData(cvdBars);
        series.createPriceLine({
            price: 0, color: '#536071', lineWidth: 1, lineStyle: LineStyle.Dotted,
            axisLabelVisible: false, title: 'RESET',
        });
        chart.timeScale().fitContent();
        return () => chart.remove();
    }, [activeOrderFlowStudy, cvdBars, dataMode]);

    useEffect(() => {
        if (!dragTarget) return;
        const move = (event: PointerEvent) => {
            const host = chartHostRef.current;
            if (!host) return;
            const rect = host.getBoundingClientRect();
            const index = Math.max(0, Math.min(bars.length - 1, Math.round(((event.clientX - rect.left) / rect.width) * (bars.length - 1))));
            if (dragTarget === 'range-start') setRange((current) => ({ ...current, start: Math.min(index, current.end - 6) }));
            if (dragTarget === 'range-end') setRange((current) => ({ ...current, end: Math.max(index, current.start + 6) }));
            if (dragTarget === 'anchor') setAnchorIndex(index);
            if (dragTarget === 'range-body' && dragOriginRef.current) {
                const originIndex = Math.round(((dragOriginRef.current.x - rect.left) / rect.width) * (bars.length - 1));
                const delta = index - originIndex;
                const width = dragOriginRef.current.end - dragOriginRef.current.start;
                const start = Math.max(0, Math.min(bars.length - 1 - width, dragOriginRef.current.start + delta));
                setRange({ start, end: start + width });
            }
        };
        const up = () => {
            setDragTarget(null);
            dragOriginRef.current = null;
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [bars.length, dragTarget]);

    if (dataMode !== 'DEMO') {
        return (
            <div className="flex h-full min-h-0 items-center justify-center bg-[#080c13] p-6">
                <div className="max-w-md rounded-lg border border-amber-500/25 bg-[#0b111a] p-5 text-center">
                    <div className="mb-2 text-[10px] font-bold tracking-[0.18em] text-amber-300">PRICE SERIES · UNAVAILABLE</div>
                    <p className="text-pretty text-sm text-zinc-300">
                        The current live frontend contract supplies options structure, but no authorized candle or order-flow series. Switch to Demo to inspect the complete UI safely.
                    </p>
                </div>
            </div>
        );
    }

    const maxProfile = Math.max(...profile.map((row) => row.volume), 1);
    const leftPct = (range.start / (bars.length - 1)) * 100;
    const rightPct = (range.end / (bars.length - 1)) * 100;
    const anchorPct = (anchorIndex / (bars.length - 1)) * 100;

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#080c13]">
            <div className="relative min-h-[320px] flex-1 overflow-hidden" role="group" aria-label="Demo BTC price chart with options structure overlays">
                <div ref={chartHostRef} className="absolute inset-0" />

                {chartLayers.gammaRegime && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10" style={{ height: Math.max(0, overlayLayout.flipY) }}>
                        <div className={`h-full border-b ${positiveGamma ? 'border-emerald-400/20 bg-emerald-400/[0.045]' : 'border-rose-400/20 bg-rose-400/[0.045]'}`} />
                        <span className="absolute left-3 top-3 rounded border border-white/10 bg-[#080c13]/85 px-2 py-1 text-[9px] font-bold tracking-wider text-zinc-300">
                            {positiveGamma ? '+ GAMMA · STABILIZING' : '− GAMMA · ACCELERATING'}
                        </span>
                    </div>
                )}

                {chartLayers.volumeProfile && (
                    <div
                        className="absolute bottom-7 top-2 z-20 border-x border-cyan-400/30 bg-cyan-400/[0.025]"
                        style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
                    >
                        <button
                            type="button"
                            aria-label="Move fixed range volume profile"
                            onPointerDown={(event) => {
                                dragOriginRef.current = { x: event.clientX, start: range.start, end: range.end };
                                setDragTarget('range-body');
                            }}
                            className="absolute inset-0 cursor-move"
                        />
                        {profile.map((row) => {
                            const y = overlayLayout.profileRows.find((position) => position.price === row.price)?.y;
                            if (y === undefined) return null;
                            const width = (row.volume / maxProfile) * 72;
                            return (
                                <div key={row.price} className="pointer-events-none absolute right-0 flex h-2 -translate-y-1/2 justify-end" style={{ top: y, width: `${width}%` }}>
                                    <span className="h-full bg-rose-400/45" style={{ width: `${(1 - row.buyShare) * 100}%` }} />
                                    <span className="h-full bg-emerald-400/55" style={{ width: `${row.buyShare * 100}%` }} />
                                </div>
                            );
                        })}
                        <button type="button" aria-label="Adjust volume profile start" onPointerDown={() => setDragTarget('range-start')} className="absolute -left-2 top-1/2 flex h-12 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded border border-cyan-300/40 bg-[#101924] text-cyan-200">
                            <GripVertical className="h-3 w-3" />
                        </button>
                        <button type="button" aria-label="Adjust volume profile end" onPointerDown={() => setDragTarget('range-end')} className="absolute -right-2 top-1/2 flex h-12 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded border border-cyan-300/40 bg-[#101924] text-cyan-200">
                            <GripVertical className="h-3 w-3" />
                        </button>
                        <span className="pointer-events-none absolute left-2 top-2 rounded bg-[#09101a]/90 px-2 py-1 text-[9px] font-semibold text-cyan-200">FIXED RANGE VP · DEMO</span>
                    </div>
                )}

                {chartLayers.avwap && (
                    <button
                        type="button"
                        aria-label="Move anchored VWAP anchor"
                        onPointerDown={() => setDragTarget('anchor')}
                        className="absolute bottom-8 z-30 flex h-7 w-7 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-full border border-sky-300/70 bg-[#0b1722] text-sky-200 shadow-sm"
                        style={{ left: `${anchorPct}%` }}
                        title="Drag to re-anchor AVWAP"
                    >
                        <MoveHorizontal className="h-3.5 w-3.5" />
                    </button>
                )}

                <div className="pointer-events-none absolute left-3 top-12 z-30 flex flex-col gap-1 text-[9px] font-medium">
                    {chartLayers.walls && <span className="w-fit rounded border border-emerald-400/20 bg-[#080c13]/85 px-2 py-1 text-emerald-300">CALL WALL {money(callWall)} · {useTerminalStore.getState().dteFilter}</span>}
                    {chartLayers.walls && <span className="w-fit rounded border border-rose-400/20 bg-[#080c13]/85 px-2 py-1 text-rose-300">PUT WALL {money(putWall)} · {useTerminalStore.getState().dteFilter}</span>}
                </div>
            </div>

            <div className="flex h-8 shrink-0 items-center justify-between border-y border-[#1b2532] bg-[#090e16] px-3 text-[10px]">
                <div className="flex items-center gap-3">
                    <span className="font-bold text-zinc-200">{activeOrderFlowStudy}</span>
                    <span className="rounded border border-amber-400/25 px-1.5 py-0.5 text-amber-300">DEMO</span>
                    <span className="text-zinc-500">Session anchor · 15m intrabar approximation</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                    <Lock className="h-3 w-3" />
                    <button type="button" aria-label="Reset chart objects" onClick={() => { setRange({ start: 104, end: 178 }); setAnchorIndex(124); }} className="rounded p-1 hover:bg-white/5 hover:text-zinc-200">
                        <RotateCcw className="h-3 w-3" />
                    </button>
                </div>
            </div>

            <div className="relative h-[28%] min-h-[118px] shrink-0 bg-[#070b11]">
                {activeOrderFlowStudy === 'CVD' ? (
                    <div ref={cvdHostRef} className="absolute inset-0" role="img" aria-label="Demo cumulative volume delta candles" />
                ) : (
                    <div className="flex h-full items-center justify-center text-center">
                        <div>
                            <div className="text-[10px] font-bold tracking-wider text-amber-300">{activeOrderFlowStudy} · UNAVAILABLE</div>
                            <p className="mt-1 text-xs text-zinc-500">No authorized frontend series is connected for this study.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
