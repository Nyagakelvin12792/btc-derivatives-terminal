'use client';

import React from 'react';
import { Target, Compass, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/ui/cn';

export interface ContextModeProps {
    spotPrice: number;
    callWall: number;
    putWall: number;
    gammaFlip: number;
    gammaRegime: 'POSITIVE' | 'NEGATIVE';
    avwapLabel?: string;
    avwapPrice?: number;
    volumeProfilePoc?: number;
    volumeProfileVah?: number;
    volumeProfileVal?: number;
    decisionState: 'NO_SETUP' | 'WATCH' | 'OBSERVE' | 'CONFIRMING' | 'INSUFFICIENT_DATA';
    decisionReason: string;
    dataFreshnessMs: number | null;
    activeOverlayCount?: number;
    className?: string;
}

export default function ContextMode({
    spotPrice,
    callWall,
    putWall,
    gammaFlip,
    gammaRegime,
    avwapLabel = 'Anchored VWAP',
    avwapPrice,
    volumeProfilePoc,
    volumeProfileVah,
    volumeProfileVal,
    decisionState,
    decisionReason,
    dataFreshnessMs,
    activeOverlayCount,
    className,
}: ContextModeProps) {
    const isPositiveGamma = gammaRegime === 'POSITIVE';
    const distanceToCallBps = Math.round(((callWall - spotPrice) / spotPrice) * 10_000);
    const distanceToPutBps = Math.round(((spotPrice - putWall) / spotPrice) * 10_000);

    return (
        <div
            className={cn('space-y-2.5 p-3 font-sans text-[#D8DEE8]', className)}
            data-testid="context-mode-container"
        >
            {/* Header: Concise Decision State */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 shadow-sm">
                <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                        DECISION CONTEXT · 4H / 1H
                    </span>
                    <span className="flex items-center gap-1 rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 font-mono text-[8px] text-[#8390A0]">
                        <Clock className="size-2.5 text-[#39A9F5]" />
                        {dataFreshnessMs !== null ? `${dataFreshnessMs}ms` : 'NO FRESHNESS'}
                    </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                    <div className="font-mono text-xl font-black text-[#D8DEE8] tracking-tight">
                        {decisionState}
                    </div>
                    <span className="rounded border border-[#18212C] bg-[#141B24] px-2 py-0.5 font-mono text-[9px] font-bold text-[#8390A0]">
                        PAPER EVALUATION
                    </span>
                </div>
                <p className="mt-1.5 text-pretty text-[10px] leading-relaxed text-[#8390A0]">
                    {decisionReason}
                </p>
            </div>

            {/* Core Structural Levels */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3">
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <span>MAJOR STRUCTURAL BOUNDARIES</span>
                    <Target className="size-3 text-[#39A9F5]" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                        <div className="flex items-center justify-between text-[9px] text-[#8390A0]">
                            <span>Call Wall (Upper)</span>
                            <span className="font-mono text-[8px] text-[#2CC7A0]">+{distanceToCallBps} bps</span>
                        </div>
                        <div className="mt-1 font-mono text-xs font-bold text-[#D8DEE8]">
                            ${Math.round(callWall).toLocaleString()}
                        </div>
                    </div>
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                        <div className="flex items-center justify-between text-[9px] text-[#8390A0]">
                            <span>Put Wall (Lower)</span>
                            <span className="font-mono text-[8px] text-[#E06379]">-{distanceToPutBps} bps</span>
                        </div>
                        <div className="mt-1 font-mono text-xs font-bold text-[#D8DEE8]">
                            ${Math.round(putWall).toLocaleString()}
                        </div>
                    </div>
                </div>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                        <div className="text-[9px] text-[#8390A0]">Gamma Flip</div>
                        <div className="mt-1 font-mono text-xs font-bold text-[#39A9F5]">
                            ${Math.round(gammaFlip).toLocaleString()}
                        </div>
                    </div>
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                        <div className="text-[9px] text-[#8390A0]">Gamma Regime</div>
                        <div className={cn('mt-1 font-mono text-xs font-bold', isPositiveGamma ? 'text-[#2CC7A0]' : 'text-[#E06379]')}>
                            {gammaRegime}
                        </div>
                    </div>
                </div>
            </div>

            {/* Anchored VWAP & High-Level Volume Profile */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3">
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <span>CONFLUENCE ANCHORS</span>
                    <Compass className="size-3 text-[#39A9F5]" />
                </div>
                <div className="space-y-1.5 text-[9px]">
                    <div className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1.5">
                        <span className="text-[#8390A0]">{avwapLabel}</span>
                        <span className="font-mono font-bold text-[#D8DEE8]">
                            {avwapPrice !== undefined ? `$${Math.round(avwapPrice).toLocaleString()}` : 'NOT AVAILABLE'}
                        </span>
                    </div>
                    {volumeProfilePoc && (
                        <div className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1.5">
                            <span className="text-[#8390A0]">Profile POC</span>
                            <span className="font-mono font-bold text-[#D8DEE8]">
                                ${Math.round(volumeProfilePoc).toLocaleString()}
                            </span>
                        </div>
                    )}
                    {volumeProfileVah && volumeProfileVal && (
                        <div className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1.5">
                            <span className="text-[#8390A0]">Value Area (VAL / VAH)</span>
                            <span className="font-mono font-bold text-[#8390A0]">
                                ${Math.round(volumeProfileVal).toLocaleString()} — ${Math.round(volumeProfileVah).toLocaleString()}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Jev Shadow Status */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-[#E6B450]">JEV SHADOW OPINION</span>
                    <span className="rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 text-[8px] font-bold text-[#8390A0]">
                        UNAVAILABLE
                    </span>
                </div>
                <p className="mt-1.5 font-sans text-pretty text-[10px] leading-relaxed text-[#8390A0]">
                    The repository exposes no Jev response contract to this frontend. No AI opinion is invented.
                </p>
            </div>

            {/* Attention Budget Status */}
            <div className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] px-3 py-2 font-mono text-[8px] text-[#5C697A]">
                <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3 text-[#39A9F5]" />
                    <span>ATTENTION BUDGET: {activeOverlayCount ?? '—'} OVERLAYS ACTIVE</span>
                </div>
                <span>CONTEXT MODE</span>
            </div>
        </div>
    );
}
