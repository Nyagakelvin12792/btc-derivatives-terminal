import {
    ProjectProgressSnapshotV1Schema,
    type MilestoneProgressV1,
    type ProjectProgressSnapshotV1,
    type ProjectTaskV1,
} from './contracts';

const EVIDENCE_RANK = {
    UNVERIFIED: 0,
    IMPLEMENTED: 1,
    TESTED: 2,
    ACCEPTED: 3,
} as const;

function roundPercent(weight: number, total: number): number {
    return total === 0 ? 0 : Number(((weight / total) * 100).toFixed(1));
}

export function flattenProjectTasks(milestones: readonly MilestoneProgressV1[]): ProjectTaskV1[] {
    return milestones.flatMap((milestone) => milestone.features.flatMap((feature) => feature.tasks));
}

export function buildProjectProgressSnapshotV1(input: {
    generatedAt: string;
    sourceBranch: string;
    sourceCommit: string | null;
    milestones: MilestoneProgressV1[];
}): ProjectProgressSnapshotV1 {
    const tasks = flattenProjectTasks(input.milestones);
    const totalWeight = tasks.reduce((sum, task) => sum + task.weight, 0);
    const weightAt = (minimumRank: number) => tasks.reduce((sum, task) =>
        sum + (task.evidence.commit !== null && EVIDENCE_RANK[task.evidence.evidenceStatus] >= minimumRank ? task.weight : 0), 0);
    const implementedWeight = weightAt(1);
    const testedWeight = weightAt(2);
    const acceptedWeight = weightAt(3);
    return ProjectProgressSnapshotV1Schema.parse({
        schemaVersion: 'project-control-v1',
        projectId: 'btc-derivatives-terminal',
        generatedAt: input.generatedAt,
        sourceBranch: input.sourceBranch,
        sourceCommit: input.sourceCommit,
        milestones: input.milestones,
        totals: {
            totalWeight,
            implementedWeight,
            testedWeight,
            acceptedWeight,
            implementedPercent: roundPercent(implementedWeight, totalWeight),
            testedPercent: roundPercent(testedWeight, totalWeight),
            acceptedPercent: roundPercent(acceptedWeight, totalWeight),
            blockedTasks: tasks.filter((task) => task.status === 'BLOCKED').length,
            reviewRequiredTasks: tasks.filter((task) => task.status === 'REVIEW_REQUIRED').length,
        },
    });
}
