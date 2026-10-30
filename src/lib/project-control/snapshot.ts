import codexUsageJson from '../../../.agents/usage/codex.json';
import deepseekUsageJson from '../../../.agents/usage/deepseek.json';
import geminiUsageJson from '../../../.agents/usage/gemini.json';
import otherUsageJson from '../../../.agents/usage/other.json';

import {
    AgentUsageFileV1Schema,
    ProjectControlResponseV1Schema,
    type ProjectControlResponseV1,
} from './contracts';
import { buildUsageSpendSnapshotV1 } from './cost-calculator';
import { buildProjectProgressSnapshotV1 } from './progress-calculator';
import { buildUx16Milestones } from './ux16-plan';

export interface ProjectControlSnapshotOptions {
    generatedAt?: string;
    sourceBranch?: string;
    sourceCommit?: string | null;
}

export function buildProjectControlResponseV1(
    options: ProjectControlSnapshotOptions = {},
): ProjectControlResponseV1 {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const sourceBranch = options.sourceBranch
        ?? process.env.VERCEL_GIT_COMMIT_REF
        ?? 'codex/ux16.2-true-flow';
    const sourceCommit = options.sourceCommit
        ?? process.env.VERCEL_GIT_COMMIT_SHA
        ?? process.env.UX16_SOURCE_COMMIT
        ?? null;
    const usageFiles = [codexUsageJson, geminiUsageJson, deepseekUsageJson, otherUsageJson]
        .map((file) => AgentUsageFileV1Schema.parse(file));

    return ProjectControlResponseV1Schema.parse({
        progress: buildProjectProgressSnapshotV1({
            generatedAt,
            sourceBranch,
            sourceCommit,
            milestones: buildUx16Milestones(sourceCommit),
        }),
        usage: buildUsageSpendSnapshotV1({
            generatedAt,
            usageFiles,
            budgets: [
                { agent: 'CODEX', period: 'MILESTONE', budgetUsd: null, warningPercent: 80 },
                { agent: 'ANTIGRAVITY', period: 'MILESTONE', budgetUsd: null, warningPercent: 80 },
                { agent: 'DEEPSEEK', period: 'MILESTONE', budgetUsd: null, warningPercent: 80 },
            ],
        }),
    });
}
