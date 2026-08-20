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
import { DashboardData } from '@/lib/dashboard/types';
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
    const [data, setData] = useState<DashboardData>(createCanonicalDashboardData());
    const [activeTab, setActiveTab] = useState('SURFACE MAP');

    const fetchLiveFeed = useCallback(async () => {
        try {
            const res = await fetch('/api/deribit');
            if (res.ok) {
                const json = await res.json();
                const adapted = adaptApiResponseToDashboardData(json);
                setData(adapted);
            }
        } catch (e) {
            // Keep canonical dashboard data on network err
            console.error('Failed to sync live feed:', e);
        }
    }, []);

    useEffect(() => {
        fetchLiveFeed();
        const timer = setInterval(() => {
            fetchLiveFeed();
        }, 3000); // 3s auto-refresh
        return () => clearInterval(timer);
    }, [fetchLiveFeed]);

    return (
        <div className="min-h-screen bg-[#05080f] text-zinc-100 flex flex-row font-sans selection:bg-cyan-500 selection:text-black overflow-hidden">
            {/* Left Collapsible Navigation Sidebar */}
            <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

            {/* Main Terminal Viewport Container */}
            <div className="flex-1 flex flex-col h-screen overflow-y-auto">
                {/* Top Ticker Metric Bar */}
                <TopTickerBar summary={data.summary} />

                {/* Main Content Workspace */}
                <main className="flex-1 p-3.5 space-y-3.5 max-w-[1920px] mx-auto w-full">
                    {/* Top Row: Dominant 3D Dealer Terrain (75%) + Environment Summary (25%) */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
                        {/* 3D Dealer Terrain */}
                        <div className="xl:col-span-9 w-full">
                            <IntegratedDealerTerrain
                                surfaceGrid={data.surfaceGrid}
                                summary={data.summary}
                                strikes={data.strikes}
                                expirations={data.expirations}
                                dtes={data.dtes}
                            />
                        </div>

                        {/* Dealer Environment Summary & Regime Gauge */}
                        <div className="xl:col-span-3 w-full">
                            <DealerEnvironmentSummary summary={data.summary} />
                        </div>
                    </div>

                    {/* Middle Row: 4 Synchronized Analytical Panels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 h-auto min-h-[220px]">
                        {/* 1. GEX Heatmap */}
                        <div className="w-full h-full">
                            <GexHeatmap
                                surfaceGrid={data.surfaceGrid}
                                strikes={data.strikes}
                                dtes={data.dtes}
                                spotPrice={data.summary.spotPrice}
                            />
                        </div>

                        {/* 2. Strike Slice */}
                        <div className="w-full h-full">
                            <StrikeSliceChart
                                surfaceGrid={data.surfaceGrid}
                                strikes={data.strikes}
                                spotPrice={data.summary.spotPrice}
                            />
                        </div>

                        {/* 3. Expiry Slice */}
                        <div className="w-full h-full">
                            <ExpirySliceChart
                                surfaceGrid={data.surfaceGrid}
                                dtes={data.dtes}
                                spotPrice={data.summary.spotPrice}
                            />
                        </div>

                        {/* 4. Confluence Levels */}
                        <div className="w-full h-full">
                            <ConfluenceLevelsTable
                                levels={data.confluenceLevels}
                            />
                        </div>
                    </div>

                    {/* Bottom Row: Key Contracts Table */}
                    <div className="w-full">
                        <KeyContractsTable contracts={data.keyContracts} />
                    </div>
                </main>

                {/* Footer Bar */}
                <FooterBar autoRefreshSecs={3} />
            </div>
        </div>
    );
}
