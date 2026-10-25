'use client';

import React from 'react';
import { Activity, BarChart2, Layers, Waves } from 'lucide-react';
import type { CaptureCoverageV1, MarketEvidenceV1 } from '../../lib/orderflow/contracts';
import { cn } from '../../lib/ui/cn';

export interface FlowModeProps {
    liquidityStatus: 'LIVE' | 'BUFFERING' | 'PAUSED' | 'OFFLINE' | 'GAP' | 'STALE';
    retainedFrames: number;
    footprintStatus: 'READY' | 'AWAITING_CAPTURE' | 'REPLAY' | 'NOT_CONNECTED';
    cvdStatus: 'TRADE_BASED' | 'BAR_PRECISION' | 'REPLAY' | 'UNAVAILABLE';
    currentCvdUsd: number | null;
    events: MarketEvidenceV1[];
    dataMode: CaptureCoverageV1['dataMode'];
    className?: string;
}

function compactUsd(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    const absolute = Math.abs(value);
    if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(2)}B`;
    if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(2)}M`;
    if (absolute >= 1e3) return `${sign}$${(absolute / 1e3).toFixed(1)}K`;
    return `${sign}$${absolute.toFixed(0)}`;
}

export default function FlowMode({
    liquidityStatus,
    retainedFrames,
    footprintStatus,
    cvdStatus,
    currentCvdUsd,
    events,
    dataMode,
    className,
}: FlowModeProps) {
    return (
        <div className={cn('space-y-2.5 p-3 font-sans text-[#D8DEE8]', className)} data-testid="flow-mode-container">
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3">
                <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">MICROSTRUCTURE OBSERVER</span>
                    <span className="rounded border border-[#39A9F5]/30 bg-[#39A9F5]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#39A9F5]">{dataMode}</span>
                </div>
                <p className="mt-1 text-[10px] text-[#8390A0]">Only captured, provenance-labelled execution evidence appears here.</p>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="flow-liquidity-surface-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5"><Waves className="size-3 text-[#39A9F5]" />LIQUIDITY CAPTURE</span>
                    <span>{liquidityStatus}</span>
                </div>
                <div className="mt-2 font-mono text-lg font-black text-[#D8DEE8]">{retainedFrames.toLocaleString()} <span className="text-[9px] font-normal text-[#8390A0]">retained frames</span></div>
                <p className="mt-1 text-[9px] text-[#5C697A]">This is capture coverage, not an institutional-activity signal.</p>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="flow-footprint-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5"><Layers className="size-3 text-[#39A9F5]" />FOOTPRINT</span>
                    <span>{footprintStatus}</span>
                </div>
                <p className="mt-2 text-[9px] leading-relaxed text-[#8390A0]">Trade-classified footprint calculation begins in UX16.2. No bar imbalance is inferred from candles.</p>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="flow-cvd-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5"><BarChart2 className="size-3 text-[#39A9F5]" />CVD COVERAGE</span>
                    <span>{cvdStatus}</span>
                </div>
                <div className="mt-2 font-mono text-lg font-black text-[#D8DEE8]">{compactUsd(currentCvdUsd)}</div>
                <p className="mt-1 text-[9px] text-[#5C697A]">True trade-based CVD requires the aggregate-trade capture milestone.</p>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="flow-events-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5"><Activity className="size-3 text-[#39A9F5]" />DETERMINISTIC EVENTS</span>
                    <span>{events.length} OBSERVED</span>
                </div>
                {events.length === 0 ? (
                    <p className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px] leading-relaxed text-[#8390A0]">No deterministic microstructure events. Aggregate-trade capture begins in UX16.1.</p>
                ) : (
                    <div className="mt-2 space-y-1.5">
                        {events.map((event) => (
                            <div key={event.id} className="rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]">
                                <div className="flex justify-between gap-2 font-mono text-[8px]"><span>{event.kind}</span><span>{event.confidence}</span></div>
                                <div className="mt-1 text-[#8390A0]">{event.reasonCodes.join(' · ')}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
