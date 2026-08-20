'use client';

import React from 'react';
import { ConfluenceLevelItem } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface ConfluenceLevelsTableProps {
    levels: ConfluenceLevelItem[];
    onSelectLevel?: (item: ConfluenceLevelItem) => void;
}

export default function ConfluenceLevelsTable({ levels, onSelectLevel }: ConfluenceLevelsTableProps) {
    const getTagBadgeStyle = (tag: string) => {
        switch (tag) {
            case 'High Confluence':
                return 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40';
            case 'Dealer Support Zone':
                return 'bg-amber-950/80 text-amber-400 border-amber-500/40';
            case 'Regime Transition':
                return 'bg-purple-950/80 text-purple-400 border-purple-500/40';
            case 'Gamma Flip Zone':
                return 'bg-cyan-950/80 text-cyan-400 border-cyan-500/40';
            default:
                return 'bg-zinc-900 text-zinc-400 border-zinc-700';
        }
    };

    const getWallTypeColor = (type: string) => {
        switch (type) {
            case 'CALL WALL':
                return 'text-emerald-400';
            case 'PUT WALL':
                return 'text-rose-400';
            case 'FLIP LEVEL':
                return 'text-cyan-400';
            case 'MAX PAIN':
                return 'text-amber-400';
            case 'SUPPORT':
                return 'text-emerald-300';
            case 'RESISTANCE':
                return 'text-rose-300';
            default:
                return 'text-zinc-300';
        }
    };

    return (
        <div className="w-full h-full rounded-xl bg-[#080d16] border border-[#151f30] p-3 flex flex-col justify-between select-none shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#151f30]">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                    4. CONFLUENCE LEVELS
                </h3>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-x-auto my-1">
                <table className="w-full text-left font-mono text-[10px]">
                    <thead>
                        <tr className="border-b border-[#151f30] text-zinc-400">
                            <th className="pb-1.5 font-semibold">Level</th>
                            <th className="pb-1.5 font-semibold">Strike</th>
                            <th className="pb-1.5 font-semibold">GEX</th>
                            <th className="pb-1.5 font-semibold">Vanna</th>
                            <th className="pb-1.5 font-semibold">Charm</th>
                            <th className="pb-1.5 font-semibold">Wall Type</th>
                            <th className="pb-1.5 font-semibold text-right">Confluence Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151f30]/60">
                        {levels.map((item) => (
                            <tr
                                key={item.id}
                                onClick={() => onSelectLevel?.(item)}
                                className="hover:bg-[#0c1422] transition-colors cursor-pointer"
                            >
                                <td className="py-1 font-bold text-white whitespace-nowrap">
                                    {item.level}
                                </td>
                                <td className="py-1 text-zinc-200">
                                    {item.strike.toLocaleString()}
                                </td>
                                <td className={`py-1 font-bold ${item.gex >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatGex(item.gex)}
                                </td>
                                <td className={`py-1 ${item.vanna >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatGex(item.vanna)}
                                </td>
                                <td className={`py-1 ${item.charm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatGex(item.charm)}
                                </td>
                                <td className={`py-1 font-bold ${getWallTypeColor(item.wallType)}`}>
                                    {item.wallType}
                                </td>
                                <td className="py-1 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <span className="font-bold text-white">{item.confluenceScore}</span>
                                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${getTagBadgeStyle(item.tag)}`}>
                                            {item.tag}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
