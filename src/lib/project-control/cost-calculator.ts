import {
    AgentUsageFileV1Schema,
    UsageSpendSnapshotV1Schema,
    type AgentBudgetV1,
    type AgentUsageFileV1,
    type AgentUsageRunV1,
    type UsageSpendSnapshotV1,
} from './contracts';

export function buildUsageSpendSnapshotV1(input: {
    generatedAt: string;
    usageFiles: AgentUsageFileV1[];
    budgets?: AgentBudgetV1[];
}): UsageSpendSnapshotV1 {
    const runs: AgentUsageRunV1[] = input.usageFiles.flatMap((file) => AgentUsageFileV1Schema.parse(file).runs);
    const providerReportedSpendUsd = runs.reduce((sum, run) => sum + (run.providerReportedCostUsd ?? 0), 0);
    const calculatedSpendUsd = runs.reduce((sum, run) => sum + (run.calculatedCostUsd ?? 0), 0);
    return UsageSpendSnapshotV1Schema.parse({
        schemaVersion: 'agent-usage-v1',
        generatedAt: input.generatedAt,
        runs,
        budgets: input.budgets ?? [],
        totals: {
            knownSpendUsd: providerReportedSpendUsd + calculatedSpendUsd,
            providerReportedSpendUsd,
            calculatedSpendUsd,
            runsWithUnknownCost: runs.filter((run) => run.costStatus === 'UNKNOWN').length,
            runsWithUnreportedUsage: runs.filter((run) => run.costStatus === 'UNREPORTED').length,
            inputTokensKnown: runs.reduce((sum, run) => sum + (run.inputTokens ?? 0), 0),
            outputTokensKnown: runs.reduce((sum, run) => sum + (run.outputTokens ?? 0), 0),
        },
    });
}
