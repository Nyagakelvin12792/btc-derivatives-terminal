'use client';

import React, { useMemo, useState } from 'react';
import type { AgentUsageRunV1, UsageSpendSnapshotV1 } from '../../lib/project-control/contracts';
import { cn } from '../../lib/ui/cn';

export interface SpendSummaryCardProps {
    usage: UsageSpendSnapshotV1;
    className?: string;
}

function formatCostOrStatus(run: AgentUsageRunV1): { text: string; isAmount: boolean; classes: string } {
    if (run.costStatus === 'UNREPORTED') {
        if (run.billingMode === 'SUBSCRIPTION') {
            return { text: 'INCLUDED/UNREPORTED', isAmount: false, classes: 'text-[#39A9F5] bg-[#39A9F5]/10 border-[#39A9F5]/30' };
        }
        return { text: 'UNREPORTED', isAmount: false, classes: 'text-[#8E98A6] bg-[#8E98A6]/10 border-[#8E98A6]/30' };
    }

    if (run.costStatus === 'UNKNOWN') {
        return { text: 'UNKNOWN', isAmount: false, classes: 'text-[#8E98A6] bg-[#8E98A6]/10 border-[#8E98A6]/30' };
    }

    if (run.costStatus === 'INCLUDED_SUBSCRIPTION' || run.billingMode === 'SUBSCRIPTION') {
        return { text: 'INCLUDED/UNREPORTED', isAmount: false, classes: 'text-[#39A9F5] bg-[#39A9F5]/10 border-[#39A9F5]/30' };
    }

    if (run.costStatus === 'FREE_TIER' || run.billingMode === 'FREE_TIER') {
        return { text: 'FREE_TIER', isAmount: false, classes: 'text-[#2CC7A0] bg-[#2CC7A0]/10 border-[#2CC7A0]/30' };
    }

    if (run.providerReportedCostUsd !== null) {
        return { text: `$${run.providerReportedCostUsd.toFixed(2)}`, isAmount: true, classes: 'text-[#D8DEE8] font-bold' };
    }

    if (run.calculatedCostUsd !== null) {
        return { text: `$${run.calculatedCostUsd.toFixed(2)}`, isAmount: true, classes: 'text-[#D8DEE8] font-bold' };
    }

    return { text: 'UNREPORTED', isAmount: false, classes: 'text-[#8E98A6] bg-[#8E98A6]/10 border-[#8E98A6]/30' };
}

export default function SpendSummaryCard({ usage, className }: SpendSummaryCardProps) {
    const { totals, budgets, runs } = usage;
    const [agentFilter, setAgentFilter] = useState('ALL');
    const [providerFilter, setProviderFilter] = useState('ALL');
    const [modelFilter, setModelFilter] = useState('ALL');
    const [taskFilter, setTaskFilter] = useState('ALL');
    const options = useMemo(() => ({
        agents: [...new Set(runs.map((run) => run.agent))].sort(),
        providers: [...new Set(runs.map((run) => run.provider))].sort(),
        models: [...new Set(runs.map((run) => run.model))].sort(),
        tasks: [...new Set(runs.map((run) => run.taskId))].sort(),
    }), [runs]);
    const visibleRuns = useMemo(() => runs.filter((run) =>
        (agentFilter === 'ALL' || run.agent === agentFilter)
        && (providerFilter === 'ALL' || run.provider === providerFilter)
        && (modelFilter === 'ALL' || run.model === modelFilter)
        && (taskFilter === 'ALL' || run.taskId === taskFilter)
    ), [agentFilter, modelFilter, providerFilter, runs, taskFilter]);

    // Filter budgets that have an actual numerical budget set
    const activeBudgets = useMemo(() => {
        return budgets.filter((b) => b.budgetUsd !== null && Number.isFinite(b.budgetUsd) && b.budgetUsd > 0);
    }, [budgets]);

    return (
        <div
            className={cn('space-y-4 font-sans text-[#D8DEE8]', className)}
            data-testid="spend-summary-card"
        >
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono">
                    <span className="text-[9px] text-[#8390A0]">KNOWN SPEND</span>
                    <div className="mt-1 text-lg font-black text-[#D8DEE8]" data-testid="known-spend-amount">
                        ${totals.knownSpendUsd.toFixed(2)}
                    </div>
                    <span className="text-[8px] text-[#5C697A]">Provider + calculated</span>
                </div>

                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono">
                    <span className="text-[9px] text-[#8390A0]">PROVIDER REPORTED</span>
                    <div className="mt-1 text-lg font-black text-[#D8DEE8]" data-testid="provider-reported-amount">
                        ${totals.providerReportedSpendUsd.toFixed(2)}
                    </div>
                    <span className="text-[8px] text-[#5C697A]">Direct telemetry</span>
                </div>

                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono">
                    <span className="text-[9px] text-[#8390A0]">CALCULATED SPEND</span>
                    <div className="mt-1 text-lg font-black text-[#D8DEE8]" data-testid="calculated-spend-amount">
                        ${totals.calculatedSpendUsd.toFixed(2)}
                    </div>
                    <span className="text-[8px] text-[#5C697A]">Priced from token rates</span>
                </div>

                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono">
                    <span className="text-[9px] text-[#8390A0]">UNKNOWN / UNREPORTED RUNS</span>
                    <div className="mt-1 text-lg font-black text-[#E5A83B]" data-testid="unreported-runs-count">
                        {totals.runsWithUnreportedUsage + totals.runsWithUnknownCost}
                    </div>
                    <span className="text-[8px] text-[#5C697A]">Excluded from known spend</span>
                </div>
            </div>

            {/* Optional Budgets Section: Only displayed when budget is present */}
            {activeBudgets.length > 0 && (
                <div
                    className="rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono text-[9px]"
                    data-testid="project-budgets-section"
                >
                    <div className="border-b border-[#18212C] pb-1.5 font-bold text-[#D8DEE8]">
                        AGENT BUDGETS
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {activeBudgets.map((b) => (
                            <div key={b.agent} className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                                <div className="flex justify-between font-bold">
                                    <span className="text-[#39A9F5]">{b.agent}</span>
                                    <span>${b.budgetUsd?.toFixed(2)}</span>
                                </div>
                                <div className="mt-1 text-[8px] text-[#5C697A]">Warning threshold: {b.warningPercent}%</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Runs Telemetry Table */}
            <div className="overflow-hidden rounded border border-[#18212C] bg-[#0C1118]">
                <div className="flex items-center justify-between border-b border-[#18212C] bg-[#070A0F] px-3 py-2 font-mono text-[9px]">
                    <span className="font-bold text-[#D8DEE8]">AGENT RUNS & USAGE TELEMETRY</span>
                    <span className="text-[#8390A0]">{visibleRuns.length} of {runs.length} runs</span>
                </div>

                <div className="grid gap-2 border-b border-[#18212C] p-3 font-mono text-[9px] sm:grid-cols-2 xl:grid-cols-4">
                    {([
                        ['Agent', agentFilter, setAgentFilter, options.agents, 'spend-filter-agent'],
                        ['Provider', providerFilter, setProviderFilter, options.providers, 'spend-filter-provider'],
                        ['Model', modelFilter, setModelFilter, options.models, 'spend-filter-model'],
                        ['Task', taskFilter, setTaskFilter, options.tasks, 'spend-filter-task'],
                    ] as const).map(([label, value, setter, choices, testId]) => (
                        <label key={label} className="flex flex-col gap-1 text-[#8390A0]">
                            <span>{label}</span>
                            <select
                                aria-label={`Filter spend by ${label.toLowerCase()}`}
                                data-testid={testId}
                                value={value}
                                onChange={(event) => setter(event.target.value)}
                                className="min-w-0 rounded border border-[#263346] bg-[#070A0F] px-2 py-1 text-[#D8DEE8] outline-none focus-visible:border-[#39A9F5]"
                            >
                                <option value="ALL">All</option>
                                {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                            </select>
                        </label>
                    ))}
                </div>

                {visibleRuns.length === 0 ? (
                    <div className="p-4 text-center font-mono text-[10px] text-[#8390A0]">
                        No runs match the selected filters.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[8px] tabular-nums" data-testid="agent-runs-table">
                            <thead className="border-b border-[#18212C] bg-[#070A0F] text-[#5C697A]">
                                <tr>
                                    <th className="px-3 py-1.5">TASK ID</th>
                                    <th className="px-2 py-1.5">AGENT</th>
                                    <th className="px-2 py-1.5">PROVIDER</th>
                                    <th className="px-2 py-1.5">MODEL</th>
                                    <th className="px-2 py-1.5">BILLING</th>
                                    <th className="px-2 py-1.5 text-right">TOKENS (IN/OUT)</th>
                                    <th className="px-3 py-1.5 text-right">COST STATUS</th>
                                    <th className="px-3 py-1.5">PRICING SOURCE</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#18212C]/40 text-[#8390A0]">
                                {visibleRuns.map((run) => {
                                    const costDisplay = formatCostOrStatus(run);
                                    return (
                                        <tr key={run.id} className="hover:bg-white/[0.02]">
                                            <td className="px-3 py-1.5 font-bold text-[#D8DEE8]">{run.taskId}</td>
                                            <td className="px-2 py-1.5 text-[#39A9F5]">{run.agent}</td>
                                            <td className="px-2 py-1.5">{run.provider}</td>
                                            <td className="px-2 py-1.5">{run.model}</td>
                                            <td className="px-2 py-1.5">{run.billingMode}</td>
                                            <td className="px-2 py-1.5 text-right">
                                                {run.inputTokens !== null ? run.inputTokens.toLocaleString() : '—'} / {run.outputTokens !== null ? run.outputTokens.toLocaleString() : '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-right">
                                                <span
                                                    className={cn(
                                                        'rounded px-1.5 py-0.5 text-[8px]',
                                                        costDisplay.isAmount ? '' : 'border font-semibold',
                                                        costDisplay.classes,
                                                    )}
                                                    data-testid={`run-cost-${run.id}`}
                                                >
                                                    {costDisplay.text}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                {run.pricing?.sourceUrl ? (
                                                    <a href={run.pricing.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#39A9F5] underline-offset-2 hover:underline">
                                                        {new Date(run.pricing.effectiveAt).toLocaleDateString()} source
                                                    </a>
                                                ) : <span className="text-[#5C697A]">Unreported</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
