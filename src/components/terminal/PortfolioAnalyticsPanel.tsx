'use client';

import React, { useMemo, useState } from 'react';
import type { ManagedTrade } from '../../lib/risk/trade-manager';
import {
    buildPortfolioAnalyticsReport,
    type AttributionSliceV1,
} from '../../lib/execution/portfolio-analytics';
import type { PaperAccountSnapshotV1, PaperJournalEntryV1 } from '../../lib/execution/paper-ledger';
import { cn } from '../../lib/ui/cn';

interface PortfolioAnalyticsPanelProps {
    trades: readonly ManagedTrade[];
    startingCapitalUsdt?: number;
}

function convertManagedTradesToPaperSnapshot(
    trades: readonly ManagedTrade[],
    startingCapitalUsdt = 10_000,
): PaperAccountSnapshotV1 {
    const completed = trades.filter((t) => t.status === 'CLOSED' || t.status === 'STOPPED_OUT');
    const journal: PaperJournalEntryV1[] = completed
        .slice()
        .reverse()
        .map((t) => {
            const r = t.initialRiskUsd > 0 ? t.realizedPnlUsd / t.initialRiskUsd : 0;
            const exitPrice =
                t.status === 'STOPPED_OUT'
                    ? t.currentStopPrice
                    : t.takeProfits.find((tp) => tp.filled)?.price ?? t.entryPrice;
            return {
                tradeId: t.id,
                accountScope: 'PAPER_ACCOUNT',
                strategyId: t.journal.setupScenario || 'NY_VALUE_RETEST_V1',
                executionSource: t.executionMode === 'HISTORICAL_REPLAY' ? 'STRATEGY_LAB' : 'MANUAL',
                sessionTag: t.journal.sessionTag,
                regimeTag: `${t.journal.htfBias}_${t.journal.qualityGrade}`,
                side: t.direction,
                openedAtMs: (t.openedAt ?? t.startTime) * 1000,
                closedAtMs: (t.closedAt ?? t.endTime) * 1000,
                entryPrice: t.entryPrice,
                exitPrice,
                stopPrice: t.initialStopPrice,
                targetPrice: t.takeProfits.at(-1)?.price ?? t.entryPrice,
                quantityBtc: t.positionSizeBtc,
                grossPnlUsdt: t.realizedPnlUsd,
                feesPaidUsdt: 0,
                netPnlUsdt: t.realizedPnlUsd,
                initialRiskUsdt: t.initialRiskUsd,
                rMultipleNet: r,
                maeUsdt: t.maeUsd,
                mfeUsdt: t.mfeUsd,
                holdingDurationMs: Math.max(0, ((t.closedAt ?? t.endTime) - (t.openedAt ?? t.startTime)) * 1000),
                exitReason: t.status === 'STOPPED_OUT' ? 'STOP_LOSS' : 'TAKE_PROFIT',
                notes: t.journal.entryRationale,
            };
        });

    const realizedPnlUsdt = journal.reduce((acc, j) => acc + j.netPnlUsdt, 0);
    const equityUsdt = startingCapitalUsdt + realizedPnlUsdt;

    return {
        accountId: 'paper-default-10k',
        accountScope: 'PAPER_ACCOUNT',
        startingCapitalUsdt,
        cashBalanceUsdt: equityUsdt,
        realizedPnlUsdt,
        unrealizedPnlUsdt: 0,
        equityUsdt,
        peakEquityUsdt: Math.max(startingCapitalUsdt, equityUsdt),
        drawdownUsdt: Math.max(0, startingCapitalUsdt - equityUsdt),
        drawdownPct:
            startingCapitalUsdt > 0
                ? Math.max(0, ((startingCapitalUsdt - equityUsdt) / startingCapitalUsdt) * 100)
                : 0,
        reservedCapitalUsdt: 0,
        availableCashUsdt: equityUsdt,
        weeklyStartEquityUsdt: startingCapitalUsdt,
        currentWeekKey: '2026-W45',
        weeklyLossPct:
            startingCapitalUsdt > 0 && realizedPnlUsdt < 0
                ? (Math.abs(realizedPnlUsdt) / startingCapitalUsdt) * 100
                : 0,
        weeklyLossLocked: realizedPnlUsdt <= -startingCapitalUsdt * 0.015,
        openPosition: null,
        journal,
    };
}

function renderSliceTable(title: string, slices: readonly AttributionSliceV1[], testId: string) {
    return (
        <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2" data-testid={testId}>
            <div className="mb-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-zinc-400">
                {title}
            </div>
            {slices.length === 0 ? (
                <div className="text-[8px] text-zinc-500">No closed trades recorded for attribution.</div>
            ) : (
                <div className="space-y-1 font-mono text-[8px]">
                    {slices.map((s) => (
                        <div
                            key={s.key}
                            className="flex items-center justify-between border-b border-[#141d29] pb-1 last:border-none last:pb-0"
                        >
                            <span className="truncate font-semibold text-zinc-200">{s.key}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-400">{s.tradeCount}T</span>
                                <span className="text-emerald-300">{s.winRatePct.toFixed(0)}%W</span>
                                <span
                                    className={cn(
                                        'font-bold',
                                        s.expectancyR >= 0 ? 'text-cyan-300' : 'text-rose-300',
                                    )}
                                >
                                    {s.expectancyR >= 0 ? '+' : ''}
                                    {s.expectancyR.toFixed(2)}R
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function PortfolioAnalyticsPanel({
    trades,
    startingCapitalUsdt = 10_000,
}: PortfolioAnalyticsPanelProps) {
    const [subTab, setSubTab] = useState<'ACCOUNT' | 'ATTRIBUTION'>('ACCOUNT');
    const report = useMemo(
        () => buildPortfolioAnalyticsReport(convertManagedTradesToPaperSnapshot(trades, startingCapitalUsdt)),
        [trades, startingCapitalUsdt],
    );

    return (
        <div
            className="rounded-md border border-[#233142] bg-[#080d15] p-2.5"
            data-testid="ux20-portfolio-attribution-panel"
        >
            <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#D8DEE8]">
                    Paper Ledger &amp; Attribution (§8.1)
                </span>
                <div className="flex gap-1">
                    {(['ACCOUNT', 'ATTRIBUTION'] as const).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setSubTab(tab)}
                            data-testid={`portfolio-subtab-${tab.toLowerCase()}`}
                            className={cn(
                                'rounded px-1.5 py-0.5 font-mono text-[7.5px] font-bold',
                                subTab === tab
                                    ? 'bg-[#39A9F5]/20 text-[#39A9F5] ring-1 ring-[#39A9F5]/40'
                                    : 'bg-[#060a10] text-zinc-400 hover:text-zinc-200',
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {subTab === 'ACCOUNT' ? (
                <div className="space-y-2 font-mono text-[8.5px]">
                    <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-1.5">
                            <span className="text-[7.5px] text-zinc-400">PAPER EQUITY (10K BASE)</span>
                            <div
                                className="mt-0.5 text-xs font-bold text-zinc-100"
                                data-testid="paper-account-equity"
                            >
                                ${report.accountSummary.currentEquityUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <span className="text-[7.5px] text-zinc-500">
                                Return: {report.accountSummary.totalReturnPct >= 0 ? '+' : ''}
                                {report.accountSummary.totalReturnPct.toFixed(2)}%
                            </span>
                        </div>
                        <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-1.5">
                            <span className="text-[7.5px] text-zinc-400">WEEKLY LOSS GUARD (1.5%)</span>
                            <div
                                className={cn(
                                    'mt-0.5 text-xs font-bold',
                                    report.accountSummary.weeklyLossLocked ? 'text-rose-400' : 'text-emerald-300',
                                )}
                                data-testid="paper-weekly-lock-status"
                            >
                                {report.accountSummary.weeklyLossLocked ? 'LOCKED' : 'ACTIVE'}
                            </div>
                            <span className="text-[7.5px] text-zinc-500">
                                Weekly Loss: {report.accountSummary.weeklyLossPct.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                    {report.performanceSummary.smallSampleWarning && (
                        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[8px] text-amber-200">
                            Small-sample notice: {report.performanceSummary.totalTrades} closed trades (&lt; 40 OOS research threshold).
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {renderSliceTable('By Strategy / Setup', report.attribution.byStrategy, 'attribution-by-strategy')}
                    {renderSliceTable('By Execution Source', report.attribution.byExecutionSource, 'attribution-by-source')}
                    {renderSliceTable('By Session', report.attribution.bySession, 'attribution-by-session')}
                    {renderSliceTable('By Regime / Grade', report.attribution.byRegime, 'attribution-by-regime')}
                </div>
            )}
        </div>
    );
}
