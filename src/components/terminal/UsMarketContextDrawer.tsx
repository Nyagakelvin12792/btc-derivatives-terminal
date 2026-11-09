'use client';

import React, { useMemo, useState } from 'react';
import { Clock, AlertTriangle, Calendar } from 'lucide-react';
import {
    evaluateUsMarketContext,
    type MacroReleaseWindowV1,
} from '../../lib/market-data/us-context';
import { cn } from '../../lib/ui/cn';

export interface UsMarketContextDrawerProps {
    timestampMs?: number;
    className?: string;
}

const DEFAULT_UPCOMING_RELEASES: MacroReleaseWindowV1[] = [
    {
        id: 'cpi-release-window',
        name: 'CPI',
        timestampMs: Date.UTC(2026, 10, 12, 13, 30, 0), // 08:30 EST
        suppressMinutesBefore: 30,
        suppressMinutesAfter: 30,
    },
    {
        id: 'fomc-release-window',
        name: 'FOMC',
        timestampMs: Date.UTC(2026, 10, 18, 19, 0, 0), // 14:00 EST
        suppressMinutesBefore: 30,
        suppressMinutesAfter: 30,
    },
];

export default function UsMarketContextDrawer({
    timestampMs,
    className,
}: UsMarketContextDrawerProps) {
    const [expanded, setExpanded] = useState(false);
    const [fridayClose, setFridayClose] = useState<string>('69450');
    const [sundayOpen, setSundayOpen] = useState<string>('69820');
    const [etfFlowM, setEtfFlowM] = useState<string>('245.0');

    const effectiveTs = timestampMs ?? Date.now();
    const snapshot = useMemo(
        () =>
            evaluateUsMarketContext(effectiveTs, DEFAULT_UPCOMING_RELEASES, {
                fridayClosePrice: fridayClose ? Number(fridayClose) : null,
                sundayOpenPrice: sundayOpen ? Number(sundayOpen) : null,
                etfNetFlowUsdMillions: etfFlowM ? Number(etfFlowM) : null,
            }),
        [effectiveTs, etfFlowM, fridayClose, sundayOpen],
    );

    const nyTimeStr = `${String(snapshot.nyHour).padStart(2, '0')}:${String(snapshot.nyMinute).padStart(2, '0')} ${
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
