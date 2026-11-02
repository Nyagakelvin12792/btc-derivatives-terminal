'use client';

import React, { useState } from 'react';
import type { FeatureProgressV1, ProjectTaskV1 } from '../../lib/project-control/contracts';
import { cn } from '../../lib/ui/cn';
import { workStatusBadge } from './ProjectMilestoneCard';

export interface ProjectTaskTableProps {
    features: FeatureProgressV1[];
    selectedAgent?: string;
    selectedStatus?: string;
    searchQuery?: string;
    className?: string;
}

export default function ProjectTaskTable({
    features,
    selectedAgent = 'ALL',
    selectedStatus = 'ALL',
    searchQuery = '',
    className,
}: ProjectTaskTableProps) {
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

    const toggleTask = (id: string) => {
        setExpandedTaskId((prev) => (prev === id ? null : id));
    };

    const query = searchQuery.trim().toLowerCase();

    const filteredFeatures = features.map((feature) => {
        const matchingTasks = feature.tasks.filter((task) => {
            const matchesAgent = selectedAgent === 'ALL' ||
                task.owner === selectedAgent ||
                task.supportingAgents.includes(selectedAgent as never);

            const matchesStatus = selectedStatus === 'ALL' || task.status === selectedStatus;

            const matchesQuery = query === '' ||
                task.title.toLowerCase().includes(query) ||
                task.id.toLowerCase().includes(query) ||
                task.description.toLowerCase().includes(query) ||
                feature.title.toLowerCase().includes(query);

            return matchesAgent && matchesStatus && matchesQuery;
        });

        return {
            ...feature,
            tasks: matchingTasks,
        };
    }).filter((f) => f.tasks.length > 0);

    if (filteredFeatures.length === 0) {
        return (
            <div className="p-4 text-center font-mono text-[10px] text-[#8390A0]">
                No tasks match the active filters or search query.
            </div>
        );
    }

    return (
        <div className={cn('space-y-4 font-sans', className)} data-testid="project-task-table">
            {filteredFeatures.map((feature) => (
                <div
                    key={feature.id}
                    className="overflow-hidden rounded border border-[#18212C] bg-[#070A0F]"
                >
                    {/* Feature Bar */}
                    <div className="flex items-center justify-between border-b border-[#18212C] bg-[#0C1118] px-3 py-2 font-mono text-[9px]">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-[#D8DEE8]">{feature.title}</span>
                            <span className="text-[#5C697A]">({feature.id})</span>
                        </div>
                        <span className="text-[#8390A0]">
                            {feature.tasks.length} {feature.tasks.length === 1 ? 'task' : 'tasks'}
                        </span>
                    </div>

                    {/* Tasks List */}
                    <div className="divide-y divide-[#18212C]/60">
                        {feature.tasks.map((task) => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                isExpanded={expandedTaskId === task.id}
                                onToggle={() => toggleTask(task.id)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function TaskRow({
    task,
    isExpanded,
    onToggle,
}: {
    task: ProjectTaskV1;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const badge = workStatusBadge(task.status);
    const hasBlockers = task.blockers.length > 0;

    return (
        <div className="bg-[#070A0F] font-sans text-[#D8DEE8]" data-testid={`task-row-${task.id.toLowerCase()}`}>
            <div
                className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-white/[0.02]"
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle();
                    }
                }}
                aria-expanded={isExpanded}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="font-mono text-[9px] font-bold text-[#8390A0]">{task.id}</span>
                    <span className="truncate font-semibold text-[#D8DEE8]">{task.title}</span>
                </div>

                <div className="flex items-center gap-2 font-mono text-[9px]">
                    {/* Owner Badge */}
                    <span className="rounded bg-[#18212C] px-1.5 py-0.5 font-bold text-[#39A9F5]">
                        {task.owner}
                    </span>

                    {/* Weight */}
                    <span className="text-[#5C697A]">w:{task.weight}</span>

                    {/* Status Badge */}
                    <span className={cn('rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase', badge.classes)}>
                        {badge.label}
                    </span>

                    {/* Evidence Status */}
                    <span className="rounded border border-[#18212C] bg-[#0C1118] px-1.5 py-0.5 text-[8px] text-[#8390A0]">
                        {task.evidence.evidenceStatus}
                    </span>

                    <span className="text-[#8390A0]">{isExpanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {/* Expandable Task Detail Drawer */}
            {isExpanded && (
                <div
                    className="border-t border-[#18212C] bg-[#0C1118]/80 p-3 font-mono text-[9px] text-[#8390A0]"
                    data-testid={`task-details-${task.id.toLowerCase()}`}
                >
                    <p className="text-[#D8DEE8] leading-relaxed">{task.description}</p>

                    {/* Blockers prominent alert */}
                    {hasBlockers && (
                        <div className="mt-2.5 rounded border border-[#F06152]/30 bg-[#F06152]/10 p-2 text-[#F06152]">
                            <span className="font-bold">BLOCKERS:</span>
                            <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                {task.blockers.map((b, i) => (
                                    <li key={i}>{b}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Acceptance Criteria */}
                    <div className="mt-2.5">
                        <span className="font-bold text-[#D8DEE8]">ACCEPTANCE CRITERIA:</span>
                        <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[#8390A0]">
                            {task.acceptanceCriteria.map((crit, i) => (
                                <li key={i}>{crit}</li>
                            ))}
                        </ul>
                    </div>

                    {/* Supporting agents & Dependencies */}
                    <div className="mt-2 flex flex-wrap gap-4 text-[8px] text-[#5C697A]">
                        {task.supportingAgents.length > 0 && (
                            <div>
                                <span className="text-[#8390A0]">SUPPORTING: </span>
                                <span>{task.supportingAgents.join(', ')}</span>
                            </div>
                        )}
                        {task.dependsOn.length > 0 && (
                            <div>
                                <span className="text-[#8390A0]">DEPENDS ON: </span>
                                <span>{task.dependsOn.join(', ')}</span>
                            </div>
                        )}
                    </div>

                    {/* Evidence & Verification */}
                    <div className="mt-3 rounded border border-[#18212C] bg-[#070A0F] p-2.5">
                        <div className="flex flex-wrap items-center justify-between border-b border-[#18212C] pb-1 font-bold text-[#D8DEE8]">
                            <span>EVIDENCE & VERIFICATION</span>
                            <span className="text-[8px] text-[#39A9F5]">{task.evidence.evidenceStatus}</span>
                        </div>

                        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[8px]">
                            <div>
                                <span className="text-[#5C697A]">BRANCH: </span>
                                <span className="text-[#D8DEE8]">{task.evidence.branch ?? '—'}</span>
                            </div>
                            <div>
                                <span className="text-[#5C697A]">COMMIT: </span>
                                <span className="font-mono text-[#D8DEE8]">{task.evidence.commit ?? '—'}</span>
                            </div>
                            {task.evidence.reviewedBy && (
                                <div>
                                    <span className="text-[#5C697A]">REVIEWED BY: </span>
                                    <span className="text-[#2CC7A0] font-bold">{task.evidence.reviewedBy}</span>
                                </div>
                            )}
                            {task.evidence.reviewedAt && (
                                <div>
                                    <span className="text-[#5C697A]">REVIEWED AT: </span>
                                    <span className="text-[#D8DEE8]">{new Date(task.evidence.reviewedAt).toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        {/* Tests List */}
                        {task.evidence.tests.length > 0 && (
                            <div className="mt-2 border-t border-[#18212C] pt-1.5">
                                <span className="text-[#8390A0] font-bold">TEST EVIDENCE:</span>
                                <div className="mt-1 space-y-1">
                                    {task.evidence.tests.map((t) => (
                                        <div
                                            key={t.id}
                                            className="flex flex-wrap items-center justify-between gap-1 rounded bg-[#0C1118] px-2 py-1 text-[8px]"
                                        >
                                            <span className="font-mono text-[#D8DEE8]">{t.command}</span>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={cn(
                                                        'font-bold',
                                                        t.result === 'PASS' ? 'text-[#2CC7A0]' : 'text-[#F06152]',
                                                    )}
                                                >
                                                    {t.result}
                                                    {t.passed !== null && ` (${t.passed} passed)`}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
