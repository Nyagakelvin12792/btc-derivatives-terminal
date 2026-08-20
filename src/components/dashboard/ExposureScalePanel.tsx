'use client';

import React from 'react';
import { formatGex } from '@/lib/dashboard/adapters';

interface ExposureScalePanelProps {
    scales: any;
}

export default function ExposureScalePanel({ scales }: ExposureScalePanelProps) {
    const intensityBands = [
        { name: 'EXTREME', range: '75-100%', color: 'text-rose-400 font-bold' },
        { name: 'HIGH', range: '50-74%', color: 'text-amber-400 font-semibold' },
        { name: 'MEDIUM', range: '25-49%', color: 'text-zinc-300' },
        { name: 'LOW', range: '0-24%', color: 'text-zinc-400' },
    ];

    const gexMax = scales?.gex?.robustAbsMax || scales?.gex?.max || scales?.gexMax || 1e9;
    const vannaMax = scales?.vanna?.robustAbsMax || scales?.vanna?.max || scales?.vannaMax || 1e8;
    const charmMax = scales?.charm?.robustAbsMax || scales?.charm?.max || scales?.charmMax || 1e8;

    const gexUnit = scales?.gex?.unit || scales?.gexUnit || 'USD / 1% BTC move';
    const vannaUnit = scales?.vanna?.unit || scales?.vannaUnit || 'USD / 1 vol point';
    const charmUnit = scales?.charm?.unit || scales?.charmUnit || 'USD / day decay';

    return (
        <div className="w-full rounded-xl bg-[#080d16] border border-[#151f30] p-3.5 select-none shadow-2xl font-mono text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                <span className="text-white font-bold uppercase tracking-wider text-xs">
                    THREE INDEPENDENT DEALER EXPOSURE SCALES
                </span>
                <span className="text-[10px] text-zinc-400">DATASET-RELATIVE BOUNDS</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Scale 1: GEX EXPOSURE */}
                <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-400 text-[11px]">GEX EXPOSURE</span>
                        <span className="text-[9px] text-zinc-400">{gexUnit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-20 rounded-full bg-gradient-to-b from-[#00e676] via-[#1a2638] to-[#ff1744] shadow-sm" />
                        <div className="flex flex-col justify-between h-20 text-[10px] font-bold">
                            <span className="text-emerald-400">+{formatGex(gexMax)}</span>
                            <span className="text-zinc-400">0 (Zero Plane)</span>
                            <span className="text-rose-400">-{formatGex(gexMax)}</span>
                        </div>
                        <div className="flex flex-col justify-between h-20 text-[8px] pl-2 border-l border-zinc-800">
                            {intensityBands.map((b, i) => (
                                <span key={i} className={b.color}>{b.name}</span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Scale 2: VANNA EXPOSURE */}
                <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-purple-400 text-[11px]">VANNA EXPOSURE</span>
                        <span className="text-[9px] text-zinc-400">{vannaUnit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-20 rounded-full bg-gradient-to-b from-[#c084fc] via-[#1a2638] to-[#6366f1] shadow-sm" />
                        <div className="flex flex-col justify-between h-20 text-[10px] font-bold">
                            <span className="text-purple-400">+{formatGex(vannaMax)}</span>
                            <span className="text-zinc-400">0</span>
                            <span className="text-indigo-400">-{formatGex(vannaMax)}</span>
                        </div>
                        <div className="flex flex-col justify-between h-20 text-[8px] pl-2 border-l border-zinc-800">
                            {intensityBands.map((b, i) => (
                                <span key={i} className={b.color}>{b.name}</span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Scale 3: CHARM EXPOSURE */}
                <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-400 text-[11px]">CHARM EXPOSURE</span>
                        <span className="text-[9px] text-zinc-400">{charmUnit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-20 rounded-full bg-gradient-to-b from-[#ff9100] via-[#1a2638] to-[#d97706] shadow-sm" />
                        <div className="flex flex-col justify-between h-20 text-[10px] font-bold">
                            <span className="text-amber-400">+{formatGex(charmMax)}</span>
                            <span className="text-zinc-400">0</span>
                            <span className="text-amber-600">-{formatGex(charmMax)}</span>
                        </div>
                        <div className="flex flex-col justify-between h-20 text-[8px] pl-2 border-l border-zinc-800">
                            {intensityBands.map((b, i) => (
                                <span key={i} className={b.color}>{b.name}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
