'use client';

import React from 'react';
import { Info, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { DealerEnvironmentSummaryData } from '@/lib/dashboard/types';
import { formatUsd } from '@/lib/dashboard/adapters';

interface DealerEnvironmentSummaryProps {
    summary: DealerEnvironmentSummaryData;
}

export default function DealerEnvironmentSummary({ summary }: DealerEnvironmentSummaryProps) {
    const isLongGamma = summary.dealerRegime === 'LONG_GAMMA';
    const isShortGamma = summary.dealerRegime === 'SHORT_GAMMA';

    return (
        <div className="w-full h-full rounded-xl bg-[#080d16] border border-[#151f30] p-4 flex flex-col justify-between select-none shadow-2xl">
            <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#151f30] mb-3">
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                        DEALER ENVIRONMENT SUMMARY
                    </h2>
                </div>

                {/* Key Metrics List */}
                <div className="space-y-2.5 font-mono text-xs">
                    {/* Net GEX */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Net GEX</span>
                        <span className="font-bold text-emerald-400">
                            {formatUsd(summary.netGex, { showSign: true })}
                        </span>
                    </div>

                    {/* Net Vanna */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Net Vanna</span>
                        <span className="font-bold text-purple-400">
                            {formatUsd(summary.netVanna, { showSign: true })}
                        </span>
                    </div>

                    {/* Net Charm */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Net Charm (1D)</span>
                        <span className="font-bold text-rose-400">
                            {formatUsd(summary.netCharm, { showSign: true })}/Day
                        </span>
                    </div>

                    {/* Gamma Flip */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Gamma Flip</span>
                        <span className="font-bold text-cyan-400">
                            {summary.gammaFlip.toLocaleString()}
                        </span>
                    </div>

                    {/* Call Wall */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Call Wall</span>
                        <span className="font-bold text-emerald-400">
                            {summary.callWall.toLocaleString()}
                        </span>
                    </div>

                    {/* Put Wall */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Put Wall</span>
                        <span className="font-bold text-rose-400">
                            {summary.putWall.toLocaleString()}
                        </span>
                    </div>

                    {/* Max Pain */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Max Pain</span>
                        <span className="font-bold text-amber-400">
                            {summary.maxPain.toLocaleString()}
                        </span>
                    </div>

                    {/* Total OI */}
                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Total OI</span>
                        <span className="font-bold text-white">
                            ${(summary.totalOiUsd / 1e9).toFixed(2)}B
                        </span>
                    </div>
                </div>
            </div>

            {/* DEALER REGIME Gauge Card */}
            <div className="mt-4 p-3.5 rounded-lg bg-[#0c1422] border border-[#1a273b] relative overflow-hidden">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                            DEALER REGIME
                        </span>
                        <Info className="w-3 h-3 text-zinc-400 cursor-pointer hover:text-cyan-400" />
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                        <div className={`text-base font-mono font-black uppercase tracking-tight ${
                            isLongGamma ? 'text-emerald-400' : isShortGamma ? 'text-rose-400' : 'text-amber-400'
                        }`}>
                            {summary.regimeTitle}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-300 font-medium">
                            {summary.regimeSubtitle}
                        </div>
                    </div>

                    {/* Radial Speedometer Gauge */}
                    <div className="relative w-16 h-12 flex items-end justify-center shrink-0">
                        <svg viewBox="0 0 100 60" className="w-full h-full overflow-visible">
                            {/* Gauge Arc Background */}
                            <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke="#1e293b"
                                strokeWidth="8"
                                strokeLinecap="round"
                            />
                            {/* Gauge Active Colored Arc */}
                            <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke="url(#regimeGradient)"
                                strokeWidth="8"
                                strokeLinecap="round"
                            />
                            {/* Gauge Needle */}
                            <line
                                x1="50"
                                y1="50"
                                x2={50 + 32 * Math.cos((Math.PI * (180 - summary.regimeScore * 1.8)) / 180)}
                                y2={50 - 32 * Math.sin((Math.PI * (180 - summary.regimeScore * 1.8)) / 180)}
                                stroke="#00e676"
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                            <circle cx="50" cy="50" r="4" fill="#00e676" />
                            <defs>
                                <linearGradient id="regimeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#ff1744" />
                                    <stop offset="50%" stopColor="#f59e0b" />
                                    <stop offset="100%" stopColor="#00e676" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                </div>

                <p className="mt-2 text-[10px] font-sans text-zinc-400 leading-relaxed">
                    {summary.regimeDescription}
                </p>
            </div>
        </div>
    );
}
