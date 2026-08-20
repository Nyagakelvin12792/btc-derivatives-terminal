'use client';

import React from 'react';
import { Shield, Zap, TrendingUp, TrendingDown, Target, Info, Sparkles, Activity } from 'lucide-react';
import {
    SelectedAnalyticalState,
    DashboardData,
    DealerBehaviorZone,
    IntensityBand,
} from '@/lib/dashboard/types';
import { formatGex, formatUsd } from '@/lib/dashboard/adapters';

interface KeyLevelProfileProps {
    data: DashboardData;
    selectedState: SelectedAnalyticalState;
    onClose?: () => void;
}

export default function KeyLevelProfile({ data, selectedState, onClose }: KeyLevelProfileProps) {
    const { summary, strikes, surfaceGrid, confluenceLevels, keyContracts, scales } = data;
    const selectedStrike = selectedState.strike || summary.spotPrice;
    const distancePct = ((selectedStrike - summary.spotPrice) / summary.spotPrice) * 100;
    const isAboveSpot = distancePct >= 0;

    // Aggregate values for the selected strike across expiries
    let totalGex = 0;
    let totalVanna = 0;
    let totalCharm = 0;
    let cellCount = 0;

    surfaceGrid.forEach((row) => {
        const cell = row.find((c) => Math.abs(c.strike - selectedStrike) < 250);
        if (cell) {
            totalGex += cell.gex;
            totalVanna += cell.vanna;
            totalCharm += cell.charm;
            cellCount++;
        }
    });

    const avgGex = cellCount > 0 ? totalGex / cellCount : 0;
    const avgVanna = cellCount > 0 ? totalVanna / cellCount : 0;
    const avgCharm = cellCount > 0 ? totalCharm / cellCount : 0;

    const gexIntensity = Math.min(100, Math.round((Math.abs(avgGex) / (scales.gexMax || 1)) * 100));
    const vannaIntensity = Math.min(100, Math.round((Math.abs(avgVanna) / (scales.vannaMax || 1)) * 100));
    const charmIntensity = Math.min(100, Math.round((Math.abs(avgCharm) / (scales.charmMax || 1)) * 100));

    const getIntensityBand = (intensity: number): IntensityBand => {
        if (intensity >= 75) return 'EXTREME';
        if (intensity >= 50) return 'HIGH';
        if (intensity >= 25) return 'MEDIUM';
        return 'LOW';
    };

    const gexBand = getIntensityBand(gexIntensity);
    const vannaBand = getIntensityBand(vannaIntensity);
    const charmBand = getIntensityBand(charmIntensity);

    // Confluence match
    const matchingConfluence = confluenceLevels.find(
        (c) => Math.abs(c.strike - selectedStrike) < 250
    );

    // Wall relationships
    const isCallWall = Math.abs(selectedStrike - summary.callWall) < 250;
    const isPutWall = Math.abs(selectedStrike - summary.putWall) < 250;
    const isGammaFlip = Math.abs(selectedStrike - summary.gammaFlip) < 400;
    const isMaxPain = Math.abs(selectedStrike - summary.maxPain) < 250;

    // Determine Behavior Zone Classification (deterministic V1 precedence)
    let behaviorZone: DealerBehaviorZone = 'NEUTRAL';
    let behaviorDesc = 'Balanced positioning with neutral dealer hedging impact.';

    if ((isCallWall || isPutWall) && (matchingConfluence?.confluenceScore || 0) >= 70) {
        behaviorZone = 'HIGH_CONFLUENCE_WALL';
        behaviorDesc = 'Multiple major structural forces align here. Heavy dealer inventory concentration creates prominent resistance or support magnet tendency.';
    } else if (isGammaFlip || Math.abs(selectedStrike - summary.gammaFlip) < 700) {
        behaviorZone = 'REGIME_TRANSITION';
        behaviorDesc = 'Inflection boundary between long-gamma mean reversion and short-gamma trend acceleration. Dealer hedging flows reverse direction around this zone.';
    } else if (vannaIntensity >= 70 && vannaIntensity > gexIntensity) {
        behaviorZone = 'VOL_SENSITIVE_ZONE';
        behaviorDesc = 'Elevated Vanna concentration. Implied volatility shocks (crush or expansion) trigger outsized delta re-hedging flows independent of spot movement.';
    } else if (charmIntensity >= 70 && (selectedState.dte || 30) <= 14) {
        behaviorZone = 'DECAY_PRESSURE_ZONE';
        behaviorDesc = 'Short-dated Charm decay concentration. Rapid time-to-expiry decay drives predictable daily and weekend delta bleed.';
    } else if (avgGex > 0 && gexIntensity >= 50) {
        behaviorZone = 'STABILIZATION_ZONE';
        behaviorDesc = 'Positive dealer gamma territory. Counter-trend delta hedging (buying dips, selling rips) dampens realized market volatility.';
    } else if (avgGex < 0 && gexIntensity >= 50) {
        behaviorZone = 'ACCELERATION_ZONE';
        behaviorDesc = 'Negative dealer gamma territory. Pro-trend delta hedging (selling drops, buying rallies) tends to amplify directional momentum.';
    }

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

    const behaviorBadge = getBehaviorBadge(behaviorZone);
    const confluenceScore = matchingConfluence?.confluenceScore || Math.round(0.35 * gexIntensity + 0.2 * vannaIntensity + 0.15 * charmIntensity + 15);

    // Matching contracts
    const matchingContracts = keyContracts.filter((c) => Math.abs(c.strike - selectedStrike) < 250);
    const strikeTotalOi = matchingContracts.reduce((sum, c) => sum + c.oiBtc, 0);

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
                            ${selectedStrike.toLocaleString()}
                        </span>
                        <span className={`text-xs font-bold ${isAboveSpot ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isAboveSpot ? '+' : ''}{distancePct.toFixed(2)}% vs Spot
                        </span>
                    </div>
                </div>

                <div className="text-right">
                    <span className="text-[9px] text-zinc-400 uppercase block">CONFLUENCE SCORE</span>
                    <span className="text-lg font-black text-cyan-400">{confluenceScore}/100</span>
                </div>
            </div>

            {/* Behavior Tendency Explanation */}
            <div className="p-3 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-300 font-bold text-[10px]">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    <span>DEALER BEHAVIOR TENDENCY (PROBABILISTIC)</span>
                </div>
                <p className="text-[11px] font-sans text-zinc-300 leading-relaxed">
                    {behaviorDesc}
                </p>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* GEX */}
                <div className="p-2.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">GEX Exposure</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-zinc-800 text-zinc-300">{gexBand}</span>
                    </div>
                    <div className={`text-sm font-bold ${avgGex >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatGex(avgGex)}
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className={`h-full ${avgGex >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${gexIntensity}%` }} />
                    </div>
                </div>

                {/* Vanna */}
                <div className="p-2.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Vanna Exposure</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-zinc-800 text-zinc-300">{vannaBand}</span>
                    </div>
                    <div className={`text-sm font-bold ${avgVanna >= 0 ? 'text-purple-400' : 'text-indigo-400'}`}>
                        {formatGex(avgVanna)}
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-purple-400" style={{ width: `${vannaIntensity}%` }} />
                    </div>
                </div>

                {/* Charm */}
                <div className="p-2.5 rounded-lg bg-[#0c1422] border border-[#1a273b] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Charm (1D)</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-zinc-800 text-zinc-300">{charmBand}</span>
                    </div>
                    <div className={`text-sm font-bold ${avgCharm >= 0 ? 'text-amber-400' : 'text-amber-600'}`}>
                        {formatGex(avgCharm)}/day
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${charmIntensity}%` }} />
                    </div>
                </div>
            </div>

            {/* Structural Relationships & OI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">CALL WALL STATUS</span>
                    <span className={`font-bold ${isCallWall ? 'text-emerald-400' : 'text-zinc-300'}`}>
                        {isCallWall ? 'PRIMARY CALL WALL' : 'Non-Wall'}
                    </span>
                </div>

                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">PUT WALL STATUS</span>
                    <span className={`font-bold ${isPutWall ? 'text-rose-400' : 'text-zinc-300'}`}>
                        {isPutWall ? 'PRIMARY PUT WALL' : 'Non-Wall'}
                    </span>
                </div>

                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">GAMMA FLIP DISTANCE</span>
                    <span className="font-bold text-cyan-400">
                        {(((selectedStrike - summary.gammaFlip) / summary.gammaFlip) * 100).toFixed(2)}%
                    </span>
                </div>

                <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b]">
                    <span className="text-zinc-400 block">OPEN INTEREST</span>
                    <span className="font-bold text-white">
                        {strikeTotalOi > 0 ? `${strikeTotalOi.toLocaleString()} BTC` : 'N/A'}
                    </span>
                </div>
            </div>
        </div>
    );
}
