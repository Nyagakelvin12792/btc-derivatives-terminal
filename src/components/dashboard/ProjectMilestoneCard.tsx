'use client';

import React from 'react';
import type { MilestoneProgressV1 } from '../../lib/project-control/contracts';
import { cn } from '../../lib/ui/cn';

export interface ProjectMilestoneCardProps {
    milestone: MilestoneProgressV1;
    isExpanded: boolean;
    onToggleExpand: () => void;
    className?: string;
}

export function workStatusBadge(status: MilestoneProgressV1['status']): {
    label: string;
    classes: string;
} {
    switch (status) {
        case 'COMPLETE':
            return {
                label: 'COMPLETE',
                classes: 'border-[#2CC7A0]/40 bg-[#2CC7A0]/10 text-[#2CC7A0]',
            };
        case 'IN_PROGRESS':
            return {
                label: 'IN PROGRESS',
                classes: 'border-[#39A9F5]/40 bg-[#39A9F5]/10 text-[#39A9F5]',
            };
        case 'REVIEW_REQUIRED':
            return {
                label: 'REVIEW REQUIRED',
                classes: 'border-[#E5A83B]/40 bg-[#E5A83B]/10 text-[#E5A83B]',
            };
        case 'BLOCKED':
            return {
                label: 'BLOCKED',
                classes: 'border-[#F06152]/40 bg-[#F06152]/10 text-[#F06152]',
            };
        case 'DEFERRED':
            return {
                label: 'DEFERRED',
                classes: 'border-[#8E98A6]/40 bg-[#8E98A6]/10 text-[#8E98A6]',
            };
        case 'NOT_STARTED':
        default:
            return {
                label: 'NOT STARTED',
                classes: 'border-[#18212C] bg-[#18212C]/40 text-[#8390A0]',
            };
    }
}

export default function ProjectMilestoneCard({
    milestone,
    isExpanded,
    onToggleExpand,
    className,
}: ProjectMilestoneCardProps) {
    const badge = workStatusBadge(milestone.status);

    const allTasks = milestone.features.flatMap((f) => f.tasks);
    const totalWeight = allTasks.reduce((sum, t) => sum + t.weight, 0);
    const testedWeight = allTasks
        .filter((t) => t.evidence.evidenceStatus === 'TESTED' || t.evidence.evidenceStatus === 'ACCEPTED')
        .reduce((sum, t) => sum + t.weight, 0);
    const milestonePercent = totalWeight > 0 ? Math.round((testedWeight / totalWeight) * 100) : 0;

    return (
        <div
            className={cn(
                'rounded border border-[#18212C] bg-[#0C1118] font-sans text-[#D8DEE8] transition-colors',
                isExpanded ? 'border-[#39A9F5]/40' : 'hover:border-[#18212C]/80',
                className,
            )}
            data-testid={`milestone-card-${milestone.id.toLowerCase()}`}
        >
            <div
                className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-3"
                onClick={onToggleExpand}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleExpand();
                    }
                }}
                aria-expanded={isExpanded}
            >
                <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-black tracking-wider text-[#39A9F5]">
                        {milestone.id}
                    </span>
                    <span className="text-xs font-semibold text-[#D8DEE8]">
                        {milestone.title}
                    </span>
                </div>

                <div className="flex items-center gap-3 font-mono text-[9px]">
                    <span className="text-[#8390A0]">
                        {milestone.features.length} {milestone.features.length === 1 ? 'feature' : 'features'} · {allTasks.length} tasks
                    </span>

                    <span
                        className={cn('rounded border px-2 py-0.5 text-[8px] font-bold uppercase', badge.classes)}
                        data-testid={`milestone-status-${milestone.id.toLowerCase()}`}
                    >
                        {badge.label}
                    </span>

                    <span className="font-bold text-[#D8DEE8]" data-testid={`milestone-tested-${milestone.id.toLowerCase()}`}>{milestonePercent}% tested</span>

                    <span className="text-[#8390A0]">
                        {isExpanded ? '▲' : '▼'}
                    </span>
                </div>
            </div>

            {/* Compact Progress Bar */}
            <div className="h-1 w-full bg-[#18212C]">
                <div
                    className={cn(
                        'h-full transition-all duration-300',
                        milestone.status === 'COMPLETE' ? 'bg-[#2CC7A0]' : 'bg-[#39A9F5]',
                    )}
                    style={{ width: `${milestonePercent}%` }}
                />
            </div>
        </div>
    );
}
