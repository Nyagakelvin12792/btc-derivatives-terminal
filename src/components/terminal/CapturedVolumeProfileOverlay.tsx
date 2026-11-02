'use client';

import React, { useMemo } from 'react';
import type { TradeVolumeProfileV1 } from '../../lib/orderflow/true-flow-contracts';
import { cn } from '../../lib/ui/cn';

export interface CapturedVolumeProfileOverlayProps {
    profile: TradeVolumeProfileV1 | null;
    className?: string;
}

function formatBtc(val: number): string {
    if (val >= 100) return val.toFixed(1);
    if (val >= 10) return val.toFixed(2);
    return val.toFixed(3);
}

function formatUsd(val: number): string {
    const abs = Math.abs(val);
    if (abs >= 1e6) return `$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(abs / 1e3).toFixed(1)}K`;
    return `$${abs.toFixed(0)}`;
}

export default function CapturedVolumeProfileOverlay({
    profile,
    className,
}: CapturedVolumeProfileOverlayProps) {
    const rows = useMemo(() => {
        if (!profile) return [];
        return [...profile.rows].sort((a, b) => b.priceMid - a.priceMid);
    }, [profile]);

    const maxVolume = useMemo(() => {
        if (rows.length === 0) return 1;
        return Math.max(...rows.map((r) => r.buyVolumeBtc + r.sellVolumeBtc), 0.001);
    }, [rows]);

    if (!profile || rows.length === 0) {
        return (
            <div
                className={cn(
                    'flex h-full min-h-[140px] items-center justify-center p-4 font-mono text-[9px] text-[#8390A0]',
                    className,
                )}
                data-testid="captured-profile-empty"
            >
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-4 text-center">
                    <p className="font-bold text-[#D8DEE8]">TRADE VOLUME PROFILE · NO ROWS</p>
                    <p className="mt-1 text-[8px] text-[#5C697A]">
                        Awaiting classified trade capture across price buckets.
                    </p>
                </div>
            </div>
        );
    }

    const { coverageKind, pocPrice, vahPrice, valPrice, totals } = profile;

    const coverageBadge = (() => {
        switch (coverageKind) {
            case 'CAPTURED_EXACT':
                return {
                    label: 'CAPTURED EXACT (0 gaps)',
                    classes: 'border-[#2CC7A0]/40 bg-[#2CC7A0]/10 text-[#2CC7A0]',
                };
            case 'CAPTURED_WITH_GAPS':
                return {
                    label: `CAPTURED WITH GAPS (${profile.coverage.gapCount} gaps)`,
                    classes: 'border-[#F06152]/40 bg-[#F06152]/10 text-[#F06152]',
                };
            case 'MIXED_APPROXIMATE':
            default:
                return {
                    label: 'MIXED APPROXIMATE COVERAGE',
                    classes: 'border-[#E5A83B]/40 bg-[#E5A83B]/10 text-[#E5A83B]',
                };
        }
    })();

    return (
        <div
            className={cn(
                'flex h-full min-h-0 flex-col overflow-hidden bg-[#070A0F] font-sans text-[#D8DEE8]',
                className,
            )}
            data-testid="captured-volume-profile-overlay"
        >
            {/* Header with Coverage Badge and Key Levels */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#18212C] bg-[#0C1118] px-3 py-1.5 font-mono text-[9px]">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-[#D8DEE8]">TRADE VP</span>
                    <span
                        className={cn('rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase', coverageBadge.classes)}
                        data-testid="captured-profile-coverage-badge"
                    >
                        {coverageBadge.label}
                    </span>
                    <span className="text-[#364150]">·</span>
                    <span className="text-[8px] text-[#8390A0]">
                        BUCKET ${profile.priceBucket}
                    </span>
                </div>

                {/* POC / VAH / VAL Indicators */}
                <div className="flex items-center gap-2 font-mono text-[8px]">
                    {pocPrice !== null && (
                        <span className="rounded bg-[#E5A83B]/15 px-1.5 py-0.5 font-bold text-[#E5A83B]" data-testid="profile-poc-tag">
                            POC: {pocPrice.toFixed(1)}
                        </span>
                    )}
                    {vahPrice !== null && (
                        <span className="rounded bg-[#39A9F5]/10 px-1 py-0.5 text-[#39A9F5]" data-testid="profile-vah-tag">
                            VAH: {vahPrice.toFixed(1)}
                        </span>
                    )}
                    {valPrice !== null && (
                        <span className="rounded bg-[#39A9F5]/10 px-1 py-0.5 text-[#39A9F5]" data-testid="profile-val-tag">
                            VAL: {valPrice.toFixed(1)}
                        </span>
                    )}
                </div>
            </div>

            {/* Profile Rows Scrollable Area */}
            <div
                className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#18212C]/40 p-2 font-mono text-[8px] tabular-nums"
                data-testid="captured-profile-rows-container"
            >
                {rows.map((row) => {
                    const isPoc = pocPrice !== null && Math.abs(row.priceMid - pocPrice) < 0.001;
                    const inValueArea = vahPrice !== null && valPrice !== null && row.priceMid >= valPrice && row.priceMid <= vahPrice;

                    const totalVol = row.buyVolumeBtc + row.sellVolumeBtc;
                    const totalWidthPct = Math.min(100, (totalVol / maxVolume) * 100);
                    const buyFraction = totalVol > 0 ? row.buyVolumeBtc / totalVol : 0.5;

                    return (
                        <div
                            key={`vp-row-${row.bucketIndex}`}
                            className={cn(
                                'relative flex items-center justify-between py-1 px-1.5 transition-colors',
                                isPoc && 'bg-[#E5A83B]/10 font-bold border-l-2 border-[#E5A83B]',
                                inValueArea && !isPoc && 'bg-white/[0.02]',
                            )}
                            data-testid={`vp-row-${Math.round(row.priceMid)}`}
                        >
                            {/* Horizontal volume bar overlay from right side */}
                            <div
                                className="absolute inset-y-0 right-0 pointer-events-none flex opacity-30"
                                style={{ width: `${totalWidthPct}%` }}
                            >
                                <div
                                    className="h-full bg-[#2CC7A0]"
                                    style={{ width: `${buyFraction * 100}%` }}
                                />
                                <div
                                    className="h-full bg-[#F06152]"
                                    style={{ width: `${(1 - buyFraction) * 100}%` }}
                                />
                            </div>

                            {/* Price label */}
                            <div className="relative z-10 flex items-center gap-1.5">
                                <span className={cn(isPoc ? 'text-[#E5A83B]' : inValueArea ? 'text-[#D8DEE8]' : 'text-[#8390A0]')}>
                                    {row.priceMid.toFixed(0)}
                                </span>
                                {isPoc && (
                                    <span className="rounded bg-[#E5A83B]/20 px-1 py-0.2 text-[6px] font-bold text-[#E5A83B]">
                                        POC
                                    </span>
                                )}
                            </div>

                            {/* Volume numbers */}
                            <div className="relative z-10 flex items-center gap-2">
                                <span className="text-[#2CC7A0]">{formatBtc(row.buyVolumeBtc)}</span>
                                <span className="text-[#364150]">/</span>
                                <span className="text-[#F06152]">{formatBtc(row.sellVolumeBtc)}</span>
                                <span className="text-[#5C697A]">({formatUsd(row.totalNotionalUsd)})</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Profile Totals Footer */}
            <div className="border-t border-[#18212C] bg-[#0C1118] px-3 py-1.5 font-mono text-[8px] text-[#8390A0]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <span>TRADES: </span>
                        <span className="font-bold text-[#D8DEE8]">{totals.tradeCount.toLocaleString()}</span>
                        <span className="mx-1 text-[#364150]">·</span>
                        <span>BUY: </span>
                        <span className="text-[#2CC7A0]">{formatBtc(totals.buyVolumeBtc)} BTC</span>
                        <span className="mx-1 text-[#364150]">·</span>
                        <span>SELL: </span>
                        <span className="text-[#F06152]">{formatBtc(totals.sellVolumeBtc)} BTC</span>
                    </div>
                    <div>
                        <span>TOTAL NOTIONAL: </span>
                        <span className="font-bold text-[#D8DEE8]">{formatUsd(totals.totalNotionalUsd)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
