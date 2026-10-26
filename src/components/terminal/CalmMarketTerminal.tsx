'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Switch from '@radix-ui/react-switch';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Command } from 'cmdk';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
    Activity,
    AlignVerticalSpaceAround,
    BarChart3,
    Boxes,
    ChevronDown,
    CircleHelp,
    Command as CommandIcon,
    Eye,
    EyeOff,
    Layers3,
    LayoutDashboard,
    Lock,
    Minus,
    Mountain,
    MousePointer2,
    MoveVertical,
    PanelRightOpen,
    Pause,
    Pencil,
    Pin,
    Play,
    RotateCcw,
    Search,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Square,
    TrendingDown,
    TrendingUp,
    Type,
    Waves,
    X,
} from 'lucide-react';
import type { TerrainDataContractV2 } from '../../lib/terrain/types';
import type { WorkspaceTab } from '../../lib/dashboard/types';
import { useTerminalStore } from '../../lib/dashboard/store';
import { cn } from '../../lib/ui/cn';
import { useBinanceMarketFeed } from '../../lib/binance/use-market-feed';
import { useBinanceLiquidityHeatmap } from '../../lib/binance/use-liquidity-heatmap';
import { useBinanceAggregateTradeCapture } from '../../lib/orderflow/use-aggregate-trade-capture';
import type { BinanceInterval } from '../../lib/binance/types';
import MarketStructureChart from './MarketStructureChart';
import type { ChartTimeframe, ChartTool } from './types';
import {
    DEFAULT_RISK_SETTINGS,
    type PositionRiskSettings,
    readPersistedRiskSettings,
    subscribePersistedRiskSettings,
    writePersistedRiskSettings,
} from './RiskTerminal';
import type { DrawingObject, PositionPrices } from './drawing-model';
import DecisionDock from './DecisionDock';
import DataIntegrityStrip from './DataIntegrityStrip';
import { getAggregateTradeIntegrityStatus } from './trade-integrity-status';
import { ORDERFLOW_SCHEMA_VERSION, type DataIntegritySourceV1 } from '../../lib/orderflow/contracts';
import { createCaptureCoverageV1 } from '../../lib/orderflow/provenance';

interface MarketTerminalProps {
    data: TerrainDataContractV2;
    isError: boolean;
}

interface MarketMetrics {
    spot: number;
    callWall: number;
    putWall: number;
    gammaFlip: number;
    maxPain: number;
    netGex: number;
    totalCallGex?: number;
    totalPutGex?: number;
    contractsCount?: number;
    putCallRatio?: number;
    atmIv?: number;
    callOi: number;
    putOi: number;
    longGamma: boolean;
}

const WORKSPACES: Array<{ id: WorkspaceTab; label: string; icon: React.ElementType }> = [
    { id: 'MARKET STRUCTURE', label: 'Market Structure', icon: BarChart3 },
    { id: 'SURFACE MAP', label: '3D Surface', icon: Mountain },
    { id: 'DASHBOARD', label: 'Overview', icon: LayoutDashboard },
    { id: 'GEX ANALYSIS', label: 'GEX Analysis', icon: Activity },
    { id: 'VANNA', label: 'Vanna', icon: Waves },
    { id: 'CHARM', label: 'Charm', icon: Sparkles },
    { id: 'OPEN INTEREST', label: 'Open Interest', icon: Boxes },
];

const DTE_FILTERS = ['0-2D', '7D', '14D', '30D', 'ALL'] as const;
const ORDER_FLOW_TABS = ['CVD', 'DELTA', 'BOOK', 'LIQUIDITY'] as const;
const TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D'];
const BINANCE_INTERVALS: Record<ChartTimeframe, BinanceInterval> = { '1m': '1m', '5m': '5m', '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d' };

export const DRAWING_TOOLS: Array<{ id: ChartTool; label: string; icon: React.ElementType; tone?: 'long' | 'short' }> = [
    { id: 'cursor', label: 'Cursor', icon: MousePointer2 },
    { id: 'trendline', label: 'Trend line', icon: Pencil },
    { id: 'horizontal', label: 'Horizontal line', icon: Minus },
    { id: 'vertical', label: 'Vertical line', icon: MoveVertical },
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    { id: 'fibonacci', label: 'Fibonacci retracement', icon: AlignVerticalSpaceAround },
    { id: 'long-position', label: 'Long position', icon: TrendingUp, tone: 'long' },
    { id: 'short-position', label: 'Short position', icon: TrendingDown, tone: 'short' },
    { id: 'text', label: 'Text note', icon: Type },
];

function subscribeDesktop(callback: () => void) {
    const media = window.matchMedia('(min-width: 768px)');
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
}

function getDesktopSnapshot() {
    return window.matchMedia('(min-width: 768px)').matches;
}

function compact(value: number | null | undefined, prefix = '') {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const absolute = Math.abs(value);
    const sign = value < 0 ? '−' : '';
    if (absolute >= 1e9) return `${sign}${prefix}${(absolute / 1e9).toFixed(2)}B`;
    if (absolute >= 1e6) return `${sign}${prefix}${(absolute / 1e6).toFixed(2)}M`;
    if (absolute >= 1e3) return `${sign}${prefix}${(absolute / 1e3).toFixed(1)}K`;
    return `${sign}${prefix}${absolute.toFixed(2)}`;
}

function numeric(value: unknown, fallback?: number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function levelStrike(value: unknown): number | undefined {
    if (typeof value === 'number') return numeric(value);
    if (value && typeof value === 'object') return numeric((value as { strike?: unknown }).strike);
    return undefined;
}

function LayerToggle({ label, checked, onCheckedChange, compact: isCompact = false }: { label: string; checked: boolean; onCheckedChange: () => void; compact?: boolean }) {
    return <div className={cn('flex items-center justify-between gap-3', isCompact ? 'py-1' : 'py-1.5')}><span className={cn('truncate text-[#D8DEE8]', isCompact ? 'text-[10px]' : 'text-[11px]')}>{label}</span><Switch.Root aria-label={`Toggle ${label}`} checked={checked} onCheckedChange={onCheckedChange} className="relative h-5 w-9 shrink-0 rounded-full border border-[#18212C] bg-[#141B24] data-[state=checked]:border-[#39A9F5]/60 data-[state=checked]:bg-[#39A9F5]/30"><Switch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-[#8390A0] transition-transform duration-150 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[#39A9F5] motion-reduce:transition-none" /></Switch.Root></div>;
}

function InspectorMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'negative' }) {
    const color = tone === 'positive' ? 'text-[#2CC7A0]' : tone === 'negative' ? 'text-[#E06379]' : 'text-[#D8DEE8]';
    return <div className="flex min-w-0 items-center justify-between gap-2 rounded border border-[#18212C] bg-[#070A0F] px-2 py-2"><span className="truncate text-[10px] text-[#8390A0]">{label}</span><span className={cn('shrink-0 font-mono text-[11px] font-semibold tabular-nums', color)}>{value}</span></div>;
}

function SourceChip({ label, state, tone }: { label: string; state: string; tone: 'live' | 'shadow' | 'demo' | 'off' }) {
    const dot = tone === 'live' ? 'bg-[#2CC7A0]' : tone === 'shadow' ? 'bg-[#39A9F5]' : tone === 'demo' ? 'bg-[#E6B450]' : 'bg-[#5C697A]';
    const textTone = tone === 'live' ? 'text-[#2CC7A0]' : tone === 'shadow' ? 'text-[#39A9F5]' : tone === 'demo' ? 'text-[#E6B450]' : 'text-[#8390A0]';
    return <div className="hidden h-8 items-center gap-2 rounded border border-[#18212C] bg-[#070A0F] px-2.5 text-[9px] font-mono lg:flex"><span className={cn('size-1.5 rounded-full', dot)} /><span className="font-semibold text-[#D8DEE8]">{label}</span><span className={cn('font-bold uppercase', textTone)}>{state}</span></div>;
}

function StudyChip({ label, visible, onToggle, description }: { label: string; visible: boolean; onToggle: () => void; description: string }) {
    return <div className="flex h-7 shrink-0 items-center rounded border border-[#18212C] bg-[#0C1118] text-[9px] font-mono font-semibold text-[#39A9F5]"><span className="px-2 text-[#D8DEE8]">{label}</span><button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label}`} onClick={onToggle} className="border-l border-[#18212C] p-1.5 text-[#8390A0] hover:text-[#D8DEE8]">{visible ? <Eye className="size-3 text-[#39A9F5]" /> : <EyeOff className="size-3" />}</button><Popover.Root><Popover.Trigger asChild><button type="button" aria-label={`${label} settings`} className="border-l border-[#18212C] p-1.5 text-[#8390A0] hover:text-[#D8DEE8]"><Settings className="size-3" /></button></Popover.Trigger><Popover.Portal><Popover.Content sideOffset={6} className="z-50 w-56 rounded border border-[#18212C] bg-[#0C1118] p-3 text-[10px] text-[#D8DEE8] shadow-xl"><div className="font-semibold text-[#D8DEE8]">{label}</div><p className="mt-1 text-pretty leading-relaxed text-[#8390A0]">{description}</p><Popover.Arrow className="fill-[#18212C]" /></Popover.Content></Popover.Portal></Popover.Root><button type="button" aria-label={`Remove ${label}`} onClick={onToggle} className="border-l border-[#18212C] p-1.5 text-[#8390A0] hover:text-[#E06379]"><X className="size-3" /></button></div>;
}

function OptionsContent({ metrics, data, isError }: { metrics: MarketMetrics; data: TerrainDataContractV2; isError: boolean }) {
    const { dataMode, dteFilter, setDteFilter, chartLayers, toggleChartLayer, setInspectorTab } = useTerminalStore();
    const decisionReason = Math.abs((metrics.spot - metrics.gammaFlip) / metrics.spot) < 0.012 ? 'Wait for Gamma Flip confirmation' : 'Wait for retest confirmation';
    return <div className="space-y-2 p-2.5 font-sans">
        <div className="grid min-h-[92px] grid-cols-[1.25fr_1fr_0.8fr] divide-x divide-[#18212C] rounded border border-[#18212C] bg-[#070A0F] p-3"><div><div className="text-[10px] font-mono text-[#8390A0]">Gamma Regime</div><div className={cn('mt-1.5 text-xl font-bold leading-none font-mono', metrics.longGamma ? 'text-[#2CC7A0]' : 'text-[#E06379]')}>{metrics.longGamma ? 'POSITIVE' : 'NEGATIVE'}</div><div className="mt-2 text-[10px] text-[#8390A0]">{metrics.longGamma ? 'mean-reversion' : 'expansion'}</div></div><div className="pl-3"><div className="text-[10px] font-mono text-[#8390A0]">Net GEX</div><div className={cn('mt-3 font-mono text-base font-bold tabular-nums', metrics.longGamma ? 'text-[#2CC7A0]' : 'text-[#E06379]')}>{compact(metrics.netGex, '$')}</div></div><div className="pl-3"><div className="text-[10px] font-mono text-[#8390A0]">Flip</div><div className="mt-3 font-mono text-[13px] font-bold tabular-nums text-[#39A9F5]">{Math.round(metrics.gammaFlip).toLocaleString()}</div></div></div>
        <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5"><div className="mb-2 text-[10px] font-mono font-semibold text-[#8390A0]">DTE (Days to Expiry)</div><div className="grid grid-cols-5 gap-1">{DTE_FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setDteFilter(filter)} title={filter === 'ALL' ? 'All expiries' : `Expiries up to ${filter.replace('D', '')} days`} className={cn('h-7 rounded border font-mono text-[9px] font-bold transition-colors', dteFilter === filter ? 'border-[#39A9F5]/60 bg-[#39A9F5]/15 text-[#39A9F5]' : 'border-[#18212C] text-[#8390A0] hover:text-[#D8DEE8]')}>{filter}</button>)}</div><div className="mt-2 grid grid-cols-2 gap-1.5"><InspectorMetric label="Call Wall" value={Math.round(metrics.callWall).toLocaleString()} tone="positive" /><InspectorMetric label="Put Wall" value={Math.round(metrics.putWall).toLocaleString()} tone="negative" /><InspectorMetric label="Max Pain" value={Math.round(metrics.maxPain).toLocaleString()} /><InspectorMetric label="Key P/C" value={metrics.putCallRatio === undefined ? '—' : metrics.putCallRatio.toFixed(2)} /><InspectorMetric label="Near-ATM IV" value={metrics.atmIv === undefined ? '—' : `${(metrics.atmIv > 3 ? metrics.atmIv : metrics.atmIv * 100).toFixed(1)}%`} /><InspectorMetric label="IV Rank" value="N/A" /><InspectorMetric label="Key Call OI" value={compact(metrics.callOi)} /><InspectorMetric label="Key Put OI" value={compact(metrics.putOi)} /></div></div>
        <div className="grid grid-cols-[1fr_0.92fr] gap-1.5"><div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5"><div className="mb-0.5 text-[10px] font-mono font-semibold text-[#8390A0]">Show on chart</div><LayerToggle compact label="Walls" checked={chartLayers.walls} onCheckedChange={() => toggleChartLayer('walls')} /><LayerToggle compact label="Gamma Regime" checked={chartLayers.gammaRegime} onCheckedChange={() => toggleChartLayer('gammaRegime')} /><LayerToggle compact label="Gamma Flip" checked={chartLayers.gammaFlip} onCheckedChange={() => toggleChartLayer('gammaFlip')} /><LayerToggle compact label="Max Pain" checked={chartLayers.maxPain} onCheckedChange={() => toggleChartLayer('maxPain')} /><LayerToggle compact label="Secondary GEX" checked={chartLayers.secondaryWalls} onCheckedChange={() => toggleChartLayer('secondaryWalls')} /></div><div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5"><div className="text-[10px] font-mono font-semibold text-[#8390A0]">Display</div><div className="mt-2 grid grid-cols-2 gap-1">{(['GEX', 'OI'] as const).map((display) => <button key={display} type="button" disabled={display === 'OI'} title={display === 'OI' ? 'Requires a full-chain call/put OI wall contract' : 'Gamma exposure walls'} className={cn('h-7 rounded border font-mono text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-40 transition-colors', display === 'GEX' ? 'border-[#39A9F5]/60 bg-[#39A9F5]/15 text-[#39A9F5]' : 'border-[#18212C] text-[#8390A0]')}>{display}</button>)}</div><div className="mt-4 space-y-2.5 text-[9px] font-mono text-[#8390A0]"><div className="flex items-center gap-1.5"><span className="h-1 w-4 bg-[#2CC7A0]" />Primary Wall</div><div className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-[#8390A0]" />Secondary Wall</div><div className="flex items-center gap-1.5"><span className="w-4 border-t border-dotted border-[#5C697A]" />Max Pain</div></div></div></div>
        <div className="min-h-[110px] rounded border border-[#18212C] bg-[#070A0F] p-3"><div className="flex items-center justify-between"><span className="font-mono text-[10px] font-semibold text-[#8390A0]">Decision State</span><button type="button" onClick={() => setInspectorTab('DECISION')} className="rounded border border-[#39A9F5]/40 px-2.5 py-1 font-mono text-[9px] font-semibold text-[#39A9F5] hover:bg-[#39A9F5]/10">Open →</button></div><div className="mt-2 font-mono text-xl font-black text-[#D8DEE8]">NO TRADE</div><p className="mt-1 text-pretty text-[10px] text-[#8390A0]">{decisionReason}</p></div>
        <p className="border-t border-[#18212C] px-0.5 pt-2 text-pretty text-[8px] leading-relaxed text-[#5C697A]">Dealer positioning uses {data.assumptionModel}. It is not directly observed inventory. {isError && dataMode === 'LIVE' ? 'Live feed unavailable.' : ''}</p>
    </div>;
}

export default function MarketTerminal({ data, isError }: MarketTerminalProps) {
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<ChartTool>('cursor');
    const [keepDrawing, setKeepDrawing] = useState(false);
    const [selectedDrawing, setSelectedDrawing] = useState<DrawingObject | null>(null);
    const positionUpdateRef = useRef<((prices: PositionPrices) => void) | null>(null);

    const handleRegisterPositionUpdater = useCallback((updater: ((prices: PositionPrices) => void) | null) => {
        positionUpdateRef.current = updater;
    }, []);

    const handleUpdatePositionPrices = useCallback((prices: PositionPrices) => {
        positionUpdateRef.current?.(prices);
    }, []);
    const [timeframe, setTimeframe] = useState<ChartTimeframe>('1H');
    const [replayActive, setReplayActive] = useState(false);
    const [utcNow, setUtcNow] = useState('--:--:--');
    const riskSettings = useSyncExternalStore(
        subscribePersistedRiskSettings,
        readPersistedRiskSettings,
        () => DEFAULT_RISK_SETTINGS,
    );

    const handleRiskSettingsChange = useCallback((next: PositionRiskSettings) => {
        writePersistedRiskSettings(next);
    }, []);
    const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false);
    const {
        workspaceMode,
        setWorkspaceMode,
        setActiveWorkspace,
        dataMode,
        setDataMode,
        inspectorOpen,
        setInspectorOpen,
        setInspectorTab,
        setStudyPaneOpen,
        activeOrderFlowStudy,
        setActiveOrderFlowStudy,
        dteFilter,
        setDteFilter,
        chartLayers,
        toggleChartLayer,
        resetWorkspaceUi,
    } = useTerminalStore();
    const marketFeed = useBinanceMarketFeed(BINANCE_INTERVALS[timeframe], dataMode === 'LIVE');
    const liquidityFeed = useBinanceLiquidityHeatmap(dataMode === 'LIVE', {
        heatmap: {
            tickSize: 10,
            visibleDepthBps: 100,
            minNotionalUsd: 0,
            maxFrames: 1_800,
            bucketMs: 500,
            maxLevelsPerSide: 400,
        },
        maxClientFrames: 1_800,
    });
    const aggregateTradeFeed = useBinanceAggregateTradeCapture(dataMode === 'LIVE');

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
            if (event.key === 'Escape') setActiveTool('cursor');
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        const updateClock = () => setUtcNow(new Date().toISOString().slice(11, 19));
        updateClock();
        const timer = window.setInterval(updateClock, 1000);
        return () => window.clearInterval(timer);
    }, []);

    const metrics = useMemo<MarketMetrics>(() => {
        const summary = data.summary as unknown as Record<string, unknown>;
        const keyLevels = (data.keyLevels || {}) as unknown as Record<string, unknown>;
        const spot = numeric(data.spotPrice, numeric(summary.spotPrice, 68_000)) ?? 68_000;
        const callWall = levelStrike(keyLevels.callWall) ?? numeric(summary.topPositiveGexStrike) ?? spot * 1.05;
        const putWall = levelStrike(keyLevels.putWall) ?? numeric(summary.topNegativeGexStrike) ?? spot * 0.95;
        const gammaFlip = levelStrike(keyLevels.gammaFlip) ?? numeric(summary.gammaFlip) ?? spot;
        const maxPain = levelStrike(keyLevels.primaryMaxPain) ?? numeric(summary.maxPainStrike) ?? spot;
        const netGex = numeric(summary.netGex, 0) ?? 0;
        const calls = (data.keyContracts || []).filter((contract) => contract.type === 'call');
        const puts = (data.keyContracts || []).filter((contract) => contract.type === 'put');
        const callOi = calls.reduce((sum, contract) => sum + contract.openInterest, 0);
        const putOi = puts.reduce((sum, contract) => sum + contract.openInterest, 0);
        const nearest = [...(data.keyContracts || [])].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
        return { spot, callWall, putWall, gammaFlip, maxPain, netGex, totalCallGex: numeric(summary.totalCallGex), totalPutGex: numeric(summary.totalPutGex), contractsCount: numeric(summary.contractsCount), putCallRatio: callOi > 0 ? putOi / callOi : undefined, atmIv: nearest?.iv, callOi, putOi, longGamma: netGex >= 0 };
    }, [data]);

    const liveSpot = dataMode === 'LIVE' ? marketFeed.ticker?.lastPrice ?? marketFeed.candles.at(-1)?.close : undefined;
    const displayedSpot = liveSpot ?? metrics.spot;
    const changePct = dataMode === 'LIVE' ? marketFeed.ticker?.priceChangePercent : numeric((data.summary as unknown as Record<string, unknown>).spot24hChangePct);
    const rawExpiry = data.expirations?.[0];
    const parsedExpiry = rawExpiry ? Date.parse(rawExpiry) : Number.NaN;
    const expiryLabel = rawExpiry
        ? Number.isFinite(parsedExpiry)
            ? new Date(parsedExpiry).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }).toUpperCase()
            : rawExpiry
        : 'EXPIRY';
    const deribitState = dataMode === 'LIVE' ? (isError || data.dataMode !== 'LIVE' ? 'OFFLINE' : 'LIVE') : 'DEMO';
    const binanceState = dataMode === 'DEMO' ? 'DEMO' : marketFeed.state;

    function saveLayout() {
        localStorage.setItem('btc-terminal-layout-snapshot', JSON.stringify({ timeframe, replayActive, activeOrderFlowStudy, dteFilter, chartLayers, savedAt: new Date().toISOString() }));
        setSavedAt(new Date().toLocaleTimeString());
    }

    const integrityDomains = useMemo<DataIntegritySourceV1[]>(() => {
        const replayTimestamp = Date.parse(data.timestamp);
        const safeReplayTimestamp = Number.isSafeInteger(replayTimestamp) && replayTimestamp >= 0 ? replayTimestamp : 0;
        const capturedAt = Math.max(
            safeReplayTimestamp,
            marketFeed.lastEventAt ?? 0,
            liquidityFeed.sequence.lastEventTime ?? 0,
            aggregateTradeFeed.coverage.capturedAt,
        );
        const replayCoverage = (precision: 'BAR' | 'STRUCTURAL') => createCaptureCoverageV1({
            dataMode: 'REPLAY',
            source: 'UX16_FIXTURE',
            venue: precision === 'BAR' ? 'BINANCE_SPOT' : 'DERIBIT',
            symbol: 'BTCUSDT',
            capturedAt: safeReplayTimestamp,
            eventTime: safeReplayTimestamp,
            coverageStart: null,
            coverageEnd: null,
            sequenceState: 'NOT_APPLICABLE',
            gapCount: 0,
            precision,
            approximation: precision === 'BAR' ? 'BAR_DERIVED' : 'NONE',
            quality: 'UNAVAILABLE',
        });
        const offlineCoverage = (source: 'BINANCE_SPOT' | 'ORDERFLOW_DERIVED', precision: 'TRADE' | 'DEPTH_BUCKET' | 'STRUCTURAL') => createCaptureCoverageV1({
            dataMode: 'LIVE',
            source,
            venue: source === 'BINANCE_SPOT' ? 'BINANCE_SPOT' : 'NOT_APPLICABLE',
            symbol: 'BTCUSDT',
            capturedAt,
            eventTime: capturedAt,
            coverageStart: null,
            coverageEnd: null,
            sequenceState: 'OFFLINE',
            gapCount: 0,
            precision,
            approximation: 'NONE',
            quality: 'UNAVAILABLE',
        });

        const candleEventTime = marketFeed.lastEventAt ?? capturedAt;
        const candleCapturedAt = candleEventTime + Math.max(0, Math.round(marketFeed.latencyMs ?? 0));
        const candleCoverage = dataMode === 'DEMO' ? replayCoverage('BAR') : createCaptureCoverageV1({
            dataMode: 'LIVE',
            source: 'BINANCE_SPOT',
            venue: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            capturedAt: Math.max(capturedAt, candleCapturedAt),
            eventTime: candleEventTime,
            coverageStart: marketFeed.lastEventAt,
            coverageEnd: marketFeed.lastEventAt,
            sequenceState: marketFeed.state === 'CONNECTING' ? 'BUFFERING' : marketFeed.state,
            gapCount: 0,
            precision: 'BAR',
            approximation: 'BAR_DERIVED',
        });
        const optionsEventTime = Number.isSafeInteger(replayTimestamp) && replayTimestamp >= 0 ? replayTimestamp : capturedAt;
        const optionsCoverage = dataMode === 'DEMO' ? replayCoverage('STRUCTURAL') : createCaptureCoverageV1({
            dataMode: 'LIVE',
            source: 'DERIBIT_OPTIONS',
            venue: 'DERIBIT',
            symbol: 'BTCUSDT',
            capturedAt: Math.max(capturedAt, optionsEventTime),
            eventTime: optionsEventTime,
            coverageStart: isError ? null : optionsEventTime,
            coverageEnd: isError ? null : optionsEventTime,
            sequenceState: isError ? 'OFFLINE' : 'NOT_APPLICABLE',
            gapCount: 0,
            precision: 'STRUCTURAL',
            approximation: 'NONE',
        });
        const depthEventTime = liquidityFeed.sequence.lastEventTime ?? capturedAt;
        const depthCoverage = dataMode === 'DEMO' ? offlineCoverage('BINANCE_SPOT', 'DEPTH_BUCKET') : createCaptureCoverageV1({
            dataMode: 'LIVE',
            source: 'BINANCE_SPOT',
            venue: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            capturedAt: Math.max(capturedAt, depthEventTime),
            eventTime: depthEventTime,
            coverageStart: liquidityFeed.coverage.startedAt,
            coverageEnd: liquidityFeed.coverage.endedAt,
            sequenceState: liquidityFeed.sequence.state,
            gapCount: liquidityFeed.sequence.gapCount,
            precision: 'DEPTH_BUCKET',
            approximation: 'NONE',
        });
        const depthStatus = dataMode === 'DEMO'
            ? 'UNAVAILABLE'
            : liquidityFeed.sequence.state === 'LIVE' ? 'READY'
                : liquidityFeed.sequence.state === 'BUFFERING' ? 'LOADING'
                    : liquidityFeed.sequence.state === 'GAP' ? 'PARTIAL'
                        : liquidityFeed.sequence.state === 'STALE' ? 'STALE' : 'UNAVAILABLE';
        const tradeCoverage = dataMode === 'DEMO'
            ? offlineCoverage('BINANCE_SPOT', 'TRADE')
            : aggregateTradeFeed.coverage;
        const tradeStatus = getAggregateTradeIntegrityStatus({
            capability: aggregateTradeFeed.capability,
            coverage: aggregateTradeFeed.coverage,
            error: aggregateTradeFeed.error,
            stats: { acceptedCount: aggregateTradeFeed.stats.acceptedCount },
        }, dataMode);
        const tradeDetail = dataMode === 'DEMO'
            ? 'No replay tape is presented as observed live data.'
            : aggregateTradeFeed.capability === 'DISABLED'
                ? 'Shadow aggregate-trade capture is disabled by the server feature flag.'
                : aggregateTradeFeed.capability === 'CHECKING'
                    ? 'Checking the shadow aggregate-trade capture capability.'
                    : aggregateTradeFeed.capability === 'ERROR'
                        ? aggregateTradeFeed.error?.message ?? 'Shadow aggregate-trade capture is unavailable.'
                        : `Binance Spot aggregate trades; ${aggregateTradeFeed.stats.acceptedCount.toLocaleString()} captured; capture only, no derived CVD yet.`;

        return [
            {
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                key: 'CANDLES',
                label: 'CANDLES',
                status: dataMode === 'DEMO' ? 'REPLAY' : marketFeed.state === 'LIVE' ? 'READY' : marketFeed.state === 'CONNECTING' ? 'LOADING' : marketFeed.state === 'STALE' ? 'STALE' : 'UNAVAILABLE',
                detail: dataMode === 'DEMO' ? 'UX16 demo fixture; not live market data.' : `Binance Spot ${timeframe} bars; bar precision only.`,
                coverage: candleCoverage,
            },
            {
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                key: 'OPTIONS',
                label: 'OPTIONS',
                status: dataMode === 'DEMO' ? 'REPLAY' : isError || data.dataMode !== 'LIVE' ? 'UNAVAILABLE' : 'READY',
                detail: dataMode === 'DEMO' ? 'UX16 demo fixture; not live market data.' : 'Deribit public options structure.',
                coverage: optionsCoverage,
            },
            {
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                key: 'DEPTH',
                label: 'L2 DEPTH',
                status: depthStatus,
                detail: dataMode === 'DEMO' ? 'No demo depth is presented as observed.' : 'Sequence-validated Binance diff-depth reconstruction.',
                coverage: depthCoverage,
            },
            {
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                key: 'TRADES',
                label: 'SPOT TAPE',
                status: tradeStatus,
                detail: tradeDetail,
                coverage: tradeCoverage,
            },
            {
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                key: 'SETUP',
                label: 'SETUP',
                status: 'UNAVAILABLE',
                detail: 'The deterministic setup engine is not enabled in UX16.0.',
                coverage: offlineCoverage('ORDERFLOW_DERIVED', 'STRUCTURAL'),
            },
            {
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                key: 'JEV',
                label: 'JEV',
                status: 'SHADOW',
                detail: 'Jev is disabled in the UI until the UX16.7 shadow-explanation checkpoint.',
                coverage: createCaptureCoverageV1({ ...offlineCoverage('ORDERFLOW_DERIVED', 'STRUCTURAL'), dataMode: 'SHADOW', source: 'UX16_FIXTURE' }),
            },
        ];
    }, [aggregateTradeFeed.capability, aggregateTradeFeed.coverage, aggregateTradeFeed.error, aggregateTradeFeed.stats.acceptedCount, data.dataMode, data.timestamp, dataMode, isError, liquidityFeed.coverage.endedAt, liquidityFeed.coverage.startedAt, liquidityFeed.sequence.gapCount, liquidityFeed.sequence.lastEventTime, liquidityFeed.sequence.state, marketFeed.lastEventAt, marketFeed.latencyMs, marketFeed.state, timeframe]);

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-[#070A0F] text-[#D8DEE8]">
                {/* Header Chrome */}
                <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#18212C] bg-[#0C1118] px-2 md:px-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#E6B450] font-mono font-black text-black text-xs">₿</div>
                        <div className="hidden text-xs font-bold tracking-tight text-[#D8DEE8] sm:block">BTCUSDT</div>
                        <ChevronDown className="size-3 text-[#8390A0]" />
                    </div>

                    <div className="font-mono text-sm font-semibold tabular-nums text-[#D8DEE8] md:text-base">
                        {displayedSpot.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </div>
                    <div className={cn('hidden font-mono text-xs font-semibold tabular-nums sm:block', changePct === undefined ? 'text-[#8390A0]' : changePct >= 0 ? 'text-[#2CC7A0]' : 'text-[#E06379]')}>
                        {changePct === undefined ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}
                    </div>

                    {/* Mode Shell Switcher in Header */}
                    <div
                        className="ml-2 flex items-center rounded border border-[#18212C] bg-[#070A0F] p-0.5"
                        role="tablist"
                        aria-label="Workspace Mode Switcher"
                        data-testid="header-workspace-mode-selector"
                    >
                        {(['CONTEXT', 'FLOW', 'SETUP'] as const).map((mode) => {
                            const active = workspaceMode === mode;
                            return (
                                <button
                                    key={mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    data-testid={`workspace-mode-${mode.toLowerCase()}`}
                                    onClick={() => {
                                        setWorkspaceMode(mode);
                                        setInspectorTab('DECISION');
                                    }}
                                    className={cn(
                                        'h-6 px-2.5 font-mono text-[9px] font-bold tracking-wider rounded transition-colors',
                                        active
                                            ? 'bg-[#18212C] text-[#39A9F5]'
                                            : 'text-[#8390A0] hover:text-[#D8DEE8]',
                                    )}
                                >
                                    {mode}
                                </button>
                            );
                        })}
                    </div>

                    {/* Timeframe pills */}
                    <div className="ml-auto hidden items-center rounded border border-[#18212C] bg-[#070A0F] md:flex">
                        {TIMEFRAMES.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setTimeframe(item)}
                                className={cn('h-7 min-w-9 px-2 font-mono text-[9px] text-[#8390A0] transition-colors', timeframe === item && 'bg-[#18212C] text-[#39A9F5] font-bold')}
                            >
                                {item}
                            </button>
                        ))}
                    </div>

                    <button type="button" className="hidden h-7 items-center gap-1.5 rounded border border-[#18212C] bg-[#070A0F] px-2.5 font-mono text-[9px] text-[#8390A0] xl:flex">
                        {expiryLabel}<ChevronDown className="size-3" />
                    </button>

                    <SourceChip label="Binance" state={binanceState} tone={binanceState === 'LIVE' ? 'live' : binanceState === 'DEMO' ? 'demo' : binanceState === 'STALE' || binanceState === 'CONNECTING' ? 'shadow' : 'off'} />
                    <SourceChip label="Deribit" state={deribitState} tone={deribitState === 'LIVE' ? 'live' : deribitState === 'DEMO' ? 'demo' : 'off'} />
                    <SourceChip label="Jev" state="SHADOW OFF" tone="off" />

                    <button
                        type="button"
                        onClick={() => setPaletteOpen(true)}
                        aria-label="Open command palette CTRL K"
                        className="flex h-7 shrink-0 items-center gap-1.5 rounded border border-[#18212C] bg-[#070A0F] px-2 font-mono text-[9px] text-[#8390A0] hover:text-[#D8DEE8]"
                    >
                        <Search className="size-3" />
                        <span className="hidden sm:inline">CTRL K</span>
                    </button>

                    <button
                        type="button"
                        aria-label="Terminal settings"
                        onClick={() => setActiveWorkspace('SETTINGS')}
                        className="rounded p-1.5 text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]"
                    >
                        <Settings className="size-3.5" />
                    </button>
                </header>

                {/* Toolbar */}
                <div
                    className="flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#18212C] bg-[#0C1118] px-2 font-mono"
                    role="toolbar"
                    aria-label="Chart navigation and workspace actions"
                    data-testid="chart-upper-toolbar"
                >
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button type="button" className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]">
                                <Activity className="size-3.5 text-[#39A9F5]" />Indicators
                            </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                            <Popover.Content sideOffset={6} className="z-50 w-56 rounded border border-[#18212C] bg-[#0C1118] p-2 shadow-xl">
                                <div className="px-2 py-1 text-[9px] font-bold text-[#8390A0]">ORDER FLOW STUDIES</div>
                                {ORDER_FLOW_TABS.map((study) => {
                                    const state = study === 'CVD' || study === 'DELTA'
                                        ? 'BAR_PRECISION'
                                        : dataMode === 'DEMO' ? 'UNAVAILABLE' : liquidityFeed.sequence.state;
                                    return (
                                        <button
                                            key={study}
                                            type="button"
                                            onClick={() => { setStudyPaneOpen(true); setActiveOrderFlowStudy(study); }}
                                            className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-[10px] text-[#D8DEE8] hover:bg-white/5"
                                        >
                                            <span>{study}</span>
                                            <span className={state === 'LIVE' ? 'text-[#2CC7A0]' : state === 'BAR_PRECISION' || state === 'BUFFERING' ? 'text-[#E6B450]' : 'text-[#5C697A]'}>{state}</span>
                                        </button>
                                    );
                                })}
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>

                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button type="button" className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]">
                                <Layers3 className="size-3.5 text-[#39A9F5]" />Layers
                            </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                            <Popover.Content sideOffset={6} className="z-50 w-64 rounded border border-[#18212C] bg-[#0C1118] p-3 shadow-xl">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-[#8390A0]">CHART OVERLAYS</span>
                                    <button type="button" aria-label="Reset layers" onClick={resetWorkspaceUi}>
                                        <RotateCcw className="size-3.5 text-[#8390A0] hover:text-[#D8DEE8]" />
                                    </button>
                                </div>
                                <LayerToggle label="Primary walls" checked={chartLayers.walls} onCheckedChange={() => toggleChartLayer('walls')} />
                                <LayerToggle label="Secondary walls" checked={chartLayers.secondaryWalls} onCheckedChange={() => toggleChartLayer('secondaryWalls')} />
                                <LayerToggle label="Gamma regime" checked={chartLayers.gammaRegime} onCheckedChange={() => toggleChartLayer('gammaRegime')} />
                                <LayerToggle label="Gamma Flip" checked={chartLayers.gammaFlip} onCheckedChange={() => toggleChartLayer('gammaFlip')} />
                                <LayerToggle label="Max Pain" checked={chartLayers.maxPain} onCheckedChange={() => toggleChartLayer('maxPain')} />
                                <LayerToggle label="Liquidity heatmap" checked={chartLayers.liquidityHeatmap !== false} onCheckedChange={() => toggleChartLayer('liquidityHeatmap')} />
                                <LayerToggle label="Fixed Range VP" checked={chartLayers.volumeProfile} onCheckedChange={() => toggleChartLayer('volumeProfile')} />
                                <LayerToggle label="Anchored VWAP" checked={chartLayers.avwap} onCheckedChange={() => toggleChartLayer('avwap')} />
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>

                    <button
                        type="button"
                        aria-pressed={replayActive}
                        onClick={() => setReplayActive((active) => !active)}
                        className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8]', replayActive && 'bg-[#E6B450]/15 text-[#E6B450]')}
                    >
                        {replayActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}Replay
                    </button>

                    <div className="ml-auto flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => {
                                if (isDesktop) {
                                    if (inspectorOpen && useTerminalStore.getState().inspectorTab === 'OPTIONS') {
                                        setInspectorOpen(false);
                                    } else {
                                        setInspectorTab('OPTIONS');
                                        setInspectorOpen(true);
                                    }
                                } else {
                                    setInspectorTab('OPTIONS');
                                    setMobileInspectorOpen(true);
                                }
                            }}
                            aria-label="OPTIONS METRICS"
                            className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded border border-[#39A9F5]/40 px-3 text-[9px] font-bold text-[#39A9F5] transition-colors', inspectorOpen && 'bg-[#39A9F5]/10')}
                        >
                            <SlidersHorizontal className="size-3" />OPTIONS METRICS
                        </button>
                        {DTE_FILTERS.map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                onClick={() => setDteFilter(filter)}
                                className={cn('h-7 min-w-10 shrink-0 rounded border px-2 text-[9px] font-bold transition-colors', dteFilter === filter ? 'border-[#39A9F5]/50 bg-[#39A9F5]/15 text-[#39A9F5]' : 'border-[#18212C] text-[#8390A0] hover:text-[#D8DEE8]')}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>

                {isError && dataMode === 'LIVE' && (
                    <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#E06379]/30 bg-[#E06379]/10 px-3 text-[9px] font-mono text-[#E06379]">
                        <span>LIVE OPTIONS FEED OFFLINE · no demo values are presented as live</span>
                        <button type="button" onClick={() => setDataMode('DEMO')} className="font-bold underline underline-offset-2">OPEN DEMO</button>
                    </div>
                )}

                {/* Main Work Area: Left Drawing Rail + Chart + Decision Dock */}
                <main className="min-h-0 flex-1">
                    <Group
                        orientation="horizontal"
                        id="market-layout"
                        defaultLayout={{ chart: 78, inspector: 22 }}
                        onLayoutChanged={(layout) => localStorage.setItem('btc-terminal-panels-v2', JSON.stringify(layout))}
                    >
                        <Panel id="chart" minSize="58%" defaultSize="78%">
                            <div className="flex h-full min-h-0 flex-col">
                                {/* Study Chips Bar */}
                                <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#18212C] bg-[#090D14] px-2">
                                    <StudyChip label="Fixed Range VP" visible={chartLayers.volumeProfile} onToggle={() => toggleChartLayer('volumeProfile')} description="Selected-range profile with POC, VAH, VAL, and configurable row density." />
                                    <StudyChip label="AVWAP · Swing Low" visible={chartLayers.avwap} onToggle={() => toggleChartLayer('avwap')} description="Anchored VWAP with draggable candle anchor and standard-deviation bands." />
                                    <StudyChip label="Gamma Regime" visible={chartLayers.gammaRegime} onToggle={() => toggleChartLayer('gammaRegime')} description="Positive and negative gamma behavior zones separated by the Gamma Flip." />
                                    <StudyChip label="Walls" visible={chartLayers.walls} onToggle={() => toggleChartLayer('walls')} description="Primary call and put walls plus optional secondary GEX levels." />
                                    <StudyChip label="Liquidity Heatmap" visible={chartLayers.liquidityHeatmap !== false} onToggle={() => toggleChartLayer('liquidityHeatmap')} description="Sequence-validated Binance Spot depth history. Session-local only; no synthetic liquidity." />
                                </div>

                                <div className="flex min-h-0 flex-1">
                                    {/* Left Drawing Tools Rail */}
                                    <nav
                                        className="flex w-10 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#18212C] bg-[#070A0F] py-2 md:w-12"
                                        aria-label="Chart drawing tools"
                                        data-testid="drawing-tools-rail"
                                    >
                                        {DRAWING_TOOLS.map(({ id, label, icon: Icon, tone }) => (
                                            <Tooltip.Root key={id}>
                                                <Tooltip.Trigger asChild>
                                                    <button
                                                        type="button"
                                                        aria-label={label}
                                                        aria-pressed={activeTool === id}
                                                        title={label}
                                                        onClick={() => setActiveTool(id)}
                                                        className={cn(
                                                            'flex size-8 shrink-0 items-center justify-center rounded text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8] transition-colors',
                                                            tone === 'long' && 'text-[#2CC7A0]/80 hover:text-[#2CC7A0]',
                                                            tone === 'short' && 'text-[#E06379]/80 hover:text-[#E06379]',
                                                            activeTool === id && 'bg-[#39A9F5]/15 text-[#39A9F5] ring-1 ring-[#39A9F5]/40',
                                                        )}
                                                    >
                                                        <Icon className="size-3.5" />
                                                    </button>
                                                </Tooltip.Trigger>
                                                <Tooltip.Portal>
                                                    <Tooltip.Content side="right" sideOffset={8} className="z-50 rounded bg-[#D8DEE8] px-2 py-1 text-[10px] font-medium text-[#070A0F]">
                                                        {label}
                                                    </Tooltip.Content>
                                                </Tooltip.Portal>
                                            </Tooltip.Root>
                                        ))}

                                        <div className="my-1 h-px w-6 shrink-0 bg-[#18212C]" />

                                        <Tooltip.Root>
                                            <Tooltip.Trigger asChild>
                                                <button
                                                    type="button"
                                                    aria-label="Keep drawing mode"
                                                    aria-pressed={keepDrawing}
                                                    title="Keep drawing mode"
                                                    onClick={() => setKeepDrawing((current) => !current)}
                                                    className={cn(
                                                        'flex size-8 shrink-0 items-center justify-center rounded text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8] transition-colors',
                                                        keepDrawing && 'bg-[#39A9F5]/15 text-[#39A9F5] ring-1 ring-[#39A9F5]/40',
                                                    )}
                                                >
                                                    <Pin className="size-3" />
                                                </button>
                                            </Tooltip.Trigger>
                                            <Tooltip.Portal>
                                                <Tooltip.Content side="right" sideOffset={8} className="z-50 rounded bg-[#D8DEE8] px-2 py-1 text-[10px] font-medium text-[#070A0F]">
                                                    Keep drawing mode
                                                </Tooltip.Content>
                                            </Tooltip.Portal>
                                        </Tooltip.Root>

                                        <Tooltip.Root>
                                            <Tooltip.Trigger asChild>
                                                <button
                                                    type="button"
                                                    aria-label="Lock chart objects"
                                                    title="Lock chart objects"
                                                    className="flex size-8 shrink-0 items-center justify-center rounded text-[#8390A0] hover:bg-white/5"
                                                >
                                                    <Lock className="size-3.5" />
                                                </button>
                                            </Tooltip.Trigger>
                                            <Tooltip.Portal>
                                                <Tooltip.Content side="right" className="z-50 rounded bg-[#D8DEE8] px-2 py-1 text-[10px] text-[#070A0F]">
                                                    Object locking is available on selected studies
                                                </Tooltip.Content>
                                            </Tooltip.Portal>
                                        </Tooltip.Root>

                                        <div className="mt-auto">
                                            <DropdownMenu.Root>
                                                <DropdownMenu.Trigger asChild>
                                                    <button
                                                        type="button"
                                                        aria-label="Switch workspace"
                                                        title="Switch workspace"
                                                        className="flex size-8 shrink-0 items-center justify-center rounded text-[#8390A0] hover:bg-white/5"
                                                    >
                                                        <LayoutDashboard className="size-3.5" />
                                                    </button>
                                                </DropdownMenu.Trigger>
                                                <DropdownMenu.Portal>
                                                    <DropdownMenu.Content side="right" sideOffset={7} className="z-50 w-48 rounded border border-[#18212C] bg-[#0C1118] p-1 shadow-xl">
                                                        {WORKSPACES.map(({ id, label, icon: Icon }) => (
                                                            <DropdownMenu.Item key={id} onSelect={() => setActiveWorkspace(id)} className="flex cursor-default items-center gap-2 rounded px-2 py-2 text-[10px] text-[#D8DEE8] outline-none data-[highlighted]:bg-[#39A9F5]/10">
                                                                <Icon className="size-3.5 text-[#39A9F5]" />{label}
                                                            </DropdownMenu.Item>
                                                        ))}
                                                    </DropdownMenu.Content>
                                                </DropdownMenu.Portal>
                                            </DropdownMenu.Root>
                                        </div>
                                    </nav>

                                    {/* Chart Center Area */}
                                    <div className="min-w-0 flex-1">
                                        <MarketStructureChart
                                            data={data}
                                            marketFeed={marketFeed}
                                            liquidityFeed={liquidityFeed}
                                            activeTool={activeTool}
                                            keepDrawing={keepDrawing}
                                            timeframe={timeframe}
                                            replayActive={replayActive}
                                            onActiveToolChange={setActiveTool}
                                            selectedDrawing={selectedDrawing}
                                            onSelectedDrawingChange={setSelectedDrawing}
                                            onRegisterPositionUpdater={handleRegisterPositionUpdater}
                                            riskSettings={riskSettings}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Panel>

                        {/* Right Dock / Inspector Panel */}
                        {inspectorOpen && isDesktop && (
                            <>
                                <Separator
                                    aria-label="Resize options inspector"
                                    aria-valuemin={58}
                                    aria-valuemax={90}
                                    aria-valuenow={78}
                                    className="group relative w-1 bg-[#18212C] outline-none hover:bg-[#39A9F5]/40 focus-visible:bg-[#39A9F5]/60"
                                >
                                    <span className="absolute inset-y-0 -left-1 -right-1" />
                                </Separator>
                                <Panel id="inspector" minSize="320px" maxSize="36%" defaultSize="22%" groupResizeBehavior="preserve-pixel-size">
                                    <DecisionDock
                                        metrics={metrics}
                                        data={data}
                                        marketFeed={marketFeed}
                                        liquidityFeed={liquidityFeed}
                                        isError={isError}
                                        onClose={() => setInspectorOpen(false)}
                                        selectedDrawing={selectedDrawing}
                                        onUpdatePositionPrices={handleUpdatePositionPrices}
                                        onSelectDrawingType={(type) => setActiveTool(type)}
                                        riskSettings={riskSettings}
                                        onSettingsChange={handleRiskSettingsChange}
                                        optionsContent={<OptionsContent metrics={metrics} data={data} isError={isError} />}
                                    />
                                </Panel>
                            </>
                        )}
                    </Group>
                </main>

                {/* Data Integrity Strip */}
                <DataIntegrityStrip domains={integrityDomains} />

                {/* Footer Status Bar */}
                <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[#18212C] bg-[#070A0F] px-2.5 text-[9px] font-mono text-[#8390A0]">
                    <div className="flex min-w-0 items-center gap-4">
                        <span className="font-bold text-[#E06379]">NO LIVE EXECUTION</span>
                        <span className="hidden items-center gap-1 sm:flex">
                            <span className={cn('size-1.5 rounded-full', binanceState === 'LIVE' ? 'bg-[#2CC7A0]' : binanceState === 'DEMO' ? 'bg-[#E6B450]' : 'bg-[#5C697A]')} />
                            Candles {binanceState.toLowerCase()}
                        </span>
                        <span className="hidden items-center gap-1 md:flex">
                            <span className={cn('size-1.5 rounded-full', deribitState === 'LIVE' ? 'bg-[#2CC7A0]' : deribitState === 'DEMO' ? 'bg-[#E6B450]' : 'bg-[#5C697A]')} />
                            Options {deribitState.toLowerCase()}
                        </span>
                        <span className="hidden items-center gap-1 lg:flex">
                            <span className={cn('size-1.5 rounded-full', marketFeed.state === 'LIVE' ? 'bg-[#2CC7A0]' : 'bg-[#39A9F5]')} />
                            Tape unavailable
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:inline">UTC {utcNow}</span>
                        <span className="hidden lg:inline">Latency {marketFeed.latencyMs === null ? '—' : `${marketFeed.latencyMs} ms`}</span>
                        <button type="button" onClick={saveLayout} className="hover:text-[#D8DEE8] transition-colors">SAVE LAYOUT</button>
                        {savedAt && <span className="hidden text-[#2CC7A0] xl:inline">Saved {savedAt}</span>}
                        <button
                            type="button"
                            onClick={() => setDataMode(dataMode === 'DEMO' ? 'LIVE' : 'DEMO')}
                            className={cn('font-bold transition-colors', dataMode === 'DEMO' ? 'text-[#E6B450]' : 'text-[#2CC7A0]')}
                        >
                            ● {dataMode}
                        </button>
                        <CircleHelp className="size-3 text-[#5C697A]" />
                    </div>
                </footer>

                {/* Command Palette */}
                <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
                        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[18%] z-50 w-[min(92vw,620px)] -translate-x-1/2 overflow-hidden rounded-xl border border-[#18212C] bg-[#0C1118] shadow-2xl">
                            <Dialog.Title className="sr-only">Terminal command palette</Dialog.Title>
                            <Command className="bg-transparent text-[#D8DEE8]">
                                <div className="flex items-center border-b border-[#18212C] px-3">
                                    <CommandIcon className="size-4 text-[#8390A0]" />
                                    <Command.Input autoFocus placeholder="Search workspaces and actions…" className="h-12 w-full bg-transparent px-3 font-sans text-sm outline-none placeholder:text-[#5C697A]" />
                                </div>
                                <Command.List className="max-h-[360px] overflow-y-auto p-2">
                                    <Command.Empty className="p-6 text-center text-xs text-[#8390A0]">No command found.</Command.Empty>
                                    <Command.Group heading="Workspaces" className="text-[9px] font-mono text-[#8390A0]">
                                        {WORKSPACES.map(({ id, label, icon: Icon }) => (
                                            <Command.Item key={id} value={label} onSelect={() => { setActiveWorkspace(id); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2 text-xs text-[#D8DEE8] data-[selected=true]:bg-[#39A9F5]/10 data-[selected=true]:text-[#39A9F5]">
                                                <Icon className="size-4" />{label}
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                    <Command.Group heading="Modes" className="mt-2 text-[9px] font-mono text-[#8390A0]">
                                        {(['CONTEXT', 'FLOW', 'SETUP'] as const).map((mode) => (
                                            <Command.Item key={mode} value={`Mode: ${mode}`} onSelect={() => { setWorkspaceMode(mode); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2 text-xs text-[#D8DEE8] data-[selected=true]:bg-[#39A9F5]/10 data-[selected=true]:text-[#39A9F5]">
                                                <Activity className="size-4" />Switch to {mode} Mode
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                    <Command.Group heading="Actions" className="mt-2 text-[9px] font-mono text-[#8390A0]">
                                        <Command.Item onSelect={() => { setInspectorOpen(true); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2 text-xs text-[#D8DEE8] data-[selected=true]:bg-[#39A9F5]/10 data-[selected=true]:text-[#39A9F5]">
                                            <PanelRightOpen className="size-4" />Open Decision Dock &amp; Metrics
                                        </Command.Item>
                                        <Command.Item onSelect={() => { resetWorkspaceUi(); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2 text-xs text-[#D8DEE8] data-[selected=true]:bg-[#39A9F5]/10 data-[selected=true]:text-[#39A9F5]">
                                            <RotateCcw className="size-4" />Reset Workspace layout
                                        </Command.Item>
                                    </Command.Group>
                                </Command.List>
                            </Command>
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>

                {/* Mobile Inspector Drawer */}
                <Dialog.Root open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 md:hidden" />
                        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-y-auto rounded-t-xl border border-[#18212C] bg-[#0C1118] pb-[env(safe-area-inset-bottom)] md:hidden">
                            <Dialog.Title className="sr-only">Decision Dock &amp; Options</Dialog.Title>
                            <DecisionDock
                                metrics={metrics}
                                data={data}
                                marketFeed={marketFeed}
                                liquidityFeed={liquidityFeed}
                                isError={isError}
                                onClose={() => setMobileInspectorOpen(false)}
                                selectedDrawing={selectedDrawing}
                                onUpdatePositionPrices={handleUpdatePositionPrices}
                                onSelectDrawingType={(type) => setActiveTool(type)}
                                riskSettings={riskSettings}
                                onSettingsChange={handleRiskSettingsChange}
                                optionsContent={<OptionsContent metrics={metrics} data={data} isError={isError} />}
                            />
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>
            </div>
        </Tooltip.Provider>
    );
}
