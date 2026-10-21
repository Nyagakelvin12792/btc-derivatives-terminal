'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Command } from 'cmdk';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
    Activity, BarChart3, Boxes, ChevronDown, CircleHelp, Command as CommandIcon,
    Database, Layers3, LayoutDashboard, Mountain, PanelRightClose, PanelRightOpen,
    RotateCcw, Search, ShieldAlert, SlidersHorizontal, Sparkles, Waves, X,
} from 'lucide-react';
import type { TerrainDataContractV2 } from '@/lib/terrain/types';
import type { WorkspaceTab } from '@/lib/dashboard/types';
import { useTerminalStore } from '@/lib/dashboard/store';
import MarketStructureChart from './MarketStructureChart';

interface MarketTerminalProps {
    data: TerrainDataContractV2;
    isError: boolean;
}

const WORKSPACES: Array<{ id: WorkspaceTab; label: string; icon: React.ElementType }> = [
    { id: 'MARKET STRUCTURE', label: 'Market Structure', icon: BarChart3 },
    { id: 'SURFACE MAP', label: '3D Surface', icon: Mountain },
    { id: 'DASHBOARD', label: 'Overview', icon: LayoutDashboard },
    { id: 'GEX ANALYSIS', label: 'GEX', icon: Activity },
    { id: 'VANNA', label: 'Vanna', icon: Waves },
    { id: 'CHARM', label: 'Charm', icon: Sparkles },
    { id: 'OPEN INTEREST', label: 'Open Interest', icon: Boxes },
];

const DTE_FILTERS = ['0-2D', '7D', '14D', '30D', 'ALL'] as const;
const ORDER_FLOW_TABS = ['CVD', 'DELTA', 'BOOK', 'LIQUIDITY'] as const;

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
    const color = tone === 'positive' ? 'text-emerald-300' : tone === 'negative' ? 'text-rose-300' : tone === 'warning' ? 'text-amber-300' : 'text-zinc-100';
    return (
        <div className="rounded-md border border-[#1c2735] bg-[#0a1018] px-2.5 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-zinc-500">{label}</div>
            <div className={`mt-1 font-mono text-sm font-semibold tabular-nums ${color}`}>{value}</div>
        </div>
    );
}

function LayerToggle({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: () => void }) {
    return (
        <div className="flex items-center justify-between gap-4 py-1.5">
            <span className="text-xs text-zinc-300">{label}</span>
            <Switch.Root checked={checked} onCheckedChange={onCheckedChange} className="relative h-5 w-9 rounded-full border border-[#2a3748] bg-[#111a25] data-[state=checked]:border-cyan-400/50 data-[state=checked]:bg-cyan-500/25">
                <Switch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-zinc-400 transition-transform duration-150 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-cyan-300 motion-reduce:transition-none" />
            </Switch.Root>
        </div>
    );
}

export default function MarketTerminal({ data, isError }: MarketTerminalProps) {
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => true);
    const {
        activeWorkspace, setActiveWorkspace, dataMode, setDataMode,
        inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab,
        studyPaneOpen, setStudyPaneOpen, activeOrderFlowStudy, setActiveOrderFlowStudy,
        dteFilter, setDteFilter, chartLayers, toggleChartLayer, resetWorkspaceUi,
    } = useTerminalStore();

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setPaletteOpen((open) => !open);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const summary = data.summary as unknown as Record<string, unknown>;
    const keyLevels = (data.keyLevels || {}) as unknown as Record<string, unknown>;
    const spot = numeric(data.spotPrice, numeric(summary.spotPrice, 68_000)) ?? 68_000;
    const callWall = levelStrike(keyLevels.callWall) ?? numeric(summary.topPositiveGexStrike) ?? numeric(summary.callWall) ?? spot * 1.05;
    const putWall = levelStrike(keyLevels.putWall) ?? numeric(summary.topNegativeGexStrike) ?? numeric(summary.putWall) ?? spot * 0.95;
    const gammaFlip = levelStrike(keyLevels.gammaFlip) ?? numeric(summary.gammaFlip) ?? spot;
    const maxPain = levelStrike(keyLevels.primaryMaxPain) ?? numeric(summary.maxPainStrike) ?? numeric(summary.maxPain) ?? spot;
    const netGex = numeric(summary.netGex, 0) ?? 0;
    const totalCallGex = numeric(summary.totalCallGex);
    const totalPutGex = numeric(summary.totalPutGex);
    const contractsCount = numeric(summary.contractsCount);
    const longGamma = netGex >= 0;

    return (
        <Tooltip.Provider delayDuration={350}>
            <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-[#05080d] text-zinc-100">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1b2532] bg-[#080d14] px-2 md:px-3">
                    <div className="flex min-w-0 items-center gap-2 border-r border-[#1b2532] pr-2 md:pr-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-300/30 bg-amber-400/10 font-mono font-black text-amber-300">₿</div>
                        <div className="hidden leading-none sm:block">
                            <div className="text-[10px] font-bold tracking-[0.14em] text-zinc-100">BTC MECHANICS</div>
                            <div className="mt-1 text-[8px] tracking-[0.14em] text-cyan-400">ANALYSIS TERMINAL</div>
                        </div>
                    </div>

                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button type="button" className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-[#243143] bg-[#0c131d] px-2 text-xs text-zinc-200 hover:border-cyan-400/40">
                                <span className="truncate">{WORKSPACES.find((workspace) => workspace.id === activeWorkspace)?.label || activeWorkspace}</span>
                                <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content sideOffset={6} align="start" className="z-50 min-w-52 rounded-lg border border-[#263244] bg-[#0b111a] p-1 shadow-xl">
                                {WORKSPACES.map(({ id, label, icon: Icon }) => (
                                    <DropdownMenu.Item key={id} onSelect={() => setActiveWorkspace(id)} className="flex cursor-default items-center gap-2 rounded px-2 py-2 text-xs text-zinc-300 outline-none data-[highlighted]:bg-cyan-400/10 data-[highlighted]:text-cyan-200">
                                        <Icon className="h-3.5 w-3.5" /> {label}
                                    </DropdownMenu.Item>
                                ))}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>

                    <div className="hidden items-center gap-2 border-l border-[#1b2532] pl-3 lg:flex">
                        <span className="font-mono text-sm font-bold tabular-nums">BTC / USD</span>
                        <span className="font-mono text-sm tabular-nums text-zinc-200">${Math.round(spot).toLocaleString()}</span>
                        <span className="rounded border border-[#273447] px-1.5 py-0.5 text-[9px] text-zinc-400">15m</span>
                    </div>

                    <div className="ml-auto flex items-center gap-1.5">
                        <div className="hidden items-center gap-1 xl:flex" aria-label="DTE filters">
                            {DTE_FILTERS.map((filter) => (
                                <button key={filter} type="button" onClick={() => setDteFilter(filter)} className={`h-7 rounded px-2 text-[9px] font-semibold ${dteFilter === filter ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/35' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}>
                                    {filter}
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => { setInspectorTab('OPTIONS'); if (isDesktop) setInspectorOpen(true); else setMobileInspectorOpen(true); }} className="h-8 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2.5 text-[10px] font-bold text-cyan-200 hover:bg-cyan-400/15">
                            OPTIONS METRICS
                        </button>
                        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette CTRL K" className="flex h-8 items-center gap-2 rounded-md border border-[#243143] bg-[#0c131d] px-2 text-zinc-400 hover:text-zinc-100">
                            <Search className="h-3.5 w-3.5" /><span className="hidden text-[9px] md:inline">CTRL K</span>
                        </button>
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button type="button" className={`h-8 rounded-md border px-2 text-[9px] font-bold ${dataMode === 'DEMO' ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'}`}>
                                    {dataMode}
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content sideOffset={6} align="end" className="z-50 rounded-lg border border-[#263244] bg-[#0b111a] p-1 shadow-xl">
                                    {(['DEMO', 'LIVE'] as const).map((mode) => <DropdownMenu.Item key={mode} onSelect={() => setDataMode(mode)} className="cursor-default rounded px-3 py-2 text-xs text-zinc-300 outline-none data-[highlighted]:bg-cyan-400/10">{mode}</DropdownMenu.Item>)}
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    </div>
                </header>

                {isError && dataMode === 'LIVE' && (
                    <div className="flex h-8 shrink-0 items-center justify-between border-b border-rose-500/25 bg-rose-500/10 px-3 text-[10px] text-rose-200">
                        <span>LIVE OPTIONS FEED OFFLINE · no demo values are being presented as live</span>
                        <button type="button" onClick={() => setDataMode('DEMO')} className="font-bold underline underline-offset-2">OPEN DEMO</button>
                    </div>
                )}

                <div className="flex min-h-0 flex-1">
                    <nav className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r border-[#1b2532] bg-[#070b11] py-2 md:flex" aria-label="Analytical workspaces">
                        {WORKSPACES.map(({ id, label, icon: Icon }) => (
                            <Tooltip.Root key={id}>
                                <Tooltip.Trigger asChild>
                                    <button type="button" aria-label={label} onClick={() => setActiveWorkspace(id)} className={`flex h-8 w-8 items-center justify-center rounded-md ${activeWorkspace === id ? 'bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/25' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'}`}>
                                        <Icon className="h-4 w-4" />
                                    </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal><Tooltip.Content side="right" sideOffset={8} className="z-50 rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-900">{label}</Tooltip.Content></Tooltip.Portal>
                            </Tooltip.Root>
                        ))}
                    </nav>

                    <main className="flex min-w-0 flex-1 flex-col">
                        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#1b2532] bg-[#080d14] px-2.5">
                            <Popover.Root>
                                <Popover.Trigger asChild>
                                    <button type="button" className="flex h-7 items-center gap-1.5 rounded border border-[#253244] px-2 text-[10px] text-zinc-300 hover:border-cyan-400/40"><Layers3 className="h-3.5 w-3.5" /> Layers</button>
                                </Popover.Trigger>
                                <Popover.Portal>
                                    <Popover.Content sideOffset={7} align="start" className="z-50 w-64 rounded-lg border border-[#263244] bg-[#0b111a] p-3 shadow-xl">
                                        <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold tracking-wider text-zinc-300">CHART LAYERS</span><button type="button" onClick={resetWorkspaceUi} aria-label="Reset layers"><RotateCcw className="h-3.5 w-3.5 text-zinc-500" /></button></div>
                                        <LayerToggle label="Options walls" checked={chartLayers.walls} onCheckedChange={() => toggleChartLayer('walls')} />
                                        <LayerToggle label="Gamma regime shading" checked={chartLayers.gammaRegime} onCheckedChange={() => toggleChartLayer('gammaRegime')} />
                                        <LayerToggle label="Gamma Flip" checked={chartLayers.gammaFlip} onCheckedChange={() => toggleChartLayer('gammaFlip')} />
                                        <LayerToggle label="Fixed Range VP" checked={chartLayers.volumeProfile} onCheckedChange={() => toggleChartLayer('volumeProfile')} />
                                        <LayerToggle label="Anchored VWAP" checked={chartLayers.avwap} onCheckedChange={() => toggleChartLayer('avwap')} />
                                        <Popover.Arrow className="fill-[#263244]" />
                                    </Popover.Content>
                                </Popover.Portal>
                            </Popover.Root>

                            <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden sm:flex">
                                {[
                                    chartLayers.walls && 'WALLS', chartLayers.gammaRegime && 'GAMMA REGIME',
                                    chartLayers.volumeProfile && 'FIXED RANGE VP', chartLayers.avwap && 'AVWAP',
                                ].filter(Boolean).map((label) => <span key={String(label)} className="shrink-0 rounded border border-[#253244] bg-[#0b121c] px-2 py-1 text-[8px] font-semibold tracking-wider text-zinc-400">{label}</span>)}
                            </div>

                            <div className="ml-auto flex items-center gap-1">
                                {ORDER_FLOW_TABS.map((study) => <button key={study} type="button" onClick={() => { setStudyPaneOpen(true); setActiveOrderFlowStudy(study); }} className={`h-7 rounded px-2 text-[9px] font-semibold ${activeOrderFlowStudy === study && studyPaneOpen ? 'bg-white/7 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}>{study}</button>)}
                                <button type="button" onClick={() => setStudyPaneOpen(!studyPaneOpen)} aria-label={studyPaneOpen ? 'Hide lower study pane' : 'Show lower study pane'} className="h-7 rounded px-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"><SlidersHorizontal className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => setInspectorOpen(!inspectorOpen)} aria-label={inspectorOpen ? 'Close inspector' : 'Open inspector'} className="h-7 rounded px-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200">{inspectorOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}</button>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1">
                            <Group orientation="horizontal" id="market-layout" defaultLayout={{ chart: 76, inspector: 24 }} onLayoutChanged={(layout) => localStorage.setItem('btc-terminal-panels-v1', JSON.stringify(layout))}>
                                <Panel id="chart" minSize="55%" defaultSize="76%">
                                    <div className="h-full min-w-0">
                                        <MarketStructureChart data={data} />
                                    </div>
                                </Panel>
                                {inspectorOpen && isDesktop && (
                                    <>
                                        <Separator
                                            aria-label="Resize options inspector"
                                            elementRef={(node) => {
                                                if (!node) return;
                                                node.setAttribute('aria-valuemin', '55');
                                                node.setAttribute('aria-valuemax', '90');
                                                node.setAttribute('aria-valuenow', '76');
                                            }}
                                            className="group relative w-1 bg-[#111a25] outline-none hover:bg-cyan-400/40 focus-visible:bg-cyan-400/60"
                                        ><span className="absolute inset-y-0 -left-1 -right-1" /></Separator>
                                        <Panel id="inspector" minSize="260px" maxSize="38%" defaultSize="24%" groupResizeBehavior="preserve-pixel-size">
                                            <aside className="h-full overflow-y-auto border-l border-[#1b2532] bg-[#080d14]">
                                                <Tabs.Root value={inspectorTab} onValueChange={(value) => setInspectorTab(value as typeof inspectorTab)}>
                                                    <div className="sticky top-0 z-20 flex h-10 items-center border-b border-[#1b2532] bg-[#080d14]">
                                                        <Tabs.List className="grid flex-1 grid-cols-4 px-1">
                                                            {(['OPTIONS', 'DECISION', 'RISK', 'DATA'] as const).map((tab) => <Tabs.Trigger key={tab} value={tab} className="h-8 border-b border-transparent text-[9px] font-bold tracking-wider text-zinc-500 data-[state=active]:border-cyan-300 data-[state=active]:text-cyan-200">{tab}</Tabs.Trigger>)}
                                                        </Tabs.List>
                                                        <button type="button" onClick={() => setInspectorOpen(false)} aria-label="Close inspector" className="mr-1 rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"><X className="h-3.5 w-3.5" /></button>
                                                    </div>

                                                    <Tabs.Content value="OPTIONS" className="space-y-3 p-3 outline-none">
                                                        <div className="flex items-center justify-between"><span className="text-[10px] font-bold tracking-[0.14em] text-zinc-300">OPTIONS STRUCTURE</span><span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold ${dataMode === 'DEMO' ? 'border-amber-400/25 text-amber-300' : 'border-emerald-400/25 text-emerald-300'}`}>{dataMode}</span></div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <Metric label="Regime" value={longGamma ? 'LONG Γ' : 'SHORT Γ'} tone={longGamma ? 'positive' : 'negative'} />
                                                            <Metric label="Net GEX" value={compact(netGex, '$')} tone={longGamma ? 'positive' : 'negative'} />
                                                            <Metric label="Call Wall" value={`$${Math.round(callWall).toLocaleString()}`} tone="positive" />
                                                            <Metric label="Put Wall" value={`$${Math.round(putWall).toLocaleString()}`} tone="negative" />
                                                            <Metric label="Gamma Flip" value={`$${Math.round(gammaFlip).toLocaleString()}`} tone="warning" />
                                                            <Metric label="Max Pain" value={`$${Math.round(maxPain).toLocaleString()}`} />
                                                            <Metric label="Call GEX" value={compact(totalCallGex, '$')} />
                                                            <Metric label="Put GEX" value={compact(totalPutGex, '$')} />
                                                        </div>
                                                        <div>
                                                            <div className="mb-2 text-[9px] font-semibold tracking-wider text-zinc-500">IMPORTANT DTE</div>
                                                            <div className="grid grid-cols-5 gap-1">{DTE_FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setDteFilter(filter)} className={`h-7 rounded border text-[8px] font-bold ${dteFilter === filter ? 'border-cyan-400/45 bg-cyan-400/10 text-cyan-200' : 'border-[#243143] text-zinc-500'}`}>{filter}</button>)}</div>
                                                        </div>
                                                        <p className="text-pretty border-t border-[#1b2532] pt-3 text-[10px] leading-relaxed text-zinc-500">Dealer positioning is estimated using {data.assumptionModel}. It is not directly observed inventory.</p>
                                                    </Tabs.Content>

                                                    <Tabs.Content value="DECISION" className="space-y-3 p-3 outline-none">
                                                        <div className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.05] p-3"><div className="text-[9px] font-bold tracking-wider text-cyan-200">DETERMINISTIC BASELINE</div><div className="mt-2 text-sm font-semibold text-zinc-100">Observe structure; no action generated</div><p className="mt-2 text-pretty text-[10px] leading-relaxed text-zinc-500">This UI does not create a trade signal from chart position alone.</p></div>
                                                        <div className="rounded-md border border-amber-400/20 bg-amber-400/[0.04] p-3"><div className="flex items-center justify-between"><span className="text-[9px] font-bold tracking-wider text-amber-200">JEV SHADOW OPINION</span><span className="text-[8px] text-amber-300">UNAVAILABLE</span></div><p className="mt-2 text-[10px] leading-relaxed text-zinc-500">No Jev response contract is exposed in this repository surface. The interface will not invent one.</p></div>
                                                    </Tabs.Content>

                                                    <Tabs.Content value="RISK" className="space-y-3 p-3 outline-none">
                                                        <div className="flex items-center gap-2 rounded-md border border-rose-400/25 bg-rose-400/[0.05] p-3 text-rose-200"><ShieldAlert className="h-4 w-4" /><span className="text-[10px] font-bold tracking-wider">NO LIVE EXECUTION</span></div>
                                                        <Metric label="Distance to Call Wall" value={`${(((callWall - spot) / spot) * 100).toFixed(2)}%`} />
                                                        <Metric label="Distance to Put Wall" value={`${(((spot - putWall) / spot) * 100).toFixed(2)}%`} />
                                                        <Metric label="Contracts Observed" value={contractsCount?.toLocaleString() ?? '—'} />
                                                    </Tabs.Content>

                                                    <Tabs.Content value="DATA" className="space-y-3 p-3 outline-none">
                                                        <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-zinc-300"><Database className="h-4 w-4 text-cyan-300" /> DATA HEALTH</div>
                                                        {[['Mode', dataMode], ['Contract', `Terrain v${data.schemaVersion}`], ['Timestamp', data.timestamp], ['Price candles', dataMode === 'DEMO' ? 'DEMO FIXTURE' : 'UNAVAILABLE'], ['CVD', dataMode === 'DEMO' ? 'DEMO FIXTURE' : 'UNAVAILABLE'], ['Options structure', isError && dataMode === 'LIVE' ? 'UNAVAILABLE' : dataMode]].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-3 border-b border-[#1b2532] py-2 text-[10px]"><span className="text-zinc-500">{label}</span><span className="break-all text-right font-mono text-zinc-300">{value}</span></div>)}
                                                    </Tabs.Content>
                                                </Tabs.Root>
                                            </aside>
                                        </Panel>
                                    </>
                                )}
                            </Group>
                        </div>
                    </main>
                </div>

                <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[#1b2532] bg-[#070b11] px-2.5 text-[9px] text-zinc-500">
                    <div className="flex min-w-0 items-center gap-3"><span className="font-bold text-rose-300">NO LIVE EXECUTION</span><span className="hidden truncate sm:inline">Indicative analytics · not financial advice</span></div>
                    <div className="flex items-center gap-3"><button type="button" onClick={() => setSavedAt(new Date().toLocaleTimeString())} className="hover:text-zinc-200">SAVE LAYOUT</button>{savedAt && <span className="hidden text-emerald-300 sm:inline">Saved {savedAt}</span>}<span className={dataMode === 'DEMO' ? 'text-amber-300' : 'text-emerald-300'}>● {dataMode}</span><CircleHelp className="h-3 w-3" /></div>
                </footer>

                <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
                        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[18%] z-50 w-[min(92vw,620px)] -translate-x-1/2 overflow-hidden rounded-xl border border-[#2a384b] bg-[#0b111a] shadow-2xl">
                            <Dialog.Title className="sr-only">Terminal command palette</Dialog.Title>
                            <Command className="bg-transparent text-zinc-100">
                                <div className="flex items-center border-b border-[#243143] px-3"><CommandIcon className="h-4 w-4 text-zinc-500" /><Command.Input autoFocus placeholder="Search workspaces and actions…" className="h-12 w-full bg-transparent px-3 text-sm outline-none placeholder:text-zinc-600" /></div>
                                <Command.List className="max-h-[360px] overflow-y-auto p-2"><Command.Empty className="p-6 text-center text-xs text-zinc-500">No command found.</Command.Empty><Command.Group heading="Workspaces" className="text-[9px] tracking-wider text-zinc-600">{WORKSPACES.map(({ id, label, icon: Icon }) => <Command.Item key={id} value={label} onSelect={() => { setActiveWorkspace(id); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2.5 text-xs text-zinc-300 data-[selected=true]:bg-cyan-400/10 data-[selected=true]:text-cyan-200"><Icon className="h-4 w-4" />{label}</Command.Item>)}</Command.Group><Command.Group heading="Actions" className="mt-2 text-[9px] tracking-wider text-zinc-600"><Command.Item onSelect={() => { setInspectorOpen(true); setInspectorTab('OPTIONS'); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2.5 text-xs text-zinc-300 data-[selected=true]:bg-cyan-400/10"><PanelRightOpen className="h-4 w-4" />Open Options Metrics</Command.Item><Command.Item onSelect={() => { resetWorkspaceUi(); setPaletteOpen(false); }} className="mt-1 flex cursor-default items-center gap-2 rounded px-3 py-2.5 text-xs text-zinc-300 data-[selected=true]:bg-cyan-400/10"><RotateCcw className="h-4 w-4" />Reset Market Structure layout</Command.Item></Command.Group></Command.List>
                            </Command>
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>

                <Dialog.Root open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 md:hidden" />
                        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 max-h-[74dvh] overflow-y-auto rounded-t-xl border border-[#2a384b] bg-[#0b111a] p-4 shadow-2xl md:hidden">
                            <div className="mb-4 flex items-center justify-between">
                                <div><Dialog.Title className="text-xs font-bold tracking-wider text-zinc-100">OPTIONS METRICS</Dialog.Title><p className="mt-1 text-[9px] text-zinc-500">{dteFilter} · {dataMode}</p></div>
                                <Dialog.Close asChild><button type="button" aria-label="Close options metrics" className="rounded p-2 text-zinc-400 hover:bg-white/5"><X className="h-4 w-4" /></button></Dialog.Close>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Metric label="Regime" value={longGamma ? 'LONG Γ' : 'SHORT Γ'} tone={longGamma ? 'positive' : 'negative'} />
                                <Metric label="Net GEX" value={compact(netGex, '$')} tone={longGamma ? 'positive' : 'negative'} />
                                <Metric label="Call Wall" value={`$${Math.round(callWall).toLocaleString()}`} tone="positive" />
                                <Metric label="Put Wall" value={`$${Math.round(putWall).toLocaleString()}`} tone="negative" />
                                <Metric label="Gamma Flip" value={`$${Math.round(gammaFlip).toLocaleString()}`} tone="warning" />
                                <Metric label="Max Pain" value={`$${Math.round(maxPain).toLocaleString()}`} />
                            </div>
                            <div className="mt-4 grid grid-cols-5 gap-1">{DTE_FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setDteFilter(filter)} className={`h-9 rounded border text-[8px] font-bold ${dteFilter === filter ? 'border-cyan-400/45 bg-cyan-400/10 text-cyan-200' : 'border-[#243143] text-zinc-500'}`}>{filter}</button>)}</div>
                            <div className="mt-4 rounded-md border border-rose-400/20 bg-rose-400/[0.04] p-3 text-[9px] font-bold tracking-wider text-rose-200">NO LIVE EXECUTION</div>
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>
            </div>
        </Tooltip.Provider>
    );
}
