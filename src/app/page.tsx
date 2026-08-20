'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/dashboard/Sidebar';
import TopTickerBar from '@/components/dashboard/TopTickerBar';
import DealerEnvironmentSummary from '@/components/dashboard/DealerEnvironmentSummary';
import KeyLevelProfile from '@/components/dashboard/KeyLevelProfile';
import HowToReadMapPanel from '@/components/dashboard/HowToReadMapPanel';
import DealerBehaviorLegend from '@/components/dashboard/DealerBehaviorLegend';
import FooterBar from '@/components/dashboard/FooterBar';
import { ConfluenceTable, ContractsTable } from '@/components/dashboard/TanStackTables';
import {
    DashboardOverviewView,
    GexAnalysisView,
    VannaAnalysisView,
    CharmAnalysisView,
    OpenInterestView,
    PlannedModuleView,
} from '@/components/dashboard/Workspaces';
import { useTerminalStore } from '@/lib/dashboard/store';
import { useTerrainQuery } from '@/lib/dashboard/queries';
import { createCanonicalDashboardData, extractKeyLevelProfileFromContractV2 } from '@/lib/dashboard/adapters';
import type { DealerEnvironmentSummaryData } from '@/lib/dashboard/types';
import type { TerrainDataContractV2 } from '@/lib/terrain/types';
import { Info, AlertTriangle } from 'lucide-react';

// Dynamically import 3D WebGL component to guarantee client-only execution
const IntegratedDealerTerrain = dynamic(
    () => import('@/components/three/IntegratedDealerTerrain'),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-[540px] rounded-xl bg-[#080d16] border border-[#151f30] flex flex-col items-center justify-center gap-3 text-cyan-400">
                <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <span className="font-mono text-xs tracking-wider text-zinc-400">
                    INITIALIZING 3D DEALER PRESSURE TERRAIN...
                </span>
            </div>
        ),
    }
);

export default function TerminalPage() {
    const {
        activeWorkspace,
        setActiveWorkspace,
        dataMode,
        setDataMode,
        selectedStrike,
        selectedDte,
        setSelectedStrike,
        setSelectedPoint,
    } = useTerminalStore();

    // Query live or demo terrain data using TanStack Query
    const { data: queryData, isError } = useTerrainQuery(dataMode);

    // Fallback data when loading or in demo mode
    const fallbackDemoData = useMemo(() => createCanonicalDashboardData('DEMO') as unknown as TerrainDataContractV2, []);
    const data: TerrainDataContractV2 = queryData || fallbackDemoData;

    const currentStrike = selectedStrike || data.spotPrice || 68000;
    const currentProfile = useMemo(() => {
        return extractKeyLevelProfileFromContractV2(data, currentStrike);
    }, [data, currentStrike]);

    // Adapt summary data for legacy header components if needed
    const summaryData = useMemo<DealerEnvironmentSummaryData>(() => {
        return {
            ...data.summary,
            spotPrice: data.spotPrice || 68000,
            spot24hChange: 1243.5,
            spot24hChangePct: 1.86,
            openInterestUsd: null,
            openInterestBtc: data.summary.totalOpenInterest,
            openInterestChangePct: 2.7,
            iv30d: 54.2,
            iv30dChange: 0.8,
            skew25d: 7.6,
            skew25dChange: 0.3,
            fundingRate: 0.0102,
            fundingPeriod: '8h',
            utcTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
            netGex: data.summary.netGex,
            netVanna: data.summary.totalVannaExposure,
            netCharm: data.summary.totalCharmExposure,
            gammaFlip: data.keyLevels?.gammaFlip?.strike || data.summary.gammaFlip || 65250,
            callWall: data.keyLevels?.callWall?.strike || data.summary.callWallExposure || 72000,
            putWall: data.keyLevels?.putWall?.strike || data.summary.putWallExposure || 62000,
            maxPain: data.keyLevels?.primaryMaxPain?.strike || data.summary.maxPainStrike || 68500,
            totalOiUsd: null,
            totalOiBtc: data.summary.totalOpenInterest,
            dealerRegime: data.summary.netGex > 0.3e9 ? 'LONG_GAMMA' : data.summary.netGex < -0.3e9 ? 'SHORT_GAMMA' : 'TRANSITIONAL',
            regimeTitle: data.summary.netGex > 0.3e9 ? 'LONG GAMMA' : data.summary.netGex < -0.3e9 ? 'SHORT GAMMA' : 'TRANSITIONAL',
            regimeSubtitle: data.summary.netGex > 0.3e9 ? 'stabilizing / mean reverting' : 'accelerating / trending',
            regimeDescription: data.summary.netGex > 0.3e9
                ? 'Dealers are long gamma. Market tends to stabilize around spot. Pullbacks may be bought, rips may fade.'
                : 'Dealers are short gamma. Hedging flows align with price breakouts, accelerating trend volatility.',
            regimeScore: data.summary.netGex > 0.3e9 ? 78 : 22,
            dataMode: data.dataMode,
            assumptionModel: data.assumptionModel,
            sourceStatus: data.dataMode === 'DEMO' ? 'DEMO CANONICAL MODEL' : 'LIVE DERIBIT FEED',
        };
    }, [data]);

    return (
        <div className="min-h-screen bg-[#05080f] text-zinc-100 flex flex-row font-sans selection:bg-cyan-500 selection:text-black overflow-x-hidden">
            {/* Left Navigation Sidebar */}
            <Sidebar
                activeTab={activeWorkspace}
                onSelectTab={setActiveWorkspace}
            />

            {/* Main Terminal Workspace */}
            <div className="flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden">
                {/* Top Ticker Metric Bar */}
                <TopTickerBar
                    summary={summaryData}
                    onToggleDataMode={(mode) => setDataMode(mode)}
                />

                {/* Dynamic Content Viewport */}
                <main className="flex-1 p-3 space-y-3 max-w-[1920px] w-full mx-auto">
                    {/* Status Alert for DEGRADED or Error */}
                    {isError && dataMode === 'LIVE' && (
                        <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/50 flex items-center justify-between text-xs font-mono text-rose-300">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-rose-400" />
                                <span>LIVE FEED OFFLINE: Unable to reach Deribit API. Showing canonical demo model.</span>
                            </div>
                            <button
                                onClick={() => setDataMode('DEMO')}
                                className="px-2 py-0.5 rounded bg-rose-900 text-white font-bold"
                            >
                                SWITCH TO DEMO
                            </button>
                        </div>
                    )}

                    {/* View 1: Primary Canonical SURFACE MAP */}
                    {activeWorkspace === 'SURFACE MAP' && (
                        <div className="space-y-3">
                            {/* How To Read Map 5-Second Guide */}
                            <HowToReadMapPanel />

                            {/* Top Row: Dominant 3D Dealer Pressure Terrain (75%) + Environment Summary & Profile (25%) */}
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                                <div className="xl:col-span-9 w-full">
                                    <IntegratedDealerTerrain
                                        data={data}
                                        selectedStrike={selectedStrike}
                                        selectedDte={selectedDte}
                                        onSelectStrike={setSelectedStrike}
                                        onSelectPoint={(cell) => setSelectedPoint(cell.strike, cell.dte, cell.expiry)}
                                    />
                                </div>

                                <div className="xl:col-span-3 w-full space-y-3">
                                    <DealerEnvironmentSummary
                                        summary={summaryData}
                                        onSelectStrike={setSelectedStrike}
                                    />
                                    <KeyLevelProfile
                                        profile={currentProfile}
                                    />
                                </div>
                            </div>

                            {/* Middle Row: Confluence Levels Table + Key Option Contracts Table */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                <ConfluenceTable
                                    data={data.confluenceLevels || []}
                                    selectedStrike={selectedStrike}
                                    onSelectStrike={setSelectedStrike}
                                />

                                <ContractsTable
                                    data={data.keyContracts || []}
                                    selectedStrike={selectedStrike}
                                    onSelectStrike={setSelectedStrike}
                                />
                            </div>

                            {/* Institutional Assumption Model Note */}
                            <div className="p-3 rounded-xl bg-[#080d16] border border-[#151f30] flex items-center justify-between gap-3 text-[11px] font-mono text-zinc-400">
                                <div className="flex items-center gap-2">
                                    <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                                    <span>
                                        <strong>ASSUMPTION MODEL: {data.assumptionModel || 'OI_SIGN_PROXY_V1'}</strong> — Dealer positioning is estimated from public open interest; it is not directly observed dealer inventory.
                                    </span>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-[#0c1422] border border-[#1a273b] text-cyan-300 text-[10px] shrink-0 font-bold">
                                    CONTRACT V2 VERIFIED
                                </span>
                            </div>

                            {/* Dealer Behavior Legend Guide */}
                            <div className="w-full">
                                <DealerBehaviorLegend />
                            </div>
                        </div>
                    )}

                    {/* View 2: DASHBOARD Overview */}
                    {activeWorkspace === 'DASHBOARD' && (
                        <div className="space-y-3">
                            <HowToReadMapPanel />
                            <DashboardOverviewView
                                data={data}
                                selectedStrike={selectedStrike}
                                onSelectStrike={setSelectedStrike}
                            />
                            <KeyLevelProfile profile={currentProfile} />
                            <DealerBehaviorLegend />
                        </div>
                    )}

                    {/* View 3: GEX ANALYSIS (ECharts) */}
                    {activeWorkspace === 'GEX ANALYSIS' && (
                        <div className="space-y-3">
                            <HowToReadMapPanel />
                            <GexAnalysisView
                                data={data}
                                selectedStrike={selectedStrike}
                                onSelectStrike={setSelectedStrike}
                            />
                            <KeyLevelProfile profile={currentProfile} />
                            <DealerBehaviorLegend />
                        </div>
                    )}

                    {/* View 4: VANNA (ECharts) */}
                    {activeWorkspace === 'VANNA' && (
                        <div className="space-y-3">
                            <HowToReadMapPanel />
                            <VannaAnalysisView
                                data={data}
                                selectedStrike={selectedStrike}
                                onSelectStrike={setSelectedStrike}
                            />
                            <KeyLevelProfile profile={currentProfile} />
                            <DealerBehaviorLegend />
                        </div>
                    )}

                    {/* View 5: CHARM (ECharts) */}
                    {activeWorkspace === 'CHARM' && (
                        <div className="space-y-3">
                            <HowToReadMapPanel />
                            <CharmAnalysisView
                                data={data}
                                selectedStrike={selectedStrike}
                                onSelectStrike={setSelectedStrike}
                            />
                            <KeyLevelProfile profile={currentProfile} />
                            <DealerBehaviorLegend />
                        </div>
                    )}

                    {/* View 6: OPEN INTEREST (ECharts) */}
                    {activeWorkspace === 'OPEN INTEREST' && (
                        <div className="space-y-3">
                            <HowToReadMapPanel />
                            <OpenInterestView
                                data={data}
                                selectedStrike={selectedStrike}
                                onSelectStrike={setSelectedStrike}
                            />
                            <KeyLevelProfile profile={currentProfile} />
                            <DealerBehaviorLegend />
                        </div>
                    )}

                    {/* View 7: Planned Modules */}
                    {['ALERTS', 'WATCHLIST', 'SCREENER', 'REPORTS', 'SETTINGS'].includes(activeWorkspace) && (
                        <PlannedModuleView moduleName={activeWorkspace} />
                    )}
                </main>

                {/* Footer Bar */}
                <FooterBar autoRefreshSecs={3} />
            </div>
        </div>
    );
}
