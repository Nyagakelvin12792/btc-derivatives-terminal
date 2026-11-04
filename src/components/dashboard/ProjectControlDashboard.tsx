'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ProjectControlResponseV1Schema, type ProjectControlResponseV1 } from '../../lib/project-control/contracts';
import { cn } from '../../lib/ui/cn';
import ProjectMilestoneCard from './ProjectMilestoneCard';
import ProjectTaskTable from './ProjectTaskTable';
import SpendSummaryCard from './SpendSummaryCard';
import ProjectControlFilters from './ProjectControlFilters';

export interface ProjectControlDashboardProps {
    initialData?: ProjectControlResponseV1 | null;
    className?: string;
}

export default function ProjectControlDashboard({
    initialData = null,
    className,
}: ProjectControlDashboardProps) {
    const [data, setData] = useState<ProjectControlResponseV1 | null>(initialData);
    const [loading, setLoading] = useState<boolean>(!initialData);
    const [error, setError] = useState<string | null>(null);
    const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialData?.progress.generatedAt ?? null);

    const [activeTab, setActiveTab] = useState<'MILESTONES' | 'SPEND'>('MILESTONES');
    const [expandedMilestoneIds, setExpandedMilestoneIds] = useState<Record<string, boolean>>({
        'UX16.2': true,
    });

    const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
    const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/project-control', {
                headers: { 'Cache-Control': 'no-store' },
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            const parsed = ProjectControlResponseV1Schema.safeParse(await res.json());
            if (!parsed.success) throw new Error('Project-control telemetry failed schema validation');
            setData(parsed.data);
            setLastSyncedAt(new Date().toISOString());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch project-control telemetry');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let isCancelled = false;
        if (!initialData) {
            fetch('/api/project-control', { headers: { 'Cache-Control': 'no-store' } })
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    return res.json() as Promise<unknown>;
                })
                .then((json) => {
                    const parsed = ProjectControlResponseV1Schema.safeParse(json);
                    if (!parsed.success) throw new Error('Project-control telemetry failed schema validation');
                    if (!isCancelled) {
                        setData(parsed.data);
                        setLastSyncedAt(new Date().toISOString());
                        setLoading(false);
                    }
                })
                .catch((err) => {
                    if (!isCancelled) {
                        setError(err instanceof Error ? err.message : 'Failed to fetch project-control telemetry');
                        setLoading(false);
                    }
                });
        }
        return () => {
            isCancelled = true;
        };
    }, [initialData]);

    useEffect(() => {
        if (!autoSyncEnabled) return;
        const timer = window.setInterval(() => {
            void fetchData();
        }, 15_000);
        return () => window.clearInterval(timer);
    }, [autoSyncEnabled, fetchData]);

    const toggleMilestone = (id: string) => {
        setExpandedMilestoneIds((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    if (loading && !data) {
        return (
            <div
                className={cn('flex min-h-[400px] items-center justify-center font-mono text-[10px] text-[#8390A0]', className)}
                data-testid="project-control-loading"
            >
                <div className="text-center">
                    <p className="font-bold text-[#D8DEE8]">LOADING PROJECT CONTROL TELEMETRY…</p>
                    <p className="mt-1 text-[#5C697A]">Validating progress and cost schema from /api/project-control</p>
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div
                className={cn('flex min-h-[400px] items-center justify-center font-mono text-[10px] text-[#F06152]', className)}
                data-testid="project-control-error"
            >
                <div className="rounded border border-[#F06152]/30 bg-[#F06152]/10 p-4 text-center">
                    <p className="font-bold">ERROR LOADING TELEMETRY</p>
                    <p className="mt-1 text-[#D8DEE8]">{error}</p>
                    <button
                        type="button"
                        onClick={fetchData}
                        className="mt-3 rounded border border-[#F06152]/40 bg-[#F06152]/20 px-3 py-1 font-bold text-[#D8DEE8] hover:bg-[#F06152]/30"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { progress, usage } = data;
    const { totals } = progress;

    return (
        <div
            className={cn('space-y-4 font-sans text-[#D8DEE8]', className)}
            data-testid="project-control-dashboard"
        >
            {error && (
                <div role="alert" className="rounded border border-[#F06152]/40 bg-[#F06152]/10 px-3 py-2 font-mono text-[9px] text-[#F06152]">
                    {error}. Showing the last validated snapshot.
                </div>
            )}
            {/* Header: Project Info & Separated Completion Percentages */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#18212C] pb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black uppercase tracking-wider text-[#39A9F5]">
                                PROJECT CONTROL DASHBOARD
                            </span>
                            <span className="rounded bg-[#18212C] px-1.5 py-0.5 font-mono text-[8px] text-[#8390A0]">
                                {progress.projectId}
                            </span>
                            <span className="rounded border border-[#39A9F5]/30 bg-[#39A9F5]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#39A9F5]">
                                UX17 ACTIVE INITIATIVE
                            </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] text-[#5C697A]">
                            <span>BRANCH: <span className="text-[#8390A0]">{progress.sourceBranch}</span></span>
                            <span>·</span>
                            <span>COMMIT: <span className="text-[#8390A0]">{progress.sourceCommit ?? '—'}</span></span>
                            <span>·</span>
                            <span>AS OF: <span className="text-[#8390A0]">{new Date(progress.generatedAt).toLocaleString()}</span></span>
                            {lastSyncedAt && (
                                <>
                                    <span>·</span>
                                    <span data-testid="last-synced-timestamp">
                                        LAST SYNC: <span className="text-[#2CC7A0]">{new Date(lastSyncedAt).toLocaleTimeString()}</span>
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setAutoSyncEnabled((prev) => !prev)}
                            className={cn(
                                'rounded border px-2 py-1 font-mono text-[9px] font-bold transition-colors',
                                autoSyncEnabled
                                    ? 'border-[#2CC7A0]/40 bg-[#2CC7A0]/10 text-[#2CC7A0]'
                                    : 'border-[#18212C] bg-[#070A0F] text-[#5C697A]',
                            )}
                            data-testid="auto-sync-toggle"
                        >
                            {autoSyncEnabled ? 'LIVE SYNC: 15s' : 'LIVE SYNC: OFF'}
                        </button>
                        <button
                            type="button"
                            onClick={fetchData}
                            className="rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1 font-mono text-[9px] font-bold text-[#8390A0] hover:border-[#39A9F5]/40 hover:text-[#D8DEE8]"
                            data-testid="refresh-telemetry-button"
                        >
                            Refresh Telemetry
                        </button>
                    </div>
                </div>

                {/* 3 Key Separate Progress Metrics */}
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] text-[#5C697A]">IMPLEMENTED</span>
                        <div
                            className="text-lg font-black text-[#D8DEE8]"
                            data-testid="implemented-percent"
                        >
                            {totals.implementedPercent}%
                        </div>
                        <span className="text-[7px] text-[#5C697A]">w: {totals.implementedWeight} / {totals.totalWeight}</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] text-[#5C697A]">TESTED</span>
                        <div
                            className="text-lg font-black text-[#39A9F5]"
                            data-testid="tested-percent"
                        >
                            {totals.testedPercent}%
                        </div>
                        <span className="text-[7px] text-[#5C697A]">w: {totals.testedWeight} / {totals.totalWeight}</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] text-[#5C697A]">ARCHITECT ACCEPTED</span>
                        <div
                            className="text-lg font-black text-[#2CC7A0]"
                            data-testid="accepted-percent"
                        >
                            {totals.acceptedPercent}%
                        </div>
                        <span className="text-[7px] text-[#5C697A]">w: {totals.acceptedWeight} / {totals.totalWeight}</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] text-[#5C697A]">REVIEW REQUIRED</span>
                        <div
                            className="text-lg font-black text-[#E5A83B]"
                            data-testid="review-required-tasks"
                        >
                            {totals.reviewRequiredTasks}
                        </div>
                        <span className="text-[7px] text-[#5C697A]">Pending handoffs</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] text-[#5C697A]">BLOCKED TASKS</span>
                        <div
                            className="text-lg font-black text-[#F06152]"
                            data-testid="blocked-tasks"
                        >
                            {totals.blockedTasks}
                        </div>
                        <span className="text-[7px] text-[#5C697A]">Active blockers</span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#18212C] font-mono text-[10px]" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'MILESTONES'}
                    onClick={() => setActiveTab('MILESTONES')}
                    className={cn(
                        'border-b-2 px-4 py-2 font-bold transition-colors',
                        activeTab === 'MILESTONES'
                            ? 'border-[#39A9F5] text-[#D8DEE8]'
                            : 'border-transparent text-[#8390A0] hover:text-[#D8DEE8]',
                    )}
                    data-testid="tab-milestones"
                >
                    MILESTONES &amp; TASKS ({progress.milestones.length})
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'SPEND'}
                    onClick={() => setActiveTab('SPEND')}
                    className={cn(
                        'border-b-2 px-4 py-2 font-bold transition-colors',
                        activeTab === 'SPEND'
                            ? 'border-[#39A9F5] text-[#D8DEE8]'
                            : 'border-transparent text-[#8390A0] hover:text-[#D8DEE8]',
                    )}
                    data-testid="tab-spend"
                >
                    SPEND &amp; TELEMETRY (known ${usage.totals.knownSpendUsd.toFixed(2)} · {usage.totals.runsWithUnreportedUsage + usage.totals.runsWithUnknownCost} unreported)
                </button>
            </div>

            {/* Tab 1: Milestones & Tasks */}
            {activeTab === 'MILESTONES' && (
                <div className="space-y-4">
                    {/* Filters */}
                    <ProjectControlFilters
                        selectedAgent={selectedAgent}
                        onSelectAgent={setSelectedAgent}
                        selectedStatus={selectedStatus}
                        onSelectStatus={setSelectedStatus}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                    />

                    {/* Milestones Accordion */}
                    <div className="space-y-3" data-testid="milestones-accordion">
                        {progress.milestones.map((m) => {
                            const isExpanded = !!expandedMilestoneIds[m.id];
                            return (
                                <div key={m.id} className="space-y-2">
                                    <ProjectMilestoneCard
                                        milestone={m}
                                        isExpanded={isExpanded}
                                        onToggleExpand={() => toggleMilestone(m.id)}
                                    />

                                    {isExpanded && (
                                        <div className="pl-2 sm:pl-4">
                                            <ProjectTaskTable
                                                features={m.features}
                                                selectedAgent={selectedAgent}
                                                selectedStatus={selectedStatus}
                                                searchQuery={searchQuery}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tab 2: Spend & Telemetry */}
            {activeTab === 'SPEND' && (
                <SpendSummaryCard usage={usage} />
            )}
        </div>
    );
}
