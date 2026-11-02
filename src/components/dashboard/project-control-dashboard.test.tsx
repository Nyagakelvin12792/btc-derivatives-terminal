import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildProjectControlResponseV1 } from '../../lib/project-control/snapshot';
import ProjectControlDashboard from './ProjectControlDashboard';
import ProjectMilestoneCard, { workStatusBadge } from './ProjectMilestoneCard';
import ProjectTaskTable from './ProjectTaskTable';
import SpendSummaryCard from './SpendSummaryCard';
import ProjectControlFilters from './ProjectControlFilters';

describe('UX16.2 Child B: Project-Control Dashboard Components', () => {
    const mockData = buildProjectControlResponseV1();

    describe('ProjectControlDashboard', () => {
        it('renders implemented, tested, and Architect-accepted percentages separately', () => {
            const html = renderToStaticMarkup(<ProjectControlDashboard initialData={mockData} />);

            expect(html).toContain('data-testid="project-control-dashboard"');
            expect(html).toContain('data-testid="implemented-percent"');
            expect(html).toContain('data-testid="tested-percent"');
            expect(html).toContain('data-testid="accepted-percent"');

            // Confirm percentages match snapshot totals directly (not hardcoded)
            expect(html).toContain(`${mockData.progress.totals.implementedPercent}%`);
            expect(html).toContain(`${mockData.progress.totals.testedPercent}%`);
            expect(html).toContain(`${mockData.progress.totals.acceptedPercent}%`);
        });

        it('renders all UX16.0 through UX16.8 milestones', () => {
            const html = renderToStaticMarkup(<ProjectControlDashboard initialData={mockData} />);

            const milestoneIds = ['ux16.0', 'ux16.1', 'ux16.2', 'ux16.3', 'ux16.4', 'ux16.5', 'ux16.6', 'ux16.7', 'ux16.8'];
            for (const id of milestoneIds) {
                expect(html).toContain(`data-testid="milestone-card-${id}"`);
            }
        });

        it('displays branch, commit, and project ID in header', () => {
            const html = renderToStaticMarkup(<ProjectControlDashboard initialData={mockData} />);
            expect(html).toContain('btc-derivatives-terminal');
            expect(html).toContain(mockData.progress.sourceBranch);
        });
    });

    describe('ProjectMilestoneCard', () => {
        const milestone0 = mockData.progress.milestones[0];

        it('renders milestone badge and progress bar', () => {
            const html = renderToStaticMarkup(
                <ProjectMilestoneCard
                    milestone={milestone0}
                    isExpanded={false}
                    onToggleExpand={() => {}}
                />,
            );

            expect(html).toContain(`data-testid="milestone-card-${milestone0.id.toLowerCase()}"`);
            expect(html).toContain(milestone0.title);
            expect(html).toContain(`data-testid="milestone-status-${milestone0.id.toLowerCase()}"`);
        });

        it('returns appropriate badge styling for each work status', () => {
            expect(workStatusBadge('COMPLETE').classes).toContain('text-[#2CC7A0]');
            expect(workStatusBadge('IN_PROGRESS').classes).toContain('text-[#39A9F5]');
            expect(workStatusBadge('REVIEW_REQUIRED').classes).toContain('text-[#E5A83B]');
            expect(workStatusBadge('BLOCKED').classes).toContain('text-[#F06152]');
            expect(workStatusBadge('NOT_STARTED').classes).toContain('text-[#8390A0]');
        });
    });

    describe('ProjectTaskTable', () => {
        const features = mockData.progress.milestones.flatMap((m) => m.features);

        it('renders tasks with owner, weight, and status badges', () => {
            const html = renderToStaticMarkup(<ProjectTaskTable features={features} />);

            expect(html).toContain('data-testid="project-task-table"');
            expect(html).toContain('data-testid="task-row-');
        });

        it('filters tasks by agent', () => {
            const html = renderToStaticMarkup(
                <ProjectTaskTable features={features} selectedAgent="CODEX" />,
            );

            expect(html).toContain('CODEX');
        });

        it('shows empty filter message when query matches nothing', () => {
            const html = renderToStaticMarkup(
                <ProjectTaskTable features={features} searchQuery="NONEXISTENT_QUERY_12345" />,
            );

            expect(html).toContain('No tasks match the active filters or search query.');
        });
    });

    describe('SpendSummaryCard & Cost Truthfulness', () => {
        it('renders known, provider-reported, and calculated spend totals', () => {
            const html = renderToStaticMarkup(<SpendSummaryCard usage={mockData.usage} />);

            expect(html).toContain('data-testid="spend-summary-card"');
            expect(html).toContain('data-testid="known-spend-amount"');
            expect(html).toContain(`$${mockData.usage.totals.knownSpendUsd.toFixed(2)}`);
            expect(html).toContain('data-testid="provider-reported-amount"');
            expect(html).toContain('data-testid="calculated-spend-amount"');
            expect(html).toContain('data-testid="unreported-runs-count"');
        });

        it('never renders UNREPORTED or UNKNOWN runs as $0.00', () => {
            const html = renderToStaticMarkup(<SpendSummaryCard usage={mockData.usage} />);

            // Check every run
            for (const run of mockData.usage.runs) {
                if (run.costStatus === 'UNREPORTED' || run.costStatus === 'UNKNOWN') {
                    // Must NOT say $0.00 in its run-cost cell
                    const runCellPattern = new RegExp(`data-testid="run-cost-${run.id}"[^>]*>\\$0\\.00<`);
                    expect(html).not.toMatch(runCellPattern);
                }
            }
        });

        it('renders subscription usage as INCLUDED/UNREPORTED, not free API usage', () => {
            const html = renderToStaticMarkup(<SpendSummaryCard usage={mockData.usage} />);

            const subscriptionRuns = mockData.usage.runs.filter((r) => r.billingMode === 'SUBSCRIPTION');
            if (subscriptionRuns.length > 0) {
                expect(html).toContain('INCLUDED/UNREPORTED');
                expect(html).not.toContain('Free API usage');
            }
        });
    });

    describe('ProjectControlFilters', () => {
        it('renders search input, agent select, and status select', () => {
            const html = renderToStaticMarkup(
                <ProjectControlFilters
                    selectedAgent="ALL"
                    onSelectAgent={() => {}}
                    selectedStatus="ALL"
                    onSelectStatus={() => {}}
                    searchQuery=""
                    onSearchChange={() => {}}
                />,
            );

            expect(html).toContain('data-testid="project-control-filters"');
            expect(html).toContain('data-testid="filter-search-input"');
            expect(html).toContain('data-testid="filter-agent-select"');
            expect(html).toContain('data-testid="filter-status-select"');
        });
    });
});
