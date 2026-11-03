'use client';

import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { TerrainGridCell, SelectedAnalyticalState, ExposureScales } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface ExpirySliceChartProps {
    surfaceGrid: TerrainGridCell[][];
    dtes: number[];
    spotPrice: number;
    scales?: ExposureScales;
    selectedState?: SelectedAnalyticalState;
    onSelectDte?: (dte: number) => void;
}

export default function ExpirySliceChart({
    surfaceGrid,
    dtes,
    spotPrice,
    scales,
    selectedState,
    onSelectDte,
}: ExpirySliceChartProps) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const expirySliceData = surfaceGrid.map((row, rIdx) => {
        // Find cell closest to selected strike or spot
        const targetStrike = selectedState?.strike || spotPrice;
        let closestCell = row[0];
        let minDiff = Infinity;
        row.forEach((cell) => {
            const diff = Math.abs(cell.strike - targetStrike);
            if (diff < minDiff) {
                minDiff = diff;
                closestCell = cell;
            }
        });

        return {
            dte: dtes[rIdx] || closestCell.dte,
            expiry: closestCell.expiry,
            gex: closestCell.gex,
            vanna: closestCell.vanna,
            charm: closestCell.charm,
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
        return (idx / (dtes.length - 1)) * (CHART_WIDTH - 20) + 10;
    };

    const gexPath = expirySliceData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.gex, gexMax)}`).join(' ');
    const vannaPath = expirySliceData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.vanna, vannaMax)}`).join(' ');
    const charmPath = expirySliceData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(d.charm, charmMax)}`).join(' ');

    const activeItem = hoverIdx !== null ? expirySliceData[hoverIdx] : null;

    return (
        <div className="w-full h-full rounded-xl bg-[#080d16] border border-[#151f30] p-3 flex flex-col justify-between select-none shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#151f30]">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                    3. EXPIRY SLICE @ SPOT ({spotPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })})
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

                            <path d={vannaPath} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />
                            <path d={charmPath} fill="none" stroke="#ff9100" strokeWidth="2" strokeLinecap="round" />
                            <path d={gexPath} fill="none" stroke="#00e676" strokeWidth="2.5" strokeLinecap="round" />

                            {expirySliceData.map((d, i) => (
                                <g
                                    key={i}
                                    onClick={() => onSelectDte?.(d.dte)}
                                    onMouseEnter={() => setHoverIdx(i)}
                                    onMouseLeave={() => setHoverIdx(null)}
                                    className="cursor-pointer"
                                >
                                    <circle cx={idxToX(i)} cy={valToY(d.gex, gexMax)} r="2.5" fill="#00e676" />
                                    <circle cx={idxToX(i)} cy={valToY(d.vanna, vannaMax)} r="2" fill="#c084fc" />
                                    <circle cx={idxToX(i)} cy={valToY(d.charm, charmMax)} r="2" fill="#ff9100" />
                                </g>
                            ))}
                        </svg>
                    </div>
                </div>

                <div className="pl-10 flex justify-between text-[8px] font-mono text-zinc-400 pt-1">
                    {dtes.map((d, idx) => (
                        <span key={idx}>{d}</span>
                    ))}
                </div>
            </div>

            {/* Bottom Axis Title / Tooltip */}
            <div className="text-center text-[8px] font-mono text-zinc-400 pt-1 border-t border-[#151f30] flex items-center justify-between">
                <span>DAYS TO EXPIRY</span>
                {activeItem && (
                    <span className="text-cyan-300 font-bold">
                        {activeItem.dte}d: GEX {formatGex(activeItem.gex)} | Vanna {formatGex(activeItem.vanna)} | Charm {formatGex(activeItem.charm)}
                    </span>
                )}
            </div>
        </div>
    );
}
