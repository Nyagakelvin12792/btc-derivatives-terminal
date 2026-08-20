'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { KeyLevelProfileData, DealerBehaviorZone, IntensityBand } from '@/lib/dashboard/types';
import { formatGex } from '@/lib/dashboard/adapters';

interface KeyLevelProfileProps {
    profile?: KeyLevelProfileData | null;
    onClose?: () => void;
}

export default function KeyLevelProfile({ profile, onClose }: KeyLevelProfileProps) {
    if (!profile) {
        return (
            <div className="w-full rounded-xl bg-[#080d16] border border-[#151f30] p-4 select-none shadow-2xl font-mono text-xs text-zinc-400 flex flex-col items-center justify-center min-h-[220px]">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400">NO LEVEL SELECTED</span>
                <p className="text-[11px] text-zinc-400 text-center mt-1">
                    Click a strike or level on the 3D surface or tables to inspect its dealer profile.
                </p>
            </div>
        );
    }

    const isAboveSpot = profile.distancePct >= 0;

    const getBehaviorBadge = (zone: DealerBehaviorZone) => {
        switch (zone) {
            case 'HIGH_CONFLUENCE_WALL':
                return { label: 'HIGH CONFLUENCE WALL', bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50' };
            case 'REGIME_TRANSITION':
                return { label: 'REGIME TRANSITION', bg: 'bg-purple-950/80 text-purple-300 border-purple-500/50' };
            case 'VOL_SENSITIVE_ZONE':
                return { label: 'VOL SENSITIVE ZONE', bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50' };
            case 'DECAY_PRESSURE_ZONE':
                return { label: 'DECAY PRESSURE ZONE', bg: 'bg-amber-950/80 text-amber-300 border-amber-500/50' };
            case 'STABILIZATION_ZONE':
                return { label: 'STABILIZATION ZONE', bg: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50' };
            case 'ACCELERATION_ZONE':
                return { label: 'ACCELERATION ZONE', bg: 'bg-rose-950/80 text-rose-400 border-rose-500/50' };
            default:
                return { label: 'NEUTRAL ZONE', bg: 'bg-zinc-900 text-zinc-400 border-zinc-700' };
        }
    };

    const behaviorBadge = getBehaviorBadge(profile.behaviorZone);

    const getBandColor = (band: IntensityBand) => {
        switch (band) {
            case 'EXTREME': return 'bg-rose-950/80 text-rose-300 border-rose-500/40';
            case 'HIGH': return 'bg-amber-950/80 text-amber-300 border-amber-500/40';
            case 'MEDIUM': return 'bg-zinc-800 text-zinc-300 border-zinc-700';
            case 'LOW': return 'bg-zinc-900 text-zinc-400 border-zinc-800';
        }
    };

    return (
        <div className="w-full rounded-xl bg-[#080d16] border border-[#151f30] p-4 select-none shadow-2xl font-mono text-xs space-y-3.5">
            {/* Header: Selected Strike & Distance */}
            <div className="flex items-start justify-between pb-3 border-b border-[#151f30]">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">KEY-LEVEL PROFILE</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${behaviorBadge.bg}`}>
                            {behaviorBadge.label}
                        </span>
                    </div>
                    <div className="flex items-baseline gap-3 mt-1">
                        <span className="text-xl font-black text-white">
                            ${profile.strike.toLocaleString()}
                        </span>
                        <span className={`text-xs font-bold ${isAboveSpot ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isAboveSpot ? '+' : ''}{profile.distancePct.toFixed(2)}% vs Spot
                        </span>
                    </div>
                </div>

                <div className="text-right">
                    <span className="text-[9px] text-zinc-400 uppercase block font-semibold">CONFLUENCE</span>
                    <span className="text-lg font-black text-cyan-400">{profile.confluenceScore}/100</span>
                </div>
            </div>

            {/* Expected Tendency */}
            <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-300 font-bold text-[10px]">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    <span>EXPECTED DEALER TENDENCY (PROBABILISTIC)</span>
                </div>
                <p className="text-[11px] font-sans text-zinc-300 leading-relaxed">
                    {profile.behaviorTendencyDescription}
                </p>
            </div>

            {/* Metrics Breakdown: GEX, Vanna, Charm */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* GEX */}
                <div className="p-2.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">GEX Exposure</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${getBandColor(profile.gexBand)}`}>
                            {profile.gexBand}
                        </span>
                    </div>
                    <div className={`text-sm font-bold ${profile.gexExposure >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatGex(profile.gexExposure)}
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                            className={`h-full ${profile.gexExposure >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                            style={{ width: `${Math.min(100, Math.max(0, profile.gexIntensity))}%` }}
                        />
                    </div>
                </div>

                {/* Vanna */}
                <div className="p-2.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Vanna Exposure</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${getBandColor(profile.vannaBand)}`}>
                            {profile.vannaBand}
                        </span>
                    </div>
                    <div className={`text-sm font-bold ${profile.vannaExposure >= 0 ? 'text-purple-400' : 'text-indigo-400'}`}>
                        {formatGex(profile.vannaExposure)}
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                            className="h-full bg-purple-400"
                            style={{ width: `${Math.min(100, Math.max(0, profile.vannaIntensity))}%` }}
                        />
                    </div>
                </div>

                {/* Charm */}
                <div className="p-2.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Charm (1D)</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${getBandColor(profile.charmBand)}`}>
                            {profile.charmBand}
                        </span>
                    </div>
                    <div className={`text-sm font-bold ${profile.charmExposure >= 0 ? 'text-amber-400' : 'text-amber-600'}`}>
                        {formatGex(profile.charmExposure)}/day
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                            className="h-full bg-amber-400"
                            style={{ width: `${Math.min(100, Math.max(0, profile.charmIntensity))}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Structural Relationships & OI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">CALL WALL</span>
                    <span className={`font-bold ${profile.callWallStatus ? 'text-emerald-400' : 'text-zinc-400'}`}>
                        {profile.callWallStatus ? 'YES (Call Wall)' : 'NO'}
                    </span>
                </div>

                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">PUT WALL</span>
                    <span className={`font-bold ${profile.putWallStatus ? 'text-rose-400' : 'text-zinc-400'}`}>
                        {profile.putWallStatus ? 'YES (Put Wall)' : 'NO'}
                    </span>
                </div>

                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">GAMMA FLIP DIST</span>
                    <span className="font-bold text-cyan-400">
                        {profile.gammaFlipDistancePct ? `${profile.gammaFlipDistancePct.toFixed(2)}%` : 'N/A'}
                    </span>
                </div>

                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">OPEN INTEREST</span>
                    <span className="font-bold text-white">
                        {profile.oiBtc ? `${profile.oiBtc.toLocaleString()} BTC` : 'N/A'}
                    </span>
                </div>
            </div>
        </div>
    );
}
