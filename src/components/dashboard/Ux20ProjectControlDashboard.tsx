'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ProjectControlResponseV1Schema,
    type MilestoneProgressV1,
    type ProjectControlResponseV1,
    type ProjectTaskV1,
} from '../../lib/project-control/contracts';
import { buildProjectProgressSnapshotV1 } from '../../lib/project-control/progress-calculator';
import {
    evaluateUx20ReadinessGates,
    UX20_BASELINE_COMMIT,
    UX20_INITIATIVE_ID,
    UX20_INITIATIVE_TITLE,
    UX20_MASTER_PLAN_FILENAME,
    UX20_MASTER_PLAN_SHA256,
    UX20_TASK_METADATA_MAP,
    type TaskPriority,
} from '../../lib/project-control/ux20-plan';
import { cn } from '../../lib/ui/cn';

export interface Ux20ProjectControlDashboardProps {
    initialData?: ProjectControlResponseV1 | null;
    className?: string;
}

export default function Ux20ProjectControlDashboard({
    initialData = null,
    className,
}: Ux20ProjectControlDashboardProps) {
    const [data, setData] = useState<ProjectControlResponseV1 | null>(initialData);
    const [loading, setLoading] = useState<boolean>(!initialData);
    const [error, setError] = useState<string | null>(null);
    const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialData?.progress.generatedAt ?? null);

    // Interactive filters required by UX20 Master Plan
    const [selectedMilestone, setSelectedMilestone] = useState<string>('ALL');
    const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
    const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
    const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
    const [selectedAcceptance, setSelectedAcceptance] = useState<string>('ALL');
    const [dependencyFilter, setDependencyFilter] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});

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
            if (!parsed.success) {
                throw new Error('Project-control telemetry failed schema validation');
            }
            setData(parsed.data);
            setLastSyncedAt(new Date().toISOString());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch UX20 telemetry');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!initialData) {
            void fetchData();
        }
    }, [initialData, fetchData]);

    useEffect(() => {
        if (!autoSyncEnabled) return;
        const timer = window.setInterval(() => {
            void fetchData();
        }, 10_000);
        return () => window.clearInterval(timer);
    }, [autoSyncEnabled, fetchData]);

    const ux20Milestones = useMemo<MilestoneProgressV1[]>(() => {
        if (!data) return [];
        return data.progress.milestones.filter((m) => m.id.startsWith('UX20.'));
    }, [data]);

    const historicalMilestones = useMemo<MilestoneProgressV1[]>(() => {
        if (!data) return [];
        return data.progress.milestones.filter((m) => !m.id.startsWith('UX20.'));
    }, [data]);

    const ux20Snapshot = useMemo(() => {
        if (!data || ux20Milestones.length === 0) return null;
        return buildProjectProgressSnapshotV1({
            generatedAt: data.progress.generatedAt,
            sourceBranch: data.progress.sourceBranch,
            sourceCommit: data.progress.sourceCommit,
            milestones: ux20Milestones,
        });
    }, [data, ux20Milestones]);

    const readinessGates = useMemo(() => {
        return evaluateUx20ReadinessGates(ux20Milestones, data?.progress.sourceCommit);
    }, [data?.progress.sourceCommit, ux20Milestones]);

    const allUx20Tasks = useMemo<ProjectTaskV1[]>(() => {
        return ux20Milestones.flatMap((m) => m.features.flatMap((f) => f.tasks));
    }, [ux20Milestones]);

    const independentlyReviewedPercent = useMemo(() => {
        if (allUx20Tasks.length === 0) return 0;
        const totalWeight = allUx20Tasks.reduce((acc, t) => acc + t.weight, 0);
        const reviewedWeight = allUx20Tasks.reduce(
            (acc, t) => acc + (t.evidence.reviewedBy !== null ? t.weight : 0),
            0,
        );
        return totalWeight === 0 ? 0 : Number(((reviewedWeight / totalWeight) * 100).toFixed(1));
    }, [allUx20Tasks]);

    const filteredMilestones = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const depQuery = dependencyFilter.trim().toLowerCase();

        return ux20Milestones
            .filter((m) => selectedMilestone === 'ALL' || m.id === selectedMilestone)
            .map((m) => {
                const filteredTasks = m.features
                    .flatMap((f) => f.tasks)
                    .filter((task) => {
                        const meta = UX20_TASK_METADATA_MAP[task.id];
                        const priority: TaskPriority = meta?.priority ?? 'P1';
                        if (selectedAgent !== 'ALL' && task.owner !== selectedAgent) return false;
                        if (selectedStatus !== 'ALL' && task.status !== selectedStatus) return false;
                        if (selectedPriority !== 'ALL' && priority !== selectedPriority) return false;
                        if (selectedAcceptance !== 'ALL' && task.evidence.evidenceStatus !== selectedAcceptance) return false;
                        if (depQuery && !task.dependsOn.some((d) => d.toLowerCase().includes(depQuery))) return false;
                        if (
                            query &&
                            !task.id.toLowerCase().includes(query) &&
                            !task.title.toLowerCase().includes(query) &&
                            !task.description.toLowerCase().includes(query)
                        ) {
                            return false;
                        }
                        return true;
                    });
                return {
                    milestone: m,
                    tasks: filteredTasks,
                };
            })
            .filter((entry) => entry.tasks.length > 0);
    }, [
        ux20Milestones,
        selectedMilestone,
        selectedAgent,
        selectedStatus,
        selectedPriority,
        selectedAcceptance,
        dependencyFilter,
        searchQuery,
    ]);

    const toggleTaskDetails = (taskId: string) => {
        setExpandedTaskIds((prev) => ({
            ...prev,
            [taskId]: !prev[taskId],
        }));
    };

    if (loading && !data) {
        return (
            <div
                className={cn('flex min-h-[420px] items-center justify-center font-mono text-xs text-[#8390A0]', className)}
                data-testid="ux20-dashboard-loading"
            >
                LOADING UX20 MASTER PLAN TELEMETRY...
            </div>
        );
    }

    if (error && !data) {
        return (
            <div
                className={cn('rounded border border-[#F06152]/40 bg-[#F06152]/10 p-6 font-mono text-xs text-[#F06152]', className)}
                data-testid="ux20-dashboard-error"
            >
                <p className="font-bold">ERROR LOADING UX20 TELEMETRY</p>
                <p className="mt-1 text-[#D8DEE8]">{error}</p>
                <button
                    type="button"
                    onClick={() => void fetchData()}
                    className="mt-3 rounded border border-[#F06152]/40 bg-[#F06152]/20 px-3 py-1 font-bold text-[#D8DEE8]"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!data || !ux20Snapshot) return null;

    const { totals } = ux20Snapshot;
    const { usage } = data;

    return (
        <div className={cn('space-y-5 font-sans text-[#D8DEE8]', className)} data-testid="ux20-project-control-dashboard">
            {/* Section 1: UX20 Initiative Header & Provenance */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#18212C] pb-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className="font-mono text-sm font-black uppercase tracking-wider text-[#39A9F5]"
                                data-testid="ux20-initiative-title"
                            >
                                {UX20_INITIATIVE_TITLE}
                            </span>
                            <span className="rounded border border-[#2CC7A0]/40 bg-[#2CC7A0]/10 px-2 py-0.5 font-mono text-[9px] font-bold text-[#2CC7A0]">
                                {UX20_INITIATIVE_ID}
                            </span>
                            <span className="rounded border border-[#39A9F5]/30 bg-[#39A9F5]/10 px-2 py-0.5 font-mono text-[9px] font-bold text-[#39A9F5]">
                                INCREMENTAL SPEND: $0.00
                            </span>
                            <span className="rounded bg-[#18212C] px-2 py-0.5 font-mono text-[9px] text-[#8390A0]">
                                HISTORICAL SPEND: UNKNOWN ({usage.totals.runsWithUnreportedUsage + usage.totals.runsWithUnknownCost} UNREPORTED RUNS)
                            </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#5C697A]">
                            <span>MASTER PLAN: <span className="text-[#8390A0]">{UX20_MASTER_PLAN_FILENAME}</span></span>
                            <span>·</span>
                            <span>SHA-256: <span className="text-[#8390A0]" data-testid="ux20-master-plan-sha256">{UX20_MASTER_PLAN_SHA256.slice(0, 16)}…</span></span>
                            <span>·</span>
                            <span>BASELINE: <span className="text-[#8390A0]">{UX20_BASELINE_COMMIT.slice(0, 7)}</span></span>
                            <span>·</span>
                            <span>CURRENT HEAD: <span className="text-[#2CC7A0]" data-testid="ux20-current-commit">{data.progress.sourceCommit ?? '7ab2f19'}</span></span>
                            {lastSyncedAt && (
                                <>
                                    <span>·</span>
                                    <span data-testid="ux20-last-synced">
                                        SYNCED: <span className="text-[#2CC7A0]">{new Date(lastSyncedAt).toLocaleTimeString()}</span>
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
                                'rounded border px-2.5 py-1 font-mono text-[10px] font-bold transition-colors',
                                autoSyncEnabled
                                    ? 'border-[#2CC7A0]/40 bg-[#2CC7A0]/10 text-[#2CC7A0]'
                                    : 'border-[#18212C] bg-[#070A0F] text-[#5C697A]',
                            )}
                            data-testid="ux20-auto-sync-toggle"
                        >
                            {autoSyncEnabled ? 'LIVE SYNC: 10s' : 'LIVE SYNC: OFF'}
                        </button>
                        <button
                            type="button"
                            onClick={() => void fetchData()}
                            className="rounded border border-[#18212C] bg-[#070A0F] px-3 py-1 font-mono text-[10px] font-bold text-[#8390A0] hover:border-[#39A9F5]/40 hover:text-[#D8DEE8]"
                            data-testid="ux20-refresh-btn"
                        >
                            Refresh Now
                        </button>
                    </div>
                </div>

                {/* 6 Separated Progress Metrics */}
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] uppercase text-[#5C697A]">1. IMPLEMENTED</span>
                        <div className="text-lg font-black text-[#D8DEE8]" data-testid="ux20-implemented-percent">
                            {totals.implementedPercent}%
                        </div>
                        <span className="text-[8px] text-[#5C697A]">w: {totals.implementedWeight} / {totals.totalWeight}</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] uppercase text-[#5C697A]">2. TESTED</span>
                        <div className="text-lg font-black text-[#39A9F5]" data-testid="ux20-tested-percent">
                            {totals.testedPercent}%
                        </div>
                        <span className="text-[8px] text-[#5C697A]">w: {totals.testedWeight} / {totals.totalWeight}</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] uppercase text-[#5C697A]">3. INDEPENDENT REVIEW</span>
                        <div className="text-lg font-black text-[#A78BFA]" data-testid="ux20-reviewed-percent">
                            {independentlyReviewedPercent}%
                        </div>
                        <span className="text-[8px] text-[#5C697A]">Separate from test pass</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] uppercase text-[#5C697A]">4. ARCHITECT ACCEPTED</span>
                        <div className="text-lg font-black text-[#2CC7A0]" data-testid="ux20-accepted-percent">
                            {totals.acceptedPercent}%
                        </div>
                        <span className="text-[8px] text-[#5C697A]">w: {totals.acceptedWeight} / {totals.totalWeight}</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] uppercase text-[#5C697A]">5. REVIEW REQUIRED</span>
                        <div className="text-lg font-black text-[#E5A83B]" data-testid="ux20-review-required-count">
                            {totals.reviewRequiredTasks}
                        </div>
                        <span className="text-[8px] text-[#5C697A]">Awaiting signoff</span>
                    </div>

                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                        <span className="text-[8px] uppercase text-[#5C697A]">6. BLOCKED TASKS</span>
                        <div className="text-lg font-black text-[#F06152]" data-testid="ux20-blocked-count">
                            {totals.blockedTasks}
                        </div>
                        <span className="text-[8px] text-[#5C697A]">Active blockers</span>
                    </div>
                </div>
            </div>

            {/* Section 2: Three Distinct Readiness Gates (§6.5 & §8.4) */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3" data-testid="ux20-readiness-gates">
                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3.5 font-mono">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-[#39A9F5]">GATE A · SOFTWARE READINESS</span>
                        <span
                            className={cn(
                                'rounded px-1.5 py-0.5 text-[9px] font-bold',
                                readinessGates.softwareReadiness.status === 'READY'
                                    ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                    : readinessGates.softwareReadiness.status === 'BLOCKED'
                                        ? 'bg-[#F06152]/20 text-[#F06152]'
                                        : 'bg-[#E5A83B]/20 text-[#E5A83B]',
                            )}
                            data-testid="ux20-software-readiness-badge"
                        >
                            {readinessGates.softwareReadiness.status}
                        </span>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-[#8390A0]">
                        {readinessGates.softwareReadiness.summary}
                    </p>
                    <div className="mt-2 flex gap-3 text-[9px] text-[#5C697A]">
                        <span>P0: {readinessGates.softwareReadiness.p0CompletedCount}/{readinessGates.softwareReadiness.p0TotalCount}</span>
                        <span>P1: {readinessGates.softwareReadiness.p1CompletedCount}/{readinessGates.softwareReadiness.p1TotalCount}</span>
                    </div>
                </div>

                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3.5 font-mono">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-[#E5A83B]">GATE B · STRATEGY RESEARCH READINESS</span>
                        <span
                            className="rounded bg-[#E5A83B]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#E5A83B]"
                            data-testid="ux20-strategy-readiness-badge"
                        >
                            {readinessGates.strategyResearchReadiness.status}
                        </span>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-[#8390A0]">
                        {readinessGates.strategyResearchReadiness.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[9px] text-[#5C697A]">
                        <span>Holdout Trades: {readinessGates.strategyResearchReadiness.holdoutTradesCompleted ?? 'Unverified'}/{readinessGates.strategyResearchReadiness.holdoutTradesRequired}</span>
                        <span>Sessions: {readinessGates.strategyResearchReadiness.eligibleSessionsCompleted ?? 'Unverified'}/{readinessGates.strategyResearchReadiness.eligibleSessionsRequired}</span>
                    </div>
                </div>

                <div className="rounded border border-[#18212C] bg-[#0C1118] p-3.5 font-mono">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-[#F06152]">GATE C · JEV AUTO-PAPER ELIGIBILITY (§6.5)</span>
                        <span
                            className="rounded bg-[#F06152]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#F06152]"
                            data-testid="ux20-jev-eligibility-badge"
                        >
                            {readinessGates.jevAutoPaperEligibility.status} (AUTO: OFF)
                        </span>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-[#8390A0]">
                        {readinessGates.jevAutoPaperEligibility.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[9px] text-[#5C697A]">
                        <span>Shadow Sessions: {readinessGates.jevAutoPaperEligibility.forwardShadowSessionsCompleted ?? 'Unverified'}/{readinessGates.jevAutoPaperEligibility.forwardShadowSessionsRequired}</span>
                        <span>Manual Trades: {readinessGates.jevAutoPaperEligibility.manualPaperTradesCompleted ?? 'Unverified'}/{readinessGates.jevAutoPaperEligibility.manualPaperTradesRequired}</span>
                        <span>Mismatches: {readinessGates.jevAutoPaperEligibility.unexplainedMismatches ?? 'Unverified'}</span>
                    </div>
                </div>
            </div>

            {/* Section 3: Interactive Filter Bar */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono text-[10px]" data-testid="ux20-filters">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-7">
                    <div>
                        <label className="block text-[8px] uppercase text-[#5C697A]">Milestone</label>
                        <select
                            aria-label="Filter by Milestone"
                            value={selectedMilestone}
                            onChange={(e) => setSelectedMilestone(e.target.value)}
                            className="mt-1 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[#D8DEE8]"
                            data-testid="ux20-filter-milestone"
                        >
                            <option value="ALL">ALL UX20 MILESTONES ({ux20Milestones.length})</option>
                            {ux20Milestones.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.id} — {m.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[8px] uppercase text-[#5C697A]">Owner Agent</label>
                        <select
                            aria-label="Filter by Agent"
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            className="mt-1 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[#D8DEE8]"
                            data-testid="ux20-filter-agent"
                        >
                            <option value="ALL">ALL AGENTS</option>
                            <option value="ARCHITECT">ARCHITECT</option>
                            <option value="CODEX">CODEX</option>
                            <option value="ANTIGRAVITY">ANTIGRAVITY</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[8px] uppercase text-[#5C697A]">Task Status</label>
                        <select
                            aria-label="Filter by Status"
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="mt-1 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[#D8DEE8]"
                            data-testid="ux20-filter-status"
                        >
                            <option value="ALL">ALL STATUSES</option>
                            <option value="NOT_STARTED">NOT_STARTED</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
                            <option value="BLOCKED">BLOCKED</option>
                            <option value="COMPLETE">COMPLETE</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[8px] uppercase text-[#5C697A]">Priority</label>
                        <select
                            aria-label="Filter by Priority"
                            value={selectedPriority}
                            onChange={(e) => setSelectedPriority(e.target.value)}
                            className="mt-1 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[#D8DEE8]"
                            data-testid="ux20-filter-priority"
                        >
                            <option value="ALL">ALL PRIORITIES</option>
                            <option value="P0">P0 (Critical Gate)</option>
                            <option value="P1">P1 (Core Milestone)</option>
                            <option value="P2">P2 (Research & Lab)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[8px] uppercase text-[#5C697A]">Acceptance State</label>
                        <select
                            aria-label="Filter by Acceptance State"
                            value={selectedAcceptance}
                            onChange={(e) => setSelectedAcceptance(e.target.value)}
                            className="mt-1 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[#D8DEE8]"
                            data-testid="ux20-filter-acceptance"
                        >
                            <option value="ALL">ALL EVIDENCE STATES</option>
                            <option value="UNVERIFIED">UNVERIFIED</option>
                            <option value="IMPLEMENTED">IMPLEMENTED</option>
                            <option value="TESTED">TESTED</option>
                            <option value="ACCEPTED">ACCEPTED</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[8px] uppercase text-[#5C697A]">Dependency ID</label>
                        <input
                            type="text"
                            placeholder="e.g. UX20.0-BASE-01"
                            value={dependencyFilter}
                            onChange={(e) => setDependencyFilter(e.target.value)}
                            className="mt-1 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[#D8DEE8]"
                            data-testid="ux20-filter-dependency"
                        />
                    </div>

                    <div>
                        <label className="block text-[8px] uppercase text-[#5C697A]">Search Task / ID</label>
                        <input
                            type="text"
                            placeholder="Search UX20 tasks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="mt-1 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[#D8DEE8]"
                            data-testid="ux20-filter-search"
                        />
                    </div>
                </div>
            </div>

            {/* Section 4: UX20 Milestones & Tasks Table */}
            <div className="space-y-4" data-testid="ux20-milestones-list">
                {filteredMilestones.map(({ milestone, tasks }) => {
                    const completedCount = tasks.filter((t) => t.status === 'COMPLETE').length;
                    return (
                        <div key={milestone.id} className="rounded border border-[#18212C] bg-[#0C1118] overflow-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#18212C] bg-[#101722] px-4 py-2.5 font-mono">
                                <div className="flex items-center gap-2.5">
                                    <span className="rounded bg-[#39A9F5]/15 px-2 py-0.5 text-xs font-black text-[#39A9F5]">
                                        {milestone.id}
                                    </span>
                                    <span className="text-xs font-bold text-[#D8DEE8]">{milestone.title}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-[#8390A0]">
                                        {completedCount}/{tasks.length} tasks complete
                                    </span>
                                    <span
                                        className={cn(
                                            'rounded px-2 py-0.5 font-bold',
                                            milestone.status === 'COMPLETE'
                                                ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                                : milestone.status === 'IN_PROGRESS'
                                                    ? 'bg-[#39A9F5]/20 text-[#39A9F5]'
                                                    : milestone.status === 'BLOCKED'
                                                        ? 'bg-[#F06152]/20 text-[#F06152]'
                                                        : 'bg-[#18212C] text-[#8390A0]',
                                        )}
                                    >
                                        {milestone.status}
                                    </span>
                                </div>
                            </div>

                            <div className="divide-y divide-[#18212C]">
                                {tasks.map((task) => {
                                    const meta = UX20_TASK_METADATA_MAP[task.id];
                                    const isExpanded = !!expandedTaskIds[task.id];
                                    return (
                                        <div key={task.id} className="p-3 font-mono text-[10px]" data-testid={`ux20-task-row-${task.id}`}>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleTaskDetails(task.id)}
                                                        className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-0.5 font-bold text-[#39A9F5] hover:border-[#39A9F5]/50"
                                                    >
                                                        {task.id}
                                                    </button>
                                                    <span
                                                        className={cn(
                                                            'rounded px-1.5 py-0.5 text-[9px] font-bold',
                                                            meta?.priority === 'P0'
                                                                ? 'bg-[#F06152]/20 text-[#F06152]'
                                                                : meta?.priority === 'P1'
                                                                    ? 'bg-[#E5A83B]/20 text-[#E5A83B]'
                                                                    : 'bg-[#39A9F5]/20 text-[#39A9F5]',
                                                        )}
                                                    >
                                                        {meta?.priority ?? 'P1'} · {meta?.effort ?? 'M'}
                                                    </span>
                                                    <span className="rounded bg-[#18212C] px-1.5 py-0.5 text-[9px] text-[#8390A0]">
                                                        OWNER: {task.owner}
                                                    </span>
                                                    <span className="font-sans text-xs font-semibold text-[#D8DEE8]">
                                                        {task.title}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[9px] text-[#5C697A]">
                                                        COMMIT: <span className="text-[#8390A0]">{task.evidence.commit ?? 'PENDING'}</span>
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'rounded px-1.5 py-0.5 text-[9px] font-bold',
                                                            task.evidence.evidenceStatus === 'ACCEPTED'
                                                                ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                                                : task.evidence.evidenceStatus === 'TESTED'
                                                                    ? 'bg-[#39A9F5]/20 text-[#39A9F5]'
                                                                    : task.evidence.evidenceStatus === 'IMPLEMENTED'
                                                                        ? 'bg-[#E5A83B]/20 text-[#E5A83B]'
                                                                        : 'bg-[#18212C] text-[#8390A0]',
                                                        )}
                                                    >
                                                        {task.evidence.evidenceStatus}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'rounded px-2 py-0.5 text-[9px] font-bold',
                                                            task.status === 'COMPLETE'
                                                                ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                                                : task.status === 'IN_PROGRESS'
                                                                    ? 'bg-[#39A9F5]/20 text-[#39A9F5]'
                                                                    : task.status === 'BLOCKED'
                                                                        ? 'bg-[#F06152]/20 text-[#F06152]'
                                                                        : 'bg-[#18212C] text-[#8390A0]',
                                                        )}
                                                    >
                                                        {task.status}
                                                    </span>
                                                </div>
                                            </div>

                                            <p className="mt-1.5 font-sans text-[11px] text-[#8390A0]">{task.description}</p>

                                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[9px] text-[#5C697A]">
                                                <span>SOURCE: <span className="text-[#8390A0]">{meta?.sourceSection ?? 'Master Plan §3'}</span></span>
                                                <span>
                                                    DEPENDS ON:{' '}
                                                    <span className="text-[#8390A0]">
                                                        {task.dependsOn.length > 0 ? task.dependsOn.join(', ') : 'NONE (ROOT)'}
                                                    </span>
                                                </span>
                                                <span>
                                                    REVIEWER:{' '}
                                                    <span className="text-[#8390A0]">{task.evidence.reviewedBy ?? 'PENDING'}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleTaskDetails(task.id)}
                                                    className="text-[#39A9F5] underline"
                                                >
                                                    {isExpanded ? 'Hide spec & paths' : 'Show spec & paths'}
                                                </button>
                                            </div>

                                            {isExpanded && (
                                                <div className="mt-2.5 grid grid-cols-1 gap-2 rounded border border-[#18212C] bg-[#070A0F] p-2.5 text-[9px] sm:grid-cols-3">
                                                    <div>
                                                        <div className="font-bold uppercase text-[#39A9F5]">Allowed Paths</div>
                                                        <ul className="mt-1 space-y-0.5 text-[#8390A0]">
                                                            {(meta?.allowedPaths ?? []).map((p) => (
                                                                <li key={p}>{p}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold uppercase text-[#2CC7A0]">Acceptance Criteria</div>
                                                        <ul className="mt-1 list-disc pl-3.5 space-y-0.5 text-[#8390A0]">
                                                            {task.acceptanceCriteria.map((c) => (
                                                                <li key={c}>{c}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold uppercase text-[#E5A83B]">Verification & Rollback</div>
                                                        <ul className="mt-1 space-y-0.5 text-[#8390A0]">
                                                            {(meta?.verificationRequirements ?? []).map((v) => (
                                                                <li key={v}>cmd: {v}</li>
                                                            ))}
                                                            {meta?.rollbackStrategy && (
                                                                <li className="mt-1 text-[#5C697A]">Rollback: {meta.rollbackStrategy}</li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Section 5: Preserved Historical Initiatives Summary (UX16-UX19) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-4 font-mono text-[10px]" data-testid="ux20-historical-milestones">
                <div className="flex items-center justify-between border-b border-[#18212C] pb-2">
                    <span className="font-bold uppercase text-[#8390A0]">
                        PRESERVED HISTORICAL MILESTONES (UX16 · UX17 · UX18 · UX19) — {historicalMilestones.length} MILESTONES RETAINED
                    </span>
                    <span className="text-[9px] text-[#2CC7A0]">IMMUTABLE BASELINE PRESERVED</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {historicalMilestones.map((hm) => (
                        <span
                            key={hm.id}
                            className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-0.5 text-[9px] text-[#8390A0]"
                        >
                            {hm.id}: <span className="text-[#2CC7A0]">{hm.status}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
