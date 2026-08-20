'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Filter } from 'lucide-react';
import { KeyContractItem, SelectedAnalyticalState } from '@/lib/dashboard/types';
import { formatGex, formatUsd } from '@/lib/dashboard/adapters';

interface KeyContractsTableProps {
    contracts: KeyContractItem[];
    selectedState?: SelectedAnalyticalState;
    onSelectContract?: (contract: KeyContractItem) => void;
}

type SortField = 'type' | 'expiry' | 'dte' | 'strike' | 'spotPct' | 'gamma' | 'gex' | 'vanna' | 'charm' | 'iv' | 'oiBtc' | 'delta' | 'volume24h';

export default function KeyContractsTable({
    contracts,
    selectedState,
    onSelectContract,
}: KeyContractsTableProps) {
    const [sortField, setSortField] = useState<SortField>('gex');
    const [sortAsc, setSortAsc] = useState(false);
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(false);
        }
    };

    const filteredAndSorted = useMemo(() => {
        return contracts
            .filter((c) => {
                if (typeFilter === 'CALL' && c.type !== 'call') return false;
                if (typeFilter === 'PUT' && c.type !== 'put') return false;
                if (searchTerm) {
                    const term = searchTerm.toLowerCase();
                    return (
                        c.instrument.toLowerCase().includes(term) ||
                        c.expiry.toLowerCase().includes(term) ||
                        String(c.strike).includes(term)
                    );
                }
                return true;
            })
            .sort((a, b) => {
                let valA = a[sortField];
                let valB = b[sortField];

                if (typeof valA === 'string') {
                    return sortAsc ? valA.localeCompare(String(valB)) : String(valB).localeCompare(valA);
                }
                return sortAsc ? (Number(valA) - Number(valB)) : (Number(valB) - Number(valA));
            });
    }, [contracts, sortField, sortAsc, typeFilter, searchTerm]);

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

    const renderSort = (field: SortField) => {
        if (sortField !== field) return <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />;
        return sortAsc ? <ArrowUp className="w-2.5 h-2.5 text-cyan-400" /> : <ArrowDown className="w-2.5 h-2.5 text-cyan-400" />;
    };

    return (
        <div className="w-full rounded-xl bg-[#080d16] border border-[#151f30] p-3.5 select-none shadow-2xl">
            {/* Header with Search & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#151f30] mb-2 gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                        5. KEY CONTRACTS <span className="text-zinc-400 font-normal">(TOP EXPOSURE)</span>
                    </h3>
                    <span className="text-[10px] font-mono text-zinc-400">
                        ({filteredAndSorted.length} matching)
                    </span>
                </div>

                {/* Filter Pills & Search Box */}
                <div className="flex items-center gap-3 font-mono text-[10px]">
                    {/* Search */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0c1422] border border-[#1a273b]">
                        <Search className="w-3 h-3 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Filter strike/expiry..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none outline-hidden text-zinc-200 placeholder-zinc-500 text-[10px] w-28"
                        />
                    </div>

                    {/* Option Type Filter Pills */}
                    <div className="flex items-center bg-[#0c1422] p-0.5 rounded border border-[#1a273b]">
                        <button
                            onClick={() => setTypeFilter('ALL')}
                            className={`px-2 py-0.5 rounded font-bold transition-colors ${
                                typeFilter === 'ALL' ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/40' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            ALL
                        </button>
                        <button
                            onClick={() => setTypeFilter('CALL')}
                            className={`px-2 py-0.5 rounded font-bold transition-colors ${
                                typeFilter === 'CALL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            CALLS
                        </button>
                        <button
                            onClick={() => setTypeFilter('PUT')}
                            className={`px-2 py-0.5 rounded font-bold transition-colors ${
                                typeFilter === 'PUT' ? 'bg-rose-950 text-rose-400 border border-rose-500/40' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            PUTS
                        </button>
                    </div>
                </div>
            </div>

            {/* Dense Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                    <thead>
                        <tr className="border-b border-[#151f30] text-zinc-400 bg-[#0c1422]/50">
                            <th onClick={() => handleSort('type')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Type {renderSort('type')}</div>
                            </th>
                            <th onClick={() => handleSort('expiry')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Expiry {renderSort('expiry')}</div>
                            </th>
                            <th onClick={() => handleSort('dte')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">DTE {renderSort('dte')}</div>
                            </th>
                            <th onClick={() => handleSort('strike')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Strike {renderSort('strike')}</div>
                            </th>
                            <th onClick={() => handleSort('spotPct')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Spot % {renderSort('spotPct')}</div>
                            </th>
                            <th onClick={() => handleSort('gamma')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Gamma {renderSort('gamma')}</div>
                            </th>
                            <th onClick={() => handleSort('gex')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">GEX (USD) {renderSort('gex')}</div>
                            </th>
                            <th onClick={() => handleSort('vanna')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Vanna {renderSort('vanna')}</div>
                            </th>
                            <th onClick={() => handleSort('charm')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Charm {renderSort('charm')}</div>
                            </th>
                            <th onClick={() => handleSort('iv')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">IV {renderSort('iv')}</div>
                            </th>
                            <th className="py-2 px-2.5">IV %ile</th>
                            <th onClick={() => handleSort('oiBtc')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">OI (BTC) {renderSort('oiBtc')}</div>
                            </th>
                            <th className="py-2 px-2.5">OI (USD)</th>
                            <th onClick={() => handleSort('delta')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Δ (Delta) {renderSort('delta')}</div>
                            </th>
                            <th onClick={() => handleSort('volume24h')} className="py-2 px-2.5 cursor-pointer hover:text-white">
                                <div className="flex items-center gap-1">Volume {renderSort('volume24h')}</div>
                            </th>
                            <th className="py-2 px-2.5 text-right">Confluence</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151f30]/60">
                        {filteredAndSorted.map((item, idx) => {
                            const isCall = item.type === 'call';
                            const spotPctPos = item.spotPct >= 0;
                            const isSelected = selectedState?.strike === item.strike;

                            return (
                                <tr
                                    key={idx}
                                    onClick={() => onSelectContract?.(item)}
                                    className={`transition-colors cursor-pointer ${
                                        isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : 'hover:bg-[#0c1422]'
                                    }`}
                                >
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
                                    <td className="py-2 px-2.5 font-semibold text-white whitespace-nowrap">
                                        {item.expiry}
                                    </td>
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.dte}d
                                    </td>
                                    <td className="py-2 px-2.5 font-bold text-white">
                                        {item.strike.toLocaleString()}
                                    </td>
                                    <td className={`py-2 px-2.5 font-semibold ${spotPctPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {spotPctPos ? '+' : ''}{item.spotPct.toFixed(2)}%
                                    </td>
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.gamma > 0 ? `+${item.gamma.toFixed(6)}` : item.gamma.toFixed(6)}
                                    </td>
                                    <td className={`py-2 px-2.5 font-bold ${item.gex >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formatGex(item.gex)}
                                    </td>
                                    <td className={`py-2 px-2.5 ${item.vanna >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formatGex(item.vanna)}
                                    </td>
                                    <td className={`py-2 px-2.5 ${item.charm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {formatGex(item.charm)}
                                    </td>
                                    <td className="py-2 px-2.5 text-zinc-200">
                                        {item.iv.toFixed(1)}%
                                    </td>
                                    <td className="py-2 px-2.5 text-zinc-400">
                                        {item.ivPercentile}%
                                    </td>
                                    <td className="py-2 px-2.5 text-zinc-200">
                                        {item.oiBtc.toLocaleString()}
                                    </td>
                                    <td className="py-2 px-2.5 font-semibold text-white">
                                        {item.oiUsd ? formatUsd(item.oiUsd) : 'N/A'}
                                    </td>
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.delta > 0 ? `+${item.delta.toFixed(2)}` : item.delta.toFixed(2)}
                                    </td>
                                    <td className="py-2 px-2.5 text-zinc-300">
                                        {item.volume24h.toLocaleString()}
                                    </td>
                                    <td className="py-2 px-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getBadgeStyle(item.confluenceBadge)}`}>
                                                {item.confluenceBadge}
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
