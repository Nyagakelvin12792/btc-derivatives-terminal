'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ConfluenceLevelItem, SelectedAnalyticalState } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface ConfluenceLevelsTableProps {
    levels: ConfluenceLevelItem[];
    selectedState?: SelectedAnalyticalState;
    onSelectLevel?: (item: ConfluenceLevelItem) => void;
}

type SortField = 'level' | 'strike' | 'gex' | 'vanna' | 'charm' | 'confluenceScore';

export default function ConfluenceLevelsTable({
    levels,
    selectedState,
    onSelectLevel,
}: ConfluenceLevelsTableProps) {
    const [sortField, setSortField] = useState<SortField>('confluenceScore');
    const [sortAsc, setSortAsc] = useState(false);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(false);
        }
    };

    const sortedLevels = useMemo(() => {
        return [...levels].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            if (typeof valA === 'string') {
                return sortAsc ? valA.localeCompare(String(valB)) : String(valB).localeCompare(valA);
            }
            return sortAsc ? (Number(valA) - Number(valB)) : (Number(valB) - Number(valA));
        });
    }, [levels, sortField, sortAsc]);

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

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) return <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />;
        return sortAsc ? <ArrowUp className="w-2.5 h-2.5 text-cyan-400" /> : <ArrowDown className="w-2.5 h-2.5 text-cyan-400" />;
    };

    return (
        <div className="w-full h-full rounded-xl bg-[#080d16] border border-[#151f30] p-3 flex flex-col justify-between select-none shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#151f30]">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                    4. CONFLUENCE LEVELS
                </h3>
                <span className="text-[9px] font-mono text-zinc-400">Click to highlight on 3D terrain</span>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-x-auto my-1">
                <table className="w-full text-left font-mono text-[10px]">
                    <thead>
                        <tr className="border-b border-[#151f30] text-zinc-400">
                            <th onClick={() => handleSort('level')} className="pb-1.5 font-semibold cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Level {renderSortIcon('level')}</div>
                            </th>
                            <th onClick={() => handleSort('strike')} className="pb-1.5 font-semibold cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Strike {renderSortIcon('strike')}</div>
                            </th>
                            <th onClick={() => handleSort('gex')} className="pb-1.5 font-semibold cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">GEX {renderSortIcon('gex')}</div>
                            </th>
                            <th onClick={() => handleSort('vanna')} className="pb-1.5 font-semibold cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Vanna {renderSortIcon('vanna')}</div>
                            </th>
                            <th onClick={() => handleSort('charm')} className="pb-1.5 font-semibold cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Charm {renderSortIcon('charm')}</div>
                            </th>
                            <th className="pb-1.5 font-semibold">Wall Type</th>
                            <th onClick={() => handleSort('confluenceScore')} className="pb-1.5 font-semibold text-right cursor-pointer hover:text-white">
                                <div className="flex items-center justify-end gap-1">Confluence {renderSortIcon('confluenceScore')}</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151f30]/60">
                        {sortedLevels.map((item) => {
                            const isSelected = selectedState?.strike === item.strike;

                            return (
                                <tr
                                    key={item.id}
                                    onClick={() => onSelectLevel?.(item)}
                                    className={`transition-colors cursor-pointer ${
                                        isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : 'hover:bg-[#0c1422]'
                                    }`}
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
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
