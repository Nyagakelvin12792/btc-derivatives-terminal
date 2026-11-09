'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Clock, AlertTriangle, Calendar } from 'lucide-react';
import {
    evaluateUsMarketContext,
} from '../../lib/market-data/us-context';
import { cn } from '../../lib/ui/cn';

export interface UsMarketContextDrawerProps {
    timestampMs?: number;
    className?: string;
}

export default function UsMarketContextDrawer({
    timestampMs,
    className,
}: UsMarketContextDrawerProps) {
    const [expanded, setExpanded] = useState(false);
    const [fridayClose, setFridayClose] = useState<string>('');
    const [sundayOpen, setSundayOpen] = useState<string>('');
    const [etfFlowM, setEtfFlowM] = useState<string>('');

    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, []);
    const effectiveTs = timestampMs ?? now ?? 0;
    const snapshot = useMemo(
        () =>
            evaluateUsMarketContext(effectiveTs, [], {
                fridayClosePrice: fridayClose ? Number(fridayClose) : null,
                sundayOpenPrice: sundayOpen ? Number(sundayOpen) : null,
                etfNetFlowUsdMillions: etfFlowM ? Number(etfFlowM) : null,
            }),
        [effectiveTs, etfFlowM, fridayClose, sundayOpen],
    );

    const nyTimeStr = effectiveTs === 0 ? 'Awaiting clock' : `${String(snapshot.nyHour).padStart(2, '0')}:${String(snapshot.nyMinute).padStart(2, '0')} ${
        snapshot.isDstActive ? 'EDT' : 'EST'
    }`;

    return (
        <div
            className={cn('rounded border border-[#18212C] bg-[#0C1118] p-3', className)}
            data-testid="us-market-context-drawer"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <Clock className="size-3 text-[#39A9F5]" />
                    <span>US SESSION &amp; MACRO CONTEXT</span>
                </div>
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    data-testid="us-context-toggle-btn"
                    className="rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 font-mono text-[8px] font-semibold text-[#39A9F5] hover:bg-[#141B24]"
                >
                    {expanded ? 'HIDE' : 'INSPECT'}
                </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[8.5px]">
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                    <span className="text-[7.5px] text-[#8390A0]">NEW YORK WALL CLOCK</span>
                    <div className="mt-0.5 font-bold text-[#D8DEE8]" data-testid="us-ny-clock">
                        {nyTimeStr}
                    </div>
                    <span className="text-[7.5px] text-[#39A9F5]">{snapshot.sessionPhase}</span>
                </div>
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                    <span className="text-[7.5px] text-[#8390A0]">DECISION WINDOW (10:00–11:30)</span>
                    <div
                        className={cn(
                            'mt-0.5 font-bold',
                            snapshot.inNyDecisionWindow ? 'text-[#2CC7A0]' : 'text-[#8390A0]',
                        )}
                        data-testid="us-decision-window-status"
                    >
                        {snapshot.inNyDecisionWindow
                            ? 'ACTIVE · ELIGIBLE'
                            : snapshot.inNyOpeningRangeWindow
                              ? 'OR DISCOVERY (09:30–10:00)'
                              : 'STANDBY'}
                    </div>
                    <span className="text-[7.5px] text-[#8390A0]">
                        Macro Gate: {snapshot.activeMacroBlock.blocked ? 'BLOCKED' : 'CLEAR'}
                    </span>
                </div>
            </div>

            {snapshot.activeMacroBlock.blocked && (
                <div className="mt-2 flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 font-mono text-[8px] text-amber-200">
                    <AlertTriangle className="size-3 shrink-0 text-amber-400" />
                    <span>
                        Macro Blackout Active ({snapshot.activeMacroBlock.eventName}): ±30m suppression engaged.
                    </span>
                </div>
            )}

            {expanded && (
                <div className="mt-2.5 space-y-2 border-t border-[#18212C] pt-2 font-mono text-[8px]">
                    <div className="flex items-center justify-between text-[#8390A0]">
                        <span className="flex items-center gap-1 font-bold">
                            <Calendar className="size-2.5 text-[#39A9F5]" />
                            MANUAL CME GAP &amp; ETF FLOW INPUTS ($0 SPEND)
                        </span>
                        {snapshot.cmeContext.gapLow !== null && snapshot.cmeContext.gapHigh !== null && (
                            <span className="text-[#2CC7A0]">
                                Gap: ${Math.round(snapshot.cmeContext.gapLow).toLocaleString()}–$
                                {Math.round(snapshot.cmeContext.gapHigh).toLocaleString()}
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        <label className="block">
                            <span className="text-[7px] text-[#8390A0]">CME Fri Close</span>
                            <input
                                type="number"
                                value={fridayClose}
                                onChange={(e) => setFridayClose(e.target.value)}
                                className="mt-0.5 w-full rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-1 text-[8.5px] text-[#D8DEE8]"
                                data-testid="us-cme-fri-close"
                            />
                        </label>
                        <label className="block">
                            <span className="text-[7px] text-[#8390A0]">CME Sun Open</span>
                            <input
                                type="number"
                                value={sundayOpen}
                                onChange={(e) => setSundayOpen(e.target.value)}
                                className="mt-0.5 w-full rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-1 text-[8.5px] text-[#D8DEE8]"
                                data-testid="us-cme-sun-open"
                            />
                        </label>
                        <label className="block">
                            <span className="text-[7px] text-[#8390A0]">ETF Flow ($M)</span>
                            <input
                                type="number"
                                value={etfFlowM}
                                onChange={(e) => setEtfFlowM(e.target.value)}
                                className="mt-0.5 w-full rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-1 text-[8.5px] text-[#D8DEE8]"
                                data-testid="us-etf-flow-input"
                            />
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}
