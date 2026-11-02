import { describe, expect, it } from 'vitest';

import {
    AgentUsageFileV1Schema,
    ProjectControlResponseV1Schema,
    TaskEvidenceV1Schema,
    type AgentUsageFileV1,
    type MilestoneProgressV1,
} from './contracts';
import { buildUsageSpendSnapshotV1 } from './cost-calculator';
import { buildProjectProgressSnapshotV1 } from './progress-calculator';
import { buildProjectControlResponseV1 } from './snapshot';
import { buildUx16Milestones } from './ux16-plan';

const NOW = '2026-10-30T00:00:00.000Z';

describe('project-control contracts and calculations', () => {
    it('requires evidence before progress can be counted', () => {
        expect(() => TaskEvidenceV1Schema.parse({
            branch: 'agent/example',
            commit: null,
            pullRequestUrl: null,
            handoffPath: null,
            evidenceStatus: 'IMPLEMENTED',
            tests: [],
            reviewedBy: null,
            reviewedAt: null,
        })).toThrow();
    });

    it('derives implemented, tested, and accepted progress separately', () => {
        const milestones = buildUx16Milestones('abcdef1234567');
        const snapshot = buildProjectProgressSnapshotV1({
            generatedAt: NOW,
            sourceBranch: 'codex/ux16.2-true-flow',
            sourceCommit: 'abcdef1234567',
            milestones,
        });
        expect(snapshot.totals.implementedWeight).toBeGreaterThan(snapshot.totals.acceptedWeight);
        expect(snapshot.totals.testedWeight).toBeGreaterThan(snapshot.totals.acceptedWeight);
        expect(snapshot.totals.reviewRequiredTasks).toBeGreaterThan(0);
    });

    it('does not count the active task locally when no commit is reported', () => {
        const milestones = buildUx16Milestones(null);
        const current = milestones
            .flatMap((milestone) => milestone.features)
            .flatMap((feature) => feature.tasks)
            .find((task) => task.id === 'UX16.2-CALC-01');
        expect(current?.evidence.evidenceStatus).toBe('UNVERIFIED');
        expect(current?.evidence.commit).toBeNull();
    });

    it('keeps unreported subscription usage out of known spend', () => {
        const file = AgentUsageFileV1Schema.parse({
            schemaVersion: 'agent-usage-v1',
            agent: 'CODEX',
            runs: [{
                id: 'run-1', taskId: 'UX16.2-CALC-01', agent: 'CODEX', provider: 'OpenAI', model: 'UNREPORTED',
                billingMode: 'SUBSCRIPTION', startedAt: NOW, completedAt: null, elapsedMs: null,
                inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, toolCalls: null,
                providerReportedCostUsd: null, calculatedCostUsd: null, costStatus: 'UNREPORTED', pricing: null,
                usageSource: 'UNAVAILABLE', sourceReference: null, notes: ['Not exposed'],
            }],
        });
        const snapshot = buildUsageSpendSnapshotV1({ generatedAt: NOW, usageFiles: [file] });
        expect(snapshot.totals.knownSpendUsd).toBe(0);
        expect(snapshot.totals.runsWithUnreportedUsage).toBe(1);
    });

    it('sums provider-reported and sourced calculated costs without mixing unknowns', () => {
        const usageFiles: AgentUsageFileV1[] = [AgentUsageFileV1Schema.parse({
            schemaVersion: 'agent-usage-v1',
            agent: 'DEEPSEEK',
            runs: [
                {
                    id: 'provider-run', taskId: 'UX16.2-VALIDATION-04', agent: 'DEEPSEEK', provider: 'DeepSeek', model: 'test',
                    billingMode: 'API_METERED', startedAt: NOW, completedAt: NOW, elapsedMs: 100,
                    inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 500, reasoningTokens: null, toolCalls: 2,
                    providerReportedCostUsd: 0.01, calculatedCostUsd: null, costStatus: 'PROVIDER_REPORTED', pricing: null,
                    usageSource: 'API_RESPONSE', sourceReference: 'agent report', notes: [],
                },
                {
                    id: 'calculated-run', taskId: 'UX16.2-VALIDATION-04', agent: 'DEEPSEEK', provider: 'DeepSeek', model: 'test',
                    billingMode: 'API_METERED', startedAt: NOW, completedAt: NOW, elapsedMs: 100,
                    inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 500, reasoningTokens: null, toolCalls: 2,
                    providerReportedCostUsd: null, calculatedCostUsd: 0.02, costStatus: 'CALCULATED',
                    pricing: { currency: 'USD', effectiveAt: NOW, inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2, cachedInputUsdPerMillionTokens: 0.5, sourceUrl: 'https://example.com/pricing' },
                    usageSource: 'MANUAL_ENTRY', sourceReference: 'pricing snapshot', notes: [],
                },
            ],
        })];
        const snapshot = buildUsageSpendSnapshotV1({ generatedAt: NOW, usageFiles });
        expect(snapshot.totals.knownSpendUsd).toBe(0.03);
        expect(snapshot.totals.providerReportedSpendUsd).toBe(0.01);
        expect(snapshot.totals.calculatedSpendUsd).toBe(0.02);
    });

    it('builds a schema-valid dashboard response with truthful unknown usage', () => {
        const response = buildProjectControlResponseV1({
            generatedAt: NOW,
            sourceBranch: 'codex/ux16.2-true-flow',
            sourceCommit: 'abcdef1234567',
        });
        expect(ProjectControlResponseV1Schema.parse(response)).toEqual(response);
        expect(response.usage.totals.runsWithUnreportedUsage).toBeGreaterThan(0);
        expect(response.progress.milestones.find((milestone: MilestoneProgressV1) => milestone.id === 'UX16.2')?.status).toBe('IN_PROGRESS');
    });
});
