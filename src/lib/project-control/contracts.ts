import { z } from 'zod';

const nullableCommit = z.string().trim().min(7).max(64).nullable();
const nullableText = z.string().trim().min(1).max(500).nullable();
const nonNegativeFinite = z.number().nonnegative().finite();
const nullableNonNegative = nonNegativeFinite.nullable();

export const PROJECT_CONTROL_SCHEMA_VERSION = 'project-control-v1' as const;
export const AGENT_USAGE_SCHEMA_VERSION = 'agent-usage-v1' as const;

export const WorkStatusSchema = z.enum([
    'NOT_STARTED',
    'IN_PROGRESS',
    'BLOCKED',
    'REVIEW_REQUIRED',
    'COMPLETE',
    'DEFERRED',
]);
export type WorkStatus = z.infer<typeof WorkStatusSchema>;

export const AgentIdSchema = z.enum([
    'ARCHITECT',
    'CODEX',
    'ANTIGRAVITY',
    'DEEPSEEK',
    'GLM',
    'QWEN',
    'OTHER',
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const EvidenceStatusSchema = z.enum(['UNVERIFIED', 'IMPLEMENTED', 'TESTED', 'ACCEPTED']);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const TestEvidenceV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    command: z.string().trim().min(1).max(500),
    result: z.enum(['PASS', 'FAIL', 'NOT_RUN']),
    passed: z.number().int().nonnegative().nullable(),
    failed: z.number().int().nonnegative().nullable(),
    skipped: z.number().int().nonnegative().nullable(),
    executedAt: z.string().datetime().nullable(),
    commit: nullableCommit,
    artifactPaths: z.array(z.string().trim().min(1).max(500)).max(64),
}).strict();
export type TestEvidenceV1 = z.infer<typeof TestEvidenceV1Schema>;

export const TaskEvidenceV1Schema = z.object({
    branch: nullableText,
    commit: nullableCommit,
    pullRequestUrl: z.string().url().nullable(),
    handoffPath: nullableText,
    evidenceStatus: EvidenceStatusSchema,
    tests: z.array(TestEvidenceV1Schema).max(64),
    reviewedBy: AgentIdSchema.nullable(),
    reviewedAt: z.string().datetime().nullable(),
}).strict().superRefine((value, context) => {
    if (value.evidenceStatus !== 'UNVERIFIED' && value.commit === null) {
        context.addIssue({ code: 'custom', message: 'Implemented evidence requires a commit', path: ['commit'] });
    }
    if ((value.evidenceStatus === 'TESTED' || value.evidenceStatus === 'ACCEPTED')
        && !value.tests.some((test) => test.result === 'PASS')) {
        context.addIssue({ code: 'custom', message: 'Tested evidence requires a passing test', path: ['tests'] });
    }
    if (value.evidenceStatus === 'ACCEPTED' && (value.reviewedBy === null || value.reviewedAt === null)) {
        context.addIssue({ code: 'custom', message: 'Accepted evidence requires a reviewer and review time', path: ['reviewedBy'] });
    }
});
export type TaskEvidenceV1 = z.infer<typeof TaskEvidenceV1Schema>;

export const ProjectTaskV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    milestoneId: z.string().trim().min(1).max(32),
    featureId: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1_000),
    owner: AgentIdSchema,
    supportingAgents: z.array(AgentIdSchema).max(8),
    status: WorkStatusSchema,
    weight: z.number().int().positive().max(100),
    dependsOn: z.array(z.string().trim().min(1).max(128)).max(32),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(32),
    blockers: z.array(z.string().trim().min(1).max(500)).max(32),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
    evidence: TaskEvidenceV1Schema,
}).strict();
export type ProjectTaskV1 = z.infer<typeof ProjectTaskV1Schema>;

export const FeatureProgressV1Schema = z.object({
    id: z.string().trim().min(1).max(64),
    milestoneId: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(200),
    status: WorkStatusSchema,
    tasks: z.array(ProjectTaskV1Schema).min(1).max(100),
}).strict();
export type FeatureProgressV1 = z.infer<typeof FeatureProgressV1Schema>;

export const MilestoneProgressV1Schema = z.object({
    id: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(200),
    status: WorkStatusSchema,
    features: z.array(FeatureProgressV1Schema).min(1).max(100),
}).strict();
export type MilestoneProgressV1 = z.infer<typeof MilestoneProgressV1Schema>;

export const ProjectProgressTotalsV1Schema = z.object({
    totalWeight: z.number().int().nonnegative(),
    implementedWeight: z.number().int().nonnegative(),
    testedWeight: z.number().int().nonnegative(),
    acceptedWeight: z.number().int().nonnegative(),
    implementedPercent: z.number().min(0).max(100),
    testedPercent: z.number().min(0).max(100),
    acceptedPercent: z.number().min(0).max(100),
    blockedTasks: z.number().int().nonnegative(),
    reviewRequiredTasks: z.number().int().nonnegative(),
}).strict();

export const ProjectProgressSnapshotV1Schema = z.object({
    schemaVersion: z.literal(PROJECT_CONTROL_SCHEMA_VERSION),
    projectId: z.literal('btc-derivatives-terminal'),
    generatedAt: z.string().datetime(),
    sourceBranch: z.string().trim().min(1).max(200),
    sourceCommit: nullableCommit,
    milestones: z.array(MilestoneProgressV1Schema).min(1).max(32),
    totals: ProjectProgressTotalsV1Schema,
}).strict();
export type ProjectProgressSnapshotV1 = z.infer<typeof ProjectProgressSnapshotV1Schema>;

export const BillingModeSchema = z.enum(['API_METERED', 'SUBSCRIPTION', 'FREE_TIER', 'LOCAL', 'UNKNOWN']);
export const CostStatusSchema = z.enum([
    'PROVIDER_REPORTED',
    'CALCULATED',
    'INCLUDED_SUBSCRIPTION',
    'FREE_TIER',
    'UNKNOWN',
    'UNREPORTED',
]);

export const PricingSnapshotV1Schema = z.object({
    currency: z.literal('USD'),
    effectiveAt: z.string().datetime(),
    inputUsdPerMillionTokens: nullableNonNegative,
    outputUsdPerMillionTokens: nullableNonNegative,
    cachedInputUsdPerMillionTokens: nullableNonNegative,
    sourceUrl: z.string().url().nullable(),
}).strict();
export type PricingSnapshotV1 = z.infer<typeof PricingSnapshotV1Schema>;

export const AgentUsageRunV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    taskId: z.string().trim().min(1).max(128),
    agent: AgentIdSchema,
    provider: z.string().trim().min(1).max(128),
    model: z.string().trim().min(1).max(128),
    billingMode: BillingModeSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    elapsedMs: z.number().int().nonnegative().nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    cachedInputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    reasoningTokens: z.number().int().nonnegative().nullable(),
    toolCalls: z.number().int().nonnegative().nullable(),
    providerReportedCostUsd: nullableNonNegative,
    calculatedCostUsd: nullableNonNegative,
    costStatus: CostStatusSchema,
    pricing: PricingSnapshotV1Schema.nullable(),
    usageSource: z.enum(['API_RESPONSE', 'PROVIDER_DASHBOARD', 'AGENT_REPORT', 'MANUAL_ENTRY', 'UNAVAILABLE']),
    sourceReference: nullableText,
    notes: z.array(z.string().trim().min(1).max(500)).max(32),
}).strict().superRefine((value, context) => {
    if (value.providerReportedCostUsd !== null && value.calculatedCostUsd !== null) {
        context.addIssue({ code: 'custom', message: 'A usage run cannot count both reported and calculated cost', path: ['calculatedCostUsd'] });
    }
    if (value.costStatus === 'PROVIDER_REPORTED' && value.providerReportedCostUsd === null) {
        context.addIssue({ code: 'custom', message: 'Provider-reported cost requires an amount', path: ['providerReportedCostUsd'] });
    }
    if (value.costStatus === 'CALCULATED'
        && (value.calculatedCostUsd === null || value.pricing === null || value.pricing.sourceUrl === null)) {
        context.addIssue({ code: 'custom', message: 'Calculated cost requires an amount and sourced pricing snapshot', path: ['calculatedCostUsd'] });
    }
    if ((value.costStatus === 'UNKNOWN' || value.costStatus === 'UNREPORTED')
        && (value.providerReportedCostUsd !== null || value.calculatedCostUsd !== null)) {
        context.addIssue({ code: 'custom', message: 'Unknown cost cannot include a cost amount', path: ['costStatus'] });
    }
});
export type AgentUsageRunV1 = z.infer<typeof AgentUsageRunV1Schema>;

export const AgentUsageFileV1Schema = z.object({
    schemaVersion: z.literal(AGENT_USAGE_SCHEMA_VERSION),
    agent: AgentIdSchema,
    runs: z.array(AgentUsageRunV1Schema).max(10_000),
}).strict().superRefine((value, context) => {
    value.runs.forEach((run, index) => {
        if (run.agent !== value.agent) {
            context.addIssue({ code: 'custom', message: 'Usage run agent must match file agent', path: ['runs', index, 'agent'] });
        }
    });
});
export type AgentUsageFileV1 = z.infer<typeof AgentUsageFileV1Schema>;

export const AgentBudgetV1Schema = z.object({
    agent: AgentIdSchema,
    period: z.enum(['MILESTONE', 'MONTH', 'PROJECT']),
    budgetUsd: nullableNonNegative,
    warningPercent: z.number().min(0).max(100),
}).strict();
export type AgentBudgetV1 = z.infer<typeof AgentBudgetV1Schema>;

export const UsageSpendTotalsV1Schema = z.object({
    knownSpendUsd: nonNegativeFinite,
    providerReportedSpendUsd: nonNegativeFinite,
    calculatedSpendUsd: nonNegativeFinite,
    runsWithUnknownCost: z.number().int().nonnegative(),
    runsWithUnreportedUsage: z.number().int().nonnegative(),
    inputTokensKnown: z.number().int().nonnegative(),
    outputTokensKnown: z.number().int().nonnegative(),
}).strict();

export const UsageSpendSnapshotV1Schema = z.object({
    schemaVersion: z.literal(AGENT_USAGE_SCHEMA_VERSION),
    generatedAt: z.string().datetime(),
    runs: z.array(AgentUsageRunV1Schema).max(50_000),
    budgets: z.array(AgentBudgetV1Schema).max(100),
    totals: UsageSpendTotalsV1Schema,
}).strict();
export type UsageSpendSnapshotV1 = z.infer<typeof UsageSpendSnapshotV1Schema>;

export const ProjectControlResponseV1Schema = z.object({
    progress: ProjectProgressSnapshotV1Schema,
    usage: UsageSpendSnapshotV1Schema,
}).strict();
export type ProjectControlResponseV1 = z.infer<typeof ProjectControlResponseV1Schema>;
