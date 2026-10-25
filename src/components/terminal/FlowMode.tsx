'use client';

import React from 'react';
import { Waves, BarChart2, Activity, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../../lib/ui/cn';

export interface FlowEventItem {
    id: string;
    type: 'PROBABLE_ABSORPTION' | 'REPLENISHMENT' | 'LIQUIDITY_ADD' | 'LIQUIDITY_PULL' | 'STACKED_IMBALANCE';
    side: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    price: number;
    volumeUsd: number;
    timestamp: string;
    note: string;
}

export interface FlowModeProps {
    liquidityStatus?: 'ACTIVE' | 'BUFFERING' | 'PAUSED' | 'OFFLINE';
    retainedFrames?: number;
    footprintStatus?: 'READY' | 'AWAITING_CAPTURE' | 'OFFLINE';
    cvdStatus?: 'TRADE_BASED' | 'BAR_PRECISION' | 'DEGRADED';
    currentCvdUsd?: number;
    events?: FlowEventItem[];
    className?: string;
}

const DEFAULT_FLOW_EVENTS: FlowEventItem[] = [
    {
        id: 'ev-1',
        type: 'PROBABLE_ABSORPTION',
        side: 'BULLISH',
        price: 68_380,
        volumeUsd: 1_240_000,
        timestamp: '14:22:10',
        note: 'Aggressive selling absorbed near Call/Put neutral boundary; minimal price excursion.',
    },
    {
        id: 'ev-2',
        type: 'REPLENISHMENT',
        side: 'BULLISH',
        price: 68_370,
        volumeUsd: 840_000,
        timestamp: '14:21:45',
        note: 'Resting bids replenished after sweep; displayed liquidity re-entered within 400ms.',
    },
];

export default function FlowMode({
    liquidityStatus = 'ACTIVE',
    retainedFrames = 1_800,
    footprintStatus = 'READY',
    cvdStatus = 'TRADE_BASED',
    currentCvdUsd = 12_450_000,
    events = DEFAULT_FLOW_EVENTS,
    className,
}: FlowModeProps) {
    return (
        <div
            className={cn('space-y-2.5 p-3 font-sans text-[#D8DEE8]', className)}
            data-testid="flow-mode-container"
        >
            {/* Header: Flow Mode Description */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 shadow-sm">
                <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                        MICROSTRUCTURE EXECUTION OBSERVER
                    </span>
                    <span className="rounded border border-[#39A9F5]/30 bg-[#39A9F5]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#39A9F5]">
                        FLOW MODE
                    </span>
                </div>
                <p className="mt-1 text-[10px] text-[#8390A0]">
                    Execution observation when price is testing or entering a qualified decision zone.
                </p>
            </div>

            {/* Container 1: Liquidity Surface Container */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="flow-liquidity-surface-container"
            >
                <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <Waves className="size-3 text-[#39A9F5]" />
                        <span>LIQUIDITY SURFACE V2</span>
                    </div>
                    <span className="rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 text-[8px] text-[#2CC7A0]">
                        {liquidityStatus}
                    </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] font-mono">
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                        <span className="text-[#8390A0]">Retained frames</span>
                        <div className="mt-0.5 text-xs font-bold text-[#D8DEE8]">{retainedFrames.toLocaleString()}</div>
                    </div>
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                        <span className="text-[#8390A0]">Filtering density</span>
                        <div className="mt-0.5 text-xs font-bold text-[#D8DEE8]">FOCUSED (&gt;80th pct)</div>
                    </div>
                </div>
                <p className="mt-2 text-[9px] text-[#8390A0] leading-relaxed">
                    X-axis aligned with historical chart timestamps. Subordinated graphite-to-amber ramp prevents visual fatigue.
                </p>
            </div>

            {/* Container 2: Footprint / Order-Flow Container */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="flow-footprint-container"
            >
                <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <BarChart2 className="size-3 text-[#39A9F5]" />
                        <span>TAPE FOOTPRINT &amp; IMBALANCE</span>
                    </div>
                    <span className="rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 text-[8px] text-[#D8DEE8]">
                        {footprintStatus}
                    </span>
                </div>
                <div className="mt-2 space-y-1.5 text-[9px] font-mono">
                    <div className="flex justify-between rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1.5">
                        <span className="text-[#8390A0]">Diagonal Imbalance Ratio</span>
                        <span className="font-bold text-[#D8DEE8]">300% (3:1)</span>
                    </div>
                    <div className="flex justify-between rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1.5">
                        <span className="text-[#8390A0]">Stacked Imbalance Min Rows</span>
                        <span className="font-bold text-[#D8DEE8]">3 adjacent</span>
                    </div>
                </div>
                <p className="mt-2 text-[9px] text-[#8390A0]">
                    Semantic zoom: numbers reveal only at &le;20 visible candles to maintain clear execution reading.
                </p>
            </div>

            {/* Container 3: True CVD and Delta Container */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="flow-cvd-container"
            >
                <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <Activity className="size-3 text-[#39A9F5]" />
                        <span>TRUE TRADE-BASED CVD</span>
                    </div>
                    <span className="rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 text-[8px] text-[#2CC7A0]">
                        {cvdStatus}
                    </span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono">
                    <span className="text-[9px] text-[#8390A0]">Session Cumulative Delta</span>
                    <span className={cn('text-xs font-bold', currentCvdUsd >= 0 ? 'text-[#2CC7A0]' : 'text-[#E06379]')}>
                        {currentCvdUsd >= 0 ? '+' : ''}${(currentCvdUsd / 1_000_000).toFixed(2)}M
                    </span>
                </div>
                <p className="mt-1.5 text-[8px] text-[#8390A0]">
                    Synchronized with lower study pane. Disconnect boundaries create explicit visual gaps.
                </p>
            </div>

            {/* Container 4: Detected Events Container */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="flow-events-container"
            >
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <Layers className="size-3 text-[#39A9F5]" />
                        <span>DETECTED MICROSTRUCTURE EVENTS</span>
                    </div>
                    <span className="text-[8px] text-[#8390A0]">{events.length} observed</span>
                </div>
                <div className="space-y-1.5">
                    {events.map((ev) => (
                        <div
                            key={ev.id}
                            className="rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]"
                        >
                            <div className="flex items-center justify-between font-mono">
                                <span className="flex items-center gap-1 font-bold text-[#D8DEE8]">
                                    {ev.side === 'BULLISH' ? (
                                        <ArrowUpRight className="size-3 text-[#2CC7A0]" />
                                    ) : (
                                        <ArrowDownRight className="size-3 text-[#E06379]" />
                                    )}
                                    {ev.type}
                                </span>
                                <span className="text-[#8390A0]">{ev.timestamp}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between font-mono text-[8px] text-[#8390A0]">
                                <span>Level: ${ev.price.toLocaleString()}</span>
                                <span>Vol: ${(ev.volumeUsd / 1_000).toFixed(0)}K</span>
                            </div>
                            <p className="mt-1 text-pretty text-[9px] text-[#8390A0]">
                                {ev.note}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
