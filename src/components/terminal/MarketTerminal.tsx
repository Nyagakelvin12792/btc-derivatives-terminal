'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Command } from 'cmdk';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
    Activity,
    BarChart3,
    Boxes,
    ChevronDown,
    CircleHelp,
    Command as CommandIcon,
    Database,
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
    ShieldAlert,
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
import { useBinanceMarketFeed, type BinanceMarketFeed } from '../../lib/binance/use-market-feed';
import type { BinanceInterval } from '../../lib/binance/types';
import MarketStructureChart from './MarketStructureChart';
import type { ChartTimeframe, ChartTool } from './types';

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

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'negative' | 'warning' }) {
    const color = tone === 'positive' ? 'text-emerald-300' : tone === 'negative' ? 'text-rose-300' : tone === 'warning' ? 'text-sky-300' : 'text-zinc-100';
    return <div className="rounded-md border border-[#253347] bg-[#0a1018] px-2.5 py-2"><div className="truncate text-[9px] font-semibold uppercase text-zinc-500">{label}</div><div className={cn('mt-1 font-mono text-[13px] font-semibold tabular-nums', color)}>{value}</div></div>;
}

function LayerToggle({ label, checked, onCheckedChange, compact: isCompact = false }: { label: string; checked: boolean; onCheckedChange: () => void; compact?: boolean }) {
    return <div className={cn('flex items-center justify-between gap-3', isCompact ? 'py-1.5' : 'py-1.5')}><span className={cn('truncate text-zinc-300', isCompact ? 'text-[10px]' : 'text-[11px]')}>{label}</span><Switch.Root aria-label={`Toggle ${label}`} checked={checked} onCheckedChange={onCheckedChange} className="relative h-5 w-9 shrink-0 rounded-full border border-[#2a3748] bg-[#111a25] data-[state=checked]:border-cyan-400/50 data-[state=checked]:bg-cyan-500/25"><Switch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-zinc-400 transition-transform duration-150 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-cyan-300 motion-reduce:transition-none" /></Switch.Root></div>;
}

function InspectorMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'negative' }) {
    const color = tone === 'positive' ? 'text-emerald-300' : tone === 'negative' ? 'text-rose-300' : 'text-zinc-100';
    return <div className="flex min-w-0 items-center justify-between gap-2 rounded border border-[#253347] bg-[#0a1018] px-2 py-2"><span className="truncate text-[10px] text-zinc-500">{label}</span><span className={cn('shrink-0 font-mono text-[11px] font-semibold tabular-nums', color)}>{value}</span></div>;
}

function SourceChip({ label, state, tone }: { label: string; state: string; tone: 'live' | 'shadow' | 'demo' | 'off' }) {
    const dot = tone === 'live' ? 'bg-emerald-300' : tone === 'shadow' ? 'bg-sky-300' : tone === 'demo' ? 'bg-amber-300' : 'bg-zinc-500';
    const textTone = tone === 'live' ? 'text-emerald-300' : tone === 'shadow' ? 'text-sky-300' : tone === 'demo' ? 'text-amber-300' : 'text-zinc-500';
    return <div className="hidden h-8 items-center gap-2 rounded border border-[#253347] bg-[#0a111a] px-2.5 text-[9px] lg:flex"><span className={cn('size-2 rounded-full', dot)} /><span className="font-semibold text-zinc-200">{label}</span><span className={cn('font-bold', textTone)}>{state}</span></div>;
}

function StudyChip({ label, visible, onToggle, description }: { label: string; visible: boolean; onToggle: () => void; description: string }) {
    return <div className="flex h-8 shrink-0 items-center rounded border border-[#2b3b50] bg-[#0a121d] text-[9px] font-semibold text-cyan-300"><span className="px-2">{label}</span><button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label}`} onClick={onToggle} className="border-l border-[#2b3b50] p-2 text-zinc-400 hover:text-zinc-100">{visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}</button><Popover.Root><Popover.Trigger asChild><button type="button" aria-label={`${label} settings`} className="border-l border-[#2b3b50] p-2 text-zinc-400 hover:text-zinc-100"><Settings className="size-3" /></button></Popover.Trigger><Popover.Portal><Popover.Content sideOffset={6} className="z-50 w-56 rounded-md border border-[#33445a] bg-[#0b121c] p-3 text-[10px] text-zinc-300 shadow-lg"><div className="font-semibold text-zinc-100">{label}</div><p className="mt-1 text-pretty leading-relaxed text-zinc-500">{description}</p><Popover.Arrow className="fill-[#33445a]" /></Popover.Content></Popover.Portal></Popover.Root><button type="button" aria-label={`Remove ${label}`} onClick={onToggle} className="border-l border-[#2b3b50] p-2 text-zinc-400 hover:text-rose-300"><X className="size-3" /></button></div>;
}

function OptionsContent({ metrics, data, isError }: { metrics: MarketMetrics; data: TerrainDataContractV2; isError: boolean }) {
    const { dataMode, dteFilter, setDteFilter, chartLayers, toggleChartLayer, setInspectorTab } = useTerminalStore();
    const decisionReason = Math.abs((metrics.spot - metrics.gammaFlip) / metrics.spot) < 0.012 ? 'Wait for Gamma Flip confirmation' : 'Wait for retest confirmation';
    return <div className="space-y-2 p-2.5">
        <div className="grid min-h-[92px] grid-cols-[1.25fr_1fr_0.8fr] divide-x divide-[#263346] rounded border border-[#263346] bg-[#0a111a] p-3"><div><div className="text-[10px] text-zinc-500">Gamma Regime</div><div className={cn('mt-1.5 text-xl font-bold leading-none', metrics.longGamma ? 'text-emerald-300' : 'text-rose-300')}>{metrics.longGamma ? 'POSITIVE' : 'NEGATIVE'}</div><div className="mt-2 text-[10px] text-zinc-500">{metrics.longGamma ? 'mean-reversion' : 'expansion'}</div></div><div className="pl-3"><div className="text-[10px] text-zinc-500">Net GEX</div><div className={cn('mt-3 font-mono text-base font-bold tabular-nums', metrics.longGamma ? 'text-emerald-300' : 'text-rose-300')}>{compact(metrics.netGex, '$')}</div></div><div className="pl-3"><div className="text-[10px] text-zinc-500">Flip</div><div className="mt-3 font-mono text-[13px] font-bold tabular-nums text-sky-300">{Math.round(metrics.gammaFlip).toLocaleString()}</div></div></div>
        <div className="rounded border border-[#263346] bg-[#090f17] p-2.5"><div className="mb-2 text-[10px] font-semibold text-zinc-500">DTE (Days to Expiry)</div><div className="grid grid-cols-5 gap-1">{DTE_FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setDteFilter(filter)} title={filter === 'ALL' ? 'All expiries' : `Expiries up to ${filter.replace('D', '')} days`} className={cn('h-8 rounded border text-[9px] font-bold', dteFilter === filter ? 'border-cyan-400/55 bg-cyan-400/10 text-cyan-200' : 'border-[#2b3b50] text-zinc-500 hover:text-zinc-200')}>{filter}</button>)}</div><div className="mt-2 grid grid-cols-2 gap-1.5"><InspectorMetric label="Call Wall" value={Math.round(metrics.callWall).toLocaleString()} tone="positive" /><InspectorMetric label="Put Wall" value={Math.round(metrics.putWall).toLocaleString()} tone="negative" /><InspectorMetric label="Max Pain" value={Math.round(metrics.maxPain).toLocaleString()} /><InspectorMetric label="Key P/C" value={metrics.putCallRatio === undefined ? '—' : metrics.putCallRatio.toFixed(2)} /><InspectorMetric label="Near-ATM IV" value={metrics.atmIv === undefined ? '—' : `${(metrics.atmIv > 3 ? metrics.atmIv : metrics.atmIv * 100).toFixed(1)}%`} /><InspectorMetric label="IV Rank" value="N/A" /><InspectorMetric label="Key Call OI" value={compact(metrics.callOi)} /><InspectorMetric label="Key Put OI" value={compact(metrics.putOi)} /></div></div>
        <div className="grid grid-cols-[1fr_0.92fr] gap-1.5"><div className="rounded border border-[#263346] bg-[#0a111a] p-2.5"><div className="mb-0.5 text-[10px] font-semibold text-zinc-400">Show on chart</div><LayerToggle compact label="Walls" checked={chartLayers.walls} onCheckedChange={() => toggleChartLayer('walls')} /><LayerToggle compact label="Gamma Regime" checked={chartLayers.gammaRegime} onCheckedChange={() => toggleChartLayer('gammaRegime')} /><LayerToggle compact label="Gamma Flip" checked={chartLayers.gammaFlip} onCheckedChange={() => toggleChartLayer('gammaFlip')} /><LayerToggle compact label="Max Pain" checked={chartLayers.maxPain} onCheckedChange={() => toggleChartLayer('maxPain')} /><LayerToggle compact label="Secondary GEX" checked={chartLayers.secondaryWalls} onCheckedChange={() => toggleChartLayer('secondaryWalls')} /></div><div className="rounded border border-[#263346] bg-[#0a111a] p-2.5"><div className="text-[10px] font-semibold text-zinc-400">Display</div><div className="mt-2 grid grid-cols-2 gap-1">{(['GEX', 'OI'] as const).map((display) => <button key={display} type="button" disabled={display === 'OI'} title={display === 'OI' ? 'Requires a full-chain call/put OI wall contract' : 'Gamma exposure walls'} className={cn('h-8 rounded border text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-40', display === 'GEX' ? 'border-cyan-400/55 bg-cyan-400/10 text-cyan-200' : 'border-[#2b3b50] text-zinc-500')}>{display}</button>)}</div><div className="mt-4 space-y-3 text-[9px] text-zinc-400"><div className="flex items-center gap-1.5"><span className="h-1 w-4 bg-emerald-400" />Primary Wall</div><div className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-zinc-400" />Secondary Wall</div><div className="flex items-center gap-1.5"><span className="w-4 border-t border-dotted border-zinc-300" />Max Pain</div></div></div></div>
        <div className="min-h-[118px] rounded border border-[#2a3c50] bg-[#0b121b] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-zinc-400">Decision</span><button type="button" onClick={() => setInspectorTab('DECISION')} className="rounded border border-cyan-400/40 px-2.5 py-1.5 text-[9px] font-semibold text-cyan-300">Open →</button></div><div className="mt-2 text-2xl font-black text-zinc-100">NO TRADE</div><p className="mt-1.5 text-pretty text-[10px] text-zinc-400">{decisionReason}</p></div>
        <p className="border-t border-[#263346] px-0.5 pt-2 text-pretty text-[8px] leading-relaxed text-zinc-500">Dealer positioning uses {data.assumptionModel}. It is not directly observed inventory. {isError && dataMode === 'LIVE' ? 'Live feed unavailable.' : ''}</p>
    </div>;
}

function Inspector({ metrics, data, marketFeed, isError, onClose }: { metrics: MarketMetrics; data: TerrainDataContractV2; marketFeed: BinanceMarketFeed; isError: boolean; onClose: () => void }) {
    const { inspectorTab, setInspectorTab, dataMode } = useTerminalStore();
    const timestamp = new Date(data.timestamp).toLocaleString(undefined, { hour12: false });
    return <Tabs.Root value={inspectorTab} onValueChange={(value) => setInspectorTab(value as typeof inspectorTab)} className="h-full">
        <div className="sticky top-0 z-20 flex h-11 items-center border-b border-[#263346] bg-[#080d14]"><Tabs.List className="grid h-full flex-1 grid-cols-4 px-1">{(['OPTIONS', 'DECISION', 'RISK', 'DATA'] as const).map((tab) => <Tabs.Trigger key={tab} value={tab} className="mt-1 h-10 rounded-t border border-transparent text-[9px] font-bold text-zinc-500 data-[state=active]:border-[#2c4157] data-[state=active]:border-b-cyan-300 data-[state=active]:bg-[#0c1722] data-[state=active]:text-zinc-100">{tab}</Tabs.Trigger>)}</Tabs.List><button type="button" onClick={onClose} aria-label="Close options metrics" className="mr-1 rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 md:hidden"><X className="size-3.5" /></button></div>
        <Tabs.Content value="OPTIONS" className="outline-none"><OptionsContent metrics={metrics} data={data} isError={isError} /></Tabs.Content>
        <Tabs.Content value="DECISION" className="space-y-3 p-3 outline-none"><div className="rounded-md border border-cyan-400/25 bg-cyan-400/[0.05] p-3"><div className="flex items-center justify-between"><span className="text-[9px] font-bold text-cyan-200">DETERMINISTIC BASELINE</span><span className="rounded border border-zinc-600 px-1.5 py-0.5 text-[8px] text-zinc-400">OBSERVE</span></div><div className="mt-3 text-2xl font-black">NO TRADE</div><p className="mt-2 text-pretty text-[10px] leading-relaxed text-zinc-400">Wait for price to retest a structural level and confirm acceptance or rejection. Chart position alone does not generate a trade.</p></div><div className="rounded-md border border-amber-400/25 bg-amber-400/[0.04] p-3"><div className="flex items-center justify-between"><span className="text-[9px] font-bold text-amber-200">JEV SHADOW OPINION</span><span className="text-[8px] text-amber-300">UNAVAILABLE</span></div><p className="mt-2 text-pretty text-[10px] leading-relaxed text-zinc-500">The repository exposes no Jev response contract to this frontend. No AI opinion is invented.</p></div><div className="rounded-md border border-[#263346] p-3 text-[9px] text-zinc-500"><div className="mb-2 font-semibold text-zinc-300">Evidence required before promotion</div><ul className="space-y-1"><li>• Replay-safe deterministic agreement</li><li>• Calibrated confidence and abstention</li><li>• Timestamped source provenance</li></ul></div></Tabs.Content>
        <Tabs.Content value="RISK" className="space-y-3 p-3 outline-none"><div className="flex items-center gap-2 rounded-md border border-rose-400/25 bg-rose-400/[0.05] p-3 text-rose-200"><ShieldAlert className="size-4" /><span className="text-[10px] font-bold">NO LIVE EXECUTION</span></div><Metric label="Distance to Call Wall" value={`${(((metrics.callWall - metrics.spot) / metrics.spot) * 100).toFixed(2)}%`} /><Metric label="Distance to Put Wall" value={`${(((metrics.spot - metrics.putWall) / metrics.spot) * 100).toFixed(2)}%`} /><Metric label="Contracts Observed" value={metrics.contractsCount?.toLocaleString() ?? '—'} /><p className="text-pretty text-[9px] leading-relaxed text-zinc-500">Risk tools are observational. Long and Short chart tools are measurements, not order-entry controls.</p></Tabs.Content>
        <Tabs.Content value="DATA" className="space-y-3 p-3 outline-none"><div className="flex items-center gap-2 text-[10px] font-bold text-zinc-300"><Database className="size-4 text-cyan-300" />DATA HEALTH</div>{[['Mode', dataMode], ['Contract', `Terrain v${data.schemaVersion}`], ['Timestamp', timestamp], ['Price candles', dataMode === 'DEMO' ? 'DEMO FIXTURE' : marketFeed.state], ['CVD / Delta', dataMode === 'DEMO' ? 'SHADOW DEMO' : marketFeed.state], ['Book / Liquidity', dataMode === 'DEMO' ? 'UNAVAILABLE IN DEMO' : marketFeed.book ? marketFeed.state : 'OFFLINE'], ['Options structure', isError && dataMode === 'LIVE' ? 'UNAVAILABLE' : data.dataMode], ['Jev', 'NO FRONTEND CONTRACT']].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-3 border-b border-[#263346] py-2 text-[9px]"><span className="text-zinc-500">{label}</span><span className="break-all text-right font-mono text-zinc-300">{value}</span></div>)}</Tabs.Content>
    </Tabs.Root>;
}

export default function MarketTerminal({ data, isError }: MarketTerminalProps) {
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<ChartTool>('cursor');
    const [keepDrawing, setKeepDrawing] = useState(false);
    const [timeframe, setTimeframe] = useState<ChartTimeframe>('1H');
    const [replayActive, setReplayActive] = useState(false);
    const [utcNow, setUtcNow] = useState('--:--:--');
    const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false);
    const { setActiveWorkspace, dataMode, setDataMode, inspectorOpen, setInspectorOpen, setStudyPaneOpen, activeOrderFlowStudy, setActiveOrderFlowStudy, dteFilter, setDteFilter, chartLayers, toggleChartLayer, resetWorkspaceUi } = useTerminalStore();
    const marketFeed = useBinanceMarketFeed(BINANCE_INTERVALS[timeframe], dataMode === 'LIVE');

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

    return <Tooltip.Provider delayDuration={300}><div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-[#05080d] text-zinc-100">
        <header className="flex h-13 shrink-0 items-center gap-3 border-b border-[#263346] bg-[#080d14] px-2 md:px-3">
            <div className="flex min-w-0 items-center gap-2"><div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500 font-mono font-black text-black">₿</div><div className="hidden text-sm font-bold sm:block">BTCUSDT</div><ChevronDown className="size-3 text-zinc-500" /></div>
            <div className="font-mono text-base font-semibold tabular-nums md:text-lg">{displayedSpot.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div><div className={cn('hidden font-mono text-sm font-semibold tabular-nums sm:block', changePct === undefined ? 'text-zinc-500' : changePct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{changePct === undefined ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}</div>
            <div className="ml-auto hidden items-center rounded border border-[#263346] md:flex">{TIMEFRAMES.map((item) => <button key={item} type="button" onClick={() => setTimeframe(item)} className={cn('h-8 min-w-10 px-2 text-[10px] text-zinc-400', timeframe === item && 'bg-sky-500/20 text-sky-200')}>{item}</button>)}</div><button type="button" className="hidden h-8 items-center gap-2 rounded border border-[#263346] px-3 text-[10px] text-zinc-300 xl:flex">{expiryLabel}<ChevronDown className="size-3" /></button>
            <SourceChip label="Binance" state={binanceState} tone={binanceState === 'LIVE' ? 'live' : binanceState === 'DEMO' ? 'demo' : binanceState === 'STALE' || binanceState === 'CONNECTING' ? 'shadow' : 'off'} /><SourceChip label="Deribit" state={deribitState} tone={deribitState === 'LIVE' ? 'live' : deribitState === 'DEMO' ? 'demo' : 'off'} /><SourceChip label="Jev" state="SHADOW OFF" tone="off" />
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette CTRL K" className="flex h-8 shrink-0 items-center gap-1.5 rounded border border-[#263346] bg-[#0a111a] px-2 text-[9px] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"><Search className="size-3" /><span className="hidden sm:inline">CTRL K</span></button>
            <button type="button" aria-label="Terminal settings" onClick={() => setActiveWorkspace('SETTINGS')} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Settings className="size-4" /></button>
        </header>

        <div
            className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#263346] bg-[#080d14] px-2"
            role="toolbar"
            aria-label="Chart navigation and workspace actions"
            data-testid="chart-upper-toolbar"
        >
            <Popover.Root><Popover.Trigger asChild><button type="button" className="flex h-8 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-zinc-300 hover:bg-white/5"><Activity className="size-3.5" />Indicators</button></Popover.Trigger><Popover.Portal><Popover.Content sideOffset={6} className="z-50 w-56 rounded-md border border-[#33445a] bg-[#0b121c] p-2 shadow-lg"><div className="px-2 py-1 text-[9px] font-bold text-zinc-500">ORDER FLOW</div>{ORDER_FLOW_TABS.map((study) => { const state = dataMode === 'DEMO' ? (study === 'CVD' ? 'DEMO' : 'UNAVAILABLE') : marketFeed.state; return <button key={study} type="button" onClick={() => { setStudyPaneOpen(true); setActiveOrderFlowStudy(study); }} className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-[10px] text-zinc-300 hover:bg-white/5"><span>{study}</span><span className={state === 'LIVE' ? 'text-emerald-300' : state === 'DEMO' || state === 'CONNECTING' ? 'text-amber-300' : 'text-zinc-500'}>{state}</span></button>; })}</Popover.Content></Popover.Portal></Popover.Root>
            <Popover.Root><Popover.Trigger asChild><button type="button" className="flex h-8 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-zinc-300 hover:bg-white/5"><Layers3 className="size-3.5" />Layers</button></Popover.Trigger><Popover.Portal><Popover.Content sideOffset={6} className="z-50 w-64 rounded-md border border-[#33445a] bg-[#0b121c] p-3 shadow-lg"><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-bold text-zinc-400">CHART LAYERS</span><button type="button" aria-label="Reset layers" onClick={resetWorkspaceUi}><RotateCcw className="size-3.5 text-zinc-500" /></button></div><LayerToggle label="Primary walls" checked={chartLayers.walls} onCheckedChange={() => toggleChartLayer('walls')} /><LayerToggle label="Secondary walls" checked={chartLayers.secondaryWalls} onCheckedChange={() => toggleChartLayer('secondaryWalls')} /><LayerToggle label="Gamma regime" checked={chartLayers.gammaRegime} onCheckedChange={() => toggleChartLayer('gammaRegime')} /><LayerToggle label="Gamma Flip" checked={chartLayers.gammaFlip} onCheckedChange={() => toggleChartLayer('gammaFlip')} /><LayerToggle label="Max Pain" checked={chartLayers.maxPain} onCheckedChange={() => toggleChartLayer('maxPain')} /><LayerToggle label="Fixed Range VP" checked={chartLayers.volumeProfile} onCheckedChange={() => toggleChartLayer('volumeProfile')} /><LayerToggle label="Anchored VWAP" checked={chartLayers.avwap} onCheckedChange={() => toggleChartLayer('avwap')} /></Popover.Content></Popover.Portal></Popover.Root>
            <button type="button" aria-pressed={replayActive} onClick={() => setReplayActive((active) => !active)} className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-zinc-300 hover:bg-white/5', replayActive && 'bg-amber-400/10 text-amber-300')}>{replayActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}Replay</button>
            <div className="ml-auto flex items-center gap-1"><button type="button" onClick={() => isDesktop ? setInspectorOpen(!inspectorOpen) : setMobileInspectorOpen(true)} aria-label="OPTIONS METRICS" className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded border border-cyan-400/55 px-3 text-[10px] font-bold text-cyan-300', inspectorOpen && 'bg-cyan-400/10')}><SlidersHorizontal className="size-3.5" />OPTIONS METRICS</button>{DTE_FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setDteFilter(filter)} className={cn('h-8 min-w-11 shrink-0 rounded border px-2 text-[9px] font-bold', dteFilter === filter ? 'border-cyan-400/55 bg-cyan-400/10 text-cyan-200' : 'border-[#263346] text-zinc-500')}>{filter}</button>)}</div>
        </div>

        {isError && dataMode === 'LIVE' && <div className="flex h-8 shrink-0 items-center justify-between border-b border-rose-500/25 bg-rose-500/10 px-3 text-[10px] text-rose-200"><span>LIVE OPTIONS FEED OFFLINE · no demo values are presented as live</span><button type="button" onClick={() => setDataMode('DEMO')} className="font-bold underline underline-offset-2">OPEN DEMO</button></div>}

        <main className="min-h-0 flex-1">
            <Group orientation="horizontal" id="market-layout" defaultLayout={{ chart: 78, inspector: 22 }} onLayoutChanged={(layout) => localStorage.setItem('btc-terminal-panels-v2', JSON.stringify(layout))}>
                <Panel id="chart" minSize="58%" defaultSize="78%">
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#263346] bg-[#070c13] px-2">
                            <StudyChip label="Fixed Range VP" visible={chartLayers.volumeProfile} onToggle={() => toggleChartLayer('volumeProfile')} description="Movable selected-range profile with POC, VAH, VAL, and configurable row density." />
                            <StudyChip label="AVWAP · Swing Low" visible={chartLayers.avwap} onToggle={() => toggleChartLayer('avwap')} description="Anchored VWAP with draggable candle anchor and one-standard-deviation bands." />
                            <StudyChip label="Gamma Regime" visible={chartLayers.gammaRegime} onToggle={() => toggleChartLayer('gammaRegime')} description="Positive and negative gamma behavior zones separated by the Gamma Flip." />
                            <StudyChip label="Walls" visible={chartLayers.walls} onToggle={() => toggleChartLayer('walls')} description="Primary call and put walls plus optional secondary GEX levels." />
                        </div>
                        <div className="flex min-h-0 flex-1">
                            <nav
                                className="flex w-10 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#263346] bg-[#070b11] py-2 md:w-13"
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
                                                    'flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-100 md:size-9',
                                                    tone === 'long' && 'text-emerald-300/80 hover:text-emerald-200',
                                                    tone === 'short' && 'text-rose-300/80 hover:text-rose-200',
                                                    activeTool === id && 'bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30',
                                                )}
                                            >
                                                <Icon className="size-4" />
                                            </button>
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                            <Tooltip.Content side="right" sideOffset={8} className="z-50 rounded bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-900">
                                                {label}
                                            </Tooltip.Content>
                                        </Tooltip.Portal>
                                    </Tooltip.Root>
                                ))}
                                <div className="my-1 h-px w-6 shrink-0 bg-[#263346]" />
                                <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                        <button
                                            type="button"
                                            aria-label="Keep drawing mode"
                                            aria-pressed={keepDrawing}
                                            title="Keep drawing mode"
                                            onClick={() => setKeepDrawing((current) => !current)}
                                            className={cn(
                                                'flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-100 md:size-9',
                                                keepDrawing && 'bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30',
                                            )}
                                        >
                                            <Pin className="size-3.5" />
                                        </button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                        <Tooltip.Content side="right" sideOffset={8} className="z-50 rounded bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-900">
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
                                            className="flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/5 md:size-9"
                                        >
                                            <Lock className="size-4" />
                                        </button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                        <Tooltip.Content side="right" className="z-50 rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-900">
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
                                                className="flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/5 md:size-9"
                                            >
                                                <LayoutDashboard className="size-4" />
                                            </button>
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Portal>
                                            <DropdownMenu.Content side="right" sideOffset={7} className="z-50 w-48 rounded-md border border-[#33445a] bg-[#0b121c] p-1 shadow-lg">
                                                {WORKSPACES.map(({ id, label, icon: Icon }) => (
                                                    <DropdownMenu.Item key={id} onSelect={() => setActiveWorkspace(id)} className="flex cursor-default items-center gap-2 rounded px-2 py-2 text-[10px] text-zinc-300 outline-none data-[highlighted]:bg-cyan-400/10">
                                                        <Icon className="size-3.5" />{label}
                                                    </DropdownMenu.Item>
                                                ))}
                                            </DropdownMenu.Content>
                                        </DropdownMenu.Portal>
                                    </DropdownMenu.Root>
                                </div>
                            </nav>
                            <div className="min-w-0 flex-1">
                                <MarketStructureChart
                                    data={data}
                                    marketFeed={marketFeed}
                                    activeTool={activeTool}
                                    keepDrawing={keepDrawing}
                                    timeframe={timeframe}
                                    replayActive={replayActive}
                                    onActiveToolChange={setActiveTool}
                                />
                            </div>
                        </div>
                    </div>
                </Panel>
                {inspectorOpen && isDesktop && <><Separator aria-label="Resize options inspector" aria-valuemin={58} aria-valuemax={90} aria-valuenow={78} className="group relative w-1 bg-[#111a25] outline-none hover:bg-cyan-400/40 focus-visible:bg-cyan-400/60"><span className="absolute inset-y-0 -left-1 -right-1" /></Separator><Panel id="inspector" minSize="320px" maxSize="34%" defaultSize="22%" groupResizeBehavior="preserve-pixel-size"><aside className="h-full overflow-y-auto border-l border-[#263346] bg-[#080d14]"><Inspector metrics={metrics} data={data} marketFeed={marketFeed} isError={isError} onClose={() => setInspectorOpen(false)} /></aside></Panel></>}
            </Group>
        </main>

        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[#263346] bg-[#070b11] px-2.5 text-[9px] text-zinc-500"><div className="flex min-w-0 items-center gap-4"><span className="font-bold text-rose-300">NO LIVE EXECUTION</span><span className="hidden items-center gap-1 sm:flex"><span className={cn('size-2 rounded-full', binanceState === 'LIVE' ? 'bg-emerald-300' : binanceState === 'DEMO' ? 'bg-amber-300' : 'bg-zinc-500')} />Candles {binanceState.toLowerCase()}</span><span className="hidden items-center gap-1 md:flex"><span className={cn('size-2 rounded-full', deribitState === 'LIVE' ? 'bg-emerald-300' : deribitState === 'DEMO' ? 'bg-amber-300' : 'bg-zinc-500')} />Options {deribitState.toLowerCase()}</span><span className="hidden items-center gap-1 lg:flex"><span className={cn('size-2 rounded-full', marketFeed.state === 'LIVE' ? 'bg-emerald-300' : 'bg-sky-300')} />Flow {dataMode === 'DEMO' ? 'shadow' : marketFeed.state.toLowerCase()}</span></div><div className="flex items-center gap-3"><span className="hidden sm:inline">UTC {utcNow}</span><span className="hidden lg:inline">Latency {marketFeed.latencyMs === null ? '—' : `${marketFeed.latencyMs} ms`}</span><button type="button" onClick={saveLayout} className="hover:text-zinc-200">SAVE LAYOUT</button>{savedAt && <span className="hidden text-emerald-300 xl:inline">Saved {savedAt}</span>}<button type="button" onClick={() => setDataMode(dataMode === 'DEMO' ? 'LIVE' : 'DEMO')} className={cn('font-bold', dataMode === 'DEMO' ? 'text-amber-300' : 'text-emerald-300')}>● {dataMode}</button><CircleHelp className="size-3" /></div></footer>

        <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" /><Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[18%] z-50 w-[min(92vw,620px)] -translate-x-1/2 overflow-hidden rounded-xl border border-[#33445a] bg-[#0b111a] shadow-2xl"><Dialog.Title className="sr-only">Terminal command palette</Dialog.Title><Command className="bg-transparent text-zinc-100"><div className="flex items-center border-b border-[#263346] px-3"><CommandIcon className="size-4 text-zinc-500" /><Command.Input autoFocus placeholder="Search workspaces and actions…" className="h-12 w-full bg-transparent px-3 text-sm outline-none placeholder:text-zinc-600" /></div><Command.List className="max-h-[360px] overflow-y-auto p-2"><Command.Empty className="p-6 text-center text-xs text-zinc-500">No command found.</Command.Empty><Command.Group heading="Workspaces" className="text-[9px] text-zinc-600">{WORKSPACES.map(({ id, label, icon: Icon }) => <Command.Item key={id} value={label} onSelect={() => { setActiveWorkspace(id); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2.5 text-xs text-zinc-300 data-[selected=true]:bg-cyan-400/10 data-[selected=true]:text-cyan-200"><Icon className="size-4" />{label}</Command.Item>)}</Command.Group><Command.Group heading="Actions" className="mt-2 text-[9px] text-zinc-600"><Command.Item onSelect={() => { setInspectorOpen(true); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2.5 text-xs text-zinc-300 data-[selected=true]:bg-cyan-400/10"><PanelRightOpen className="size-4" />Open Options Metrics</Command.Item><Command.Item onSelect={() => { resetWorkspaceUi(); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2.5 text-xs text-zinc-300 data-[selected=true]:bg-cyan-400/10"><RotateCcw className="size-4" />Reset Market Structure layout</Command.Item></Command.Group></Command.List></Command></Dialog.Content></Dialog.Portal></Dialog.Root>

        <Dialog.Root open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 md:hidden" /><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-y-auto rounded-t-xl border border-[#33445a] bg-[#080d14] pb-[env(safe-area-inset-bottom)] md:hidden"><Dialog.Title className="sr-only">Options Metrics</Dialog.Title><Inspector metrics={metrics} data={data} marketFeed={marketFeed} isError={isError} onClose={() => setMobileInspectorOpen(false)} /></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div></Tooltip.Provider>;
}
