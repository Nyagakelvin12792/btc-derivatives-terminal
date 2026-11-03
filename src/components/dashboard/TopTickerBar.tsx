'use client';

import React, { useState, useEffect } from 'react';
import { DealerEnvironmentSummaryData, DataMode } from '@/lib/dashboard/types';
import { formatUsd } from '@/lib/dashboard/adapters';

interface TopTickerBarProps {
    summary: DealerEnvironmentSummaryData;
    onToggleDataMode?: (mode: DataMode) => void;
}

export default function TopTickerBar({ summary, onToggleDataMode }: TopTickerBarProps) {
    const [utcTime, setUtcTime] = useState(summary.utcTime);

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            const year = now.getUTCFullYear();
            const month = String(now.getUTCMonth() + 1).padStart(2, '0');
            const day = String(now.getUTCDate()).padStart(2, '0');
            const hours = String(now.getUTCHours()).padStart(2, '0');
            const mins = String(now.getUTCMinutes()).padStart(2, '0');
            const secs = String(now.getUTCSeconds()).padStart(2, '0');
            setUtcTime(`${year}-${month}-${day} ${hours}:${mins}:${secs}`);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const isPositiveChange = summary.spot24hChange >= 0;
    const isDemo = summary.dataMode === 'DEMO';
    const isDegraded = summary.dataMode === 'DEGRADED';

    return (
        <div className="w-full bg-[#080d16] border-b border-[#151f30] px-4 py-2.5 flex items-center justify-between text-xs font-mono select-none overflow-x-auto gap-4">
            {/* Ticker items in horizontal row */}
            <div className="flex items-center gap-5 divide-x divide-[#151f30] shrink-0">
                {/* BTCUSD Spot */}
                <div className="flex items-baseline gap-2">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">BTCUSD</span>
                    <span className="text-base font-black text-white tracking-tight">
                        {summary.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                </div>

                {/* 24H Change */}
                <div className="pl-5 flex items-baseline gap-2">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">24H CHANGE</span>
                    <div className="flex items-baseline gap-1.5 font-bold">
                        <span className={isPositiveChange ? 'text-emerald-400' : 'text-rose-400'}>
                            {isPositiveChange ? '+' : ''}{summary.spot24hChange.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                        <span className={`text-[10px] px-1 py-0.2 rounded ${
                            isPositiveChange ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                        }`}>
                            {isPositiveChange ? '+' : ''}{summary.spot24hChangePct.toFixed(2)}%
                        </span>
                    </div>
                </div>

                {/* Open Interest */}
                <div className="pl-5 flex items-baseline gap-2">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">OPEN INTEREST</span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-white">
                            {summary.openInterestUsd
                                ? formatUsd(summary.openInterestUsd)
                                : summary.totalOiBtc
                                ? `${summary.totalOiBtc.toLocaleString()} BTC`
                                : 'N/A'}
                        </span>
                        {summary.openInterestChangePct > 0 && (
                            <span className="text-[10px] text-emerald-400 font-semibold">+{summary.openInterestChangePct.toFixed(2)}%</span>
                        )}
                    </div>
                </div>

                {/* IV 30D */}
                <div className="pl-5 flex items-baseline gap-2">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">IV 30D</span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-white">{summary.iv30d.toFixed(1)}%</span>
                        <span className="text-[10px] text-emerald-400">+{summary.iv30dChange.toFixed(1)} vol</span>
                    </div>
                </div>

                {/* Skew 25Δ */}
                <div className="pl-5 flex items-baseline gap-2">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">SKEW 25Δ</span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-white">{summary.skew25d.toFixed(1)}%</span>
                        <span className="text-[10px] text-emerald-400">+{summary.skew25dChange.toFixed(1)} vol</span>
                    </div>
                </div>

                {/* Funding Rate */}
                <div className="pl-5 flex items-baseline gap-2">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">FUNDING RATE</span>
                    <div className="flex items-baseline gap-1">
                        <span className="font-bold text-emerald-400">{(summary.fundingRate).toFixed(4)}%</span>
                        <span className="text-[10px] text-zinc-400">({summary.fundingPeriod})</span>
                    </div>
                </div>
            </div>

            {/* Right Data Mode Switcher & Status Clock */}
            <div className="flex items-center gap-4 shrink-0 pl-4 border-l border-[#151f30]">
                {/* Mode Selector Toggle */}
                <div className="flex items-center gap-1 bg-[#0c1422] p-1 rounded-lg border border-[#1a273b]">
                    <button
                        onClick={() => onToggleDataMode?.('LIVE')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            !isDemo
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Connect live Deribit API feed"
                    >
                        LIVE
                    </button>
                    <button
                        onClick={() => onToggleDataMode?.('DEMO')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            isDemo
                                ? 'bg-amber-950 text-amber-400 border border-amber-500/40'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Inspect canonical reference model"
                    >
                        DEMO
                    </button>
                </div>

                {/* Data Status Indicator */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                        isDemo ? 'bg-amber-400' : isDegraded ? 'bg-rose-400' : 'bg-emerald-400 animate-ping'
                    }`} />
                    <span className={`text-[10px] font-bold ${
                        isDemo ? 'text-amber-400' : isDegraded ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                        {isDemo ? 'DEMO' : isDegraded ? 'DEGRADED' : 'LIVE'}
                    </span>
                    <span className="text-[10px] text-zinc-400">Deribit</span>
                </div>

                {/* UTC Time */}
                <div className="hidden lg:flex items-center gap-1.5 text-zinc-300">
                    <span className="text-[10px] text-zinc-400 uppercase">UTC</span>
                    <span suppressHydrationWarning className="font-semibold">{utcTime}</span>
                </div>
            </div>
        </div>
    );
}
