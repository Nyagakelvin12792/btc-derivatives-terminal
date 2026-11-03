'use client';

import React, { useMemo, useState } from 'react';
import type { FootprintBarV1 } from '../../lib/orderflow/contracts';
import type { SegmentedFootprintBarV1 } from '../../lib/orderflow/true-flow-contracts';
import { cn } from '../../lib/ui/cn';

export type FootprintZoomLevel = 'DETAILED' | 'COMPACT' | 'OVERVIEW';

export interface FootprintChartOverlayProps {
    bars: SegmentedFootprintBarV1[];
    zoomLevel?: FootprintZoomLevel;
    onZoomChange?: (level: FootprintZoomLevel) => void;
    className?: string;
}

function formatVolume(val: number): string {
    if (val === 0) return '0';
    if (val >= 100) return val.toFixed(0);
    if (val >= 10) return val.toFixed(1);
    return val.toFixed(2);
}

function formatUsdDelta(val: number): string {
    const sign = val > 0 ? '+' : val < 0 ? '−' : '';
    const abs = Math.abs(val);
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toISOString().substring(11, 16);
}

export default function FootprintChartOverlay({
    bars,
    zoomLevel = 'DETAILED',
    onZoomChange,
    className,
}: FootprintChartOverlayProps) {
    const [internalZoom, setInternalZoom] = useState<FootprintZoomLevel>(zoomLevel);
    const activeZoom = onZoomChange ? zoomLevel : internalZoom;

    const handleZoom = (level: FootprintZoomLevel) => {
        setInternalZoom(level);
        onZoomChange?.(level);
    };

    // Filter to ensure no cells exist before capture start
    const validBars = useMemo(() => {
        return bars.filter((b) => b.footprint.cells.length > 0);
    }, [bars]);

    if (validBars.length === 0) {
        return (
            <div
                className={cn(
                    'flex h-full min-h-[140px] items-center justify-center p-4 font-mono text-[9px] text-[#8390A0]',
                    className,
                )}
                data-testid="footprint-overlay-empty"
            >
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-4 text-center">
                    <p className="font-bold text-[#D8DEE8]">FOOTPRINT · NO CAPTURED TRADE CELLS</p>
                    <p className="mt-1 text-[8px] text-[#5C697A]">
                        Footprint cells begin strictly at the first classified trade.
                    </p>
                    <p className="mt-0.5 text-[8px] text-[#5C697A]">
                        No pre-capture candle inference is performed.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn(
                'flex h-full min-h-0 flex-col overflow-hidden bg-[#070A0F] font-sans text-[#D8DEE8]',
                className,
            )}
            data-testid="footprint-chart-overlay"
        >
            {/* Header & Semantic Zoom Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#18212C] bg-[#0C1118] px-3 py-1.5 font-mono text-[9px]">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-[#D8DEE8]">FOOTPRINT</span>
                    <span className="rounded bg-[#18212C] px-1.5 py-0.5 text-[8px] text-[#8390A0]">
                        {validBars.length} {validBars.length === 1 ? 'BAR' : 'BARS'}
                    </span>
                    <span className="text-[#364150]">·</span>
                    <span className="text-[8px] text-[#5C697A]">
                        {activeZoom === 'DETAILED'
                            ? 'GEOMETRY + NUMBERS'
                            : activeZoom === 'COMPACT'
                                ? 'GEOMETRY ONLY (LABELS HIDDEN)'
                                : 'OVERVIEW'}
                    </span>
                </div>

                {/* Semantic Zoom Level Selector */}
                <div className="flex items-center gap-1 font-mono text-[8px]">
                    <span className="text-[#5C697A]">ZOOM:</span>
                    {(['DETAILED', 'COMPACT', 'OVERVIEW'] as const).map((lvl) => (
                        <button
                            key={lvl}
                            type="button"
                            onClick={() => handleZoom(lvl)}
                            className={cn(
                                'rounded px-1.5 py-0.5 font-bold transition-colors',
                                activeZoom === lvl
                                    ? 'bg-[#39A9F5]/20 text-[#39A9F5] border border-[#39A9F5]/40'
                                    : 'bg-[#18212C]/60 text-[#8390A0] hover:text-[#D8DEE8]',
                            )}
                            data-testid={`footprint-zoom-${lvl.toLowerCase()}`}
                        >
                            {lvl}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bars horizontal scroll view */}
            <div
                className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3"
                data-testid="footprint-bars-container"
            >
                {validBars.map((segmentedBar, idx) => (
                    <FootprintBarColumn
                        key={`${segmentedBar.segmentId}-${segmentedBar.footprint.openTime}-${idx}`}
                        bar={segmentedBar.footprint}
                        segmentId={segmentedBar.segmentId}
                        zoomLevel={activeZoom}
                    />
                ))}
            </div>

            {/* Note regarding imbalance absence in UX16.2 */}
            <div className="border-t border-[#18212C] bg-[#0C1118] px-3 py-1 font-mono text-[8px] text-[#5C697A]">
                Footprint buy/sell volumes and deltas from classified trades · Diagonal imbalance disabled until UX16.4
            </div>
        </div>
    );
}

function FootprintBarColumn({
    bar,
    segmentId,
    zoomLevel,
}: {
    bar: FootprintBarV1;
    segmentId: string;
    zoomLevel: FootprintZoomLevel;
}) {
    // Sort cells descending by price
    const sortedCells = useMemo(() => {
        return [...bar.cells].sort((a, b) => b.priceMid - a.priceMid);
    }, [bar.cells]);

    const maxVolumeInBar = useMemo(() => {
        return Math.max(...sortedCells.map((c) => Math.max(c.buyVolumeBtc, c.sellVolumeBtc)), 0.001);
    }, [sortedCells]);

    const isDetailed = zoomLevel === 'DETAILED';
    const isCompact = zoomLevel === 'COMPACT';

    return (
        <div
            className={cn(
                'flex flex-col rounded border border-[#18212C] bg-[#0C1118] shrink-0 font-mono text-[8px]',
                isDetailed ? 'w-44' : isCompact ? 'w-24' : 'w-14',
            )}
            data-testid={`footprint-bar-${bar.openTime}`}
        >
            {/* Bar Header */}
            <div className="border-b border-[#18212C] bg-[#070A0F] p-1.5 text-center">
                <div className="font-bold text-[#D8DEE8]">{formatTime(bar.openTime)}</div>
                <div className="mt-0.5 flex justify-between text-[7px] text-[#5C697A]">
                    <span>{segmentId}</span>
                    <span className={bar.deltaNotionalUsd >= 0 ? 'text-[#2CC7A0]' : 'text-[#F06152]'}>
                        Δ {formatUsdDelta(bar.deltaNotionalUsd)}
                    </span>
                </div>
            </div>

            {/* Price Level Cells */}
            <div className="flex-1 divide-y divide-[#18212C]/40 overflow-y-auto p-0.5">
                {sortedCells.map((cell) => {
                    const isPoc = bar.pocPrice !== null && (
                        Math.abs(cell.priceMid - bar.pocPrice) < 0.001 ||
                        (cell.priceLow <= bar.pocPrice && cell.priceHigh >= bar.pocPrice)
                    );

                    const buyPct = Math.min(100, (cell.buyVolumeBtc / maxVolumeInBar) * 100);
                    const sellPct = Math.min(100, (cell.sellVolumeBtc / maxVolumeInBar) * 100);

                    return (
                        <div
                            key={`cell-${cell.priceLow}-${cell.priceHigh}`}
                            className={cn(
                                'relative flex items-center justify-between px-1 py-0.5 transition-colors',
                                isPoc && 'bg-[#E5A83B]/10 border-l-2 border-[#E5A83B]',
                            )}
                            data-testid={`footprint-cell-${Math.round(cell.priceMid)}`}
                        >
                            {/* Background split volume bars */}
                            <div className="absolute inset-y-0 left-0 right-0 flex pointer-events-none opacity-20">
                                <div className="h-full bg-[#2CC7A0]" style={{ width: `${buyPct / 2}%` }} />
                                <div className="flex-1" />
                                <div className="h-full bg-[#F06152]" style={{ width: `${sellPct / 2}%` }} />
                            </div>

                            {/* Detailed Zoom: Show full numbers */}
                            {isDetailed && (
                                <>
                                    <span className="relative z-10 text-left font-mono text-[#2CC7A0]">
                                        {formatVolume(cell.buyVolumeBtc)}
                                    </span>
                                    <span className={cn('relative z-10 text-center font-bold', isPoc ? 'text-[#E5A83B]' : 'text-[#8390A0]')}>
                                        {cell.priceMid.toFixed(0)}
                                        {isPoc && <span className="ml-0.5 text-[6px] text-[#E5A83B]">POC</span>}
                                    </span>
                                    <span className="relative z-10 text-right font-mono text-[#F06152]">
                                        {formatVolume(cell.sellVolumeBtc)}
                                    </span>
                                </>
                            )}

                            {/* Compact Zoom: HIDE NUMERIC LABELS before geometry */}
                            {isCompact && (
                                <div className="relative z-10 flex w-full items-center justify-between text-[7px]">
                                    <span className={cn('font-bold', isPoc ? 'text-[#E5A83B]' : 'text-[#5C697A]')}>
                                        {cell.priceMid.toFixed(0)}
                                    </span>
                                    {isPoc && <span className="text-[6px] font-bold text-[#E5A83B]">POC</span>}
                                </div>
                            )}

                            {/* Overview Zoom: Minimal footprint indicator */}
                            {!isDetailed && !isCompact && (
                                <div className="relative z-10 flex w-full justify-center">
                                    <div
                                        className={cn(
                                            'size-1.5 rounded-full',
                                            isPoc ? 'bg-[#E5A83B]' : cell.deltaNotionalUsd >= 0 ? 'bg-[#2CC7A0]' : 'bg-[#F06152]',
                                        )}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Bar Footer Totals */}
            <div className="border-t border-[#18212C] bg-[#070A0F] p-1 text-[7px] text-[#8390A0]">
                <div className="flex justify-between">
                    <span>POC: <span className="font-bold text-[#E5A83B]">{bar.pocPrice?.toFixed(0) ?? '—'}</span></span>
                    <span>TOTAL: <span className="text-[#D8DEE8]">{formatUsdDelta(bar.totalNotionalUsd)}</span></span>
                </div>
            </div>
        </div>
    );
}
