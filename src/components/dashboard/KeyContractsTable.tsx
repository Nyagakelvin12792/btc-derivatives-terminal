'use client';

import React from 'react';
import { KeyContractItem } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface KeyContractsTableProps {
    contracts: KeyContractItem[];
}

export default function KeyContractsTable({ contracts }: KeyContractsTableProps) {
    const getBadgeStyle = (badge: string) => {
        switch (badge) {
            case 'Call Wall':
                return 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40';
            case 'Put Wall':
                return 'bg-rose-950/80 text-rose-400 border-rose-500/40';
            case 'Support Zone':
                return 'bg-amber-950/80 text-amber-400 border-amber-500/40';
            case 'High Confluence':
                return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
            case 'Dealer Support Zone':
                return 'bg-amber-950/80 text-amber-300 border-amber-500/40';
            case 'Regime Transition':
                return 'bg-purple-950/80 text-purple-400 border-purple-500/40';
            default:
                return 'bg-zinc-900 text-zinc-400 border-zinc-700';
        }
    };

    return (
        <div className="w-full rounded-xl bg-[#080d16] border border-[#151f30] p-4 select-none shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#151f30] mb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                    5. KEY CONTRACTS <span className="text-zinc-400 font-normal">(TOP EXPOSURE)</span>
                </h3>
                <span className="text-[10px] font-mono text-zinc-400">
                    Showing top institutional dealer risk concentrations
                </span>
            </div>

            {/* Dense Institutional Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                    <thead>
                        <tr className="border-b border-[#151f30] text-zinc-400 bg-[#0c1422]/50">
                            <th className="py-2 px-2.5">Type</th>
                            <th className="py-2 px-2.5">Expiry</th>
                            <th className="py-2 px-2.5">DTE</th>
                            <th className="py-2 px-2.5">Strike</th>
                            <th className="py-2 px-2.5">Spot %</th>
                            <th className="py-2 px-2.5">Gamma</th>
                            <th className="py-2 px-2.5">GEX (USD)</th>
                            <th className="py-2 px-2.5">Vanna (USD)</th>
                            <th className="py-2 px-2.5">Charm (USD/Day)</th>
                            <th className="py-2 px-2.5">IV</th>
                            <th className="py-2 px-2.5">IV %ile</th>
                            <th className="py-2 px-2.5">OI (BTC)</th>
                            <th className="py-2 px-2.5">OI (USD)</th>
                            <th className="py-2 px-2.5">Δ (Delta)</th>
                            <th className="py-2 px-2.5">Volume (24H)</th>
                            <th className="py-2 px-2.5 text-right">Confluence</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151f30]/60">
                        {contracts.map((item, idx) => {
                            const isCall = item.type === 'call';
                            const spotPctPos = item.spotPct >= 0;

                            return (
                                <tr key={idx} className="hover:bg-[#0c1422] transition-colors">
                                    {/* Type C/P Badge */}
                                    <td className="py-2 px-2.5">
                                        <span
                                            className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black border ${
                                                isCall
                                                    ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-400'
                                                    : 'border-rose-500/50 bg-rose-950/60 text-rose-400'
                                            }`}
                                        >
                                            {isCall ? 'C' : 'P'}
                                        </span>
                                    </td>

                                    {/* Expiry */}
                                    <td className="py-2 px-2.5 font-semibold text-white whitespace-nowrap">
                                        {item.expiry}
                                    </td>

                                    {/* DTE */}
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.dte}
                                    </td>

                                    {/* Strike */}
                                    <td className="py-2 px-2.5 font-bold text-white">
                                        {item.strike.toLocaleString()}
                                    </td>

                                    {/* Spot % */}
                                    <td className={`py-2 px-2.5 font-semibold ${spotPctPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {spotPctPos ? '+' : ''}{item.spotPct.toFixed(2)}%
                                    </td>

                                    {/* Gamma */}
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.gamma > 0 ? item.gamma.toFixed(6) : item.gamma.toFixed(6)}
                                    </td>

                                    {/* GEX (USD) */}
                                    <td className={`py-2 px-2.5 font-bold ${item.gex >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formatGex(item.gex)}
                                    </td>

                                    {/* Vanna (USD) */}
                                    <td className={`py-2 px-2.5 ${item.vanna >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formatGex(item.vanna)}
                                    </td>

                                    {/* Charm (USD/Day) */}
                                    <td className={`py-2 px-2.5 ${item.charm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formatGex(item.charm)}
                                    </td>

                                    {/* IV */}
                                    <td className="py-2 px-2.5 text-zinc-200">
                                        {item.iv.toFixed(1)}%
                                    </td>

                                    {/* IV %ile */}
                                    <td className="py-2 px-2.5 text-zinc-400">
                                        {item.ivPercentile}%
                                    </td>

                                    {/* OI (BTC) */}
                                    <td className="py-2 px-2.5 text-zinc-200">
                                        {item.oiBtc.toLocaleString()}
                                    </td>

                                    {/* OI (USD) */}
                                    <td className="py-2 px-2.5 font-semibold text-white">
                                        ${(item.oiUsd / 1e9).toFixed(2)}B
                                    </td>

                                    {/* Delta */}
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.delta > 0 ? `+${item.delta.toFixed(2)}` : item.delta.toFixed(2)}
                                    </td>

                                    {/* Volume 24H */}
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.volume24h.toLocaleString()}
                                    </td>

                                    {/* Confluence */}
                                    <td className="py-2 px-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getBadgeStyle(item.confluenceBadge)}`}>
                                                {item.confluenceBadge}
                                            </span>
                                            {item.confluenceTag !== item.confluenceBadge && (
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getBadgeStyle(item.confluenceTag)}`}>
                                                    {item.confluenceTag}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
