'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, Shield, Zap, Sparkles } from 'lucide-react';
import { DealerBehaviorZone } from '@/lib/dashboard/types';

export default function DealerBehaviorLegend() {
    const [isExpanded, setIsExpanded] = useState(false);

    const zones: Array<{
        name: DealerBehaviorZone;
        title: string;
        tagClass: string;
        description: string;
    }> = [
        {
            name: 'HIGH_CONFLUENCE_WALL',
            title: 'High Confluence Wall',
            tagClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50',
            description: 'Major strike wall with high confluence score (≥80). Heavy dealer positioning creates strong support/resistance magnets.',
        },
        {
            name: 'REGIME_TRANSITION',
            title: 'Regime Transition',
            tagClass: 'bg-purple-950/80 text-purple-300 border-purple-500/50',
            description: 'Gamma Flip inflection zone. Spot crossover inverts dealer hedging flow from volatility-dampening to momentum-amplifying.',
        },
        {
            name: 'VOL_SENSITIVE_ZONE',
            title: 'Vol-Sensitive Zone',
            tagClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50',
            description: 'High Vanna concentration. Implied volatility shocks trigger substantial delta hedging adjustments regardless of spot movement.',
        },
        {
            name: 'DECAY_PRESSURE_ZONE',
            title: 'Decay Pressure Zone',
            tagClass: 'bg-amber-950/80 text-amber-300 border-amber-500/50',
            description: 'High Charm exposure in near-term expirations. Rapid time decay creates persistent daily and weekend hedging drift.',
        },
        {
            name: 'STABILIZATION_ZONE',
            title: 'Stabilization Zone',
            tagClass: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50',
            description: 'Dominant positive dealer gamma. Counter-trend rebalancing (buying dips, selling rallies) compresses realized volatility.',
        },
        {
            name: 'ACCELERATION_ZONE',
            title: 'Acceleration Zone',
            tagClass: 'bg-rose-950/80 text-rose-400 border-rose-500/50',
            description: 'Dominant negative dealer gamma. Pro-trend rebalancing (selling into weakness, buying into strength) accelerates moves.',
        },
        {
            name: 'NEUTRAL',
            title: 'Neutral Zone',
            tagClass: 'bg-zinc-900 text-zinc-400 border-zinc-700',
            description: 'Balanced dealer positioning with negligible mechanical hedging impact on market liquidity.',
        },
    ];

    return (
        <div className="w-full rounded-xl bg-[#080d16] border border-[#151f30] p-3 font-mono text-xs select-none shadow-xl">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-left cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-bold text-white uppercase text-[11px] tracking-wider">
                        DEALER BEHAVIOR CLASSIFICATION GUIDE (V1)
                    </span>
                    <span className="text-[9px] text-zinc-400">
                        (Probabilistic tendencies, not directional guarantees)
                    </span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400 hover:text-white text-[10px]">
                    <span>{isExpanded ? 'Collapse' : 'Expand Guide'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
            </button>

            {isExpanded && (
                <div className="mt-3 pt-3 border-t border-[#151f30] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {zones.map((z) => (
                        <div key={z.name} className="p-2.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold border ${z.tagClass}`}>
                                {z.title}
                            </span>
                            <p className="text-[10px] font-sans text-zinc-300 leading-snug">
                                {z.description}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
