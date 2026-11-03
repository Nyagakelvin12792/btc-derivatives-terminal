'use client';

import React from 'react';
import { TerrainDataContractV2 } from '@/lib/terrain/types';
import { formatGex, formatUsd } from '@/lib/dashboard/adapters';
import ExposureScalePanel from '@/components/dashboard/ExposureScalePanel';
import {
    GexAnalysisWorkspace,
    VannaWorkspace,
    CharmWorkspace,
    OpenInterestWorkspace,
} from '@/components/dashboard/EChartsWorkspaces';
import { ConfluenceTable, ContractsTable } from '@/components/dashboard/TanStackTables';
import { Activity, ShieldCheck, Zap, Layers, Compass, Clock, AlertCircle } from 'lucide-react';

interface WorkspaceViewProps {
    data: TerrainDataContractV2;
    selectedStrike: number | null;
    onSelectStrike: (strike: number) => void;
}

/**
 * DASHBOARD Overview Workspace:
 * Executive high-level macro view of total dealer positioning
 */
export function DashboardOverviewView({ data, selectedStrike, onSelectStrike }: WorkspaceViewProps) {
    const { summary, scales, keyLevels } = data;

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
                    <div className="text-2xl font-black text-purple-400">{formatGex(summary.totalVannaExposure)}</div>
                    <div className="text-[10px] text-zinc-400 mt-2">Delta sensitivity to 1-point IV shock</div>
                </div>

                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase mb-1">DAILY CHARM BLEED</div>
                    <div className="text-2xl font-black text-amber-400">{formatGex(summary.totalCharmExposure)}/day</div>
                    <div className="text-[10px] text-zinc-400 mt-2">Overnight delta hedge drift</div>
                </div>
            </div>

            {/* Exposure Scale Panel */}
            <ExposureScalePanel scales={scales} />

            {/* Macro Confluence & Tables */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <ConfluenceTable
                    data={data.confluenceLevels}
                    selectedStrike={selectedStrike}
                    onSelectStrike={onSelectStrike}
                />

                <ContractsTable
                    data={data.keyContracts}
                    selectedStrike={selectedStrike}
                    onSelectStrike={onSelectStrike}
                />
            </div>
        </div>
    );
}

/**
 * GEX ANALYSIS Workspace (ECharts)
 */
export function GexAnalysisView({ data, selectedStrike, onSelectStrike }: WorkspaceViewProps) {
    return <GexAnalysisWorkspace data={data} selectedStrike={selectedStrike} onSelectStrike={onSelectStrike} />;
}

/**
 * VANNA Workspace (ECharts)
 */
export function VannaAnalysisView({ data, selectedStrike, onSelectStrike }: WorkspaceViewProps) {
    return <VannaWorkspace data={data} selectedStrike={selectedStrike} onSelectStrike={onSelectStrike} />;
}

/**
 * CHARM Workspace (ECharts)
 */
export function CharmAnalysisView({ data, selectedStrike, onSelectStrike }: WorkspaceViewProps) {
    return <CharmWorkspace data={data} selectedStrike={selectedStrike} onSelectStrike={onSelectStrike} />;
}

/**
 * OPEN INTEREST Workspace (ECharts)
 */
export function OpenInterestView({ data, selectedStrike, onSelectStrike }: WorkspaceViewProps) {
    return <OpenInterestWorkspace data={data} selectedStrike={selectedStrike} onSelectStrike={onSelectStrike} />;
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
                This feature is scheduled for full deployment after live multi-agent backend contracts are finalized.
            </p>
            <div className="text-[10px] px-3 py-1 rounded bg-[#0c1422] border border-[#1a273b] text-amber-300">
                ROADMAP EXPANSION
            </div>
        </div>
    );
}
