'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    CandlestickSeries,
    ColorType,
    createChart,
    CrosshairMode,
    HistogramSeries,
    LineSeries,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
} from 'lightweight-charts';
import { Eye, GripVertical, Lock, Move, RotateCcw, Settings, Trash2, Unlock } from 'lucide-react';
import type { TerrainDataContractV2 } from '@/lib/terrain/types';
import { useTerminalStore } from '@/lib/dashboard/store';
import { cn } from '@/lib/ui/cn';
import {
    calculateVolumeProfileLevels,
    createDemoAvwapBands,
    createDemoCvd,
    createDemoMarketBars,
    createDemoVolumeProfile,
    type DemoMarketBar,
} from '@/lib/ui/market-fixtures';
import { TIMEFRAME_SECONDS, type ChartTimeframe, type ChartTool } from './types';

type PriceSeries = ISeriesApi<'Candlestick'>;
type LineSeriesApi = ISeriesApi<'Line'>;

interface MarketStructureChartProps {
    data: TerrainDataContractV2;
    activeTool: ChartTool;
    timeframe: ChartTimeframe;
    replayActive: boolean;
}

interface OverlayLevel {
    price: number;
    y: number;
}

interface OverlayLayout {
    height: number;
    flipY: number;
    callY: number | null;
    putY: number | null;
    maxPainY: number | null;
    anchorY: number | null;
    profileRows: OverlayLevel[];
    secondaryRows: Array<OverlayLevel & { dte: number }>;
    vahY: number | null;
    pocY: number | null;
    valY: number | null;
}

interface DrawingObject {
    id: string;
    type: ChartTool;
    x1: number;
    y1: number;
    x2?: number;
    y2?: number;
}

const chartOptions = {
    autoSize: true,
    layout: {
        background: { type: ColorType.Solid, color: '#080d14' },
        textColor: '#8a97aa',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 10,
        attributionLogo: false,
    },
    grid: {
        vertLines: { color: 'rgba(55, 70, 91, 0.22)' },
        horzLines: { color: 'rgba(55, 70, 91, 0.22)' },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#263346', scaleMargins: { top: 0.08, bottom: 0.18 } },
    timeScale: { borderColor: '#263346', timeVisible: true, secondsVisible: false, rightOffset: 5 },
    handleScroll: true,
    handleScale: true,
};

function money(value: number) {
    return `$${Math.round(value).toLocaleString()}`;
}

function compact(value: number) {
    const absolute = Math.abs(value);
    const sign = value < 0 ? '−' : '';
    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(2)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
    return `${sign}${absolute.toFixed(0)}`;
}

function numeric(value: unknown, fallback?: number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function levelStrike(value: unknown): number | undefined {
    if (typeof value === 'number') return numeric(value);
    if (value && typeof value === 'object') return numeric((value as { strike?: unknown }).strike);
    return undefined;
}

function chartPercent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
}

function DrawingLayer({ drawings }: { drawings: DrawingObject[] }) {
    return (
        <svg className="pointer-events-none absolute inset-0 z-30 size-full" aria-hidden="true">
            {drawings.map((drawing) => {
                if (drawing.type === 'horizontal') return <line key={drawing.id} x1="0" y1={`${drawing.y1}%`} x2="100%" y2={`${drawing.y1}%`} stroke="#79d5ff" strokeWidth="1.5" strokeDasharray="6 4" />;
                if (drawing.type === 'vertical') return <line key={drawing.id} x1={`${drawing.x1}%`} y1="0" x2={`${drawing.x1}%`} y2="100%" stroke="#a8b6c9" strokeWidth="1" strokeDasharray="4 4" />;
                if (drawing.type === 'trendline') return <line key={drawing.id} x1={`${drawing.x1}%`} y1={`${drawing.y1}%`} x2={`${drawing.x2}%`} y2={`${drawing.y2}%`} stroke="#79d5ff" strokeWidth="2" />;
                if (drawing.type === 'rectangle') {
                    const left = Math.min(drawing.x1, drawing.x2 ?? drawing.x1);
                    const top = Math.min(drawing.y1, drawing.y2 ?? drawing.y1);
                    const width = Math.abs((drawing.x2 ?? drawing.x1) - drawing.x1);
                    const height = Math.abs((drawing.y2 ?? drawing.y1) - drawing.y1);
                    return <rect key={drawing.id} x={`${left}%`} y={`${top}%`} width={`${width}%`} height={`${height}%`} fill="rgba(73, 193, 255, 0.08)" stroke="#49c1ff" strokeWidth="1.5" />;
                }
                if (drawing.type === 'long-position' || drawing.type === 'short-position') {
                    const left = Math.min(drawing.x1, drawing.x2 ?? drawing.x1);
                    const top = Math.min(drawing.y1, drawing.y2 ?? drawing.y1);
                    const width = Math.abs((drawing.x2 ?? drawing.x1) - drawing.x1);
                    const height = Math.abs((drawing.y2 ?? drawing.y1) - drawing.y1);
                    const color = drawing.type === 'long-position' ? '#31c5a0' : '#ef6277';
                    return <rect key={drawing.id} x={`${left}%`} y={`${top}%`} width={`${width}%`} height={`${height}%`} fill={`${color}22`} stroke={color} strokeWidth="1.5" strokeDasharray="5 3" />;
                }
                if (drawing.type === 'text') return <text key={drawing.id} x={`${drawing.x1}%`} y={`${drawing.y1}%`} fill="#dce6f2" fontSize="11">NOTE</text>;
                return null;
            })}
        </svg>
    );
}

export default function MarketStructureChart({ data, activeTool, timeframe, replayActive }: MarketStructureChartProps) {
    const chartHostRef = useRef<HTMLDivElement>(null);
    const cvdHostRef = useRef<HTMLDivElement>(null);
    const priceChartRef = useRef<IChartApi | null>(null);
    const cvdChartRef = useRef<IChartApi | null>(null);
    const priceSeriesRef = useRef<PriceSeries | null>(null);
    const cvdSeriesRef = useRef<PriceSeries | null>(null);
    const avwapSeriesRef = useRef<LineSeriesApi | null>(null);
    const upperBandSeriesRef = useRef<LineSeriesApi | null>(null);
    const lowerBandSeriesRef = useRef<LineSeriesApi | null>(null);
    const profileRef = useRef<ReturnType<typeof createDemoVolumeProfile>>([]);
    const [overlayLayout, setOverlayLayout] = useState<OverlayLayout>({
        height: 460, flipY: 230, callY: null, putY: null, maxPainY: null, anchorY: null,
        profileRows: [], secondaryRows: [], vahY: null, pocY: null, valY: null,
    });
    const [range, setRange] = useState({ start: 78, end: 152 });
    const [anchorIndex, setAnchorIndex] = useState(66);
    const [profileRowCount, setProfileRowCount] = useState(24);
    const [showAvwapBands, setShowAvwapBands] = useState(true);
    const [selectedObject, setSelectedObject] = useState<'VP' | 'AVWAP' | null>('VP');
    const [objectLocked, setObjectLocked] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [dragTarget, setDragTarget] = useState<'range-start' | 'range-end' | 'range-body' | 'anchor' | null>(null);
    const [drawings, setDrawings] = useState<DrawingObject[]>([]);
    const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
    const [hoverBar, setHoverBar] = useState<DemoMarketBar | null>(null);
    const [drawingStatus, setDrawingStatus] = useState('');
    const dragOriginRef = useRef<{ x: number; start: number; end: number } | null>(null);

    const { dataMode, chartLayers, activeOrderFlowStudy, studyPaneOpen, dteFilter, toggleChartLayer } = useTerminalStore();
    const summary = data.summary as unknown as Record<string, unknown>;
    const keyLevels = (data.keyLevels || {}) as unknown as Record<string, unknown>;
    const spot = numeric(data.spotPrice, numeric(summary.spotPrice, 68_000)) ?? 68_000;
    const allBars = useMemo(() => createDemoMarketBars(spot, 192, TIMEFRAME_SECONDS[timeframe]), [spot, timeframe]);
    const bars = useMemo(() => replayActive ? allBars.slice(0, 160) : allBars, [allBars, replayActive]);
    const cvdBars = useMemo(() => createDemoCvd(bars), [bars]);
    const avwapBands = useMemo(() => createDemoAvwapBands(bars, Math.min(anchorIndex, bars.length - 1)), [bars, anchorIndex]);
    const profile = useMemo(() => createDemoVolumeProfile(bars, range.start, range.end, profileRowCount), [bars, range, profileRowCount]);
    const profileLevels = useMemo(() => calculateVolumeProfileLevels(profile), [profile]);

    const callWall = levelStrike(keyLevels.callWall) ?? numeric(summary.topPositiveGexStrike) ?? numeric(summary.callWall) ?? spot * 1.05;
    const putWall = levelStrike(keyLevels.putWall) ?? numeric(summary.topNegativeGexStrike) ?? numeric(summary.putWall) ?? spot * 0.95;
    const gammaFlip = levelStrike(keyLevels.gammaFlip) ?? numeric(summary.gammaFlip) ?? spot;
    const maxPain = levelStrike(keyLevels.primaryMaxPain) ?? numeric(summary.maxPainStrike) ?? spot;
    const positiveGamma = (numeric(summary.netGex, 0) ?? 0) >= 0;
    const secondaryLevels = useMemo(() => {
        const lowerBound = Math.min(putWall, gammaFlip, spot) * 0.99;
        const upperBound = Math.max(callWall, spot) * 1.02;
        const candidates = (data.confluenceLevels || [])
            .filter((level) => Math.abs(level.strike - callWall) > 1 && Math.abs(level.strike - putWall) > 1)
            .filter((level) => level.strike >= lowerBound && level.strike <= upperBound)
            .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
            .slice(0, 2)
            .map((level) => ({ price: level.strike, dte: level.dte }));
        if (dataMode !== 'DEMO' || candidates.length >= 2) return candidates;
        const levelSpan = Math.max(callWall - putWall, spot * 0.02);
        const demoFallbacks = [
            { price: callWall + levelSpan * 0.12, dte: 7 },
            { price: putWall + levelSpan * 0.12, dte: 7 },
        ];
        return [...candidates, ...demoFallbacks]
            .filter((level, index, rows) => rows.findIndex((row) => Math.abs(row.price - level.price) < 1) === index)
            .slice(0, 2);
    }, [callWall, data.confluenceLevels, dataMode, gammaFlip, putWall, spot]);
    const lastBar = hoverBar ?? bars.at(-1) ?? null;
    const lastCvd = cvdBars.at(-1)?.close ?? 0;
    const leftPct = (range.start / Math.max(bars.length - 1, 1)) * 100;
    const rightPct = (Math.min(range.end, bars.length - 1) / Math.max(bars.length - 1, 1)) * 100;
    const anchorPct = (Math.min(anchorIndex, bars.length - 1) / Math.max(bars.length - 1, 1)) * 100;
    const maxProfile = Math.max(...profile.map((row) => row.volume), 1);

    useEffect(() => { profileRef.current = profile; }, [profile]);

    useEffect(() => {
        if (dataMode !== 'DEMO' || !chartHostRef.current) return;
        const chart = createChart(chartHostRef.current, chartOptions);
        const candles = chart.addSeries(CandlestickSeries, {
            upColor: '#27d3aa', downColor: '#ef5d73', borderVisible: false,
            wickUpColor: '#27d3aa', wickDownColor: '#ef5d73', priceLineVisible: true,
            priceLineColor: '#27d3aa', lastValueVisible: true,
        });
        candles.setData(bars);
        const volume = chart.addSeries(HistogramSeries, {
            priceScaleId: 'volume', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false,
        });
        volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        volume.setData(chartLayers.volume ? bars.map((bar) => ({
            time: bar.time, value: bar.volume,
            color: bar.close >= bar.open ? 'rgba(39, 211, 170, 0.42)' : 'rgba(239, 93, 115, 0.42)',
        })) : []);

        const bounds = chart.addSeries(LineSeries, {
            color: 'rgba(0,0,0,0)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const visibleLevels = [callWall, putWall, gammaFlip, maxPain, ...secondaryLevels.map((level) => level.price)];
        const lowBound = Math.min(...bars.map((bar) => bar.low), ...visibleLevels) * 0.998;
        const highBound = Math.max(...bars.map((bar) => bar.high), ...visibleLevels) * 1.002;
        bounds.setData([{ time: bars[0].time, value: lowBound }, { time: bars[bars.length - 1].time, value: highBound }]);

        const avwapSeries = chart.addSeries(LineSeries, {
            color: '#32aef4', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const upperBand = chart.addSeries(LineSeries, {
            color: 'rgba(115, 190, 235, 0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const lowerBand = chart.addSeries(LineSeries, {
            color: 'rgba(115, 190, 235, 0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });

        if (chartLayers.walls) {
            candles.createPriceLine({ price: callWall, color: '#2fd8af', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'CALL WALL' });
            candles.createPriceLine({ price: putWall, color: '#f05c73', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'PUT WALL' });
        }
        if (chartLayers.secondaryWalls) secondaryLevels.forEach((level) => candles.createPriceLine({
            price: level.price, color: 'rgba(180, 192, 209, 0.7)', lineWidth: 1,
            lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${level.dte}D`,
        }));
        if (chartLayers.gammaFlip) candles.createPriceLine({ price: gammaFlip, color: '#3da7ff', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'GAMMA FLIP' });
        if (chartLayers.maxPain) candles.createPriceLine({ price: maxPain, color: '#d6dae1', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: 'MAX PAIN' });

        chart.timeScale().fitContent();
        const updateOverlayLayout = () => {
            const hostHeight = chartHostRef.current?.clientHeight || 460;
            const coordinate = (price: number) => {
                const y = candles.priceToCoordinate(price);
                return y === null ? null : Number(y);
            };
            const anchorBar = bars[Math.min(anchorIndex, bars.length - 1)];
            setOverlayLayout({
                height: hostHeight,
                flipY: coordinate(gammaFlip) ?? hostHeight * 0.52,
                callY: coordinate(callWall), putY: coordinate(putWall), maxPainY: coordinate(maxPain),
                anchorY: anchorBar ? coordinate(anchorBar.low) : null,
                profileRows: profileRef.current.flatMap((row) => {
                    const y = coordinate(row.price); return y === null ? [] : [{ price: row.price, y }];
                }),
                secondaryRows: secondaryLevels.flatMap((level) => {
                    const y = coordinate(level.price); return y === null ? [] : [{ ...level, y }];
                }),
                vahY: profileLevels ? coordinate(profileLevels.vah) : null,
                pocY: profileLevels ? coordinate(profileLevels.poc) : null,
                valY: profileLevels ? coordinate(profileLevels.val) : null,
            });
        };
        const scheduleOverlayUpdate = () => requestAnimationFrame(updateOverlayLayout);
        chart.timeScale().subscribeVisibleLogicalRangeChange((rangeValue) => {
            scheduleOverlayUpdate();
            if (rangeValue && cvdChartRef.current) cvdChartRef.current.timeScale().setVisibleLogicalRange(rangeValue);
        });
        chart.subscribeCrosshairMove((param) => {
            const point = param.seriesData.get(candles) as DemoMarketBar | undefined;
            setHoverBar(point ?? null);
            if (!param.time || !cvdSeriesRef.current || !cvdChartRef.current) return;
            const cvdPoint = cvdBars.find((bar) => Number(bar.time) === Number(param.time));
            if (cvdPoint) cvdChartRef.current.setCrosshairPosition(cvdPoint.close, param.time, cvdSeriesRef.current);
        });
        priceChartRef.current = chart;
        priceSeriesRef.current = candles;
        avwapSeriesRef.current = avwapSeries;
        upperBandSeriesRef.current = upperBand;
        lowerBandSeriesRef.current = lowerBand;
        const observer = new ResizeObserver(scheduleOverlayUpdate);
        observer.observe(chartHostRef.current);
        scheduleOverlayUpdate();

        return () => {
            observer.disconnect(); chart.remove(); priceChartRef.current = null; priceSeriesRef.current = null;
            avwapSeriesRef.current = null; upperBandSeriesRef.current = null; lowerBandSeriesRef.current = null;
        };
    }, [anchorIndex, bars, callWall, chartLayers.gammaFlip, chartLayers.maxPain, chartLayers.secondaryWalls, chartLayers.volume, chartLayers.walls, cvdBars, dataMode, gammaFlip, maxPain, profileLevels, putWall, secondaryLevels]);

    useEffect(() => {
        avwapSeriesRef.current?.setData(chartLayers.avwap ? avwapBands.center : []);
        upperBandSeriesRef.current?.setData(chartLayers.avwap && showAvwapBands ? avwapBands.upper : []);
        lowerBandSeriesRef.current?.setData(chartLayers.avwap && showAvwapBands ? avwapBands.lower : []);
    }, [avwapBands, chartLayers.avwap, showAvwapBands]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const series = priceSeriesRef.current;
            if (!series) return;
            const coordinate = (price: number) => {
                const y = series.priceToCoordinate(price); return y === null ? null : Number(y);
            };
            setOverlayLayout((current) => ({
                ...current,
                profileRows: profile.flatMap((row) => { const y = coordinate(row.price); return y === null ? [] : [{ price: row.price, y }]; }),
                vahY: profileLevels ? coordinate(profileLevels.vah) : null,
                pocY: profileLevels ? coordinate(profileLevels.poc) : null,
                valY: profileLevels ? coordinate(profileLevels.val) : null,
            }));
        });
        return () => cancelAnimationFrame(frame);
    }, [profile, profileLevels]);

    useEffect(() => {
        if (dataMode !== 'DEMO' || activeOrderFlowStudy !== 'CVD' || !studyPaneOpen || !cvdHostRef.current) return;
        const chart = createChart(cvdHostRef.current, {
            ...chartOptions,
            layout: { ...chartOptions.layout, background: { type: ColorType.Solid, color: '#070b11' } },
            rightPriceScale: { borderColor: '#263346', scaleMargins: { top: 0.16, bottom: 0.14 } },
        });
        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#27d3aa', downColor: '#ef5d73', borderVisible: false,
            wickUpColor: '#27d3aa', wickDownColor: '#ef5d73', priceLineVisible: false, lastValueVisible: true,
        });
        series.setData(cvdBars);
        series.createPriceLine({ price: 0, color: '#657287', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'ZERO' });
        chart.timeScale().fitContent();
        const mainRange = priceChartRef.current?.timeScale().getVisibleLogicalRange();
        if (mainRange) chart.timeScale().setVisibleLogicalRange(mainRange);
        cvdChartRef.current = chart;
        cvdSeriesRef.current = series;
        return () => { chart.remove(); cvdChartRef.current = null; cvdSeriesRef.current = null; };
    }, [activeOrderFlowStudy, cvdBars, dataMode, studyPaneOpen]);

    useEffect(() => {
        if (!dragTarget || objectLocked) return;
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
        const up = () => { setDragTarget(null); dragOriginRef.current = null; };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    }, [bars.length, dragTarget, objectLocked]);

    function handleDrawing(event: React.PointerEvent<HTMLDivElement>) {
        if (activeTool === 'cursor') return;
        const point = chartPercent(event);
        const oneClickTool = activeTool === 'horizontal' || activeTool === 'vertical' || activeTool === 'text';
        if (oneClickTool) {
            setDrawings((current) => [...current, { id: crypto.randomUUID(), type: activeTool, x1: point.x, y1: point.y }]);
            setDrawingStatus(`${activeTool} added`);
            return;
        }
        if (!drawingStart) {
            setDrawingStart(point);
            setDrawingStatus('Select the second point');
            return;
        }
        setDrawings((current) => [...current, { id: crypto.randomUUID(), type: activeTool, x1: drawingStart.x, y1: drawingStart.y, x2: point.x, y2: point.y }]);
        setDrawingStart(null);
        setDrawingStatus(`${activeTool} added`);
    }

    if (dataMode !== 'DEMO') {
        return (
            <div className="flex h-full min-h-0 items-center justify-center bg-[#080c13] p-6">
                <div className="max-w-md rounded-lg border border-amber-500/25 bg-[#0b111a] p-5 text-center">
                    <div className="mb-2 text-[10px] font-bold text-amber-300">PRICE SERIES · UNAVAILABLE</div>
                    <p className="text-pretty text-sm text-zinc-300">The live frontend contract supplies options structure, but no authorized candle or order-flow series. Switch to Demo to inspect the complete UI safely.</p>
                    <button type="button" onClick={() => useTerminalStore.getState().setDataMode('DEMO')} className="mt-4 rounded border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200">OPEN DEMO WORKSPACE</button>
                </div>
            </div>
        );
    }

    const valueAreaTop = overlayLayout.vahY === null || overlayLayout.valY === null ? null : Math.min(overlayLayout.vahY, overlayLayout.valY);
    const valueAreaHeight = overlayLayout.vahY === null || overlayLayout.valY === null ? 0 : Math.abs(overlayLayout.valY - overlayLayout.vahY);

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#080d14]">
            <div className="relative min-h-[310px] flex-1 overflow-hidden" role="group" aria-label="Demo BTC price chart with options structure overlays">
                <div ref={chartHostRef} className="absolute inset-0" />
                {lastBar && <div className="pointer-events-none absolute left-3 top-2 z-40 flex items-center gap-2 rounded bg-[#070c13]/90 px-2 py-1 font-mono text-[10px] tabular-nums text-zinc-400">
                    <span>O <b className="text-zinc-200">{lastBar.open.toFixed(1)}</b></span><span>H <b className="text-emerald-300">{lastBar.high.toFixed(1)}</b></span><span>L <b className="text-rose-300">{lastBar.low.toFixed(1)}</b></span><span>C <b className="text-cyan-200">{lastBar.close.toFixed(1)}</b></span><span className={lastBar.close >= lastBar.open ? 'text-emerald-300' : 'text-rose-300'}>{lastBar.close >= lastBar.open ? '+' : ''}{(lastBar.close - lastBar.open).toFixed(1)}</span>
                </div>}

                {chartLayers.gammaRegime && <div className="pointer-events-none absolute inset-0 z-10">
                    <div className={cn('absolute inset-x-0 top-0 border-b border-emerald-400/25 bg-emerald-400/[0.045]', positiveGamma && 'bg-emerald-400/[0.075]')} style={{ height: Math.max(0, overlayLayout.flipY) }}><span className="absolute left-3 top-10 rounded border border-emerald-400/20 bg-[#07120f]/90 px-2 py-1 text-[9px] font-bold text-emerald-300">POSITIVE GAMMA · MEAN-REVERSION</span></div>
                    <div className={cn('absolute inset-x-0 bottom-0 border-t border-rose-400/20 bg-rose-400/[0.035]', !positiveGamma && 'bg-rose-400/[0.07]')} style={{ top: Math.max(0, overlayLayout.flipY) }}><span className="absolute bottom-8 left-3 rounded border border-rose-400/20 bg-[#140a0e]/90 px-2 py-1 text-[9px] font-bold text-rose-300">NEGATIVE GAMMA · EXPANSION</span></div>
                </div>}

                {chartLayers.walls && overlayLayout.callY !== null && <div className="pointer-events-none absolute inset-x-0 z-20 h-2 -translate-y-1/2 border-y border-emerald-300/35 bg-emerald-400/15" style={{ top: overlayLayout.callY }}><span className="absolute right-16 -top-5 rounded bg-[#07130f]/95 px-2 py-0.5 text-[9px] font-bold text-emerald-300">CALL WALL {money(callWall)} · {dteFilter}</span></div>}
                {chartLayers.walls && overlayLayout.putY !== null && <div className="pointer-events-none absolute inset-x-0 z-20 h-2 -translate-y-1/2 border-y border-rose-300/35 bg-rose-400/15" style={{ top: overlayLayout.putY }}><span className="absolute right-16 top-2 rounded bg-[#160a0f]/95 px-2 py-0.5 text-[9px] font-bold text-rose-300">PUT WALL {money(putWall)} · {dteFilter}</span></div>}
                {chartLayers.secondaryWalls && overlayLayout.secondaryRows.map((level) => <div key={`${level.price}-${level.dte}`} className="pointer-events-none absolute inset-x-0 z-20 border-t border-dashed border-zinc-400/45" style={{ top: level.y }}><span className="absolute right-16 -top-4 text-[8px] font-semibold text-zinc-400">{money(level.price)} · {level.dte}D</span></div>)}
                {chartLayers.maxPain && overlayLayout.maxPainY !== null && <div className="pointer-events-none absolute inset-x-0 z-20 border-t border-dotted border-zinc-300/45" style={{ top: overlayLayout.maxPainY }}><span className="absolute left-[52%] -top-4 text-[8px] font-semibold text-zinc-300">MAX PAIN {money(maxPain)}</span></div>}

                {chartLayers.volumeProfile && <div
                    className={cn('absolute bottom-7 top-0 z-20 border-x border-cyan-400/40 bg-cyan-400/[0.025]', selectedObject === 'VP' && 'ring-1 ring-inset ring-cyan-300/30')}
                    style={{ left: `${leftPct}%`, width: `${Math.max(4, rightPct - leftPct)}%` }}
                    onPointerDown={(event) => { if (objectLocked) return; setSelectedObject('VP'); dragOriginRef.current = { x: event.clientX, start: range.start, end: range.end }; setDragTarget('range-body'); }}
                >
                    {valueAreaTop !== null && <div className="pointer-events-none absolute inset-x-0 bg-sky-400/[0.045]" style={{ top: valueAreaTop, height: valueAreaHeight }} />}
                    {profile.map((row) => {
                        const y = overlayLayout.profileRows.find((position) => position.price === row.price)?.y;
                        if (y === undefined) return null;
                        const width = (row.volume / maxProfile) * 68;
                        return <div key={row.price} className="pointer-events-none absolute right-0 flex h-2 -translate-y-1/2 justify-end" style={{ top: y, width: `${width}%` }}><span className="h-full bg-rose-400/55" style={{ width: `${(1 - row.buyShare) * 100}%` }} /><span className="h-full bg-sky-400/65" style={{ width: `${row.buyShare * 100}%` }} /></div>;
                    })}
                    {[
                        ['VAH', profileLevels?.vah, overlayLayout.vahY, 'border-sky-300/50 text-sky-200'],
                        ['POC', profileLevels?.poc, overlayLayout.pocY, 'border-rose-300/70 text-rose-300'],
                        ['VAL', profileLevels?.val, overlayLayout.valY, 'border-sky-300/50 text-sky-200'],
                    ].map(([label, price, y, classes]) => typeof y === 'number' && typeof price === 'number' ? <div key={String(label)} className={cn('pointer-events-none absolute inset-x-0 border-t', String(classes).split(' ')[0])} style={{ top: y }}><span className={cn('absolute right-1 -top-4 bg-[#08101a]/95 px-1 text-[8px] font-semibold', String(classes).split(' ')[1])}>{label} {Math.round(price).toLocaleString()}</span></div> : null)}
                    {!objectLocked && <><button type="button" aria-label="Adjust volume profile start" onPointerDown={(event) => { event.stopPropagation(); setDragTarget('range-start'); }} className="absolute -left-2 top-1/2 z-30 flex h-12 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded border border-cyan-300/50 bg-[#101924] text-cyan-200"><GripVertical className="size-3" /></button><button type="button" aria-label="Adjust volume profile end" onPointerDown={(event) => { event.stopPropagation(); setDragTarget('range-end'); }} className="absolute -right-2 top-1/2 z-30 flex h-12 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded border border-cyan-300/50 bg-[#101924] text-cyan-200"><GripVertical className="size-3" /></button></>}
                    <span className="pointer-events-none absolute left-2 top-2 rounded bg-[#09101a]/95 px-2 py-1 text-[9px] font-semibold text-cyan-200">FIXED RANGE VP · DEMO</span>
                </div>}

                {chartLayers.avwap && overlayLayout.anchorY !== null && <><button type="button" aria-label="Move anchored VWAP anchor" onPointerDown={(event) => { event.stopPropagation(); if (!objectLocked) setDragTarget('anchor'); setSelectedObject('AVWAP'); }} className="absolute z-40 flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-sky-300 bg-[#0b1722] text-sky-200 shadow-sm" style={{ left: `${anchorPct}%`, top: overlayLayout.anchorY }} title="Drag to re-anchor AVWAP"><span className="size-1.5 rounded-full bg-sky-300" /></button><span className="pointer-events-none absolute z-40 whitespace-nowrap rounded border border-sky-400/40 bg-[#07111c]/95 px-2 py-1 text-[9px] font-semibold text-sky-200" style={{ left: `calc(${anchorPct}% + 12px)`, top: Math.max(0, overlayLayout.anchorY - 10) }}>AVWAP · Swing Low</span></>}

                {selectedObject && ((selectedObject === 'VP' && chartLayers.volumeProfile) || (selectedObject === 'AVWAP' && chartLayers.avwap)) && <div className="absolute left-1/2 top-11 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-[#33445a] bg-[#0b121c] p-1 shadow-lg" role="toolbar" aria-label={`${selectedObject} controls`}>
                    <button type="button" aria-label={`Move ${selectedObject}`} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Move className="size-3.5" /></button>
                    <button type="button" aria-label={objectLocked ? `Unlock ${selectedObject}` : `Lock ${selectedObject}`} onClick={() => setObjectLocked((locked) => !locked)} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100">{objectLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}</button>
                    <button type="button" aria-label={`${selectedObject} settings`} onClick={() => setSettingsOpen((open) => !open)} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Settings className="size-3.5" /></button>
                    <button type="button" aria-label={`Hide ${selectedObject}`} onClick={() => toggleChartLayer(selectedObject === 'VP' ? 'volumeProfile' : 'avwap')} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Eye className="size-3.5" /></button>
                    <button type="button" aria-label={`Remove ${selectedObject}`} onClick={() => { toggleChartLayer(selectedObject === 'VP' ? 'volumeProfile' : 'avwap'); setSelectedObject(null); }} className="rounded p-1.5 text-rose-300 hover:bg-rose-400/10"><Trash2 className="size-3.5" /></button>
                    {settingsOpen && <div className="absolute left-1/2 top-10 w-48 -translate-x-1/2 rounded-md border border-[#33445a] bg-[#0b121c] p-2 text-[9px] text-zinc-300 shadow-lg">{selectedObject === 'VP' ? <><label htmlFor="profile-rows" className="mb-1 block text-zinc-500">Profile rows</label><select id="profile-rows" value={profileRowCount} onChange={(event) => setProfileRowCount(Number(event.target.value))} className="h-8 w-full rounded border border-[#33445a] bg-[#080d14] px-2"><option value={18}>18 rows</option><option value={24}>24 rows</option><option value={36}>36 rows</option></select></> : <label className="flex items-center justify-between gap-3"><span>Deviation bands</span><input type="checkbox" checked={showAvwapBands} onChange={(event) => setShowAvwapBands(event.target.checked)} /></label>}</div>}
                </div>}

                <DrawingLayer drawings={drawings} />
                <div className={cn('absolute inset-0 z-40', activeTool === 'cursor' ? 'pointer-events-none' : 'cursor-crosshair')} onPointerDown={handleDrawing} aria-hidden={activeTool === 'cursor'} />
                <span className="sr-only" aria-live="polite">{drawingStatus}</span>
                {replayActive && <div className="absolute bottom-10 left-3 z-40 rounded border border-amber-400/35 bg-[#181307]/90 px-2 py-1 text-[9px] font-bold text-amber-300">REPLAY PAUSED · HISTORICAL DEMO</div>}
            </div>

            {studyPaneOpen && <><div className="flex h-9 shrink-0 items-center justify-between border-y border-[#263346] bg-[#090f18] px-3 text-[9px]"><div className="flex min-w-0 items-center gap-3"><span className="font-bold text-zinc-100">{activeOrderFlowStudy === 'CVD' ? 'Cumulative Volume Delta' : activeOrderFlowStudy}</span>{activeOrderFlowStudy === 'CVD' && <span className="font-mono text-sm font-semibold tabular-nums text-emerald-300">{compact(lastCvd)}</span>}<span className="hidden text-zinc-500 sm:inline">Anchor: 1D</span><span className="hidden text-zinc-500 lg:inline">Intrabar: Trades</span></div><div className="flex items-center gap-2"><span className="rounded border border-sky-400/35 px-1.5 py-0.5 text-sky-300">SHADOW DATA</span><span className="rounded border border-emerald-400/35 px-1.5 py-0.5 text-emerald-300">Coverage 96%</span><button type="button" aria-label="Reset chart objects" onClick={() => { setRange({ start: 78, end: 152 }); setAnchorIndex(66); setDrawings([]); }} className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"><RotateCcw className="size-3.5" /></button></div></div><div className="relative h-[28%] min-h-[135px] shrink-0 bg-[#070b11]">{activeOrderFlowStudy === 'CVD' ? <><div ref={cvdHostRef} className="absolute inset-0" role="img" aria-label="Demo cumulative volume delta candles" /><div className="pointer-events-none absolute inset-y-0 left-[62%] z-20 border-l border-dashed border-zinc-400/65"><span className="absolute left-1 top-1 text-[8px] text-zinc-400">Session reset</span></div></> : <div className="flex h-full items-center justify-center text-center"><div><div className="text-[10px] font-bold text-amber-300">{activeOrderFlowStudy} · UNAVAILABLE</div><p className="mt-1 text-pretty text-xs text-zinc-500">No authorized frontend series is connected for this study.</p></div></div>}</div></>}
        </div>
    );
}
