'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Compass } from 'lucide-react';

export default function HowToReadMapPanel() {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="w-full rounded-xl bg-[#080d16] border border-[#151f30] p-3 font-mono text-xs select-none shadow-xl">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between text-left cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-white uppercase text-[11px] tracking-wider">
                        HOW TO READ THIS 3D DEALER PRESSURE MAP
                    </span>
                    <span className="text-[9px] text-zinc-400">
                        (5-Second Visual Guide)
                    </span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400 hover:text-white text-[10px]">
                    <span>{isOpen ? 'Hide Guide' : 'Show Guide'}</span>
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
            </button>

            {isOpen && (
                <div className="mt-2.5 pt-2.5 border-t border-[#151f30] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-500/50" />
                        <div>
                            <span className="font-bold text-emerald-400 block text-[10px]">GREEN HIGH</span>
                            <span className="text-zinc-300 text-[10px]">Stabilizing dealer gamma</span>
                        </div>
                    </div>

                    <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 shadow-sm shadow-rose-500/50" />
                        <div>
                            <span className="font-bold text-rose-400 block text-[10px]">RED LOW</span>
                            <span className="text-zinc-300 text-[10px]">Accelerating dealer gamma</span>
                        </div>
                    </div>

                    <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0 shadow-sm shadow-purple-500/50" />
                        <div>
                            <span className="font-bold text-purple-400 block text-[10px]">PURPLE DENSE</span>
                            <span className="text-zinc-300 text-[10px]">Vanna volatility sensitivity</span>
                        </div>
                    </div>

                    <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 shadow-sm shadow-amber-500/50" />
                        <div>
                            <span className="font-bold text-amber-400 block text-[10px]">ORANGE STRONG</span>
                            <span className="text-zinc-300 text-[10px]">Charm time-decay drift</span>
                        </div>
                    </div>

                    <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0 shadow-sm shadow-cyan-500/50" />
                        <div>
                            <span className="font-bold text-cyan-300 block text-[10px]">BRIGHT FLOOR</span>
                            <span className="text-zinc-300 text-[10px]">Multiple dealer forces overlap</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
