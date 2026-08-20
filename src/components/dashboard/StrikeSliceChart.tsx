'use client';

import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { TerrainGridCell, SelectedAnalyticalState, ExposureScales } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface StrikeSliceChartProps {
    surfaceGrid: TerrainGridCell[][];
    strikes: number[];
    spotPrice: number;
    scales?: ExposureScales;
    selectedState?: SelectedAnalyticalState;
    onSelectStrike?: (strike: number) => void;
}

export default function StrikeSliceChart({
    surfaceGrid,
    strikes,
    spotPrice,
    scales,
    selectedState,
    onSelectStrike,
}: StrikeSliceChartProps) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
            charm: totalCharm / surfaceGrid.length,
        };
    });

    const gexMax = scales?.gexMax || 8e9;
    const vannaMax = scales?.vannaMax || 1e9;
    const charmMax = scales?.charmMax || 5e8;

    const CHART_HEIGHT = 90;
    const CHART_WIDTH = 260;

    const valToY = (val: number, maxBound: number) => {
        const norm = Math.max(-1, Math.min(1, val / (maxBound || 1)));
        return CHART_HEIGHT / 2 - norm * (CHART_HEIGHT / 2 - 8);
    };

    const idxToX = (idx: number) => {
        return (idx / (strikes.length - 1)) * (CHART_WIDTH - 20) + 10;
    };

    const gexPath = aggregatedData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.gex, gexMax)}`).join(' ');
    const vannaPath = aggregatedData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.vanna, vannaMax)}`).join(' ');
    const charmPath = aggregatedData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.charm, charmMax)}`).join(' ');

    const minStrike = strikes[0] || 58000;
    const maxStrike = strikes[strikes.length - 1] || 78000;
    const spotX = ((spotPrice - minStrike) / (maxStrike - minStrike)) * (CHART_WIDTH - 20) + 10;

    const activeItem = hoverIdx !== null ? aggregatedData[hoverIdx] : selectedState?.strike ? aggregatedData.find(d => d.strike === selectedState.strike) : null;

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
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[8px] font-mono text-zinc-400 tracking-wider">
                    EXPOSURE
                </div>

                <div className="pl-6 flex-1 flex items-center justify-between relative">
                    <div className="flex flex-col justify-between h-full text-[8px] font-mono text-zinc-400 pr-1 py-1">
                        <span>+MAX</span>
                        <span>0</span>
                        <span>-MAX</span>
                    </div>

                    <div className="flex-1 h-full relative">
                        <svg
                            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                            className="w-full h-full overflow-visible cursor-crosshair"
                            preserveAspectRatio="none"
                        >
                            <line
                                x1="0"
                                y1={CHART_HEIGHT / 2}
                                x2={CHART_WIDTH}
                                y2={CHART_HEIGHT / 2}
                                stroke="#1e293b"
                                strokeDasharray="3 3"
                                strokeWidth="1"
                            />

                            <line
                                x1={spotX}
                                y1="0"
                                x2={spotX}
                                y2={CHART_HEIGHT}
                                stroke="#ffffff"
                                strokeDasharray="3 3"
                                strokeWidth="1.5"
                            />

                            <path d={vannaPath} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />
                            <path d={charmPath} fill="none" stroke="#ff9100" strokeWidth="2" strokeLinecap="round" />
                            <path d={gexPath} fill="none" stroke="#00e676" strokeWidth="2.5" strokeLinecap="round" />

                            {aggregatedData.map((d, i) => {
                                const isSel = selectedState?.strike === d.strike;
                                return (
                                    <g
                                        key={i}
                                        onClick={() => onSelectStrike?.(d.strike)}
                                        onMouseEnter={() => setHoverIdx(i)}
                                        onMouseLeave={() => setHoverIdx(null)}
                                        className="cursor-pointer"
                                    >
                                        {isSel && (
                                            <line
                                                x1={idxToX(i)}
                                                y1="0"
                                                x2={idxToX(i)}
                                                y2={CHART_HEIGHT}
                                                stroke="#00e5ff"
                                                strokeWidth="1.5"
                                            />
                                        )}
                                        <circle cx={idxToX(i)} cy={valToY(d.gex, gexMax)} r={isSel ? "4" : "2.5"} fill="#00e676" />
                                        <circle cx={idxToX(i)} cy={valToY(d.vanna, vannaMax)} r="2" fill="#c084fc" />
                                        <circle cx={idxToX(i)} cy={valToY(d.charm, charmMax)} r="2" fill="#ff9100" />
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>

                <div className="pl-10 flex justify-between text-[8px] font-mono text-zinc-400 pt-1">
                    {strikes.map((s, idx) => (
                        <span key={idx}>{Math.round(s / 1000)}K</span>
                    ))}
                </div>
            </div>

            {/* Bottom Details / Dynamic Tooltip */}
            <div className="text-center text-[8px] font-mono text-zinc-400 pt-1 border-t border-[#151f30] flex items-center justify-between">
                <span>STRIKE PRICE (USD)</span>
                {activeItem && (
                    <span className="text-cyan-300 font-bold">
                        ${activeItem.strike.toLocaleString()}: GEX {formatGex(activeItem.gex)} | Vanna {formatGex(activeItem.vanna)} | Charm {formatGex(activeItem.charm)}
                    </span>
                )}
            </div>
        </div>
    );
}
