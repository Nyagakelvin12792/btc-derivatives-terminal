'use client';

import React from 'react';
import { cn } from '../../lib/ui/cn';

export interface ProjectControlFiltersProps {
    selectedAgent: string;
    onSelectAgent: (agent: string) => void;
    selectedStatus: string;
    onSelectStatus: (status: string) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    className?: string;
}

const AGENT_OPTIONS: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: 'All Agents' },
    { id: 'ARCHITECT', label: 'Architect' },
    { id: 'CODEX', label: 'Codex' },
    { id: 'ANTIGRAVITY', label: 'Antigravity' },
    { id: 'DEEPSEEK', label: 'DeepSeek' },
    { id: 'GLM', label: 'GLM' },
    { id: 'QWEN', label: 'Qwen' },
];

const STATUS_OPTIONS: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: 'All Statuses' },
    { id: 'COMPLETE', label: 'Complete' },
    { id: 'IN_PROGRESS', label: 'In Progress' },
    { id: 'REVIEW_REQUIRED', label: 'Review Required' },
    { id: 'BLOCKED', label: 'Blocked' },
    { id: 'NOT_STARTED', label: 'Not Started' },
];

export default function ProjectControlFilters({
    selectedAgent,
    onSelectAgent,
    selectedStatus,
    onSelectStatus,
    searchQuery,
    onSearchChange,
    className,
}: ProjectControlFiltersProps) {
    return (
        <div
            className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded border border-[#18212C] bg-[#0C1118] p-3 font-mono text-[9px] text-[#8390A0]',
                className,
            )}
            data-testid="project-control-filters"
        >
            {/* Search Input */}
            <div className="flex min-w-[200px] flex-1 items-center gap-2">
                <span className="text-[#5C697A]">SEARCH:</span>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Filter by task ID, title, milestone…"
                    className="w-full rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1 text-xs text-[#D8DEE8] placeholder-[#5C697A] outline-none focus:border-[#39A9F5]/60"
                    data-testid="filter-search-input"
                />
            </div>

            {/* Agent Select */}
            <div className="flex items-center gap-1.5">
                <span className="text-[#5C697A]">AGENT:</span>
                <select
                    value={selectedAgent}
                    onChange={(e) => onSelectAgent(e.target.value)}
                    className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[9px] font-bold text-[#D8DEE8] outline-none focus:border-[#39A9F5]/60"
                    data-testid="filter-agent-select"
                >
                    {AGENT_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Status Select */}
            <div className="flex items-center gap-1.5">
                <span className="text-[#5C697A]">STATUS:</span>
                <select
                    value={selectedStatus}
                    onChange={(e) => onSelectStatus(e.target.value)}
                    className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-[9px] font-bold text-[#D8DEE8] outline-none focus:border-[#39A9F5]/60"
                    data-testid="filter-status-select"
                >
                    {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
