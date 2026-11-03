'use client';

import React from 'react';
import type { CaptureCoverageV1 } from '../../lib/orderflow/contracts';
import { cn } from '../../lib/ui/cn';

export interface TrueFlowProvenanceBannerProps {
    coverage: CaptureCoverageV1;
    className?: string;
    compact?: boolean;
}

export function qualityColor(quality: CaptureCoverageV1['quality']): string {
    switch (quality) {
        case 'HIGH':
            return 'text-[#2CC7A0] border-[#2CC7A0]/30 bg-[#2CC7A0]/10';
        case 'MEDIUM':
            return 'text-[#E5A83B] border-[#E5A83B]/30 bg-[#E5A83B]/10';
        case 'LOW':
            return 'text-[#F06152] border-[#F06152]/30 bg-[#F06152]/10';
        case 'UNAVAILABLE':
        default:
            return 'text-[#8E98A6] border-[#8E98A6]/30 bg-[#8E98A6]/10';
    }
}

export function sequenceStateColor(state: CaptureCoverageV1['sequenceState']): string {
    switch (state) {
        case 'LIVE':
            return 'text-[#2CC7A0]';
        case 'GAP':
            return 'text-[#F06152]';
        case 'STALE':
            return 'text-[#E5A83B]';
        case 'BUFFERING':
            return 'text-[#39A9F5]';
        case 'OFFLINE':
        default:
            return 'text-[#8E98A6]';
    }
}

export default function TrueFlowProvenanceBanner({
    coverage,
    className,
    compact = false,
}: TrueFlowProvenanceBannerProps) {
    const formatTimestamp = (ts: number | null): string => {
        if (ts === null || !Number.isFinite(ts)) return 'None';
        return new Date(ts).toISOString().replace('T', ' ').substring(11, 19) + ' UTC';
    };

    if (compact) {
        return (
            <div
                className={cn(
                    'flex flex-wrap items-center gap-2 rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1.5 font-mono text-[9px] text-[#8390A0]',
                    className,
                )}
                data-testid="true-flow-provenance-compact"
            >
                <span className="font-bold text-[#D8DEE8]">{coverage.venue}</span>
                <span className="text-[#364150]">·</span>
                <span>{coverage.precision}</span>
                <span className="text-[#364150]">·</span>
                <span className={sequenceStateColor(coverage.sequenceState)}>{coverage.sequenceState}</span>
                {coverage.gapCount > 0 && (
                    <>
                        <span className="text-[#364150]">·</span>
                        <span className="text-[#F06152] font-semibold">{coverage.gapCount} {coverage.gapCount === 1 ? 'GAP' : 'GAPS'}</span>
                    </>
                )}
                <span className="text-[#364150]">·</span>
                <span>{coverage.freshnessMs}ms</span>
                <span className="ml-auto rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ borderColor: 'transparent' }}>
                    <span className={cn('rounded px-1 py-0.5 border', qualityColor(coverage.quality))}>
                        {coverage.quality}
                    </span>
                </span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                'rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono text-[9px] text-[#8390A0]',
                className,
            )}
            data-testid="true-flow-provenance-banner"
        >
            <div className="flex items-center justify-between border-b border-[#18212C] pb-1.5">
                <span className="font-bold uppercase tracking-wider text-[#D8DEE8]">
                    DATA PROVENANCE · {coverage.symbol}
                </span>
                <span className={cn('rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase', qualityColor(coverage.quality))}>
                    {coverage.quality} QUALITY
                </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <div>
                    <span className="text-[#5C697A]">VENUE: </span>
                    <span className="font-semibold text-[#D8DEE8]">{coverage.venue}</span>
                </div>
                <div>
                    <span className="text-[#5C697A]">STATE: </span>
                    <span className={cn('font-semibold', sequenceStateColor(coverage.sequenceState))}>
                        {coverage.sequenceState}
                    </span>
                </div>
                <div>
                    <span className="text-[#5C697A]">PRECISION: </span>
                    <span className="text-[#D8DEE8]">{coverage.precision}</span>
                </div>
                <div>
                    <span className="text-[#5C697A]">APPROX: </span>
                    <span className={cn(coverage.approximation === 'NONE' ? 'text-[#2CC7A0]' : 'text-[#E5A83B]')}>
                        {coverage.approximation}
                    </span>
                </div>
                <div>
                    <span className="text-[#5C697A]">COVERAGE START: </span>
                    <span className="text-[#D8DEE8]">{formatTimestamp(coverage.coverageStart)}</span>
                </div>
                <div>
                    <span className="text-[#5C697A]">COVERAGE END: </span>
                    <span className="text-[#D8DEE8]">{formatTimestamp(coverage.coverageEnd)}</span>
                </div>
                <div>
                    <span className="text-[#5C697A]">FRESHNESS: </span>
                    <span className="text-[#D8DEE8]">{coverage.freshnessMs}ms</span>
                </div>
                <div>
                    <span className="text-[#5C697A]">GAPS DETECTED: </span>
                    <span className={coverage.gapCount > 0 ? 'font-bold text-[#F06152]' : 'text-[#2CC7A0]'}>
                        {coverage.gapCount}
                    </span>
                </div>
            </div>
        </div>
    );
}
