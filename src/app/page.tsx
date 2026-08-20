'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
    Zap,
    ShieldAlert,
    RefreshCw,
    Layers,
    Cpu,
    ArrowUpRight,
    ArrowDownRight,
    BarChart3,
    Clock,
    Database,
    Sparkles
} from 'lucide-react';
import type { TerrainDataContractV2 } from '@/lib/terrain/types';

// Dynamically import Three.js 3D terrain to ensure no SSR hydration mismatch
const IntegratedDealerTerrain = dynamic(() => import('@/components/three/IntegratedDealerTerrain'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[620px] rounded-lg bg-[#06090e] border border-cyan-500/20 flex flex-col items-center justify-center gap-4 text-cyan-400">
            <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <Cpu className="w-6 h-6 text-cyan-400 absolute top-3 left-3 animate-pulse" />
            </div>
            <span className="font-mono text-xs tracking-widest text-zinc-400">INITIALIZING 3D WEBGL ENGINE & DERIBIT SURFACE...</span>
        </div>
    ),
});

type DeribitResponse = TerrainDataContractV2;

export default function TerminalHome() {
    const [data, setData] = useState<DeribitResponse | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchData = useCallback(async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await fetch('/api/deribit');
            if (res.ok) {
                const json: DeribitResponse = await res.json();
                setData(json);
                setLastUpdated(new Date());
            }
        } catch (err) {
            console.error('Failed to load Deribit feed:', err);
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const initialFetch = window.setTimeout(() => {
            void fetchData();
        }, 0);
        const interval = setInterval(() => {
            void fetchData();
        }, 20000); // 20s auto-refresh
        return () => {
            window.clearTimeout(initialFetch);
            clearInterval(interval);
        };
    }, [fetchData]);

    const formatCurrency = (val: number) => {
        if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
        if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
        if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
        return `$${val.toFixed(0)}`;
    };

    const spot = data?.spotPrice || 69000;
    const summary = data?.summary;
    const isNetGexPositive = (summary?.netGex || 0) >= 0;

    return (
        <div className="min-h-screen bg-[#03070d] text-zinc-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 border-b border-cyan-500/20 bg-[#060b13]/90 backdrop-blur-xl px-4 lg:px-8 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-emerald-400 p-[1px] shadow-lg shadow-cyan-500/20 flex items-center justify-center">
                        <div className="w-full h-full bg-[#060b13] rounded-[11px] flex items-center justify-center">
                            <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm sm:text-base font-black tracking-wider text-white uppercase flex items-center gap-1.5">
                                BTC DERIVATIVES MECHANICS
                                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/30 rounded">
                                    v1.0-PRO
                                </span>
                            </h1>
                        </div>
                        <p className="text-[11px] font-mono text-zinc-400 flex items-center gap-2">
                            <span>QUANT GAMMA ENGINE</span>
                            <span>•</span>
                            <span className="text-emerald-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                DERIBIT LIVE WEBSOCKET/REST
                            </span>
                        </p>
                    </div>
                </div>

                {/* Spot Price & Refresh Status */}
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-xs font-mono text-zinc-400">BTC/USD SPOT INDEX</div>
                        <div className="text-lg sm:text-xl font-mono font-bold text-yellow-400 tracking-tight flex items-center justify-end gap-1">
                            ${spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>

                    <button
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/30 hover:border-cyan-400 text-xs font-mono text-cyan-300 hover:text-white transition-all shadow-sm active:scale-95"
                        title="Refresh Live Data"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
                        <span className="hidden sm:inline">SYNC</span>
                    </button>
                </div>
            </header>

            {/* Main Content Body */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
                {/* HUD Key Derivatives Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Net GEX */}
                    <div className="p-4 rounded-2xl bg-[#08101a] border border-cyan-500/20 shadow-lg relative overflow-hidden group hover:border-cyan-500/40 transition-all">
                        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-1">
                            <span>NET MARKET GEX ($)</span>
                            <Zap className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className={`text-2xl font-mono font-black ${isNetGexPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {summary ? formatCurrency(summary.netGex) : '...'}
                        </div>
                        <div className="mt-2 text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                            {isNetGexPositive ? (
                                <span className="text-emerald-400 flex items-center font-medium">
                                    <ArrowUpRight className="w-3.5 h-3.5" /> Long Gamma (Vol Dampener)
                                </span>
                            ) : (
                                <span className="text-rose-400 flex items-center font-medium">
                                    <ArrowDownRight className="w-3.5 h-3.5" /> Short Gamma (Vol Accelerator)
                                </span>
                            )}
                        </div>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all" />
                    </div>

                    {/* Card 2: Gamma Flip Level */}
                    <div className="p-4 rounded-2xl bg-[#08101a] border border-cyan-500/20 shadow-lg relative overflow-hidden group hover:border-cyan-500/40 transition-all">
                        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-1">
                            <span>GAMMA FLIP INFLECTION</span>
                            <ShieldAlert className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="text-2xl font-mono font-black text-amber-300">
                            {summary ? `$${summary.gammaFlip.toLocaleString()}` : '...'}
                        </div>
                        <div className="mt-2 text-[11px] font-mono text-zinc-400">
                            {summary && spot > summary.gammaFlip ? (
                                <span className="text-emerald-400 font-medium">
                                    Spot {((spot / summary.gammaFlip - 1) * 100).toFixed(1)}% above flip regime
                                </span>
                            ) : (
                                <span className="text-rose-400 font-medium">
                                    Spot {((1 - spot / (summary?.gammaFlip || spot)) * 100).toFixed(1)}% below flip regime
                                </span>
                            )}
                        </div>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all" />
                    </div>

                    {/* Card 3: Max Pain Strike */}
                    <div className="p-4 rounded-2xl bg-[#08101a] border border-cyan-500/20 shadow-lg relative overflow-hidden group hover:border-cyan-500/40 transition-all">
                        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-1">
                            <span>MAX PAIN STRIKE</span>
                            <BarChart3 className="w-4 h-4 text-fuchsia-400" />
                        </div>
                        <div className="text-2xl font-mono font-black text-fuchsia-300">
                            {summary ? `$${summary.maxPainStrike.toLocaleString()}` : '...'}
                        </div>
                        <div className="mt-2 text-[11px] font-mono text-zinc-400">
                            Min payout strike across expirations
                        </div>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-fuchsia-500/5 rounded-full blur-xl group-hover:bg-fuchsia-500/10 transition-all" />
                    </div>

                    {/* Card 4: Gamma Walls */}
                    <div className="p-4 rounded-2xl bg-[#08101a] border border-cyan-500/20 shadow-lg relative overflow-hidden group hover:border-cyan-500/40 transition-all">
                        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-1">
                            <span>MAJOR GEX WALLS</span>
                            <Layers className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="flex items-center justify-between font-mono mt-1">
                            <div>
                                <span className="text-[10px] text-zinc-400 block">CALL WALL</span>
                                <span className="text-sm font-bold text-emerald-400">
                                    ${summary ? summary.topPositiveGexStrike.toLocaleString() : '...'}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-zinc-400 block">PUT WALL</span>
                                <span className="text-sm font-bold text-rose-400">
                                    ${summary ? summary.topNegativeGexStrike.toLocaleString() : '...'}
                                </span>
                            </div>
                        </div>
                        <div className="mt-2 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                            <span>Total OI:</span>
                            <span className="text-cyan-300 font-bold">{summary ? `${summary.totalOpenInterest.toFixed(0)} BTC` : '...'}</span>
                        </div>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all" />
                    </div>
                </div>

                {/* 3D WebGL Gamma Mountain Surface Section */}
                <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                        <div>
                            <h2 className="text-base sm:text-lg font-mono font-bold tracking-wide text-white flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-cyan-400" />
                                3D GEX & VOLATILITY MOUNTAIN TERRAIN
                            </h2>
                            <p className="text-xs font-mono text-zinc-400">
                                Interactive real-time Black-Scholes Net Gamma ($) surface across Strike × Expiry space (Deribit Book)
                            </p>
                        </div>
                        {lastUpdated && (
                            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                                <Clock className="w-3 h-3 text-cyan-400" />
                                Updated: {lastUpdated.toLocaleTimeString()}
                            </div>
                        )}
                    </div>

                    {/* 3D Canvas Mesh */}
                    {data && (
                        <IntegratedDealerTerrain data={data} />
                    )}
                </div>

                {/* Top Gamma Contracts & Greeks Breakdown Table */}
                <div className="p-5 rounded-2xl bg-[#08101a] border border-cyan-500/20 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-cyan-400" />
                            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                                Top High-Impact Deribit Option Contracts
                            </h3>
                        </div>
                        <span className="text-xs font-mono text-zinc-400">
                            {data?.summary.contractsCount || 0} active options analyzed
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-xs">
                            <thead>
                                <tr className="border-b border-zinc-800 text-zinc-400 bg-[#060b13]/50">
                                    <th className="py-2.5 px-3">INSTRUMENT</th>
                                    <th className="py-2.5 px-3">TYPE</th>
                                    <th className="py-2.5 px-3">STRIKE</th>
                                    <th className="py-2.5 px-3">DTE</th>
                                    <th className="py-2.5 px-3">OPEN INTEREST</th>
                                    <th className="py-2.5 px-3">IMPLIED VOL (IV)</th>
                                    <th className="py-2.5 px-3">DELTA (Δ)</th>
                                    <th className="py-2.5 px-3">GAMMA (Γ)</th>
                                    <th className="py-2.5 px-3 text-right">NET GEX ($)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60">
                                {data?.topContracts && data.topContracts.length > 0 ? (
                                    data.topContracts.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-cyan-950/20 transition-colors">
                                            <td className="py-2 px-3 font-semibold text-white">{item.instrument}</td>
                                            <td className="py-2 px-3">
                                                <span
                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                        item.type === 'call'
                                                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                                            : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                                                    }`}
                                                >
                                                    {item.type.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-zinc-200">${item.strike.toLocaleString()}</td>
                                            <td className="py-2 px-3 text-zinc-300">{item.dte.toFixed(1)}d</td>
                                            <td className="py-2 px-3 text-cyan-300">{item.openInterest.toFixed(1)} BTC</td>
                                            <td className="py-2 px-3 text-purple-300">{item.iv.toFixed(1)}%</td>
                                            <td className="py-2 px-3 text-zinc-300">{item.delta.toFixed(3)}</td>
                                            <td className="py-2 px-3 text-zinc-300">{item.gamma.toExponential(3)}</td>
                                            <td
                                                className={`py-2 px-3 text-right font-bold ${
                                                    item.gex >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                                }`}
                                            >
                                                {formatCurrency(item.gex)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="text-center py-6 text-zinc-500">
                                            Loading live options contract data...
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Terminal Status Footer */}
            <footer className="border-t border-cyan-500/20 bg-[#060b13] px-4 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-zinc-400">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>SYSTEM STATE: TRIAD MULTI-AGENT LOOP ACTIVE</span>
                    <span>•</span>
                    <span className="text-cyan-400">BUILDER [GEMINI / ANTIGRAVITY]</span>
                </div>
                <div className="text-[11px] text-zinc-400">
                    Calculations: Black-Scholes (1973) PDE + 2nd-Order Greeks (Vanna / Charm / GEX)
                </div>
            </footer>
        </div>
    );
}
