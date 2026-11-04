import { z } from 'zod';
import {
    AgentIdSchema,
    EvidenceStatusSchema,
    MilestoneProgressV1Schema,
    TestEvidenceV1Schema,
    WorkStatusSchema,
    type AgentId,
    type EvidenceStatus,
    type MilestoneProgressV1,
    type ProjectTaskV1,
    type TestEvidenceV1,
    type WorkStatus,
} from './contracts';
import { flattenProjectTasks } from './progress-calculator';

export const EXECUTION_CHECKPOINT_SCHEMA_VERSION = 'execution-checkpoint-v1' as const;

export const TaskRuntimeOverrideSchema = z.object({
    taskId: z.string().trim().min(1).max(128),
    status: WorkStatusSchema,
    evidenceStatus: EvidenceStatusSchema,
    commit: z.string().trim().min(7).max(64).nullable(),
    branch: z.string().trim().min(1).max(200).nullable(),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
    reviewedBy: AgentIdSchema.nullable(),
    reviewedAt: z.string().datetime().nullable(),
    retryCount: z.number().int().nonnegative().max(10),
    lastError: z.string().trim().max(500).nullable(),
    blockers: z.array(z.string().trim().min(1).max(500)).max(32),
    tests: z.array(TestEvidenceV1Schema).max(64),
}).strict();
export type TaskRuntimeOverride = z.infer<typeof TaskRuntimeOverrideSchema>;

export const ExecutionCheckpointV1Schema = z.object({
    schemaVersion: z.literal(EXECUTION_CHECKPOINT_SCHEMA_VERSION),
    initiativeId: z.string().trim().min(1).max(64),
    activeMilestoneId: z.string().trim().min(1).max(32).nullable(),
    activeTaskId: z.string().trim().min(1).max(128).nullable(),
    assignedAgent: AgentIdSchema.nullable(),
    taskStartedAt: z.string().datetime().nullable(),
    lastCheckpointAt: z.string().datetime(),
    codeRevision: z.string().trim().min(7).max(64).nullable(),
    maxRetries: z.number().int().positive().max(10),
    overrides: z.record(z.string(), TaskRuntimeOverrideSchema),
}).strict();
export type ExecutionCheckpointV1 = z.infer<typeof ExecutionCheckpointV1Schema>;

export function createInitialCheckpoint(
    initiativeId = 'UX17-MINIMALIST-WORKSPACE',
    nowIso = new Date().toISOString(),
    codeRevision: string | null = null,
): ExecutionCheckpointV1 {
    return ExecutionCheckpointV1Schema.parse({
        schemaVersion: EXECUTION_CHECKPOINT_SCHEMA_VERSION,
        initiativeId,
        activeMilestoneId: null,
        activeTaskId: null,
        assignedAgent: null,
        taskStartedAt: null,
        lastCheckpointAt: nowIso,
        codeRevision,
        maxRetries: 3,
        overrides: {},
    });
}

/**
 * Finds the next eligible task whose dependencies are all COMPLETE and which is not COMPLETE, BLOCKED, or DEFERRED.
 */
export function findNextEligibleTask(milestones: readonly MilestoneProgressV1[]): ProjectTaskV1 | null {
    const allTasks = flattenProjectTasks(milestones);
    const taskById = new Map<string, ProjectTaskV1>(allTasks.map((t) => [t.id, t]));

    // Prefer continuing an already IN_PROGRESS task if its dependencies are met
    const inProgress = allTasks.find((t) => t.status === 'IN_PROGRESS' && areDependenciesSatisfied(t, taskById));
    if (inProgress) return inProgress;

    for (const task of allTasks) {
        if (task.status !== 'NOT_STARTED') continue;
        if (areDependenciesSatisfied(task, taskById)) {
            return task;
        }
    }
    return null;
}

export function areDependenciesSatisfied(
    task: ProjectTaskV1,
    taskById: ReadonlyMap<string, ProjectTaskV1>,
): boolean {
    for (const depId of task.dependsOn) {
        const dep = taskById.get(depId);
        if (dep && dep.status !== 'COMPLETE') {
            return false;
        }
    }
    return true;
}

export function deriveMilestoneStatusFromTasks(tasks: readonly ProjectTaskV1[]): WorkStatus {
    if (tasks.length === 0) return 'NOT_STARTED';
    if (tasks.every((t) => t.status === 'COMPLETE')) return 'COMPLETE';
    if (tasks.some((t) => t.status === 'BLOCKED')) return 'BLOCKED';
    if (tasks.some((t) => t.status === 'REVIEW_REQUIRED')) return 'REVIEW_REQUIRED';
    if (tasks.some((t) => t.status === 'IN_PROGRESS' || t.status === 'COMPLETE')) return 'IN_PROGRESS';
    if (tasks.every((t) => t.status === 'DEFERRED')) return 'DEFERRED';
    return 'NOT_STARTED';
}

/**
 * Applies runtime checkpoint overrides idempotently to a list of milestones and recalculates feature/milestone statuses.
 */
export function applyCheckpointToMilestones(
    milestones: readonly MilestoneProgressV1[],
    checkpoint: ExecutionCheckpointV1 | null | undefined,
): MilestoneProgressV1[] {
    if (!checkpoint || Object.keys(checkpoint.overrides).length === 0) {
        return [...milestones];
    }

    return milestones.map((m) => {
        const updatedFeatures = m.features.map((f) => {
            const updatedTasks: ProjectTaskV1[] = f.tasks.map((t) => {
                const ov = checkpoint.overrides[t.id];
                if (!ov) return t;
                return {
                    ...t,
                    status: ov.status,
                    blockers: ov.blockers,
                    startedAt: ov.startedAt ?? t.startedAt,
                    completedAt: ov.completedAt ?? t.completedAt,
                    updatedAt: ov.updatedAt,
                    evidence: {
                        ...t.evidence,
                        branch: ov.branch ?? t.evidence.branch,
                        commit: ov.commit ?? t.evidence.commit,
                        evidenceStatus: ov.evidenceStatus,
                        tests: ov.tests.length > 0 ? ov.tests : t.evidence.tests,
                        reviewedBy: ov.reviewedBy ?? t.evidence.reviewedBy,
                        reviewedAt: ov.reviewedAt ?? t.evidence.reviewedAt,
                    },
                };
            });
            const featureStatus = deriveMilestoneStatusFromTasks(updatedTasks);
            return {
                ...f,
                status: featureStatus,
                tasks: updatedTasks,
            };
        });
        const allMilestoneTasks = updatedFeatures.flatMap((f) => f.tasks);
        const milestoneStatus = deriveMilestoneStatusFromTasks(allMilestoneTasks);
        return MilestoneProgressV1Schema.parse({
            ...m,
            status: milestoneStatus,
            features: updatedFeatures,
        });
    });
}

export function transitionTaskInProgress(
    checkpoint: ExecutionCheckpointV1,
    task: Pick<ProjectTaskV1, 'id' | 'milestoneId' | 'owner'>,
    nowIso = new Date().toISOString(),
    branch = 'main',
): ExecutionCheckpointV1 {
    const existing = checkpoint.overrides[task.id];
    const override: TaskRuntimeOverride = {
        taskId: task.id,
        status: 'IN_PROGRESS',
        evidenceStatus: existing?.evidenceStatus ?? 'UNVERIFIED',
        commit: existing?.commit ?? null,
        branch: existing?.branch ?? branch,
        startedAt: existing?.startedAt ?? nowIso,
        completedAt: null,
        updatedAt: nowIso,
        reviewedBy: existing?.reviewedBy ?? null,
        reviewedAt: existing?.reviewedAt ?? null,
        retryCount: existing?.retryCount ?? 0,
        lastError: null,
        blockers: [],
        tests: existing?.tests ?? [],
    };
    return ExecutionCheckpointV1Schema.parse({
        ...checkpoint,
        activeMilestoneId: task.milestoneId,
        activeTaskId: task.id,
        assignedAgent: task.owner,
        taskStartedAt: override.startedAt,
        lastCheckpointAt: nowIso,
        overrides: {
            ...checkpoint.overrides,
            [task.id]: override,
        },
    });
}

export function transitionTaskTestedOrAccepted(
    checkpoint: ExecutionCheckpointV1,
    input: {
        taskId: string;
        commit: string;
        branch?: string;
        tests: TestEvidenceV1[];
        acceptedBy?: AgentId | null;
        nowIso?: string;
    },
): ExecutionCheckpointV1 {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const existing = checkpoint.overrides[input.taskId];
    const hasPassingTest = input.tests.some((t) => t.result === 'PASS');
    const evidenceStatus: EvidenceStatus =
        hasPassingTest && input.acceptedBy
            ? 'ACCEPTED'
            : hasPassingTest
                ? 'TESTED'
                : 'IMPLEMENTED';

    const override: TaskRuntimeOverride = {
        taskId: input.taskId,
        status: hasPassingTest ? 'COMPLETE' : 'IN_PROGRESS',
        evidenceStatus,
        commit: input.commit,
        branch: input.branch ?? existing?.branch ?? 'main',
        startedAt: existing?.startedAt ?? nowIso,
        completedAt: hasPassingTest ? nowIso : null,
        updatedAt: nowIso,
        reviewedBy: evidenceStatus === 'ACCEPTED' ? (input.acceptedBy ?? 'ARCHITECT') : null,
        reviewedAt: evidenceStatus === 'ACCEPTED' ? nowIso : null,
        retryCount: existing?.retryCount ?? 0,
        lastError: null,
        blockers: [],
        tests: input.tests,
    };

    return ExecutionCheckpointV1Schema.parse({
        ...checkpoint,
        activeTaskId: hasPassingTest ? null : checkpoint.activeTaskId,
        lastCheckpointAt: nowIso,
        codeRevision: input.commit,
        overrides: {
            ...checkpoint.overrides,
            [input.taskId]: override,
        },
    });
}

export function transitionTaskFailedOrBlocked(
    checkpoint: ExecutionCheckpointV1,
    input: {
        taskId: string;
        error: string;
        nowIso?: string;
    },
): ExecutionCheckpointV1 {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const existing = checkpoint.overrides[input.taskId];
    const nextRetry = (existing?.retryCount ?? 0) + 1;
    const isBlocked = nextRetry >= checkpoint.maxRetries;

    const override: TaskRuntimeOverride = {
        taskId: input.taskId,
        status: isBlocked ? 'BLOCKED' : 'IN_PROGRESS',
        evidenceStatus: existing?.evidenceStatus ?? 'UNVERIFIED',
        commit: existing?.commit ?? null,
        branch: existing?.branch ?? 'main',
        startedAt: existing?.startedAt ?? nowIso,
        completedAt: null,
        updatedAt: nowIso,
        reviewedBy: existing?.reviewedBy ?? null,
        reviewedAt: existing?.reviewedAt ?? null,
        retryCount: nextRetry,
        lastError: input.error.slice(0, 500),
        blockers: isBlocked ? [`Max retries (${checkpoint.maxRetries}) reached: ${input.error.slice(0, 400)}`] : [],
        tests: existing?.tests ?? [],
    };

    return ExecutionCheckpointV1Schema.parse({
        ...checkpoint,
        lastCheckpointAt: nowIso,
        overrides: {
            ...checkpoint.overrides,
            [input.taskId]: override,
        },
    });
}
