'use client';

import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { TerrainGridCell } from '@/lib/dashboard/types';

interface StrikeSliceChartProps {
    surfaceGrid: TerrainGridCell[][];
    strikes: number[];
    spotPrice: number;
}

export default function StrikeSliceChart({ surfaceGrid, strikes, spotPrice }: StrikeSliceChartProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // Aggregate exposure across expiries for each strike (or take near-term slice)
    const aggregatedData = strikes.map((strike, sIdx) => {
        let totalGex = 0;
        let totalVanna = 0;
        let totalCharm = 0;

        surfaceGrid.forEach((row) => {
            if (row[sIdx]) {
                totalGex += row[sIdx].gex;
                totalVanna += row[sIdx].vanna;
                totalCharm += row[sIdx].charm;
            }
        });

        return {
            strike,
            gex: totalGex / surfaceGrid.length,
            vanna: totalVanna / surfaceGrid.length,
            charm: (totalCharm / surfaceGrid.length) * 3, // scale for readability
        };
    });

    const GEX_MAX = 8e9;
    const CHART_HEIGHT = 100;
    const CHART_WIDTH = 260;

    // Convert value to SVG Y
    const valToY = (val: number) => {
        const norm = val / GEX_MAX;
        return CHART_HEIGHT / 2 - norm * (CHART_HEIGHT / 2 - 8);
    };

    // Convert strike index to SVG X
    const idxToX = (idx: number) => {
        return (idx / (strikes.length - 1)) * (CHART_WIDTH - 20) + 10;
    };

    // Build SVG paths
    const gexPath = aggregatedData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.gex)}`).join(' ');
    const vannaPath = aggregatedData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.vanna)}`).join(' ');
    const charmPath = aggregatedData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.charm)}`).join(' ');

    // Spot X position
    const minStrike = strikes[0] || 58000;
    const maxStrike = strikes[strikes.length - 1] || 78000;
    const spotX = ((spotPrice - minStrike) / (maxStrike - minStrike)) * (CHART_WIDTH - 20) + 10;

    return (
        <div className="w-full h-full rounded-xl bg-[#080d16] border border-[#151f30] p-3 flex flex-col justify-between select-none shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#151f30]">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                    2. STRIKE SLICE @ SPOT ({spotPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })})
                </h3>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[9px] font-mono">
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> GEX
                        </span>
                        <span className="flex items-center gap-1 text-purple-400 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Vanna
                        </span>
                        <span className="flex items-center gap-1 text-amber-400 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Charm
                        </span>
                    </div>
                    <Maximize2 className="w-3 h-3 text-zinc-400 cursor-pointer hover:text-cyan-400" />
                </div>
            </div>

            {/* SVG Multi-curve Chart */}
            <div className="relative flex-1 my-1 flex flex-col justify-between">
                {/* Y-axis Label */}
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[8px] font-mono text-zinc-400 tracking-wider">
                    EXPOSURE (USD)
                </div>

                <div className="pl-6 flex-1 flex items-center justify-between relative">
                    {/* Y-axis Ticks */}
                    <div className="flex flex-col justify-between h-full text-[8px] font-mono text-zinc-400 pr-1 py-1">
                        <span>8B</span>
                        <span>4B</span>
                        <span>0</span>
                        <span>-4B</span>
                        <span>-8B</span>
                    </div>

                    {/* Chart Canvas Area */}
                    <div className="flex-1 h-full relative">
                        <svg
                            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                            className="w-full h-full overflow-visible"
                            preserveAspectRatio="none"
                        >
                            {/* Zero line */}
                            <line
                                x1="0"
                                y1={CHART_HEIGHT / 2}
                                x2={CHART_WIDTH}
                                y2={CHART_HEIGHT / 2}
                                stroke="#1e293b"
                                strokeDasharray="3 3"
                                strokeWidth="1"
                            />

                            {/* Spot vertical indicator */}
                            <line
                                x1={spotX}
                                y1="0"
                                x2={spotX}
                                y2={CHART_HEIGHT}
                                stroke="#ffffff"
                                strokeDasharray="3 3"
                                strokeWidth="1.5"
                            />

                            {/* Vanna Curve (Purple) */}
                            <path d={vannaPath} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />

                            {/* Charm Curve (Orange) */}
                            <path d={charmPath} fill="none" stroke="#ff9100" strokeWidth="2" strokeLinecap="round" />

                            {/* GEX Curve (Emerald Green) */}
                            <path d={gexPath} fill="none" stroke="#00e676" strokeWidth="2.5" strokeLinecap="round" />

                            {/* Data points */}
                            {aggregatedData.map((d, i) => (
                                <g key={i}>
                                    <circle cx={idxToX(i)} cy={valToY(d.gex)} r="2.5" fill="#00e676" />
                                    <circle cx={idxToX(i)} cy={valToY(d.vanna)} r="2" fill="#c084fc" />
                                    <circle cx={idxToX(i)} cy={valToY(d.charm)} r="2" fill="#ff9100" />
                                </g>
                            ))}
                        </svg>
                    </div>
                </div>

                {/* X-axis Strike Ticks */}
                <div className="pl-10 flex justify-between text-[8px] font-mono text-zinc-400 pt-1">
                    {strikes.map((s, idx) => (
                        <span key={idx}>{Math.round(s / 1000)}K</span>
                    ))}
                </div>
            </div>

            {/* Bottom Axis Title */}
            <div className="text-center text-[8px] font-mono text-zinc-400 pt-1 border-t border-[#151f30]">
                STRIKE PRICE (USD)
            </div>
        </div>
    );
}
