'use client';

import React, { useState, useMemo } from 'react';
import {
    TerrainConfluenceLevel,
    TerrainKeyContract,
    IntensityBand,
    DealerBehaviorZone,
} from '@/lib/terrain/types';
import { formatGex, formatUsd } from '@/lib/dashboard/adapters';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, ShieldCheck, Zap } from 'lucide-react';

interface ConfluenceTableProps {
    data: TerrainConfluenceLevel[];
    selectedStrike: number | null;
    onSelectStrike: (strike: number) => void;
}

export function ConfluenceTable({ data, selectedStrike, onSelectStrike }: ConfluenceTableProps) {
    const [sortKey, setSortKey] = useState<keyof TerrainConfluenceLevel>('confluenceScore');
    const [sortDesc, setSortDesc] = useState<boolean>(true);

    const handleSort = (key: keyof TerrainConfluenceLevel) => {
        if (sortKey === key) {
            setSortDesc(!sortDesc);
        } else {
            setSortKey(key);
            setSortDesc(true);
        }
    };

    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => {
            const valA = a[sortKey] ?? 0;
            const valB = b[sortKey] ?? 0;
            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    }, [data, sortKey, sortDesc]);

    return (
        <div className="rounded-xl bg-[#080d16] border border-[#151f30] overflow-hidden shadow-xl font-mono text-[11px] select-none">
            <div className="px-4 py-2.5 bg-[#0c1422] border-b border-[#151f30] flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-cyan-400" /> High Dealer Confluence Levels
                </span>
                <span className="text-[10px] text-zinc-400">Click a row to align 3D terrain</span>
            </div>

            <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-left">
                    <thead className="bg-[#0e1726] text-zinc-400 sticky top-0 border-b border-[#151f30] text-[10px]">
                        <tr>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('strike')}>
                                <div className="flex items-center gap-1">
                                    Strike {sortKey === 'strike' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('confluenceScore')}>
                                <div className="flex items-center gap-1">
                                    Score {sortKey === 'confluenceScore' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2">Behavior Zone</th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('gexExposure')}>
                                <div className="flex items-center gap-1">
                                    GEX {sortKey === 'gexExposure' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('vannaExposure')}>
                                <div className="flex items-center gap-1">
                                    Vanna {sortKey === 'vannaExposure' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('charmExposure')}>
                                <div className="flex items-center gap-1">
                                    Charm/d {sortKey === 'charmExposure' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('openInterestBtc')}>
                                <div className="flex items-center gap-1">
                                    OI (BTC) {sortKey === 'openInterestBtc' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151f30]/60">
                        {sortedData.map((row, idx) => {
                            const isSelected = selectedStrike === row.strike;
                            const score = row.confluenceScore;
                            const badgeColor =
                                score >= 80 ? 'bg-amber-950 text-amber-300 border-amber-500/50'
                                : score >= 60 ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                                : score >= 40 ? 'bg-indigo-950 text-indigo-300 border-indigo-500/50'
                                : 'bg-zinc-900 text-zinc-400 border-zinc-700';

                            return (
                                <tr
                                    key={idx}
                                    onClick={() => onSelectStrike(row.strike)}
                                    className={`cursor-pointer transition-colors ${
                                        isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : 'hover:bg-[#0d1624]'
                                    }`}
                                >
                                    <td className="px-3 py-2 font-bold text-white">${row.strike.toLocaleString()}</td>
                                    <td className="px-3 py-2">
                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${badgeColor}`}>
                                            {score} / 100
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-[10px] text-zinc-300 font-semibold">
                                        {row.behaviorZone?.replace('_', ' ')}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`font-bold ${row.gexExposure >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {formatGex(row.gexExposure)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-purple-400 font-bold">{formatGex(row.vannaExposure)}</td>
                                    <td className="px-3 py-2 text-amber-400 font-bold">{formatGex(row.charmExposure)}/d</td>
                                    <td className="px-3 py-2 text-zinc-300">{row.openInterestBtc?.toLocaleString()} BTC</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface ContractsTableProps {
    data: TerrainKeyContract[];
    selectedStrike: number | null;
    onSelectStrike: (strike: number) => void;
}

export function ContractsTable({ data, selectedStrike, onSelectStrike }: ContractsTableProps) {
    const [sortKey, setSortKey] = useState<keyof TerrainKeyContract>('openInterest');
    const [sortDesc, setSortDesc] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'call' | 'put'>('all');

    const handleSort = (key: keyof TerrainKeyContract) => {
        if (sortKey === key) {
            setSortDesc(!sortDesc);
        } else {
            setSortKey(key);
            setSortDesc(true);
        }
    };

    const filteredData = useMemo(() => {
        return data.filter((item) => {
            if (typeFilter !== 'all' && item.type !== typeFilter) return false;
            if (searchQuery && !item.instrument?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [data, typeFilter, searchQuery]);

    const sortedData = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            const valA = a[sortKey] ?? 0;
            const valB = b[sortKey] ?? 0;
            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    }, [filteredData, sortKey, sortDesc]);

    return (
        <div className="rounded-xl bg-[#080d16] border border-[#151f30] overflow-hidden shadow-xl font-mono text-[11px] select-none">
            {/* Table Controls */}
            <div className="px-4 py-2.5 bg-[#0c1422] border-b border-[#151f30] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" /> Key Option Contracts
                    </span>
                    <span className="text-[10px] text-zinc-400">({sortedData.length} records)</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Search Filter */}
                    <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5" />
                        <input
                            type="text"
                            placeholder="Filter contracts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 pr-3 py-1 rounded-lg bg-[#070b12] border border-[#1a273b] text-white text-[11px] font-mono focus:outline-none focus:border-cyan-500 w-36 sm:w-44"
                        />
                    </div>

                    {/* Option Type Filter */}
                    <div className="flex items-center bg-[#070b12] rounded-lg border border-[#1a273b] p-0.5 text-[10px]">
                        <button
                            onClick={() => setTypeFilter('all')}
                            className={`px-2 py-0.5 rounded font-bold transition-all ${
                                typeFilter === 'all' ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            ALL
                        </button>
                        <button
                            onClick={() => setTypeFilter('call')}
                            className={`px-2 py-0.5 rounded font-bold transition-all ${
                                typeFilter === 'call' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            CALLS
                        </button>
                        <button
                            onClick={() => setTypeFilter('put')}
                            className={`px-2 py-0.5 rounded font-bold transition-all ${
                                typeFilter === 'put' ? 'bg-rose-950 text-rose-300 border border-rose-500/40' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            PUTS
                        </button>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-left">
                    <thead className="bg-[#0e1726] text-zinc-400 sticky top-0 border-b border-[#151f30] text-[10px]">
                        <tr>
                            <th className="px-3 py-2">Instrument</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('strike')}>
                                <div className="flex items-center gap-1">
                                    Strike {sortKey === 'strike' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('dte')}>
                                <div className="flex items-center gap-1">
                                    DTE {sortKey === 'dte' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2">IV</th>
                            <th className="px-3 py-2">Delta</th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('openInterest')}>
                                <div className="flex items-center gap-1">
                                    OI (BTC) {sortKey === 'openInterest' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleSort('gexExposure')}>
                                <div className="flex items-center gap-1">
                                    GEX Exposure {sortKey === 'gexExposure' ? (sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />) : <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151f30]/60">
                        {sortedData.map((row, idx) => {
                            const isSelected = selectedStrike === row.strike;
                            const isCall = row.type === 'call';
                            const gex = row.gexExposure ?? row.gex ?? 0;
                            const delta = row.delta ?? row.rawDelta;

                            return (
                                <tr
                                    key={idx}
                                    onClick={() => onSelectStrike(row.strike)}
                                    className={`cursor-pointer transition-colors ${
                                        isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : 'hover:bg-[#0d1624]'
                                    }`}
                                >
                                    <td className="px-3 py-2 font-bold text-white">{row.instrument}</td>
                                    <td className="px-3 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                            isCall ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                                        }`}>
                                            {isCall ? 'CALL' : 'PUT'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">${row.strike.toLocaleString()}</td>
                                    <td className="px-3 py-2">{row.dte}d</td>
                                    <td className="px-3 py-2">{row.iv?.toFixed(1)}%</td>
                                    <td className="px-3 py-2">{delta !== undefined && delta !== null ? delta.toFixed(2) : 'N/A'}</td>
                                    <td className="px-3 py-2 font-bold text-white">
                                        {(row.openInterestBtc || row.openInterest)?.toLocaleString()} BTC
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`font-bold ${gex >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {formatGex(gex)}
                                        </span>
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
