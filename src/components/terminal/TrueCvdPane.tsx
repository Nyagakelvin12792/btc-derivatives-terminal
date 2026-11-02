'use client';

import React, { useMemo, useState } from 'react';
import type { CvdBarV1, CvdSegmentV1, TrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow-contracts';
import { cn } from '../../lib/ui/cn';
import TrueFlowProvenanceBanner from './TrueFlowProvenanceBanner';

export interface TrueCvdPaneProps {
    snapshot: TrueFlowSnapshotV1 | null;
    className?: string;
    showProvenance?: boolean;
}

function formatUsdDelta(value: number): string {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toISOString().substring(11, 19);
}

export default function TrueCvdPane({
    snapshot,
    className,
    showProvenance = true,
}: TrueCvdPaneProps) {
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

    const segments = useMemo(() => snapshot?.cvdSegments ?? [], [snapshot]);

    const activeSegment = useMemo(() => {
        if (!selectedSegmentId) return segments[0] ?? null;
        return segments.find((seg) => seg.segmentId === selectedSegmentId) ?? segments[0] ?? null;
    }, [segments, selectedSegmentId]);

    if (!snapshot || segments.length === 0) {
        return (
            <div
                className={cn(
                    'flex h-full min-h-[140px] flex-col items-center justify-center p-4 font-mono text-[10px] text-[#8390A0]',
                    className,
                )}
                data-testid="true-cvd-pane-empty"
            >
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-4 text-center">
                    <p className="font-bold text-[#D8DEE8]">TRUE CVD PANE · NO CAPTURED SEGMENTS</p>
                    <p className="mt-1 text-[9px] text-[#5C697A]">
                        Awaiting aggregate-trade stream or deterministic replay fixture.
                    </p>
                    <p className="mt-0.5 text-[8px] text-[#5C697A]">
                        No continuous delta is fabricated from candles.
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
            data-testid="true-cvd-pane"
        >
            {/* Header with Segment Navigation and Coverage Metrics */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#18212C] bg-[#0C1118] px-3 py-1.5 font-mono text-[9px]">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-[#D8DEE8]">TRUE CVD</span>
                    <span className="rounded bg-[#18212C] px-1.5 py-0.5 text-[8px] text-[#8390A0]">
                        {snapshot.interval} · {segments.length} {segments.length === 1 ? 'SEGMENT' : 'SEGMENTS'}
                    </span>
                    <span className="text-[#364150]">|</span>
                    <span className="text-[#5C697A]">TOTAL DELTA:</span>
                    <span
                        className={cn(
                            'font-bold',
                            snapshot.totals.deltaNotionalUsd > 0
                                ? 'text-[#2CC7A0]'
                                : snapshot.totals.deltaNotionalUsd < 0
                                    ? 'text-[#F06152]'
                                    : 'text-[#D8DEE8]',
                        )}
                        data-testid="true-cvd-total-delta"
                    >
                        {formatUsdDelta(snapshot.totals.deltaNotionalUsd)}
                    </span>
                </div>

                {/* Segment Selector Tabs - Strict boundary: Segments are never joined */}
                <div className="flex items-center gap-1 overflow-x-auto py-0.5" role="tablist" aria-label="CVD Segments">
                    {segments.map((segment) => {
                        const isSelected = activeSegment?.segmentId === segment.segmentId;
                        const hasGap = segment.startReasons.includes('AGGREGATE_ID_GAP');
                        const hasReconnect = segment.startReasons.includes('RECONNECT');
                        return (
                            <button
                                key={segment.segmentId}
                                type="button"
                                role="tab"
                                aria-selected={isSelected}
                                onClick={() => setSelectedSegmentId(segment.segmentId)}
                                className={cn(
                                    'flex items-center gap-1 rounded px-2 py-0.5 text-[8px] font-mono transition-colors',
                                    isSelected
                                        ? 'border border-[#39A9F5]/40 bg-[#39A9F5]/10 text-[#D8DEE8]'
                                        : 'border border-transparent bg-[#18212C]/60 text-[#8390A0] hover:text-[#D8DEE8]',
                                )}
                                data-testid={`cvd-segment-tab-${segment.segmentId}`}
                            >
                                <span>{segment.segmentId}</span>
                                {hasGap && <span className="rounded bg-[#F06152]/20 px-1 py-0.2 text-[7px] font-bold text-[#F06152]">GAP</span>}
                                {hasReconnect && <span className="rounded bg-[#E5A83B]/20 px-1 py-0.2 text-[7px] font-bold text-[#E5A83B]">REC</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Active Segment Detail / Continuity Barrier Warning */}
            {activeSegment && (
                <div className="border-b border-[#18212C] bg-[#070A0F] px-3 py-1 font-mono text-[8px] text-[#8390A0]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#D8DEE8]">BOUNDARIES:</span>
                            {activeSegment.startReasons.map((reason, idx) => (
                                <span
                                    key={`${activeSegment.segmentId}-reason-${idx}`}
                                    className={cn(
                                        'rounded border px-1.5 py-0.2 font-bold',
                                        reason === 'CAPTURE_START'
                                            ? 'border-[#39A9F5]/30 bg-[#39A9F5]/10 text-[#39A9F5]'
                                            : reason === 'AGGREGATE_ID_GAP'
                                                ? 'border-[#F06152]/30 bg-[#F06152]/10 text-[#F06152]'
                                                : 'border-[#E5A83B]/30 bg-[#E5A83B]/10 text-[#E5A83B]',
                                    )}
                                    data-testid={`cvd-boundary-tag-${reason.toLowerCase()}`}
                                >
                                    {reason.replace(/_/g, ' ')}
                                </span>
                            ))}
                            <span className="text-[#364150]">·</span>
                            <span>BARS: {activeSegment.bars.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>SEGMENT DELTA:</span>
                            <span
                                className={cn(
                                    'font-bold',
                                    activeSegment.finalCumulativeDeltaNotionalUsd > 0
                                        ? 'text-[#2CC7A0]'
                                        : activeSegment.finalCumulativeDeltaNotionalUsd < 0
                                            ? 'text-[#F06152]'
                                            : 'text-[#D8DEE8]',
                                )}
                                data-testid="active-segment-final-delta"
                            >
                                {formatUsdDelta(activeSegment.finalCumulativeDeltaNotionalUsd)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Segment Visualization Container */}
            <div className="relative min-h-0 flex-1 overflow-y-auto p-3" data-testid="true-cvd-segments-container">
                {activeSegment && (
                    <div className="space-y-2">
                        {/* Segment SVG Stepped Delta Path - Never connects across segment boundary */}
                        <div className="rounded border border-[#18212C] bg-[#0C1118] p-2.5">
                            <div className="mb-2 flex items-center justify-between font-mono text-[8px] text-[#5C697A]">
                                <span>SEGMENT RUN: {activeSegment.segmentId} (ISOLATED CONTINUITY)</span>
                                <span>{formatTime(activeSegment.bars[0]?.openTime ?? 0)} — {formatTime(activeSegment.bars.at(-1)?.closeTime ?? 0)}</span>
                            </div>
                            <SegmentStepPlot segment={activeSegment} />
                        </div>

                        {/* Bar Breakdown Table */}
                        <div className="overflow-x-auto rounded border border-[#18212C] bg-[#0C1118]">
                            <table className="w-full text-left font-mono text-[8px] tabular-nums">
                                <thead className="border-b border-[#18212C] bg-[#070A0F] text-[#5C697A]">
                                    <tr>
                                        <th className="px-2 py-1">OPEN TIME</th>
                                        <th className="px-2 py-1 text-right">BUY BTC</th>
                                        <th className="px-2 py-1 text-right">SELL BTC</th>
                                        <th className="px-2 py-1 text-right">BUY USD</th>
                                        <th className="px-2 py-1 text-right">SELL USD</th>
                                        <th className="px-2 py-1 text-right">BAR DELTA</th>
                                        <th className="px-2 py-1 text-right">CUMULATIVE DELTA</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#18212C]/40 text-[#8390A0]">
                                    {activeSegment.bars.map((bar, i) => (
                                        <tr key={`${bar.openTime}-${i}`} className="hover:bg-white/5">
                                            <td className="px-2 py-1 font-bold text-[#D8DEE8]">{formatTime(bar.openTime)}</td>
                                            <td className="px-2 py-1 text-right">{bar.buyVolumeBtc.toFixed(4)}</td>
                                            <td className="px-2 py-1 text-right">{bar.sellVolumeBtc.toFixed(4)}</td>
                                            <td className="px-2 py-1 text-right">{formatUsdDelta(bar.buyNotionalUsd)}</td>
                                            <td className="px-2 py-1 text-right">{formatUsdDelta(-bar.sellNotionalUsd)}</td>
                                            <td
                                                className={cn(
                                                    'px-2 py-1 text-right font-semibold',
                                                    bar.deltaNotionalUsd > 0
                                                        ? 'text-[#2CC7A0]'
                                                        : bar.deltaNotionalUsd < 0
                                                            ? 'text-[#F06152]'
                                                            : 'text-[#D8DEE8]',
                                                )}
                                            >
                                                {formatUsdDelta(bar.deltaNotionalUsd)}
                                            </td>
                                            <td
                                                className={cn(
                                                    'px-2 py-1 text-right font-bold',
                                                    bar.cumulativeDeltaNotionalUsd > 0
                                                        ? 'text-[#2CC7A0]'
                                                        : bar.cumulativeDeltaNotionalUsd < 0
                                                            ? 'text-[#F06152]'
                                                            : 'text-[#D8DEE8]',
                                                )}
                                            >
                                                {formatUsdDelta(bar.cumulativeDeltaNotionalUsd)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Provenance Strip */}
            {showProvenance && (
                <div className="border-t border-[#18212C] p-2 bg-[#0C1118]">
                    <TrueFlowProvenanceBanner coverage={snapshot.coverage} compact />
                </div>
            )}
        </div>
    );
}

function SegmentStepPlot({ segment }: { segment: CvdSegmentV1 }) {
    const bars = segment.bars;
    if (bars.length === 0) return null;

    const deltas = bars.map((b) => b.cumulativeDeltaNotionalUsd);
    const minDelta = Math.min(0, ...deltas);
    const maxDelta = Math.max(0, ...deltas);
    const range = maxDelta - minDelta || 1;

    const width = 600;
    const height = 80;
    const padding = 10;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    const getY = (val: number) => {
        return padding + plotHeight - ((val - minDelta) / range) * plotHeight;
    };

    const zeroY = getY(0);

    // Build step points
    const points: Array<{ x: number; y: number; bar: CvdBarV1 }> = bars.map((bar, index) => {
        const x = padding + (index / Math.max(1, bars.length - 1)) * plotWidth;
        const y = getY(bar.cumulativeDeltaNotionalUsd);
        return { x, y, bar };
    });

    const pathD = points.reduce((acc, pt, i) => {
        if (i === 0) return `M ${pt.x} ${pt.y}`;
        const prev = points[i - 1];
        // Stepped horizontal then vertical
        return `${acc} L ${pt.x} ${prev.y} L ${pt.x} ${pt.y}`;
    }, '');

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-24 overflow-visible"
            data-testid={`segment-step-plot-${segment.segmentId}`}
        >
            {/* Zero line */}
            <line
                x1={padding}
                y1={zeroY}
                x2={width - padding}
                y2={zeroY}
                stroke="#18212C"
                strokeDasharray="2,2"
                strokeWidth={1}
            />

            {/* Stepped cumulative delta path */}
            <path
                d={pathD}
                fill="none"
                stroke={segment.finalCumulativeDeltaNotionalUsd >= 0 ? '#2CC7A0' : '#F06152'}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Points */}
            {points.map((pt, i) => (
                <circle
                    key={`pt-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={3}
                    fill="#070A0F"
                    stroke={pt.bar.cumulativeDeltaNotionalUsd >= 0 ? '#2CC7A0' : '#F06152'}
                    strokeWidth={1.5}
                />
            ))}
        </svg>
    );
}
