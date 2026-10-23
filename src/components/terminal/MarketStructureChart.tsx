'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
    CandlestickSeries,
    ColorType,
    createChart,
    CrosshairMode,
    HistogramSeries,
    LineSeries,
    LineStyle,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type LogicalRange,
} from 'lightweight-charts';
import { Eye, GripVertical, Lock, Move, RotateCcw, Settings, Trash2, Undo2, Unlock } from 'lucide-react';
import type { TerrainDataContractV2 } from '@/lib/terrain/types';
import { buildCvdBars, buildDeltaHistogram, selectLiquidityLevels, type CvdAnchor } from '@/lib/binance/analytics';
import type { BinanceMarketFeed } from '@/lib/binance/use-market-feed';
import { useBinanceVolumeProfile } from '@/lib/binance/use-volume-profile';
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
import ChartDrawingLayer, {
    type ChartDrawingObject,
    type ChartDrawingPoint,
    type ChartDrawingView,
    type DrawingDragTarget,
} from './ChartDrawingLayer';

type PriceSeries = ISeriesApi<'Candlestick'>;
type LineSeriesApi = ISeriesApi<'Line'>;
type HistogramSeriesApi = ISeriesApi<'Histogram'>;
type ProfileVolumeMode = 'TOTAL' | 'UP_DOWN' | 'DELTA';
type ProfilePlacement = 'LEFT' | 'RIGHT';
type CvdAnchorOption = 'AUTO' | CvdAnchor;

interface FlowCvdBar {
    time: DemoMarketBar['time'];
    open: number;
    high: number;
    low: number;
    close: number;
    reset?: boolean;
}

interface ProfileRange {
    startTime: number;
    endTime: number;
}

interface MarketStructureChartProps {
    data: TerrainDataContractV2;
    marketFeed: BinanceMarketFeed;
    activeTool: ChartTool;
    timeframe: ChartTimeframe;
    replayActive: boolean;
    onActiveToolChange: (tool: ChartTool) => void;
}

interface OverlayLevel {
    price: number;
    y: number;
}

interface OverlayLayout {
    width: number;
    height: number;
    flipY: number;
    callY: number | null;
    putY: number | null;
    maxPainY: number | null;
    anchorX: number | null;
    anchorY: number | null;
    profileLeftX: number | null;
    profileRightX: number | null;
    profileRows: OverlayLevel[];
    secondaryRows: Array<OverlayLevel & { dte: number }>;
    vahY: number | null;
    pocY: number | null;
    valY: number | null;
}

interface DrawingDragState {
    drawingId: string;
    target: DrawingDragTarget;
    startPoint: ChartDrawingPoint;
    startIndex: number;
    original: ChartDrawingObject;
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
    rightPriceScale: { borderColor: '#263346', scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderColor: '#263346', timeVisible: true, secondsVisible: false, rightOffset: 5 },
    handleScroll: true,
    handleScale: true,
};
const INITIAL_VISIBLE_BAR_COUNT = 180;

function showRecentBars(chart: IChartApi, barCount: number) {
    chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, barCount - INITIAL_VISIBLE_BAR_COUNT),
        to: Math.max(1, barCount - 1) + 5,
    });
}

function nearestBarIndex(bars: DemoMarketBar[], time: number): number {
    if (!bars.length) return 0;
    let low = 0;
    let high = bars.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = Number(bars[middle].time);
        if (candidate === time) return middle;
        if (candidate < time) low = middle + 1;
        else high = middle - 1;
    }
    if (low >= bars.length) return bars.length - 1;
    if (high < 0) return 0;
    return Math.abs(Number(bars[low].time) - time) < Math.abs(Number(bars[high].time) - time) ? low : high;
}

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

function BookPanel({ marketFeed }: { marketFeed: BinanceMarketFeed }) {
    const book = marketFeed.book;
    if (!book) return <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">Waiting for validated Binance order-book depth…</div>;
    const rows = Math.min(10, book.bids.length, book.asks.length);
    return <div className="grid h-full grid-cols-2 divide-x divide-[#263346] font-mono text-[9px] tabular-nums">
        <div className="overflow-hidden p-2"><div className="mb-1 grid grid-cols-2 text-zinc-500"><span>Bid price</span><span className="text-right">BTC / USD</span></div>{book.bids.slice(0, rows).map((level, index) => <div key={`bid-${level.price}`} className="relative grid grid-cols-2 py-0.5"><span className="absolute inset-y-0 right-0 bg-emerald-400/10" style={{ width: `${Math.min(100, (level.notionalUsd / Math.max(book.bidDepthUsd, 1)) * 500)}%` }} /><span className="relative text-emerald-300">{level.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span><span className="relative text-right text-zinc-300">{level.quantity.toFixed(index < 3 ? 5 : 4)} / ${compact(level.notionalUsd)}</span></div>)}</div>
        <div className="overflow-hidden p-2"><div className="mb-1 grid grid-cols-2 text-zinc-500"><span>Ask price</span><span className="text-right">BTC / USD</span></div>{book.asks.slice(0, rows).map((level, index) => <div key={`ask-${level.price}`} className="relative grid grid-cols-2 py-0.5"><span className="absolute inset-y-0 left-0 bg-rose-400/10" style={{ width: `${Math.min(100, (level.notionalUsd / Math.max(book.askDepthUsd, 1)) * 500)}%` }} /><span className="relative text-rose-300">{level.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span><span className="relative text-right text-zinc-300">{level.quantity.toFixed(index < 3 ? 5 : 4)} / ${compact(level.notionalUsd)}</span></div>)}</div>
    </div>;
}

function LiquidityPanel({ marketFeed, levels }: { marketFeed: BinanceMarketFeed; levels: ReturnType<typeof selectLiquidityLevels> }) {
    const book = marketFeed.book;
    if (!book) return <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">Waiting for validated Binance liquidity depth…</div>;
    return <div className="grid h-full grid-cols-[0.7fr_1.3fr] divide-x divide-[#263346] p-2 text-[9px]">
        <div className="grid grid-cols-2 content-start gap-2 pr-2"><div className="rounded border border-[#263346] p-2"><div className="text-zinc-500">Spread</div><div className="mt-1 font-mono text-sm tabular-nums text-zinc-100">{book.spread.toFixed(2)}</div><div className="text-[8px] text-zinc-500">{book.spreadBps.toFixed(2)} bps</div></div><div className="rounded border border-[#263346] p-2"><div className="text-zinc-500">Imbalance</div><div className={cn('mt-1 font-mono text-sm tabular-nums', book.imbalance >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{(book.imbalance * 100).toFixed(1)}%</div><div className="text-[8px] text-zinc-500">top 20 levels</div></div><div className="rounded border border-[#263346] p-2"><div className="text-zinc-500">Bid depth</div><div className="mt-1 font-mono text-xs tabular-nums text-emerald-300">${compact(book.bidDepthUsd)}</div></div><div className="rounded border border-[#263346] p-2"><div className="text-zinc-500">Ask depth</div><div className="mt-1 font-mono text-xs tabular-nums text-rose-300">${compact(book.askDepthUsd)}</div></div></div>
        <div className="space-y-1 pl-3"><div className="mb-1 flex justify-between text-zinc-500"><span>Largest observed depth levels</span><span>Notional</span></div>{levels.map((level) => <div key={`${level.side}-${level.price}`} className="grid grid-cols-[48px_1fr_70px] items-center gap-2"><span className={level.side === 'BID' ? 'text-emerald-300' : 'text-rose-300'}>{level.side}</span><div className="relative h-3 overflow-hidden rounded-sm bg-[#111a25]"><span className={cn('absolute inset-y-0', level.side === 'BID' ? 'left-0 bg-emerald-400/35' : 'right-0 bg-rose-400/35')} style={{ width: `${level.share * 100}%` }} /><span className="relative px-1 font-mono text-[8px] tabular-nums text-zinc-200">{level.price.toLocaleString()}</span></div><span className="text-right font-mono tabular-nums text-zinc-300">${compact(level.notionalUsd)}</span></div>)}</div>
    </div>;
}

export default function MarketStructureChart({ data, marketFeed, activeTool, timeframe, replayActive, onActiveToolChange }: MarketStructureChartProps) {
    const chartHostRef = useRef<HTMLDivElement>(null);
    const chartSurfaceRef = useRef<HTMLDivElement>(null);
    const orderFlowPaneRef = useRef<HTMLDivElement>(null);
    const cvdHostRef = useRef<HTMLDivElement>(null);
    const deltaHostRef = useRef<HTMLDivElement>(null);
    const priceChartRef = useRef<IChartApi | null>(null);
    const cvdChartRef = useRef<IChartApi | null>(null);
    const deltaChartRef = useRef<IChartApi | null>(null);
    const priceSeriesRef = useRef<PriceSeries | null>(null);
    const boundsSeriesRef = useRef<LineSeriesApi | null>(null);
    const cvdSeriesRef = useRef<PriceSeries | null>(null);
    const deltaSeriesRef = useRef<HistogramSeriesApi | null>(null);
    const avwapSeriesRef = useRef<LineSeriesApi | null>(null);
    const upperBandSeriesRef = useRef<LineSeriesApi | null>(null);
    const lowerBandSeriesRef = useRef<LineSeriesApi | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const profileRef = useRef<ReturnType<typeof createDemoVolumeProfile>>([]);
    const barsRef = useRef<DemoMarketBar[]>([]);
    const cvdBarsRef = useRef<FlowCvdBar[]>([]);
    const deltaBarsRef = useRef<Array<{ time: DemoMarketBar['time']; value: number }>>([]);
    const updateOverlayRef = useRef<() => void>(() => undefined);
    const overlayFrameRef = useRef<number | null>(null);
    const chartContextRef = useRef('');
    const profileContextRef = useRef('');
    const previousBarCountRef = useRef(0);
    const chartGenerationRef = useRef(0);
    const rangeSyncRef = useRef(false);
    const crosshairSyncRef = useRef(false);
    const updateCvdResetMarkersRef = useRef<() => void>(() => undefined);
    const [overlayLayout, setOverlayLayout] = useState<OverlayLayout>({
        width: 800, height: 460, flipY: 230, callY: null, putY: null, maxPainY: null, anchorX: null, anchorY: null,
        profileLeftX: null, profileRightX: null,
        profileRows: [], secondaryRows: [], vahY: null, pocY: null, valY: null,
    });
    const [range, setRange] = useState<ProfileRange | null>(null);
    const [anchorIndex, setAnchorIndex] = useState(66);
    const [profileRowCount, setProfileRowCount] = useState(48);
    const [profileWidthPercent, setProfileWidthPercent] = useState(40);
    const [profileValueAreaPercent, setProfileValueAreaPercent] = useState(70);
    const [profileVolumeMode, setProfileVolumeMode] = useState<ProfileVolumeMode>('UP_DOWN');
    const [profilePlacement, setProfilePlacement] = useState<ProfilePlacement>('RIGHT');
    const [extendProfileRight, setExtendProfileRight] = useState(false);
    const [cvdAnchor, setCvdAnchor] = useState<CvdAnchorOption>('AUTO');
    const [cvdResetMarkers, setCvdResetMarkers] = useState<Array<{ time: number; x: number }>>([]);
    const [profileQueryRange, setProfileQueryRange] = useState<{ startTimeSeconds: number; endTimeSeconds: number; displayBarSeconds: number } | null>(null);
    const [showAvwapBands, setShowAvwapBands] = useState(true);
    const [selectedObject, setSelectedObject] = useState<'VP' | 'AVWAP' | null>('VP');
    const [objectLocked, setObjectLocked] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [dragTarget, setDragTarget] = useState<'range-start' | 'range-end' | 'range-body' | 'anchor' | null>(null);
    const [drawings, setDrawings] = useState<ChartDrawingObject[]>([]);
    const [drawingViews, setDrawingViews] = useState<ChartDrawingView[]>([]);
    const [drawingDraft, setDrawingDraft] = useState<ChartDrawingObject | null>(null);
    const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
    const [drawingDrag, setDrawingDrag] = useState<DrawingDragState | null>(null);
    const [lastDeletedDrawing, setLastDeletedDrawing] = useState<ChartDrawingObject | null>(null);
    const [hoverBar, setHoverBar] = useState<DemoMarketBar | null>(null);
    const [drawingStatus, setDrawingStatus] = useState('');
    const dragOriginRef = useRef<{ logical: number; start: number; end: number } | null>(null);

    const { dataMode, chartLayers, activeOrderFlowStudy, studyPaneOpen, dteFilter, toggleChartLayer, setActiveOrderFlowStudy, setStudyPaneOpen } = useTerminalStore();
    const summary = data.summary as unknown as Record<string, unknown>;
    const keyLevels = (data.keyLevels || {}) as unknown as Record<string, unknown>;
    const spot = numeric(data.spotPrice, numeric(summary.spotPrice, 68_000)) ?? 68_000;
    const demoBars = useMemo(() => createDemoMarketBars(spot, 192, TIMEFRAME_SECONDS[timeframe]), [spot, timeframe]);
    const liveBars = useMemo<DemoMarketBar[]>(() => marketFeed.candles.map((bar) => ({ ...bar, time: bar.time as DemoMarketBar['time'] })), [marketFeed.candles]);
    const allBars = dataMode === 'DEMO' ? demoBars : liveBars;
    const bars = useMemo(() => replayActive ? allBars.slice(0, Math.max(1, allBars.length - 32)) : allBars, [allBars, replayActive]);
    const resolvedCvdAnchor = useMemo<CvdAnchor>(() => {
        if (cvdAnchor !== 'AUTO') return cvdAnchor;
        if (timeframe === '1D') return 'UTC_MONTH';
        if (timeframe === '4H') return 'UTC_WEEK';
        return 'UTC_DAY';
    }, [cvdAnchor, timeframe]);
    const cvdBars = useMemo<FlowCvdBar[]>(() => dataMode === 'DEMO'
        ? createDemoCvd(bars).map((bar, index) => ({ ...bar, reset: index === 0 }))
        : buildCvdBars(bars.map((bar) => ({ ...bar, closeTime: 0, quoteVolume: 0, trades: 0, takerBuyVolume: bar.takerBuyVolume ?? 0, takerSellVolume: Math.max(0, bar.volume - (bar.takerBuyVolume ?? 0)), delta: bar.delta ?? 0, time: Number(bar.time) })), resolvedCvdAnchor), [bars, dataMode, resolvedCvdAnchor]);
    const deltaBars = useMemo(() => dataMode === 'DEMO' ? cvdBars.map((bar) => ({ time: bar.time, value: bar.close - bar.open, color: bar.close >= bar.open ? 'rgba(39, 211, 170, 0.8)' : 'rgba(239, 93, 115, 0.8)' })) : buildDeltaHistogram(bars.map((bar) => ({ ...bar, closeTime: 0, quoteVolume: 0, trades: 0, takerBuyVolume: bar.takerBuyVolume ?? 0, takerSellVolume: Math.max(0, bar.volume - (bar.takerBuyVolume ?? 0)), delta: bar.delta ?? 0, time: Number(bar.time) }))), [bars, cvdBars, dataMode]);
    const liquidityLevels = useMemo(() => selectLiquidityLevels(marketFeed.book), [marketFeed.book]);
    const rangeStartIndex = range ? nearestBarIndex(bars, range.startTime) : 0;
    const rangeEndIndex = range ? nearestBarIndex(bars, range.endTime) : Math.max(0, bars.length - 1);
    const profileStartIndex = Math.min(rangeStartIndex, rangeEndIndex);
    const profileEndIndex = extendProfileRight ? Math.max(0, bars.length - 1) : Math.max(rangeStartIndex, rangeEndIndex);
    const selectedBarCount = bars.length ? profileEndIndex - profileStartIndex + 1 : 0;
    const avwapBands = useMemo(() => createDemoAvwapBands(bars, Math.min(anchorIndex, bars.length - 1)), [bars, anchorIndex]);
    const selectedStartTime = bars[profileStartIndex] ? Number(bars[profileStartIndex].time) : null;
    const selectedEndTime = bars[profileEndIndex] ? Number(bars[profileEndIndex].time) : null;
    useEffect(() => {
        if (dataMode !== 'LIVE' || selectedStartTime === null || selectedEndTime === null) return;
        const timer = setTimeout(() => setProfileQueryRange({
            startTimeSeconds: selectedStartTime,
            endTimeSeconds: selectedEndTime,
            displayBarSeconds: TIMEFRAME_SECONDS[timeframe],
        }), 300);
        return () => clearTimeout(timer);
    }, [dataMode, selectedEndTime, selectedStartTime, timeframe]);
    const intrabarProfile = useBinanceVolumeProfile(profileQueryRange, dataMode === 'LIVE');
    const intrabarProfileBars = useMemo<DemoMarketBar[]>(() => intrabarProfile.candles.map((bar) => ({ ...bar, time: bar.time as DemoMarketBar['time'] })), [intrabarProfile.candles]);
    const profileSourceBars = dataMode === 'LIVE' && intrabarProfileBars.length ? intrabarProfileBars : bars;
    const profileSourceStart = profileSourceBars === bars ? profileStartIndex : 0;
    const profileSourceEnd = profileSourceBars === bars ? profileEndIndex : Math.max(0, profileSourceBars.length - 1);
    const profile = useMemo(() => createDemoVolumeProfile(profileSourceBars, profileSourceStart, profileSourceEnd, profileRowCount), [profileRowCount, profileSourceBars, profileSourceEnd, profileSourceStart]);
    const profileLevels = useMemo(() => calculateVolumeProfileLevels(profile, profileValueAreaPercent / 100), [profile, profileValueAreaPercent]);

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
    const lastDelta = deltaBars.at(-1)?.value ?? 0;
    const maxProfile = Math.max(...profile.map((row) => profileVolumeMode === 'DELTA' ? Math.abs(row.delta) : row.volume), 1);
    const profileSourceLabel = dataMode === 'LIVE'
        ? intrabarProfile.state === 'LIVE' && intrabarProfile.interval ? `${intrabarProfile.interval} INTRABARS` : `${timeframe} CHART BARS`
        : `${timeframe} DEMO BARS`;
    const chartContextKey = `${dataMode}:${timeframe}:${replayActive ? 'REPLAY' : 'LIVE'}`;
    const hasChartData = bars.length >= 2;

    useEffect(() => {
        barsRef.current = bars;
        cvdBarsRef.current = cvdBars;
        deltaBarsRef.current = deltaBars;
        profileRef.current = profile;
    }, [bars, cvdBars, deltaBars, profile]);

    useEffect(() => {
        if (bars.length < (dataMode === 'LIVE' ? 50 : 2) || profileContextRef.current === chartContextKey) return;
        profileContextRef.current = chartContextKey;
        const end = bars.length - 1;
        const start = Math.max(0, end - 119);
        setRange({ startTime: Number(bars[start].time), endTime: Number(bars[end].time) });
        setAnchorIndex(Math.max(0, end - 126));
    }, [bars, chartContextKey, dataMode]);

    useEffect(() => {
        if (!chartHostRef.current || !hasChartData) return;
        const chart = createChart(chartHostRef.current, chartOptions);
        chartGenerationRef.current += 1;
        if (chartSurfaceRef.current) chartSurfaceRef.current.dataset.chartGeneration = String(chartGenerationRef.current);
        const candles = chart.addSeries(CandlestickSeries, {
            upColor: '#27d3aa', downColor: '#ef5d73', borderVisible: false,
            wickUpColor: '#27d3aa', wickDownColor: '#ef5d73', priceLineVisible: true,
            priceLineColor: '#27d3aa', lastValueVisible: true,
        });
        const bounds = chart.addSeries(LineSeries, {
            color: 'rgba(0,0,0,0)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
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
        const scheduleOverlayUpdate = () => {
            if (overlayFrameRef.current !== null) return;
            overlayFrameRef.current = requestAnimationFrame(() => {
                overlayFrameRef.current = requestAnimationFrame(() => {
                    overlayFrameRef.current = null;
                    updateOverlayRef.current();
                });
            });
        };
        const handleVisibleRangeChange = (rangeValue: LogicalRange | null) => {
            scheduleOverlayUpdate();
            if (rangeValue && chartSurfaceRef.current) {
                chartSurfaceRef.current.dataset.visibleFrom = rangeValue.from.toFixed(4);
                chartSurfaceRef.current.dataset.visibleTo = rangeValue.to.toFixed(4);
            }
            const flowChart = cvdChartRef.current ?? deltaChartRef.current;
            if (rangeValue && flowChart && !rangeSyncRef.current) {
                rangeSyncRef.current = true;
                flowChart.timeScale().setVisibleLogicalRange(rangeValue);
                queueMicrotask(() => { rangeSyncRef.current = false; });
            }
        };
        const handleCrosshairMove: Parameters<IChartApi['subscribeCrosshairMove']>[0] = (param) => {
            const point = param.seriesData.get(candles) as DemoMarketBar | undefined;
            setHoverBar(point ?? null);
            if (chartSurfaceRef.current) chartSurfaceRef.current.dataset.crosshairTime = param.time ? String(param.time) : '';
            if (orderFlowPaneRef.current) orderFlowPaneRef.current.dataset.crosshairTime = param.time ? String(param.time) : '';
            if (crosshairSyncRef.current) return;
            if (!param.time) {
                cvdChartRef.current?.clearCrosshairPosition();
                deltaChartRef.current?.clearCrosshairPosition();
                return;
            }
            crosshairSyncRef.current = true;
            const cvdPoint = cvdBarsRef.current.find((bar) => Number(bar.time) === Number(param.time));
            if (cvdPoint && cvdSeriesRef.current && cvdChartRef.current) {
                cvdChartRef.current.setCrosshairPosition(cvdPoint.close, param.time, cvdSeriesRef.current);
            }
            const deltaPoint = deltaBarsRef.current.find((bar) => Number(bar.time) === Number(param.time));
            if (deltaPoint && deltaSeriesRef.current && deltaChartRef.current) {
                deltaChartRef.current.setCrosshairPosition(deltaPoint.value, param.time, deltaSeriesRef.current);
            }
            queueMicrotask(() => { crosshairSyncRef.current = false; });
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
        chart.subscribeCrosshairMove(handleCrosshairMove);
        priceChartRef.current = chart;
        priceSeriesRef.current = candles;
        boundsSeriesRef.current = bounds;
        avwapSeriesRef.current = avwapSeries;
        upperBandSeriesRef.current = upperBand;
        lowerBandSeriesRef.current = lowerBand;
        const observer = new ResizeObserver(scheduleOverlayUpdate);
        observer.observe(chartHostRef.current);
        scheduleOverlayUpdate();

        return () => {
            observer.disconnect();
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
            chart.unsubscribeCrosshairMove(handleCrosshairMove);
            if (overlayFrameRef.current !== null) cancelAnimationFrame(overlayFrameRef.current);
            chart.remove(); priceChartRef.current = null; priceSeriesRef.current = null;
            boundsSeriesRef.current = null; priceLinesRef.current = [];
            avwapSeriesRef.current = null; upperBandSeriesRef.current = null; lowerBandSeriesRef.current = null;
        };
    }, [hasChartData]);

    useEffect(() => {
        const chart = priceChartRef.current;
        const candles = priceSeriesRef.current;
        if (!chart || !candles || bars.length < 2) return;
        const previousRange = chart.timeScale().getVisibleLogicalRange();
        const previousCount = previousBarCountRef.current;
        const contextChanged = chartContextRef.current !== chartContextKey;
        const wasAtRealtimeEdge = previousRange !== null && previousRange.to >= previousCount - 1.5;
        candles.setData(bars);
        if (contextChanged || previousRange === null) {
            chartContextRef.current = chartContextKey;
            showRecentBars(chart, bars.length);
        } else if (wasAtRealtimeEdge && bars.length > previousCount) {
            chart.timeScale().setVisibleLogicalRange({
                from: previousRange.from + (bars.length - previousCount),
                to: previousRange.to + (bars.length - previousCount),
            });
        } else {
            chart.timeScale().setVisibleLogicalRange(previousRange);
        }
        previousBarCountRef.current = bars.length;
        requestAnimationFrame(() => requestAnimationFrame(() => updateOverlayRef.current()));
    }, [bars, chartContextKey]);

    useEffect(() => {
        const bounds = boundsSeriesRef.current;
        if (!bounds || bars.length < 2) return;
        const recentBars = bars.slice(-Math.min(INITIAL_VISIBLE_BAR_COUNT + 60, bars.length));
        const visibleLevels = [callWall, putWall, gammaFlip, maxPain, ...secondaryLevels.map((level) => level.price)];
        const lowBound = Math.min(...recentBars.map((bar) => bar.low), ...visibleLevels) * 0.998;
        const highBound = Math.max(...recentBars.map((bar) => bar.high), ...visibleLevels) * 1.002;
        bounds.setData([{ time: recentBars[0].time, value: lowBound }, { time: recentBars[recentBars.length - 1].time, value: highBound }]);
    }, [bars, callWall, gammaFlip, maxPain, putWall, secondaryLevels]);

    useEffect(() => {
        const candles = priceSeriesRef.current;
        if (!candles) return;
        priceLinesRef.current.forEach((line) => candles.removePriceLine(line));
        const lines: IPriceLine[] = [];
        if (chartLayers.walls) {
            lines.push(candles.createPriceLine({ price: callWall, color: '#2fd8af', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'CALL WALL' }));
            lines.push(candles.createPriceLine({ price: putWall, color: '#f05c73', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'PUT WALL' }));
        }
        if (chartLayers.secondaryWalls) secondaryLevels.forEach((level) => lines.push(candles.createPriceLine({
            price: level.price, color: 'rgba(180, 192, 209, 0.7)', lineWidth: 1,
            lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${level.dte}D`,
        })));
        if (chartLayers.gammaFlip) lines.push(candles.createPriceLine({ price: gammaFlip, color: '#3da7ff', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'GAMMA FLIP' }));
        if (chartLayers.maxPain) lines.push(candles.createPriceLine({ price: maxPain, color: '#d6dae1', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: 'MAX PAIN' }));
        priceLinesRef.current = lines;
        requestAnimationFrame(() => requestAnimationFrame(() => updateOverlayRef.current()));
    }, [callWall, chartLayers.gammaFlip, chartLayers.maxPain, chartLayers.secondaryWalls, chartLayers.walls, gammaFlip, maxPain, putWall, secondaryLevels]);

    useEffect(() => {
        avwapSeriesRef.current?.setData(chartLayers.avwap ? avwapBands.center : []);
        upperBandSeriesRef.current?.setData(chartLayers.avwap && showAvwapBands ? avwapBands.upper : []);
        lowerBandSeriesRef.current?.setData(chartLayers.avwap && showAvwapBands ? avwapBands.lower : []);
    }, [avwapBands, chartLayers.avwap, showAvwapBands]);

    useEffect(() => {
        updateOverlayRef.current = () => {
            const chart = priceChartRef.current;
            const candles = priceSeriesRef.current;
            const hostHeight = chartHostRef.current?.clientHeight || 460;
            const hostWidth = chartHostRef.current?.clientWidth || 800;
            if (!chart || !candles || !bars.length) return;
            const coordinate = (price: number) => {
                const y = candles.priceToCoordinate(price);
                return y === null ? null : Number(y);
            };
            const anchorBar = bars[Math.min(anchorIndex, bars.length - 1)];
            const startBar = bars[profileStartIndex];
            const endBar = bars[profileEndIndex];
            const startCenter = startBar ? chart.timeScale().timeToCoordinate(startBar.time) : null;
            const endCenter = endBar ? chart.timeScale().timeToCoordinate(endBar.time) : null;
            const observedSpacing = startCenter !== null && endCenter !== null && profileEndIndex > profileStartIndex
                ? Math.abs(Number(endCenter) - Number(startCenter)) / (profileEndIndex - profileStartIndex)
                : 5;
            const left = startCenter === null ? null : Number(startCenter) - observedSpacing / 2;
            const right = endCenter === null ? null : Number(endCenter) + observedSpacing / 2;
            const anchorX = anchorBar ? chart.timeScale().timeToCoordinate(anchorBar.time) : null;
            setOverlayLayout({
                width: hostWidth,
                height: hostHeight,
                flipY: coordinate(gammaFlip) ?? hostHeight * 0.52,
                callY: coordinate(callWall), putY: coordinate(putWall), maxPainY: coordinate(maxPain),
                anchorX: anchorX === null ? null : Number(anchorX),
                anchorY: anchorBar ? coordinate(anchorBar.low) : null,
                profileLeftX: left === null ? null : Number(left),
                profileRightX: right === null ? null : Number(right),
                profileRows: profile.flatMap((row) => {
                    const y = coordinate(row.price); return y === null ? [] : [{ price: row.price, y }];
                }),
                secondaryRows: secondaryLevels.flatMap((level) => {
                    const y = coordinate(level.price); return y === null ? [] : [{ ...level, y }];
                }),
                vahY: profileLevels ? coordinate(profileLevels.vah) : null,
                pocY: profileLevels ? coordinate(profileLevels.poc) : null,
                valY: profileLevels ? coordinate(profileLevels.val) : null,
            });
            const drawingSource = drawingDraft ? [...drawings, drawingDraft] : drawings;
            setDrawingViews(drawingSource.flatMap((drawing) => {
                const points = drawing.points.map((point) => ({
                    x: chart.timeScale().timeToCoordinate(point.time as DemoMarketBar['time']),
                    y: candles.priceToCoordinate(point.price),
                }));
                if (points.some((point) => point.x === null || point.y === null)) return [];
                return [{
                    drawing,
                    points: points.map((point) => ({ x: Number(point.x), y: Number(point.y) })),
                    preview: drawing.id === 'drawing-preview',
                }];
            }));
        };
        let nestedFrame: number | null = null;
        const frame = requestAnimationFrame(() => {
            nestedFrame = requestAnimationFrame(() => updateOverlayRef.current());
        });
        return () => {
            cancelAnimationFrame(frame);
            if (nestedFrame !== null) cancelAnimationFrame(nestedFrame);
        };
    }, [anchorIndex, bars, callWall, drawingDraft, drawings, gammaFlip, maxPain, profile, profileEndIndex, profileLevels, profileStartIndex, putWall, secondaryLevels]);

    useEffect(() => {
        if (!studyPaneOpen || !hasChartData) return;
        const syncMainRange = (rangeValue: LogicalRange | null) => {
            const main = priceChartRef.current;
            if (!rangeValue || !main || rangeSyncRef.current) return;
            rangeSyncRef.current = true;
            main.timeScale().setVisibleLogicalRange(rangeValue);
            queueMicrotask(() => { rangeSyncRef.current = false; });
        };
        const syncMainCrosshair: Parameters<IChartApi['subscribeCrosshairMove']>[0] = (param) => {
            const main = priceChartRef.current;
            const candles = priceSeriesRef.current;
            if (!main || !candles || crosshairSyncRef.current) return;
            if (!param.time) {
                main.clearCrosshairPosition();
                return;
            }
            const bar = barsRef.current.find((candidate) => Number(candidate.time) === Number(param.time));
            if (!bar) return;
            crosshairSyncRef.current = true;
            main.setCrosshairPosition(bar.close, param.time, candles);
            if (chartSurfaceRef.current) chartSurfaceRef.current.dataset.crosshairTime = String(param.time);
            if (orderFlowPaneRef.current) orderFlowPaneRef.current.dataset.crosshairTime = String(param.time);
            queueMicrotask(() => { crosshairSyncRef.current = false; });
        };

        if (activeOrderFlowStudy === 'CVD' && cvdHostRef.current) {
            const chart = createChart(cvdHostRef.current, {
                ...chartOptions,
                layout: { ...chartOptions.layout, background: { type: ColorType.Solid, color: '#070b11' } },
                rightPriceScale: { borderColor: '#263346', scaleMargins: { top: 0.16, bottom: 0.14 } },
                timeScale: { ...chartOptions.timeScale, visible: true },
            });
            const series = chart.addSeries(CandlestickSeries, {
                upColor: '#27d3aa', downColor: '#ef5d73', borderVisible: false,
                wickUpColor: '#27d3aa', wickDownColor: '#ef5d73', priceLineVisible: false, lastValueVisible: true,
            });
            series.setData(cvdBarsRef.current);
            series.createPriceLine({ price: 0, color: '#657287', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'ZERO' });
            cvdChartRef.current = chart;
            cvdSeriesRef.current = series;
            const updateResetMarkers = () => {
                const width = cvdHostRef.current?.clientWidth ?? 0;
                const markers = cvdBarsRef.current.slice(1).flatMap((bar) => {
                    if (!bar.reset) return [];
                    const coordinate = chart.timeScale().timeToCoordinate(bar.time);
                    if (coordinate === null || coordinate < 0 || coordinate > width) return [];
                    return [{ time: Number(bar.time), x: Number(coordinate) }];
                });
                setCvdResetMarkers(markers);
            };
            updateCvdResetMarkersRef.current = updateResetMarkers;
            const mainRange = priceChartRef.current?.timeScale().getVisibleLogicalRange();
            if (mainRange) chart.timeScale().setVisibleLogicalRange(mainRange);
            const handleCvdRange = (rangeValue: LogicalRange | null) => {
                syncMainRange(rangeValue);
                requestAnimationFrame(updateResetMarkers);
            };
            const resizeObserver = new ResizeObserver(updateResetMarkers);
            resizeObserver.observe(cvdHostRef.current);
            chart.timeScale().subscribeVisibleLogicalRangeChange(handleCvdRange);
            chart.subscribeCrosshairMove(syncMainCrosshair);
            requestAnimationFrame(updateResetMarkers);
            return () => {
                resizeObserver.disconnect();
                chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleCvdRange);
                chart.unsubscribeCrosshairMove(syncMainCrosshair);
                chart.remove();
                cvdChartRef.current = null;
                cvdSeriesRef.current = null;
                updateCvdResetMarkersRef.current = () => undefined;
                setCvdResetMarkers([]);
            };
        }
        if (activeOrderFlowStudy === 'DELTA' && deltaHostRef.current) {
            const chart = createChart(deltaHostRef.current, {
                ...chartOptions,
                layout: { ...chartOptions.layout, background: { type: ColorType.Solid, color: '#070b11' } },
                rightPriceScale: { borderColor: '#263346', scaleMargins: { top: 0.12, bottom: 0.12 } },
                timeScale: { ...chartOptions.timeScale, visible: true },
            });
            const series = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: true, base: 0 });
            series.setData(deltaBarsRef.current);
            deltaChartRef.current = chart;
            deltaSeriesRef.current = series;
            const mainRange = priceChartRef.current?.timeScale().getVisibleLogicalRange();
            if (mainRange) chart.timeScale().setVisibleLogicalRange(mainRange);
            chart.timeScale().subscribeVisibleLogicalRangeChange(syncMainRange);
            chart.subscribeCrosshairMove(syncMainCrosshair);
            return () => {
                chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMainRange);
                chart.unsubscribeCrosshairMove(syncMainCrosshair);
                chart.remove();
                deltaChartRef.current = null;
                deltaSeriesRef.current = null;
            };
        }
    }, [activeOrderFlowStudy, hasChartData, studyPaneOpen]);

    useEffect(() => {
        cvdSeriesRef.current?.setData(cvdBars);
        requestAnimationFrame(() => updateCvdResetMarkersRef.current());
    }, [cvdBars]);

    useEffect(() => {
        deltaSeriesRef.current?.setData(deltaBars);
    }, [deltaBars]);

    useEffect(() => {
        const lowerPaneOwnsTimeAxis = studyPaneOpen && (activeOrderFlowStudy === 'CVD' || activeOrderFlowStudy === 'DELTA');
        priceChartRef.current?.applyOptions({
            timeScale: { visible: !lowerPaneOwnsTimeAxis },
        });
        if (chartSurfaceRef.current) chartSurfaceRef.current.dataset.timeAxis = lowerPaneOwnsTimeAxis ? 'lower-pane' : 'price-chart';
    }, [activeOrderFlowStudy, hasChartData, studyPaneOpen]);

    useEffect(() => {
        if (!dragTarget || objectLocked) return;
        const move = (event: PointerEvent) => {
            const host = chartHostRef.current;
            const chart = priceChartRef.current;
            if (!host || !chart || !bars.length) return;
            const rect = host.getBoundingClientRect();
            const logical = chart.timeScale().coordinateToLogical(event.clientX - rect.left);
            if (logical === null) return;
            const index = Math.max(0, Math.min(bars.length - 1, Math.round(logical)));
            if (dragTarget === 'range-start') {
                const next = Math.min(index, profileEndIndex - 1);
                setRange((current) => current && ({ ...current, startTime: Number(bars[Math.max(0, next)].time) }));
            }
            if (dragTarget === 'range-end' && !extendProfileRight) {
                const next = Math.max(index, profileStartIndex + 1);
                setRange((current) => current && ({ ...current, endTime: Number(bars[Math.min(bars.length - 1, next)].time) }));
            }
            if (dragTarget === 'anchor') setAnchorIndex(index);
            if (dragTarget === 'range-body' && dragOriginRef.current) {
                const delta = Math.round(logical - dragOriginRef.current.logical);
                const width = dragOriginRef.current.end - dragOriginRef.current.start;
                const start = Math.max(0, Math.min(bars.length - 1 - width, dragOriginRef.current.start + delta));
                setRange({ startTime: Number(bars[start].time), endTime: Number(bars[start + width].time) });
            }
        };
        const up = () => { setDragTarget(null); dragOriginRef.current = null; };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    }, [bars, dragTarget, extendProfileRight, objectLocked, profileEndIndex, profileStartIndex]);

    function beginProfileDrag(event: React.PointerEvent<HTMLElement>, target: 'range-start' | 'range-end' | 'range-body') {
        event.stopPropagation();
        if (objectLocked || !chartHostRef.current || !priceChartRef.current) return;
        const rect = chartHostRef.current.getBoundingClientRect();
        const logical = priceChartRef.current.timeScale().coordinateToLogical(event.clientX - rect.left);
        if (logical === null) return;
        setSelectedObject('VP');
        dragOriginRef.current = { logical, start: profileStartIndex, end: profileEndIndex };
        setDragTarget(target);
    }

    function setProfileToAllLoadedBars() {
        if (!bars.length) return;
        setExtendProfileRight(false);
        setRange({ startTime: Number(bars[0].time), endTime: Number(bars[bars.length - 1].time) });
    }

    function setProfileToVisibleBars() {
        const visible = priceChartRef.current?.timeScale().getVisibleLogicalRange();
        if (!visible || !bars.length) return;
        const start = Math.max(0, Math.min(bars.length - 1, Math.floor(visible.from)));
        const end = Math.max(start + 1, Math.min(bars.length - 1, Math.ceil(visible.to)));
        setExtendProfileRight(false);
        setRange({ startTime: Number(bars[start].time), endTime: Number(bars[end].time) });
    }

    function resetChartViewAndObjects() {
        const end = bars.length - 1;
        const start = Math.max(0, end - 119);
        setRange({ startTime: Number(bars[start].time), endTime: Number(bars[end].time) });
        setAnchorIndex(Math.max(0, end - 126));
        setDrawings([]);
        setDrawingDraft(null);
        setSelectedDrawingId(null);
        setLastDeletedDrawing(null);
        if (priceChartRef.current) showRecentBars(priceChartRef.current, bars.length);
        requestAnimationFrame(() => requestAnimationFrame(() => updateOverlayRef.current()));
    }

    const drawingPointFromClient = useCallback((clientX: number, clientY: number): ChartDrawingPoint | null => {
        const host = chartHostRef.current;
        const chart = priceChartRef.current;
        const candles = priceSeriesRef.current;
        if (!host || !chart || !candles || !bars.length) return null;
        const rect = host.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
        const logical = chart.timeScale().coordinateToLogical(x);
        const rawPrice = candles.coordinateToPrice(y);
        if (logical === null || rawPrice === null || !Number.isFinite(rawPrice)) return null;
        const index = Math.max(0, Math.min(bars.length - 1, Math.round(logical)));
        const bar = bars[index];
        let price = Number(rawPrice);
        const magnet = [bar.open, bar.high, bar.low, bar.close]
            .map((candidate) => ({ candidate, coordinate: candles.priceToCoordinate(candidate) }))
            .filter((candidate) => candidate.coordinate !== null)
            .sort((left, right) => Math.abs(Number(left.coordinate) - y) - Math.abs(Number(right.coordinate) - y))[0];
        if (magnet && Math.abs(Number(magnet.coordinate) - y) <= 8) price = magnet.candidate;
        return { time: Number(bar.time), price };
    }, [bars]);

    function handleDrawing(event: React.PointerEvent<HTMLDivElement>) {
        if (activeTool === 'cursor') return;
        const point = drawingPointFromClient(event.clientX, event.clientY);
        if (!point) return;
        const drawingType = activeTool as ChartDrawingObject['type'];
        const oneClickTool = activeTool === 'horizontal' || activeTool === 'vertical' || activeTool === 'text';
        if (oneClickTool) {
            const drawing: ChartDrawingObject = { id: crypto.randomUUID(), type: drawingType, points: [point], locked: false };
            setDrawings((current) => [...current, drawing]);
            setSelectedDrawingId(drawing.id);
            setSelectedObject(null);
            setLastDeletedDrawing(null);
            setDrawingStatus(`${activeTool} added`);
            onActiveToolChange('cursor');
            return;
        }
        if (!drawingDraft || drawingDraft.type !== drawingType) {
            setDrawingDraft({ id: 'drawing-preview', type: drawingType, points: [point, point], locked: false });
            setSelectedDrawingId(null);
            setDrawingStatus('Select the second point');
            return;
        }
        const drawing: ChartDrawingObject = { ...drawingDraft, id: crypto.randomUUID(), points: [drawingDraft.points[0], point] };
        setDrawings((current) => [...current, drawing]);
        setDrawingDraft(null);
        setSelectedDrawingId(drawing.id);
        setSelectedObject(null);
        setLastDeletedDrawing(null);
        setDrawingStatus(`${activeTool} added`);
        onActiveToolChange('cursor');
    }

    function handleDrawingPointerMove(event: React.PointerEvent<HTMLDivElement>) {
        if (!drawingDraft) return;
        const point = drawingPointFromClient(event.clientX, event.clientY);
        if (!point) return;
        setDrawingDraft((current) => current ? { ...current, points: [current.points[0], point] } : null);
    }

    function beginDrawingDrag(event: React.PointerEvent<SVGElement>, drawingId: string, target: DrawingDragTarget) {
        event.preventDefault();
        event.stopPropagation();
        const original = drawings.find((drawing) => drawing.id === drawingId);
        setSelectedDrawingId(drawingId);
        if (!original || original.locked || event.button !== 0) return;
        const startPoint = drawingPointFromClient(event.clientX, event.clientY);
        if (!startPoint) return;
        setDrawingDrag({
            drawingId,
            target,
            startPoint,
            startIndex: nearestBarIndex(bars, startPoint.time),
            original: { ...original, points: original.points.map((point) => ({ ...point })) },
        });
    }

    function removeDrawing(drawingId: string) {
        const drawing = drawings.find((candidate) => candidate.id === drawingId);
        if (!drawing) return;
        setDrawings((current) => current.filter((candidate) => candidate.id !== drawingId));
        setLastDeletedDrawing(drawing);
        setSelectedDrawingId(null);
        setDrawingStatus(`${drawing.type} removed. Undo is available.`);
    }

    function restoreLastDeletedDrawing() {
        if (!lastDeletedDrawing) return;
        setDrawings((current) => [...current.filter((drawing) => drawing.id !== lastDeletedDrawing.id), lastDeletedDrawing]);
        setSelectedDrawingId(lastDeletedDrawing.id);
        setLastDeletedDrawing(null);
        setDrawingStatus('Drawing restored');
    }

    useEffect(() => {
        if (!drawingDrag) return;
        const move = (event: PointerEvent) => {
            const point = drawingPointFromClient(event.clientX, event.clientY);
            if (!point) return;
            setDrawings((current) => current.map((drawing) => {
                if (drawing.id !== drawingDrag.drawingId) return drawing;
                if (drawingDrag.target.kind === 'anchor') {
                    const pointIndex = drawingDrag.target.pointIndex;
                    return {
                        ...drawing,
                        points: drawingDrag.original.points.map((originalPoint, index) => index === pointIndex ? point : originalPoint),
                    };
                }
                const indexDelta = nearestBarIndex(bars, point.time) - drawingDrag.startIndex;
                const priceDelta = point.price - drawingDrag.startPoint.price;
                return {
                    ...drawing,
                    points: drawingDrag.original.points.map((originalPoint) => {
                        const originalIndex = nearestBarIndex(bars, originalPoint.time);
                        const nextIndex = Math.max(0, Math.min(bars.length - 1, originalIndex + indexDelta));
                        return { time: Number(bars[nextIndex].time), price: originalPoint.price + priceDelta };
                    }),
                };
            }));
        };
        const up = () => {
            setDrawingDrag(null);
            setDrawingStatus('Drawing updated');
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [bars, drawingDrag, drawingPointFromClient]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target;
            if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return;
            if (event.key === 'Escape') {
                setDrawingDraft(null);
                setSelectedDrawingId(null);
                setDrawingStatus('Drawing cancelled');
                return;
            }
            if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawingId) {
                event.preventDefault();
                const selected = drawings.find((drawing) => drawing.id === selectedDrawingId);
                if (!selected) return;
                setDrawings((current) => current.filter((drawing) => drawing.id !== selectedDrawingId));
                setLastDeletedDrawing(selected);
                setSelectedDrawingId(null);
                setDrawingStatus(`${selected.type} removed. Undo is available.`);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && lastDeletedDrawing) {
                event.preventDefault();
                setDrawings((current) => [...current.filter((drawing) => drawing.id !== lastDeletedDrawing.id), lastDeletedDrawing]);
                setSelectedDrawingId(lastDeletedDrawing.id);
                setLastDeletedDrawing(null);
                setDrawingStatus('Drawing restored');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [drawings, lastDeletedDrawing, selectedDrawingId]);

    useEffect(() => {
        if (activeTool !== 'cursor') return;
        queueMicrotask(() => setDrawingDraft(null));
    }, [activeTool]);
    const selectedDrawing = drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null;
    const selectedDrawingView = drawingViews.find((view) => view.drawing.id === selectedDrawingId) ?? null;

    if (!bars.length) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center bg-[#080c13] p-6">
                <div className="max-w-md rounded-lg border border-amber-500/25 bg-[#0b111a] p-5 text-center">
                    <div className="mb-2 text-[10px] font-bold text-amber-300">BINANCE MARKET FEED · {marketFeed.state}</div>
                    <p className="text-pretty text-sm text-zinc-300">Waiting for validated BTCUSDT candles and order-flow data. Demo values are not substituted into the live workspace.</p>
                    {marketFeed.state === 'OFFLINE' && <button type="button" onClick={() => useTerminalStore.getState().setDataMode('DEMO')} className="mt-4 rounded border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200">OPEN DEMO WORKSPACE</button>}
                </div>
            </div>
        );
    }

    const valueAreaTop = overlayLayout.vahY === null || overlayLayout.valY === null ? null : Math.min(overlayLayout.vahY, overlayLayout.valY);
    const valueAreaHeight = overlayLayout.vahY === null || overlayLayout.valY === null ? 0 : Math.abs(overlayLayout.valY - overlayLayout.vahY);
    const profileLeft = overlayLayout.profileLeftX === null || overlayLayout.profileRightX === null
        ? null
        : Math.min(overlayLayout.profileLeftX, overlayLayout.profileRightX);
    const profileWidth = overlayLayout.profileLeftX === null || overlayLayout.profileRightX === null
        ? 0
        : Math.max(2, Math.abs(overlayLayout.profileRightX - overlayLayout.profileLeftX));
    const profileRowHeight = overlayLayout.profileRows.length > 1
        ? Math.max(1, Math.abs(overlayLayout.profileRows[1].y - overlayLayout.profileRows[0].y) - 1)
        : 6;
    const selectedDrawingAnchor = selectedDrawingView?.points[0] ?? null;
    const selectedDrawingToolbarLeft = selectedDrawingAnchor ? Math.max(90, Math.min(overlayLayout.width - 90, selectedDrawingAnchor.x)) : 0;
    const selectedDrawingToolbarTop = selectedDrawingAnchor ? Math.max(48, Math.min(overlayLayout.height - 44, selectedDrawingAnchor.y - 42)) : 0;

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#080d14]">
            <div
                ref={chartSurfaceRef}
                className="relative min-h-[310px] flex-1 overflow-hidden"
                role="group"
                aria-label={`${dataMode === 'LIVE' ? 'Live' : 'Demo'} BTC price chart with options structure overlays`}
                data-drawing-count={drawings.length}
                data-volume-panel="hidden"
            >
                <div ref={chartHostRef} className="absolute inset-0" />
                {lastBar && <div className="pointer-events-none absolute left-3 top-2 z-40 flex items-center gap-2 rounded bg-[#070c13]/90 px-2 py-1 font-mono text-[10px] tabular-nums text-zinc-400">
                    <span>O <b className="text-zinc-200">{lastBar.open.toFixed(1)}</b></span><span>H <b className="text-emerald-300">{lastBar.high.toFixed(1)}</b></span><span>L <b className="text-rose-300">{lastBar.low.toFixed(1)}</b></span><span>C <b className="text-cyan-200">{lastBar.close.toFixed(1)}</b></span><span className={lastBar.close >= lastBar.open ? 'text-emerald-300' : 'text-rose-300'}>{lastBar.close >= lastBar.open ? '+' : ''}{(lastBar.close - lastBar.open).toFixed(1)}</span>
                </div>}

                {chartLayers.gammaRegime && <div className="pointer-events-none absolute inset-0 z-10">
                    <div className={cn('absolute inset-x-0 top-0 border-b border-emerald-400/25 bg-emerald-400/[0.045]', positiveGamma && 'bg-emerald-400/[0.075]')} style={{ height: Math.max(0, overlayLayout.flipY) }}><span className="absolute left-3 top-10 rounded border border-emerald-400/20 bg-[#07120f]/90 px-2 py-1 text-[10px] font-bold text-emerald-300">POSITIVE GAMMA · MEAN-REVERSION</span></div>
                    <div className={cn('absolute inset-x-0 bottom-0 border-t border-rose-400/20 bg-rose-400/[0.035]', !positiveGamma && 'bg-rose-400/[0.07]')} style={{ top: Math.max(0, overlayLayout.flipY) }}><span className="absolute bottom-8 left-3 rounded border border-rose-400/20 bg-[#140a0e]/90 px-2 py-1 text-[10px] font-bold text-rose-300">NEGATIVE GAMMA · EXPANSION</span></div>
                </div>}

                {chartLayers.walls && overlayLayout.callY !== null && <div className="pointer-events-none absolute inset-x-0 z-20 h-2 -translate-y-1/2 border-y border-emerald-300/35 bg-emerald-400/15" style={{ top: overlayLayout.callY }}><span className="absolute right-16 -top-5 rounded bg-[#07130f]/95 px-2 py-0.5 text-[9px] font-bold text-emerald-300">CALL WALL {money(callWall)} · {dteFilter}</span></div>}
                {chartLayers.walls && overlayLayout.putY !== null && <div className="pointer-events-none absolute inset-x-0 z-20 h-2 -translate-y-1/2 border-y border-rose-300/35 bg-rose-400/15" style={{ top: overlayLayout.putY }}><span className="absolute right-16 top-2 rounded bg-[#160a0f]/95 px-2 py-0.5 text-[9px] font-bold text-rose-300">PUT WALL {money(putWall)} · {dteFilter}</span></div>}
                {chartLayers.secondaryWalls && overlayLayout.secondaryRows.map((level) => <div key={`${level.price}-${level.dte}`} className="pointer-events-none absolute inset-x-0 z-20 border-t border-dashed border-zinc-400/45" style={{ top: level.y }}><span className="absolute right-16 -top-4 text-[8px] font-semibold text-zinc-400">{money(level.price)} · {level.dte}D</span></div>)}
                {chartLayers.maxPain && overlayLayout.maxPainY !== null && <div className="pointer-events-none absolute inset-x-0 z-20 border-t border-dotted border-zinc-300/45" style={{ top: overlayLayout.maxPainY }}><span className="absolute left-[52%] -top-4 text-[8px] font-semibold text-zinc-300">MAX PAIN {money(maxPain)}</span></div>}

                {chartLayers.volumeProfile && profileLeft !== null && <div
                    className={cn('pointer-events-none absolute bottom-7 top-0 z-20 border-x border-cyan-400/40 bg-cyan-400/[0.025]', selectedObject === 'VP' && 'ring-1 ring-inset ring-cyan-300/30')}
                    style={{ left: profileLeft, width: profileWidth }}
                    data-testid="fixed-range-volume-profile"
                    data-selected-bars={selectedBarCount}
                    data-start-index={profileStartIndex}
                    data-end-index={profileEndIndex}
                    data-left-coordinate={overlayLayout.profileLeftX ?? ''}
                    data-right-coordinate={overlayLayout.profileRightX ?? ''}
                >
                    {valueAreaTop !== null && <div className="pointer-events-none absolute inset-x-0 bg-sky-400/[0.045]" style={{ top: valueAreaTop, height: valueAreaHeight }} />}
                    {profile.map((row) => {
                        const y = overlayLayout.profileRows.find((position) => position.price === row.price)?.y;
                        if (y === undefined) return null;
                        const metric = profileVolumeMode === 'DELTA' ? Math.abs(row.delta) : row.volume;
                        const width = (metric / maxProfile) * profileWidthPercent;
                        const inValueArea = profileLevels !== null && row.price >= profileLevels.val && row.price <= profileLevels.vah;
                        const placementClass = profilePlacement === 'RIGHT' ? 'right-0 justify-end' : 'left-0 justify-start';
                        if (profileVolumeMode === 'TOTAL') return <div key={row.price} className={cn('pointer-events-none absolute flex', placementClass)} style={{ top: y, width: `${width}%`, height: profileRowHeight, transform: 'translateY(-50%)' }}><span className={cn('size-full', inValueArea ? 'bg-sky-300/75' : 'bg-sky-500/45')} /></div>;
                        if (profileVolumeMode === 'DELTA') return <div key={row.price} className={cn('pointer-events-none absolute flex', placementClass)} style={{ top: y, width: `${width}%`, height: profileRowHeight, transform: 'translateY(-50%)' }}><span className={cn('size-full', row.delta >= 0 ? inValueArea ? 'bg-cyan-300/80' : 'bg-cyan-500/50' : inValueArea ? 'bg-rose-300/80' : 'bg-rose-500/50')} /></div>;
                        return <div key={row.price} className={cn('pointer-events-none absolute flex', placementClass)} style={{ top: y, width: `${width}%`, height: profileRowHeight, transform: 'translateY(-50%)' }}><span className={inValueArea ? 'bg-rose-300/75' : 'bg-rose-500/45'} style={{ width: `${(1 - row.upShare) * 100}%` }} /><span className={inValueArea ? 'bg-cyan-300/80' : 'bg-cyan-500/55'} style={{ width: `${row.upShare * 100}%` }} /></div>;
                    })}
                    {[
                        ['VAH', profileLevels?.vah, overlayLayout.vahY, 'border-sky-300/50 text-sky-200'],
                        ['POC', profileLevels?.poc, overlayLayout.pocY, 'border-rose-300/70 text-rose-300'],
                        ['VAL', profileLevels?.val, overlayLayout.valY, 'border-sky-300/50 text-sky-200'],
                    ].map(([label, price, y, classes]) => typeof y === 'number' && typeof price === 'number' ? <div key={String(label)} className={cn('pointer-events-none absolute inset-x-0 border-t', String(classes).split(' ')[0])} style={{ top: y }}><span className={cn('absolute right-1 -top-4 bg-[#08101a]/95 px-1 text-[8px] font-semibold', String(classes).split(' ')[1])}>{label} {Math.round(price).toLocaleString()}</span></div> : null)}
                    {!objectLocked && <><button type="button" aria-label="Adjust volume profile start" onPointerDown={(event) => beginProfileDrag(event, 'range-start')} className="pointer-events-auto absolute -left-2 top-1/2 z-30 flex h-12 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded border border-cyan-300/50 bg-[#101924] text-cyan-200"><GripVertical className="size-3" /></button>{!extendProfileRight && <button type="button" aria-label="Adjust volume profile end" onPointerDown={(event) => beginProfileDrag(event, 'range-end')} className="pointer-events-auto absolute -right-2 top-1/2 z-30 flex h-12 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded border border-cyan-300/50 bg-[#101924] text-cyan-200"><GripVertical className="size-3" /></button>}</>}
                    <button type="button" title="Drag to move the fixed range volume profile" onPointerDown={(event) => beginProfileDrag(event, 'range-body')} className="pointer-events-auto absolute left-2 top-2 flex cursor-move items-center gap-1 rounded border border-cyan-400/20 bg-[#09101a]/95 px-2 py-1 text-[9px] font-semibold text-cyan-200"><Move className="size-3" />FIXED RANGE VP · {selectedBarCount} BARS · {profileSourceLabel}</button>
                </div>}

                {chartLayers.avwap && overlayLayout.anchorX !== null && overlayLayout.anchorY !== null && <><button type="button" aria-label="Move anchored VWAP anchor" onPointerDown={(event) => { event.stopPropagation(); if (!objectLocked) setDragTarget('anchor'); setSelectedObject('AVWAP'); }} className="absolute z-40 flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-sky-300 bg-[#0b1722] text-sky-200 shadow-sm" style={{ left: overlayLayout.anchorX, top: overlayLayout.anchorY }} title="Drag to re-anchor AVWAP"><span className="size-1.5 rounded-full bg-sky-300" /></button><span className="pointer-events-none absolute z-40 whitespace-nowrap rounded border border-sky-400/40 bg-[#07111c]/95 px-2 py-1 text-[9px] font-semibold text-sky-200" style={{ left: overlayLayout.anchorX + 12, top: Math.max(0, overlayLayout.anchorY - 10) }}>AVWAP · Swing Low</span></>}

                {selectedObject && ((selectedObject === 'VP' && chartLayers.volumeProfile) || (selectedObject === 'AVWAP' && chartLayers.avwap)) && <div className="absolute left-1/2 top-11 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-[#33445a] bg-[#0b121c] p-1 shadow-lg" role="toolbar" aria-label={`${selectedObject} controls`}>
                    <button type="button" aria-label={`Move ${selectedObject}`} onPointerDown={(event) => selectedObject === 'VP' ? beginProfileDrag(event, 'range-body') : setDragTarget('anchor')} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Move className="size-3.5" /></button>
                    <button type="button" aria-label={objectLocked ? `Unlock ${selectedObject}` : `Lock ${selectedObject}`} onClick={() => setObjectLocked((locked) => !locked)} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100">{objectLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}</button>
                    <Popover.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
                        <Popover.Trigger asChild><button type="button" aria-label={`${selectedObject} settings`} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Settings className="size-3.5" /></button></Popover.Trigger>
                        <Popover.Portal><Popover.Content side="bottom" align="center" sideOffset={8} className="z-50 w-72 rounded-md border border-[#33445a] bg-[#0b121c] p-3 text-[10px] text-zinc-300 shadow-lg">
                            {selectedObject === 'VP' ? <div className="space-y-3">
                                <div className="flex items-center justify-between"><span className="font-semibold text-zinc-100">Fixed Range Volume Profile</span><span className="font-mono tabular-nums text-cyan-300">{selectedBarCount} bars</span></div>
                                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={setProfileToVisibleBars} className="rounded border border-[#33445a] px-2 py-1.5 hover:bg-white/5">Use visible range</button><button type="button" onClick={setProfileToAllLoadedBars} className="rounded border border-[#33445a] px-2 py-1.5 hover:bg-white/5">Use all loaded</button></div>
                                <label htmlFor="profile-rows" className="grid grid-cols-[1fr_112px] items-center gap-3"><span className="text-zinc-400">Number of rows</span><select id="profile-rows" value={profileRowCount} onChange={(event) => setProfileRowCount(Number(event.target.value))} className="h-8 rounded border border-[#33445a] bg-[#080d14] px-2"><option value={24}>24</option><option value={48}>48</option><option value={72}>72</option><option value={100}>100</option></select></label>
                                <label htmlFor="profile-volume-mode" className="grid grid-cols-[1fr_112px] items-center gap-3"><span className="text-zinc-400">Volume</span><select id="profile-volume-mode" value={profileVolumeMode} onChange={(event) => setProfileVolumeMode(event.target.value as ProfileVolumeMode)} className="h-8 rounded border border-[#33445a] bg-[#080d14] px-2"><option value="TOTAL">Total</option><option value="UP_DOWN">Up / Down</option><option value="DELTA">Delta</option></select></label>
                                <label htmlFor="profile-placement" className="grid grid-cols-[1fr_112px] items-center gap-3"><span className="text-zinc-400">Placement</span><select id="profile-placement" value={profilePlacement} onChange={(event) => setProfilePlacement(event.target.value as ProfilePlacement)} className="h-8 rounded border border-[#33445a] bg-[#080d14] px-2"><option value="RIGHT">Right</option><option value="LEFT">Left</option></select></label>
                                <label htmlFor="profile-width" className="block"><span className="mb-1 flex justify-between text-zinc-400"><span>Width (% of box)</span><span className="font-mono tabular-nums text-zinc-200">{profileWidthPercent}%</span></span><input id="profile-width" type="range" min="10" max="100" step="5" value={profileWidthPercent} onChange={(event) => setProfileWidthPercent(Number(event.target.value))} className="w-full accent-cyan-400" /></label>
                                <label htmlFor="profile-value-area" className="block"><span className="mb-1 flex justify-between text-zinc-400"><span>Value area volume</span><span className="font-mono tabular-nums text-zinc-200">{profileValueAreaPercent}%</span></span><input id="profile-value-area" type="range" min="50" max="99" step="1" value={profileValueAreaPercent} onChange={(event) => setProfileValueAreaPercent(Number(event.target.value))} className="w-full accent-cyan-400" /></label>
                                <label className="flex items-center justify-between gap-3"><span className="text-zinc-400">Extend right with new bars</span><input type="checkbox" checked={extendProfileRight} onChange={(event) => setExtendProfileRight(event.target.checked)} className="size-4 accent-cyan-400" /></label>
                                <p className="text-pretty text-[9px] leading-4 text-zinc-500">Source: {profileSourceLabel}. Live mode selects the finest bounded Binance interval below 5,000 intrabars. Up/down classification follows candle direction; the chart remains pannable through the profile.</p>
                            </div> : <label className="flex items-center justify-between gap-3"><span>Deviation bands</span><input type="checkbox" checked={showAvwapBands} onChange={(event) => setShowAvwapBands(event.target.checked)} className="size-4 accent-cyan-400" /></label>}
                            <Popover.Arrow className="fill-[#33445a]" />
                        </Popover.Content></Popover.Portal>
                    </Popover.Root>
                    <button type="button" aria-label={`Hide ${selectedObject}`} onClick={() => toggleChartLayer(selectedObject === 'VP' ? 'volumeProfile' : 'avwap')} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Eye className="size-3.5" /></button>
                    <button type="button" aria-label={`Remove ${selectedObject}`} onClick={() => { toggleChartLayer(selectedObject === 'VP' ? 'volumeProfile' : 'avwap'); setSelectedObject(null); }} className="rounded p-1.5 text-rose-300 hover:bg-rose-400/10"><Trash2 className="size-3.5" /></button>
                </div>}

                <ChartDrawingLayer
                    views={drawingViews}
                    selectedId={selectedDrawingId}
                    onSelect={(drawingId) => { setSelectedDrawingId(drawingId); setSelectedObject(null); }}
                    onStartDrag={beginDrawingDrag}
                />
                {selectedDrawing && selectedDrawingView && <div
                    className="absolute z-50 flex -translate-x-1/2 items-center gap-1 rounded-md border border-[#33445a] bg-[#0b121c] p-1 shadow-lg"
                    style={{ left: selectedDrawingToolbarLeft, top: selectedDrawingToolbarTop }}
                    role="toolbar"
                    aria-label="Drawing controls"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="px-1.5 text-[9px] font-semibold capitalize text-zinc-300">{selectedDrawing.type.replace('-', ' ')}</span>
                    <button type="button" aria-label={selectedDrawing.locked ? 'Unlock selected drawing' : 'Lock selected drawing'} onClick={() => setDrawings((current) => current.map((drawing) => drawing.id === selectedDrawing.id ? { ...drawing, locked: !drawing.locked } : drawing))} className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100">{selectedDrawing.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}</button>
                    <button type="button" aria-label="Delete selected drawing" onClick={() => removeDrawing(selectedDrawing.id)} className="rounded p-1.5 text-rose-300 hover:bg-rose-400/10"><Trash2 className="size-3.5" /></button>
                </div>}
                {lastDeletedDrawing && <div className="absolute bottom-3 left-3 z-50 flex items-center gap-2 rounded border border-[#33445a] bg-[#0b121c] px-2 py-1.5 text-[9px] text-zinc-300 shadow-lg" role="status"><span>Drawing removed</span><button type="button" onClick={restoreLastDeletedDrawing} className="flex items-center gap-1 rounded px-1.5 py-1 font-semibold text-cyan-300 hover:bg-white/5"><Undo2 className="size-3" />Undo</button></div>}
                <div
                    className={cn('absolute inset-0 z-40', activeTool === 'cursor' ? 'pointer-events-none' : 'cursor-crosshair')}
                    onPointerDown={handleDrawing}
                    onPointerMove={handleDrawingPointerMove}
                    aria-hidden={activeTool === 'cursor'}
                />
                <span className="sr-only" aria-live="polite">{drawingStatus}</span>
                {replayActive && <div className="absolute bottom-10 left-3 z-40 rounded border border-amber-400/35 bg-[#181307]/90 px-2 py-1 text-[9px] font-bold text-amber-300">REPLAY PAUSED · HISTORICAL {dataMode}</div>}
            </div>

            {studyPaneOpen && <>
                <div ref={orderFlowPaneRef} className="relative h-[22%] min-h-[145px] shrink-0 border-t border-[#263346] bg-[#070b11]" data-testid="order-flow-pane" data-crosshair-sync="native">
                    {activeOrderFlowStudy === 'CVD' && <><div ref={cvdHostRef} className="absolute inset-0" role="img" aria-label={`${dataMode === 'LIVE' ? 'Live' : 'Demo'} cumulative volume delta candles`} />{cvdResetMarkers.map((marker) => <div key={marker.time} className="pointer-events-none absolute inset-y-0 z-20 border-l border-dashed border-zinc-400/55" style={{ left: marker.x }}><span className="absolute left-1 top-8 whitespace-nowrap text-[8px] text-zinc-500">Reset</span></div>)}</>}
                    {activeOrderFlowStudy === 'DELTA' && <div ref={deltaHostRef} className="absolute inset-0" role="img" aria-label={`${dataMode === 'LIVE' ? 'Live' : 'Demo'} aggressor volume delta histogram`} />}
                    {activeOrderFlowStudy === 'BOOK' && <div className="absolute inset-0 pt-8"><BookPanel marketFeed={marketFeed} /></div>}
                    {activeOrderFlowStudy === 'LIQUIDITY' && <div className="absolute inset-0 pt-8"><LiquidityPanel marketFeed={marketFeed} levels={liquidityLevels} /></div>}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-8 items-center justify-between px-3 text-[9px]"><div className="flex min-w-0 items-center gap-3"><span className="rounded bg-[#090f18]/90 px-1.5 py-1 font-bold text-zinc-100">{activeOrderFlowStudy === 'CVD' ? 'Cumulative Volume Delta' : activeOrderFlowStudy === 'DELTA' ? 'Aggressor Volume Delta' : activeOrderFlowStudy === 'BOOK' ? 'BTCUSDT Order Book' : 'Observed Liquidity'}</span>{activeOrderFlowStudy === 'CVD' && <span className={cn('rounded bg-[#090f18]/90 px-1.5 py-1 font-mono text-sm font-semibold tabular-nums', lastCvd >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{compact(lastCvd)}</span>}{activeOrderFlowStudy === 'DELTA' && <span className={cn('rounded bg-[#090f18]/90 px-1.5 py-1 font-mono text-sm font-semibold tabular-nums', lastDelta >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{compact(lastDelta)}</span>}{activeOrderFlowStudy === 'CVD' && <label className="pointer-events-auto hidden items-center gap-1 rounded bg-[#090f18]/90 px-1.5 py-1 text-zinc-500 sm:flex"><span>Anchor</span><select aria-label="CVD anchor period" value={cvdAnchor} onChange={(event) => setCvdAnchor(event.target.value as CvdAnchorOption)} className="bg-transparent font-semibold text-zinc-300 outline-none"><option value="AUTO">Auto ({resolvedCvdAnchor.replace('UTC_', '')})</option><option value="UTC_DAY">UTC day</option><option value="UTC_WEEK">UTC week</option><option value="UTC_MONTH">UTC month</option><option value="VISIBLE">Loaded history</option></select></label>}<span className="hidden rounded bg-[#090f18]/90 px-1.5 py-1 text-zinc-500 lg:inline">Source: {dataMode === 'LIVE' ? 'Binance aggressor volume · bar precision' : 'demo fixture'}</span></div><div className="pointer-events-auto flex items-center gap-2 rounded bg-[#090f18]/90 px-1"><span className={cn('rounded border px-1.5 py-0.5', dataMode === 'LIVE' && marketFeed.state === 'LIVE' ? 'border-emerald-400/35 text-emerald-300' : 'border-sky-400/35 text-sky-300')}>{dataMode === 'LIVE' ? marketFeed.state : 'SHADOW DATA'}</span><span className="rounded border border-emerald-400/35 px-1.5 py-0.5 text-emerald-300">{dataMode === 'LIVE' ? `${marketFeed.historyBarCount.toLocaleString()} / ${marketFeed.historyTarget.toLocaleString()} bars` : 'Coverage 96%'}</span><button type="button" aria-label="Reset chart view and objects" onClick={resetChartViewAndObjects} className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"><RotateCcw className="size-3.5" /></button></div></div>
                </div>
            </>}
            <div className="flex h-9 shrink-0 items-stretch border-t border-[#263346] bg-[#080d14] px-1 pb-[env(safe-area-inset-bottom)]" role="tablist" aria-label="Order-flow studies" data-position="workspace-bottom" data-testid="order-flow-tabs">
                {(['CVD', 'DELTA', 'BOOK', 'LIQUIDITY'] as const).map((study) => <button
                    key={study}
                    type="button"
                    role="tab"
                    aria-selected={studyPaneOpen && activeOrderFlowStudy === study}
                    onClick={() => { setActiveOrderFlowStudy(study); setStudyPaneOpen(true); }}
                    className={cn('min-w-20 border-t-2 border-transparent px-3 text-[10px] font-semibold capitalize text-zinc-500 hover:text-zinc-200', studyPaneOpen && activeOrderFlowStudy === study && 'border-sky-400 bg-sky-400/[0.06] text-sky-200')}
                >{study === 'CVD' ? 'CVD' : study.charAt(0) + study.slice(1).toLowerCase()}</button>)}
                <span className="ml-auto self-center px-2 font-mono text-[9px] tabular-nums text-zinc-600">{dataMode === 'LIVE' ? `${marketFeed.historyBarCount.toLocaleString()} bars${marketFeed.historyLoading ? ' · loading history' : ''}` : 'demo series'}</span>
            </div>
        </div>
    );
}
