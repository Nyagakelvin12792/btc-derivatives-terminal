'use client';

import React from 'react';
import { Download, Maximize2, Sliders } from 'lucide-react';

interface FooterBarProps {
    autoRefreshSecs?: number;
}

export default function FooterBar({ autoRefreshSecs = 3 }: FooterBarProps) {
    return (
        <footer className="w-full bg-[#080d16] border-t border-[#151f30] px-4 py-2 flex items-center justify-between text-[10px] font-mono text-zinc-400 select-none">
            {/* Disclaimer */}
            <div className="flex items-center gap-2">
                <span>All data is indicative and for informational purposes only. Not financial advice. Source: Deribit (Live)</span>
            </div>

            {/* Right Status & Tools */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-zinc-300">Auto-refresh: {autoRefreshSecs}s</span>
                </div>

                <div className="flex items-center gap-2 text-zinc-400">
                    <button className="hover:text-cyan-400 transition-colors" title="Export CSV Data">
                        <Download className="w-3.5 h-3.5" />
                    </button>
                    <button className="hover:text-cyan-400 transition-colors" title="Layout Settings">
                        <Sliders className="w-3.5 h-3.5" />
                    </button>
                    <button className="hover:text-cyan-400 transition-colors" title="Fullscreen">
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </footer>
    );
}
