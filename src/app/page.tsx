'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/dashboard/Sidebar';
import TopTickerBar from '@/components/dashboard/TopTickerBar';
import DealerEnvironmentSummary from '@/components/dashboard/DealerEnvironmentSummary';
import GexHeatmap from '@/components/dashboard/GexHeatmap';
import StrikeSliceChart from '@/components/dashboard/StrikeSliceChart';
import ExpirySliceChart from '@/components/dashboard/ExpirySliceChart';
import ConfluenceLevelsTable from '@/components/dashboard/ConfluenceLevelsTable';
import KeyContractsTable from '@/components/dashboard/KeyContractsTable';
import FooterBar from '@/components/dashboard/FooterBar';
import {
    DashboardOverviewView,
    GexAnalysisView,
    VannaAnalysisView,
    CharmAnalysisView,
    OpenInterestView,
    PlannedModuleView,
} from '@/components/dashboard/Workspaces';
import { DashboardData, DataMode, WorkspaceTab, SelectedAnalyticalState, TerrainGridCell, ConfluenceLevelItem, KeyContractItem } from '@/lib/dashboard/types';
import { createCanonicalDashboardData, adaptApiResponseToDashboardData } from '@/lib/dashboard/adapters';

// Dynamically import 3D WebGL component to guarantee client-only execution
const IntegratedDealerTerrain = dynamic(
    () => import('@/components/three/IntegratedDealerTerrain'),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-[520px] rounded-xl bg-[#080d16] border border-[#151f30] flex flex-col items-center justify-center gap-3 text-cyan-400">
                <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <span className="font-mono text-xs tracking-wider text-zinc-400">
                    LOADING 3D DEALER TERRAIN ENGINE...
                </span>
            </div>
        ),
    }
);

export default function TerminalPage() {
    const [dataMode, setDataMode] = useState<DataMode>('DEMO');
    const [data, setData] = useState<DashboardData>(createCanonicalDashboardData('DEMO'));
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('SURFACE MAP');

    // Shared analytical selection state across all synchronized components
    const [selectedState, setSelectedState] = useState<SelectedAnalyticalState>({
        strike: 67842.5,
        dte: 30,
        expiry: '2025-06-27',
        levelId: null,
        contractInstrument: null,
    });

    const handleSelectStrike = useCallback((strike: number) => {
        setSelectedState((prev) => ({
            ...prev,
            strike,
        }));
    }, []);

    const handleSelectPoint = useCallback((cell: TerrainGridCell) => {
        setSelectedState({
            strike: cell.strike,
            dte: cell.dte,
            expiry: cell.expiry,
            levelId: null,
            contractInstrument: null,
        });
    }, []);

    const handleSelectLevel = useCallback((level: ConfluenceLevelItem) => {
        setSelectedState({
            strike: level.strike,
            dte: 30,
            expiry: null,
            levelId: level.id,
            contractInstrument: null,
        });
    }, []);

    const handleSelectContract = useCallback((contract: KeyContractItem) => {
        setSelectedState({
            strike: contract.strike,
            dte: contract.dte,
            expiry: contract.expiry,
            levelId: null,
            contractInstrument: contract.instrument,
        });
    }, []);

    const fetchLiveFeed = useCallback(async () => {
        if (dataMode === 'DEMO') {
            setData(createCanonicalDashboardData('DEMO'));
            return;
        }

        try {
            const res = await fetch('/api/deribit');
            if (res.ok) {
                const json = await res.json();
                const adapted = adaptApiResponseToDashboardData(json, 'LIVE');
                setData(adapted);
            } else {
                setData(createCanonicalDashboardData('DEGRADED'));
            }
        } catch (e) {
            console.error('Failed to sync live feed:', e);
            setData(createCanonicalDashboardData('DEGRADED'));
        }
    }, [dataMode]);

    useEffect(() => {
        fetchLiveFeed();
        const timer = setInterval(() => {
            if (dataMode === 'LIVE') {
                fetchLiveFeed();
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [fetchLiveFeed, dataMode]);

    const handleToggleDataMode = (mode: DataMode) => {
        setDataMode(mode);
        if (mode === 'DEMO') {
            setData(createCanonicalDashboardData('DEMO'));
        } else {
            fetchLiveFeed();
        }
    };

    return (
        <div className="min-h-screen bg-[#05080f] text-zinc-100 flex flex-row font-sans selection:bg-cyan-500 selection:text-black overflow-x-hidden">
            {/* Left Navigation Sidebar */}
            <Sidebar
                activeTab={activeTab}
                onSelectTab={setActiveTab}
            />

            {/* Main Terminal Workspace */}
            <div className="flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden">
                {/* Top Ticker Metric Bar */}
                <TopTickerBar
                    summary={data.summary}
                    onToggleDataMode={handleToggleDataMode}
                />

                {/* Dynamic Content Viewport */}
                <main className="flex-1 p-3 space-y-3 max-w-[1920px] w-full mx-auto">
                    {/* View 1: Primary Canonical SURFACE MAP */}
                    {activeTab === 'SURFACE MAP' && (
                        <div className="space-y-3">
                            {/* Top Row: Dominant 3D Dealer Terrain (75%) + Environment Summary (25%) */}
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                                <div className="xl:col-span-9 w-full">
                                    <IntegratedDealerTerrain
                                        surfaceGrid={data.surfaceGrid}
                                        interpolatedGrid={data.interpolatedGrid}
                                        summary={data.summary}
                                        scales={data.scales}
                                        strikes={data.strikes}
                                        expirations={data.expirations}
                                        dtes={data.dtes}
                                        selectedState={selectedState}
                                        onSelectStrike={handleSelectStrike}
                                        onSelectPoint={handleSelectPoint}
                                    />
                                </div>

                                <div className="xl:col-span-3 w-full">
                                    <DealerEnvironmentSummary
                                        summary={data.summary}
                                        onSelectStrike={handleSelectStrike}
                                    />
                                </div>
                            </div>

                            {/* Middle Row: 4 Synchronized Analytical Panels */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 h-auto min-h-[220px]">
                                <div className="w-full h-full">
                                    <GexHeatmap
                                        surfaceGrid={data.surfaceGrid}
                                        strikes={data.strikes}
                                        dtes={data.dtes}
                                        spotPrice={data.summary.spotPrice}
                                        scales={data.scales}
                                        selectedState={selectedState}
                                        onSelectCell={handleSelectPoint}
                                    />
                                </div>

                                <div className="w-full h-full">
                                    <StrikeSliceChart
                                        surfaceGrid={data.surfaceGrid}
                                        strikes={data.strikes}
                                        spotPrice={data.summary.spotPrice}
                                        scales={data.scales}
                                        selectedState={selectedState}
                                        onSelectStrike={handleSelectStrike}
                                    />
                                </div>

                                <div className="w-full h-full">
                                    <ExpirySliceChart
                                        surfaceGrid={data.surfaceGrid}
                                        dtes={data.dtes}
                                        spotPrice={data.summary.spotPrice}
                                        scales={data.scales}
                                        selectedState={selectedState}
                                        onSelectDte={(d) => setSelectedState(prev => ({ ...prev, dte: d }))}
                                    />
                                </div>

                                <div className="w-full h-full">
                                    <ConfluenceLevelsTable
                                        levels={data.confluenceLevels}
                                        selectedState={selectedState}
                                        onSelectLevel={handleSelectLevel}
                                    />
                                </div>
                            </div>

                            {/* Bottom Row: Key Contracts Table */}
                            <div className="w-full">
                                <KeyContractsTable
                                    contracts={data.keyContracts}
                                    selectedState={selectedState}
                                    onSelectContract={handleSelectContract}
                                />
                            </div>
                        </div>
                    )}

                    {/* View 2: DASHBOARD Overview */}
                    {activeTab === 'DASHBOARD' && (
                        <DashboardOverviewView
                            data={data}
                            selectedState={selectedState}
                            onSelectStrike={handleSelectStrike}
                        />
                    )}

                    {/* View 3: GEX ANALYSIS */}
                    {activeTab === 'GEX ANALYSIS' && (
                        <GexAnalysisView
                            data={data}
                            selectedState={selectedState}
                            onSelectStrike={handleSelectStrike}
                        />
                    )}

                    {/* View 4: VANNA */}
                    {activeTab === 'VANNA' && (
                        <VannaAnalysisView
                            data={data}
                            selectedState={selectedState}
                            onSelectStrike={handleSelectStrike}
                        />
                    )}

                    {/* View 5: CHARM */}
                    {activeTab === 'CHARM' && (
                        <CharmAnalysisView
                            data={data}
                            selectedState={selectedState}
                        />
                    )}

                    {/* View 6: OPEN INTEREST */}
                    {activeTab === 'OPEN INTEREST' && (
                        <OpenInterestView
                            data={data}
                            selectedState={selectedState}
                            onSelectStrike={handleSelectStrike}
                        />
                    )}

                    {/* View 7: Planned Modules */}
                    {['ALERTS', 'WATCHLIST', 'SCREENER', 'REPORTS', 'SETTINGS'].includes(activeTab) && (
                        <PlannedModuleView moduleName={activeTab} />
                    )}
                </main>

                {/* Footer Bar */}
                <FooterBar autoRefreshSecs={3} />
            </div>
        </div>
    );
}
