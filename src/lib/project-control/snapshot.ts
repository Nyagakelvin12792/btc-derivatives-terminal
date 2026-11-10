import codexUsageJson from '../../../.agents/usage/codex.json';
import deepseekUsageJson from '../../../.agents/usage/deepseek.json';
import geminiUsageJson from '../../../.agents/usage/gemini.json';
import otherUsageJson from '../../../.agents/usage/other.json';
import checkpointJson from '../../../.agents/project-control-state.json';
import ux21CheckpointJson from '../../../.agents/project-control-ux21-state.json';

import {
    AgentUsageFileV1Schema,
    ProjectControlResponseV1Schema,
    type ProjectControlResponseV1,
} from './contracts';
import { buildUsageSpendSnapshotV1 } from './cost-calculator';
import { applyCheckpointToMilestones, ExecutionCheckpointV1Schema } from './orchestrator';
import { buildProjectProgressSnapshotV1 } from './progress-calculator';
import { buildUx16Milestones } from './ux16-plan';
import { buildUx21Milestones } from './ux21-plan';

export interface ProjectControlSnapshotOptions {
    generatedAt?: string;
    sourceBranch?: string;
    sourceCommit?: string | null;
    applyCheckpoint?: boolean;
}

export function buildProjectControlResponseV1(
    options: ProjectControlSnapshotOptions = {},
): ProjectControlResponseV1 {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const branchCandidate = (options.sourceBranch ?? process.env.VERCEL_GIT_COMMIT_REF ?? '').trim();
    const sourceBranch = branchCandidate.length > 0 ? branchCandidate : 'main';
    const parsedCheckpoint = ExecutionCheckpointV1Schema.safeParse(checkpointJson);
    const commitCandidate = (
        options.sourceCommit ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.UX16_SOURCE_COMMIT ??
        ''
    ).trim();
    const sourceCommit = commitCandidate.length >= 7 ? commitCandidate : null;
    const usageFiles = [codexUsageJson, geminiUsageJson, deepseekUsageJson, otherUsageJson]
        .map((file) => AgentUsageFileV1Schema.parse(file));

    const baseMilestones = buildUx16Milestones();
    const ux21Milestones = buildUx21Milestones();
    const parsedUx21Checkpoint = ExecutionCheckpointV1Schema.safeParse(ux21CheckpointJson);
    const shouldApplyCheckpoint = options.applyCheckpoint ?? true;
    const milestones = shouldApplyCheckpoint && parsedCheckpoint.success
        ? applyCheckpointToMilestones(baseMilestones, parsedCheckpoint.data)
        : baseMilestones;

    return ProjectControlResponseV1Schema.parse({
        progress: buildProjectProgressSnapshotV1({
            generatedAt,
            sourceBranch,
            sourceCommit,
            milestones: [
                ...milestones,
                ...(shouldApplyCheckpoint && parsedUx21Checkpoint.success
                    ? applyCheckpointToMilestones(ux21Milestones, parsedUx21Checkpoint.data)
                    : ux21Milestones),
            ],
        }),
        usage: buildUsageSpendSnapshotV1({
            generatedAt,
            usageFiles,
            budgets: [
                { agent: 'CODEX', period: 'MILESTONE', budgetUsd: 0, warningPercent: 80 },
                { agent: 'ANTIGRAVITY', period: 'MILESTONE', budgetUsd: 0, warningPercent: 80 },
                { agent: 'DEEPSEEK', period: 'MILESTONE', budgetUsd: 0, warningPercent: 80 },
            ],
        }),
    });
}
