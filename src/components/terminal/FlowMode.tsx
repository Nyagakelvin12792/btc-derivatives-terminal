'use client';

import React from 'react';
import { Activity, BarChart2, Layers, Waves } from 'lucide-react';
import type { CaptureCoverageV1, MarketEvidenceV1 } from '../../lib/orderflow/contracts';
import type { TrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow-contracts';
import { cn } from '../../lib/ui/cn';
import TrueCvdPane from './TrueCvdPane';
import FootprintChartOverlay from './FootprintChartOverlay';
import CapturedVolumeProfileOverlay from './CapturedVolumeProfileOverlay';

export interface FlowModeProps {
    liquidityStatus: 'LIVE' | 'BUFFERING' | 'PAUSED' | 'OFFLINE' | 'GAP' | 'STALE';
    retainedFrames: number;
    footprintStatus: 'READY' | 'AWAITING_CAPTURE' | 'REPLAY' | 'NOT_CONNECTED';
    cvdStatus: 'TRADE_BASED' | 'BAR_PRECISION' | 'REPLAY' | 'UNAVAILABLE';
    currentCvdUsd: number | null;
    events: MarketEvidenceV1[];
    dataMode: CaptureCoverageV1['dataMode'];
    trueFlowSnapshot?: TrueFlowSnapshotV1 | null;
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
    trueFlowSnapshot,
    className,
}: FlowModeProps) {
    const latestSegment = trueFlowSnapshot?.cvdSegments.at(-1);
    const effectiveCvdStatus = latestSegment ? 'TRADE_BASED' : cvdStatus;
    const effectiveCvdUsd = latestSegment ? latestSegment.finalCumulativeDeltaNotionalUsd : currentCvdUsd;
    const effectiveFootprintStatus = trueFlowSnapshot && trueFlowSnapshot.footprintBars.length > 0 ? 'READY' : footprintStatus;

    const imbalancedCellsCount = trueFlowSnapshot?.footprintBars.reduce(
        (sum, bar) => sum + (bar.footprint?.cells ?? []).filter((c) => c.buyImbalance || c.sellImbalance).length,
        0,
    ) ?? 0;

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
                    <span data-testid="flow-footprint-status">{effectiveFootprintStatus}</span>
                </div>
                {trueFlowSnapshot && trueFlowSnapshot.footprintBars.length > 0 ? (
                    <div className="mt-2 font-mono text-[9px] text-[#8390A0]">
                        <div className="flex justify-between">
                            <span>CAPTURED BARS:</span>
                            <span className="font-bold text-[#D8DEE8]">{trueFlowSnapshot.footprintBars.length}</span>
                        </div>
                        <div className="flex justify-between mt-0.5">
                            <span>TOTAL TRADES:</span>
                            <span className="text-[#D8DEE8]">{trueFlowSnapshot.totals.tradeCount}</span>
                        </div>
                        {imbalancedCellsCount > 0 ? (
                            <div className="flex justify-between mt-0.5" data-testid="flow-imbalance-count">
                                <span>DIAGONAL IMBALANCES:</span>
                                <span className="font-bold text-[#E5A83B]">{imbalancedCellsCount} cells</span>
                            </div>
                        ) : (
                            <p className="mt-1 text-[8px] text-[#5C697A]">Trade-classified cells active. Diagonal imbalance enabled (ratio ≥ 3.0, min $50k).</p>
                        )}
                    </div>
                ) : (
                    <p className="mt-2 text-[9px] leading-relaxed text-[#8390A0]">Trade-classified footprint calculation active in UX16.2+. No bar imbalance is inferred from candles.</p>
                )}
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="flow-cvd-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5"><BarChart2 className="size-3 text-[#39A9F5]" />CVD COVERAGE</span>
                    <span data-testid="flow-cvd-status">{effectiveCvdStatus}</span>
                </div>
                <div className="mt-2 font-mono text-lg font-black text-[#D8DEE8]" data-testid="flow-cvd-value">{compactUsd(effectiveCvdUsd)}</div>
                {latestSegment ? (
                    <div className="mt-1 font-mono text-[8px] text-[#5C697A]">
                        Current segment; {trueFlowSnapshot?.cvdSegments.length} isolated {trueFlowSnapshot?.cvdSegments.length === 1 ? 'segment' : 'segments'} (boundaries unbridged)
                    </div>
                ) : (
                    <p className="mt-1 text-[9px] text-[#5C697A]">True trade-based CVD requires the aggregate-trade capture milestone.</p>
                )}
            </div>

            {/* Trade Volume Profile Summary when available */}
            {trueFlowSnapshot && (
                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="flow-trade-vp-container">
                    <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                        <span className="flex items-center gap-1.5"><BarChart2 className="size-3 text-[#39A9F5]" />TRADE VOLUME PROFILE</span>
                        <span className="rounded bg-[#18212C] px-1 py-0.2 text-[8px] text-[#D8DEE8]">{trueFlowSnapshot.tradeVolumeProfile.coverageKind}</span>
                    </div>
                    <div className="mt-1.5 font-mono text-[9px] text-[#8390A0]">
                        <div className="flex justify-between">
                            <span>POC:</span>
                            <span className="font-bold text-[#E5A83B]">{trueFlowSnapshot.tradeVolumeProfile.pocPrice?.toFixed(1) ?? '—'}</span>
                        </div>
                        <div className="flex justify-between mt-0.5">
                            <span>VALUE AREA:</span>
                            <span className="text-[#39A9F5]">
                                {trueFlowSnapshot.tradeVolumeProfile.valPrice?.toFixed(1) ?? '—'} – {trueFlowSnapshot.tradeVolumeProfile.vahPrice?.toFixed(1) ?? '—'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {trueFlowSnapshot && trueFlowSnapshot.cvdSegments.length > 0 && (
                <details className="rounded border border-[#18212C] bg-[#0C1118]" data-testid="flow-true-cvd-details">
                    <summary className="cursor-pointer px-3 py-2 font-mono text-[9px] font-semibold text-[#D8DEE8]">Inspect captured CVD segments</summary>
                    <div className="h-64 border-t border-[#18212C]"><TrueCvdPane snapshot={trueFlowSnapshot} showProvenance={false} /></div>
                </details>
            )}
            {trueFlowSnapshot && trueFlowSnapshot.footprintBars.length > 0 && (
                <details className="rounded border border-[#18212C] bg-[#0C1118]" data-testid="flow-footprint-details">
                    <summary className="cursor-pointer px-3 py-2 font-mono text-[9px] font-semibold text-[#D8DEE8]">Inspect captured footprint</summary>
                    <div className="h-72 border-t border-[#18212C]"><FootprintChartOverlay bars={trueFlowSnapshot.footprintBars} /></div>
                </details>
            )}
            {trueFlowSnapshot && trueFlowSnapshot.tradeVolumeProfile.rows.length > 0 && (
                <details className="rounded border border-[#18212C] bg-[#0C1118]" data-testid="flow-trade-vp-details">
                    <summary className="cursor-pointer px-3 py-2 font-mono text-[9px] font-semibold text-[#D8DEE8]">Inspect captured trade profile</summary>
                    <div className="h-72 border-t border-[#18212C]"><CapturedVolumeProfileOverlay profile={trueFlowSnapshot.tradeVolumeProfile} /></div>
                </details>
            )}

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="flow-events-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5"><Activity className="size-3 text-[#39A9F5]" />DETERMINISTIC EVENTS</span>
                    <span>{events.length} OBSERVED</span>
                </div>
                {events.length === 0 ? (
                    <p className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px] leading-relaxed text-[#8390A0]">No active deterministic microstructure events in current window.</p>
                ) : (
                    <div className="mt-2 space-y-1.5">
                        {events.map((event) => (
                            <div key={event.id} className="rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]">
                                <div className="flex justify-between gap-2 font-mono text-[8px]">
                                    <span className="font-bold text-[#D8DEE8]">{event.kind}</span>
                                    <span className="rounded bg-[#18212C] px-1 text-[#39A9F5]">{event.confidence}</span>
                                </div>
                                <div className="mt-1 text-[#8390A0]">{event.reasonCodes.join(' · ')}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
