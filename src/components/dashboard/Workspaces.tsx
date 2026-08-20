'use client';

import React from 'react';
import { DashboardData, SelectedAnalyticalState } from '@/lib/dashboard/types';
import { formatGex, formatUsd } from '@/lib/dashboard/adapters';
import ExposureScalePanel from '@/components/dashboard/ExposureScalePanel';
import { Activity, ShieldCheck, Zap, Layers, Compass, TrendingUp, TrendingDown, Clock, BarChart3, AlertCircle } from 'lucide-react';

interface WorkspaceViewProps {
    data: DashboardData;
    selectedState?: SelectedAnalyticalState;
    onSelectStrike?: (strike: number) => void;
}

/**
 * DASHBOARD Overview Workspace:
 * Executive high-level macro view of total dealer positioning
 */
export function DashboardOverviewView({ data, onSelectStrike }: WorkspaceViewProps) {
    const { summary, strikes, confluenceLevels, scales } = data;

    return (
        <div className="space-y-3 font-mono select-none">
            {/* Top Macro Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase mb-1">TOTAL NET GEX EXPOSURE</div>
                    <div className="text-2xl font-black text-emerald-400">{formatGex(summary.netGex)}</div>
                    <div className="text-[10px] text-zinc-400 mt-2">Hedge-notional change per 1% spot move</div>
                </div>

                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase mb-1">GAMMA FLIP INFLECTION</div>
                    <div className="text-2xl font-black text-cyan-400">${summary.gammaFlip.toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-400 mt-2">Regime transition boundary</div>
                </div>

                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase mb-1">DEALER NET VANNA</div>
                    <div className="text-2xl font-black text-purple-400">{formatGex(summary.netVanna)}</div>
                    <div className="text-[10px] text-zinc-400 mt-2">Delta sensitivity to 1-point IV shock</div>
                </div>

                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase mb-1">DAILY CHARM BLEED</div>
                    <div className="text-2xl font-black text-amber-400">{formatGex(summary.netCharm)}/day</div>
                    <div className="text-[10px] text-zinc-400 mt-2">Overnight delta hedge drift</div>
                </div>
            </div>

            {/* Exposure Scale Panel */}
            <ExposureScalePanel scales={scales} />

            {/* Macro Confluence & Walls Summary */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-400" /> Key Structural Dealer Boundaries
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b]">
                            <span className="text-[10px] text-zinc-400 block">CALL WALL (MAJOR RESISTANCE)</span>
                            <span className="text-lg font-bold text-emerald-400">${summary.callWall.toLocaleString()}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b]">
                            <span className="text-[10px] text-zinc-400 block">PUT WALL (MAJOR ACCELERATOR)</span>
                            <span className="text-lg font-bold text-rose-400">${summary.putWall.toLocaleString()}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b]">
                            <span className="text-[10px] text-zinc-400 block">MAX PAIN LEVEL</span>
                            <span className="text-lg font-bold text-amber-400">${summary.maxPain.toLocaleString()}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b]">
                            <span className="text-[10px] text-zinc-400 block">CURRENT SPOT DISTANCE</span>
                            <span className="text-lg font-bold text-white">
                                {(((summary.spotPrice - summary.gammaFlip) / summary.gammaFlip) * 100).toFixed(2)}% vs Flip
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" /> Dealer Regime Matrix
                    </h3>
                    <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-black text-emerald-400">{summary.regimeTitle}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40 font-bold">
                                {summary.regimeSubtitle}
                            </span>
                        </div>
                        <p className="text-xs font-sans text-zinc-300 leading-relaxed">
                            {summary.regimeDescription}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * GEX ANALYSIS Workspace:
 * Dedicated gamma exposure profiling
 */
export function GexAnalysisView({ data, onSelectStrike }: WorkspaceViewProps) {
    const { surfaceGrid, strikes, summary, scales } = data;

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" /> Gamma Exposure (GEX) Distribution by Strike
                    </h3>
                    <span className="text-[10px] text-zinc-400">Green = Long Dealer Gamma (Stabilizing) | Red = Short Dealer Gamma (Trending)</span>
                </div>

                <div className="space-y-2">
                    {strikes.map((s) => {
                        let totalGex = 0;
                        surfaceGrid.forEach((row) => {
                            const match = row.find((c) => c.strike === s);
                            if (match) totalGex += match.gex;
                        });

                        const isPos = totalGex >= 0;
                        const barWidth = Math.min(100, (Math.abs(totalGex) / (scales.gexMax * 4 || 1)) * 100);

                        return (
                            <div
                                key={s}
                                onClick={() => onSelectStrike?.(s)}
                                className="flex items-center gap-3 p-1.5 rounded hover:bg-[#0c1422] cursor-pointer text-xs"
                            >
                                <span className={`w-20 font-bold ${s === summary.callWall ? 'text-emerald-400' : s === summary.putWall ? 'text-rose-400' : 'text-white'}`}>
                                    ${s.toLocaleString()}
                                </span>
                                <div className="flex-1 flex items-center gap-2 bg-[#0c1422] h-4 rounded overflow-hidden relative">
                                    <div
                                        className={`h-full ${isPos ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                </div>
                                <span className={`w-24 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatGex(totalGex)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/**
 * VANNA Workspace:
 * Dedicated volatility sensitivity analysis
 */
export function VannaAnalysisView({ data, onSelectStrike }: WorkspaceViewProps) {
    const { strikes, summary, scales } = data;

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Compass className="w-4 h-4 text-purple-400" /> Dealer Vanna Exposure Matrix (∂Delta / ∂IV)
                    </h3>
                    <span className="text-[10px] text-zinc-400">Measures delta hedging flows caused by Implied Volatility expansions/crushes</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="p-3.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-2">
                        <span className="text-xs font-bold text-purple-400 uppercase">Vol Expansion Impact (IV Rally)</span>
                        <p className="text-[11px] font-sans text-zinc-300 leading-relaxed">
                            When IV rises, positive Vanna forces dealers to buy spot (reinforcing rallies above spot), while negative Vanna forces selling (accelerating sell-offs below spot).
                        </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-2">
                        <span className="text-xs font-bold text-indigo-400 uppercase">Vol Crush Impact (Post-Event Decay)</span>
                        <p className="text-[11px] font-sans text-zinc-300 leading-relaxed">
                            During post-FOMC/CPI volatility crushes, Vanna unwind triggers sharp mean-reversion hedging towards the highest gamma concentrations.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * CHARM Workspace:
 * Dedicated time-decay drift analysis
 */
export function CharmAnalysisView({ data }: WorkspaceViewProps) {
    const { summary, scales } = data;

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400" /> Charm Time-Decay Hedging Bleed (∂Delta / ∂Time)
                    </h3>
                    <span className="text-[10px] text-zinc-400">Daily delta change purely from the passage of time</span>
                </div>

                <div className="p-4 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400">Daily Overnight Delta Bleed</span>
                        <span className="text-base font-black text-rose-400">{formatGex(summary.netCharm)}/day</span>
                    </div>
                    <p className="text-[11px] font-sans text-zinc-300 leading-relaxed">
                        Charm causes delta exposure to decay towards 0 (out-of-the-money) or 1 (in-the-money) as expiration approaches. This creates predictable weekend and daily hedging flows.
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * OPEN INTEREST Workspace:
 * Dedicated OI strike/expiry breakdown
 */
export function OpenInterestView({ data, onSelectStrike }: WorkspaceViewProps) {
    const { strikes, keyContracts, scales } = data;

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-4 h-4 text-cyan-400" /> Open Interest Concentration by Strike
                    </h3>
                    <span className="text-[10px] text-zinc-400">Total verified contracts across active Deribit books</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 text-xs">
                    {strikes.map((s) => {
                        const matchingContracts = keyContracts.filter((c) => c.strike === s);
                        const totalOi = matchingContracts.reduce((sum, c) => sum + c.oiBtc, 0);

                        return (
                            <div
                                key={s}
                                onClick={() => onSelectStrike?.(s)}
                                className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b] hover:border-cyan-500/50 cursor-pointer space-y-1"
                            >
                                <span className="text-[10px] text-zinc-400 block">${s.toLocaleString()}</span>
                                <span className="text-sm font-bold text-white">{totalOi.toLocaleString()} BTC</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/**
 * Planned Roadmap Placeholder
 */
export function PlannedModuleView({ moduleName }: { moduleName: string }) {
    return (
        <div className="p-12 rounded-xl bg-[#080d16] border border-[#151f30] shadow-2xl flex flex-col items-center justify-center text-center space-y-3 font-mono">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider">{moduleName} MODULE</h3>
            <p className="text-xs text-zinc-400 max-w-md font-sans leading-relaxed">
                This feature is scheduled for implementation in <strong>Milestone 4</strong> after live multi-agent backend contracts are finalized by Codex.
            </p>
            <div className="text-[10px] px-3 py-1 rounded bg-[#0c1422] border border-[#1a273b] text-amber-300">
                PLANNED FOR MILESTONE 4
            </div>
        </div>
    );
}
