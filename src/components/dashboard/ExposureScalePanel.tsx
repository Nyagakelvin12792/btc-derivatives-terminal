'use client';

import React from 'react';
import { ExposureScales } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface ExposureScalePanelProps {
    scales: ExposureScales;
}

export default function ExposureScalePanel({ scales }: ExposureScalePanelProps) {
    const intensityBands = [
        { name: 'EXTREME', range: '75-100%', color: 'text-white' },
        { name: 'HIGH', range: '50-74%', color: 'text-zinc-300' },
        { name: 'MED', range: '25-49%', color: 'text-zinc-400' },
        { name: 'LOW', range: '0-24%', color: 'text-zinc-400' },
    ];

    return (
        <div className="bg-[#0c1422]/95 backdrop-blur-md px-3.5 py-3 rounded-lg border border-[#1a273b] shadow-xl pointer-events-auto space-y-3 font-mono text-[9px] select-none">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                <span className="text-zinc-300 font-bold uppercase tracking-wider text-[10px]">
                    DEALER EXPOSURE SCALES
                </span>
                <span className="text-[8px] text-zinc-400">DATASET-NORMALIZED</span>
            </div>

            {/* Scale 1: GEX EXPOSURE */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400">GEX EXPOSURE</span>
                    <span className="text-zinc-400 text-[8px]">{scales.gexUnit}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-12 rounded-full bg-gradient-to-b from-[#00e676] via-[#1a2638] to-[#ff1744]" />
                    <div className="flex flex-col justify-between h-12 text-[8px] font-bold">
                        <span className="text-emerald-400">+{formatGex(scales.gexMax)}</span>
                        <span className="text-zinc-400">0</span>
                        <span className="text-rose-400">-{formatGex(scales.gexMax)}</span>
                    </div>
                    <div className="flex flex-col justify-between h-12 text-[7px] text-zinc-400 pl-1 border-l border-zinc-800">
                        {intensityBands.map((b, i) => (
                            <span key={i} className={b.color}>{b.name}</span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="w-full h-[1px] bg-zinc-800/80" />

            {/* Scale 2: VANNA EXPOSURE */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-400">VANNA EXPOSURE</span>
                    <span className="text-zinc-400 text-[8px]">{scales.vannaUnit}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-10 rounded-full bg-gradient-to-b from-[#c084fc] via-[#1a2638] to-[#6366f1]" />
                    <div className="flex flex-col justify-between h-10 text-[8px] font-bold">
                        <span className="text-purple-400">+{formatGex(scales.vannaMax)}</span>
                        <span className="text-zinc-400">0</span>
                        <span className="text-indigo-400">-{formatGex(scales.vannaMax)}</span>
                    </div>
                </div>
            </div>

            <div className="w-full h-[1px] bg-zinc-800/80" />

            {/* Scale 3: CHARM EXPOSURE */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-400">CHARM EXPOSURE</span>
                    <span className="text-zinc-400 text-[8px]">{scales.charmUnit}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-10 rounded-full bg-gradient-to-b from-[#ff9100] via-[#1a2638] to-[#d97706]" />
                    <div className="flex flex-col justify-between h-10 text-[8px] font-bold">
                        <span className="text-amber-400">+{formatGex(scales.charmMax)}</span>
                        <span className="text-zinc-400">0</span>
                        <span className="text-amber-600">-{formatGex(scales.charmMax)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
