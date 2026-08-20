'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { TerrainGridCell, SelectedAnalyticalState, ExposureScales } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface GexHeatmapProps {
    surfaceGrid: TerrainGridCell[][];
    strikes: number[];
    dtes: number[];
    spotPrice: number;
    scales?: ExposureScales;
    selectedState?: SelectedAnalyticalState;
    onSelectCell?: (cell: TerrainGridCell) => void;
}

export default function GexHeatmap({
    surfaceGrid,
    strikes,
    dtes,
    spotPrice,
    scales,
    selectedState,
    onSelectCell,
}: GexHeatmapProps) {
    const GEX_MAX = scales?.gexMax || 8e9;

    const getHeatmapColor = (gex: number) => {
        if (gex >= 0) {
            const alpha = Math.min(1, Math.max(0.12, gex / GEX_MAX));
            return `rgba(0, 230, 118, ${alpha})`;
        } else {
            const alpha = Math.min(1, Math.max(0.12, Math.abs(gex) / GEX_MAX));
            return `rgba(255, 23, 68, ${alpha})`;
        }
    };

    const minStrike = strikes[0] || 58000;
    const maxStrike = strikes[strikes.length - 1] || 78000;
    const spotNormalizedPct = Math.max(0, Math.min(100, ((spotPrice - minStrike) / (maxStrike - minStrike)) * 100));

    return (
        <div className="w-full h-full rounded-xl bg-[#080d16] border border-[#151f30] p-3 flex flex-col justify-between select-none shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#151f30]">
                <div className="flex items-center gap-1.5">
                    <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                        1. GEX HEATMAP (USD)
                    </h3>
                    <Info className="w-3 h-3 text-zinc-400 cursor-pointer hover:text-cyan-400" />
                </div>
                <span className="text-[9px] font-mono text-zinc-400">Click cell to sync 3D</span>
            </div>

            {/* Matrix Heatmap Grid */}
            <div className="relative flex-1 my-1.5 flex flex-col justify-between">
                {/* Y-axis Label */}
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[8px] font-mono text-zinc-400 tracking-wider">
                    DAYS TO EXPIRY
                </div>

                <div className="pl-4 flex-1 flex flex-col justify-between relative">
                    <div className="flex-1 flex flex-col-reverse justify-between gap-[2px]">
                        {surfaceGrid.map((row, rowIdx) => (
                            <div key={rowIdx} className="flex-1 flex items-center gap-[2px]">
                                <span className="w-5 text-[9px] font-mono text-zinc-400 text-right pr-1 shrink-0">
                                    {dtes[rowIdx]}
                                </span>

                                <div className="flex-1 h-full flex items-center gap-[2px]">
                                    {row.map((cell, cellIdx) => {
                                        const isSelected = selectedState?.strike === cell.strike;

                                        return (
                                            <div
                                                key={cellIdx}
                                                onClick={() => onSelectCell?.(cell)}
                                                className={`flex-1 h-full rounded-[2px] transition-all hover:scale-110 hover:z-20 cursor-pointer ${
                                                    isSelected ? 'ring-1 ring-cyan-400 scale-105 z-10' : ''
                                                }`}
                                                style={{
                                                    backgroundColor: getHeatmapColor(cell.gex),
                                                }}
                                                title={`Strike: $${cell.strike.toLocaleString()} | DTE: ${cell.dte}d | GEX: ${formatGex(cell.gex)} | Vanna: ${formatGex(cell.vanna)} | Charm: ${formatGex(cell.charm)}`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Spot Vertical Line */}
                    <div
                        className="absolute top-0 bottom-0 pointer-events-none z-10 flex flex-col items-center"
                        style={{ left: `calc(24px + (100% - 24px) * ${spotNormalizedPct / 100})` }}
                    >
                        <div className="w-[1px] h-full border-r border-dashed border-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    </div>
                </div>

                {/* X-axis Strike Ticks */}
                <div className="pl-9 flex justify-between text-[8px] font-mono text-zinc-400 pt-1">
                    {strikes.map((s, idx) => (
                        <span key={idx}>{Math.round(s / 1000)}K</span>
                    ))}
                </div>
            </div>

            {/* Scale Bar */}
            <div className="pt-1.5 border-t border-[#151f30] flex items-center justify-between text-[8px] font-mono">
                <span className="text-rose-400">-{formatGex(GEX_MAX)}</span>
                <div className="w-24 h-1.5 rounded-full bg-gradient-to-r from-rose-500 via-[#1a2638] to-emerald-400" />
                <span className="text-emerald-400">+{formatGex(GEX_MAX)}</span>
            </div>
        </div>
    );
}
