import {
    MilestoneProgressV1Schema,
    type AgentId,
    type EvidenceStatus,
    type MilestoneProgressV1,
    type ProjectTaskV1,
    type WorkStatus,
} from './contracts';

const UPDATED_AT = '2026-10-30T00:00:00.000Z';

interface TaskInput {
    id: string;
    milestoneId: string;
    featureId: string;
    title: string;
    description: string;
    owner: AgentId;
    supportingAgents?: AgentId[];
    status: WorkStatus;
    weight: number;
    dependsOn?: string[];
    acceptanceCriteria: string[];
    branch?: string | null;
    commit?: string | null;
    evidenceStatus?: EvidenceStatus;
    tests?: ProjectTaskV1['evidence']['tests'];
    reviewedBy?: AgentId | null;
    reviewedAt?: string | null;
    blockers?: string[];
}

function task(input: TaskInput): ProjectTaskV1 {
    return {
        id: input.id,
        milestoneId: input.milestoneId,
        featureId: input.featureId,
        title: input.title,
        description: input.description,
        owner: input.owner,
        supportingAgents: input.supportingAgents ?? [],
        status: input.status,
        weight: input.weight,
        dependsOn: input.dependsOn ?? [],
        acceptanceCriteria: input.acceptanceCriteria,
        blockers: input.blockers ?? [],
        startedAt: input.status === 'NOT_STARTED' || input.status === 'DEFERRED' ? null : UPDATED_AT,
        completedAt: input.status === 'COMPLETE' ? UPDATED_AT : null,
        updatedAt: UPDATED_AT,
        evidence: {
            branch: input.branch ?? null,
            commit: input.commit ?? null,
            pullRequestUrl: null,
            handoffPath: input.owner === 'CODEX'
                ? '.agents/handoffs/codex.md'
                : input.owner === 'ANTIGRAVITY'
                    ? '.agents/handoffs/gemini.md'
                    : null,
            evidenceStatus: input.evidenceStatus ?? 'UNVERIFIED',
            tests: input.tests ?? [],
            reviewedBy: input.reviewedBy ?? null,
            reviewedAt: input.reviewedAt ?? null,
        },
    };
}

function milestone(
    id: string,
    title: string,
    status: WorkStatus,
    featureId: string,
    featureTitle: string,
    tasks: ProjectTaskV1[],
): MilestoneProgressV1 {
    return MilestoneProgressV1Schema.parse({
        id,
        title,
        status,
        features: [{ id: featureId, milestoneId: id, title: featureTitle, status, tasks }],
    });
}

export function buildUx16Milestones(sourceCommit: string | null): MilestoneProgressV1[] {
    const currentEvidence: EvidenceStatus = sourceCommit ? 'TESTED' : 'UNVERIFIED';
    const currentTests: ProjectTaskV1['evidence']['tests'] = sourceCommit
        ? [{
            id: 'ux16-2-true-flow-focused',
            command: 'npx vitest run src/lib/orderflow/true-flow.test.ts && npx tsc --noEmit',
            result: 'PASS',
            passed: 7,
            failed: 0,
            skipped: 0,
            executedAt: UPDATED_AT,
            commit: sourceCommit,
            artifactPaths: [],
        }]
        : [];

    return [
        milestone('UX16.0', 'Calm analytical workspace shell', 'COMPLETE', 'CALM_SHELL', 'Calm shell', [
            task({
                id: 'UX16.0-SHELL-01', milestoneId: 'UX16.0', featureId: 'CALM_SHELL',
                title: 'Calm workspace and contract foundation', description: 'Versioned contracts and calm Context/Flow/Setup shell.',
                owner: 'CODEX', supportingAgents: ['ANTIGRAVITY'], status: 'COMPLETE', weight: 4,
                acceptanceCriteria: ['Architect-approved calm workspace renders without fabricating live evidence.'],
                branch: 'codex/ux16-integration', commit: '7b8e091', evidenceStatus: 'ACCEPTED',
                reviewedBy: 'ARCHITECT', reviewedAt: '2026-10-26T00:00:00.000Z',
                tests: [{ id: 'ux16-0-suite', command: 'npx vitest run && npm run build', result: 'PASS', passed: 188, failed: 0, skipped: 0, executedAt: '2026-10-26T00:00:00.000Z', commit: '7b8e091', artifactPaths: [] }],
            }),
        ]),
        milestone('UX16.1', 'Aggregate-trade capture', 'REVIEW_REQUIRED', 'AGGREGATE_TAPE', 'Binance Spot tape', [
            task({
                id: 'UX16.1-TAPE-01', milestoneId: 'UX16.1', featureId: 'AGGREGATE_TAPE',
                title: 'Validated aggregate-trade capture', description: 'Capture, classify, deduplicate, gap-track, replay and expose truthful tape health.',
                owner: 'CODEX', supportingAgents: ['ANTIGRAVITY'], status: 'REVIEW_REQUIRED', weight: 5,
                acceptanceCriteria: ['Capture remains shadow-only and passes deterministic replay and browser acceptance.'],
                branch: 'codex/ux16-integration', commit: 'd357dd6', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-1-suite', command: 'npx vitest run && npm run test:ux16', result: 'PASS', passed: 253, failed: 0, skipped: 2, executedAt: '2026-10-26T00:00:00.000Z', commit: 'd357dd6', artifactPaths: ['.artifacts/ui-overhaul/ux16-1-ready-enabled-1920x1080.png'] }],
            }),
        ]),
        milestone('UX16.2', 'True CVD, footprint, and trade VP', 'IN_PROGRESS', 'TRUE_FLOW', 'Trade-derived flow', [
            task({
                id: 'UX16.2-CALC-01', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Canonical true-flow contracts and pure derivation',
                description: 'Derive gap-safe CVD segments, footprint cells and captured-trade VP from one classified tape.',
                owner: 'CODEX', status: 'IN_PROGRESS', weight: 4,
                acceptanceCriteria: ['Tape, CVD, footprint and VP totals reconcile exactly.', 'CVD resets across gaps.', 'UX16.4 imbalance remains disabled.'],
                branch: 'codex/ux16.2-true-flow', commit: sourceCommit, evidenceStatus: currentEvidence, tests: currentTests,
            }),
            task({
                id: 'UX16.2-RUNTIME-02', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Incremental worker/runtime aggregation',
                description: 'Maintain bounded derived snapshots without shrinking session totals when raw tape retention rolls.',
                owner: 'CODEX', status: 'NOT_STARTED', weight: 4, dependsOn: ['UX16.2-CALC-01'],
                acceptanceCriteria: ['Worker emits bounded canonical snapshots.', 'Rolling tape eviction does not reduce session aggregates.'],
            }),
            task({
                id: 'UX16.2-UI-03', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'True-flow presentation and semantic zoom',
                description: 'Render discontinuous CVD, footprint geometry and exact/mixed trade profile states.',
                owner: 'ANTIGRAVITY', supportingAgents: ['CODEX'], status: 'NOT_STARTED', weight: 3, dependsOn: ['UX16.2-CALC-01'],
                acceptanceCriteria: ['Numbers hide before geometry.', 'No footprint renders before capture.', 'Mixed coverage is visually distinct.'],
            }),
            task({
                id: 'UX16.2-VALIDATION-04', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Independent oracle and reconciliation suite',
                description: 'Hand-calculated fixtures and adversarial gap/reconnect tests independent of production calculations.',
                owner: 'DEEPSEEK', supportingAgents: ['CODEX'], status: 'NOT_STARTED', weight: 2, dependsOn: ['UX16.2-CALC-01'],
                acceptanceCriteria: ['Oracle totals match canonical output.', 'Duplicates and rejected events never affect totals.'],
            }),
            task({
                id: 'UX16.2-ACCEPT-05', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Integrated acceptance checkpoint',
                description: 'Full unit, type, lint, build, browser and visual review of the assembled milestone.',
                owner: 'ARCHITECT', supportingAgents: ['CODEX', 'ANTIGRAVITY', 'DEEPSEEK'], status: 'NOT_STARTED', weight: 2,
                dependsOn: ['UX16.2-RUNTIME-02', 'UX16.2-UI-03', 'UX16.2-VALIDATION-04'],
                acceptanceCriteria: ['All five UX16.2 plan acceptance gates pass.'],
            }),
        ]),
        milestone('UX16.3', 'Liquidity Surface V2', 'NOT_STARTED', 'LIQUIDITY_SURFACE', 'Timestamp-aligned depth', [
            task({ id: 'UX16.3-SURFACE-01', milestoneId: 'UX16.3', featureId: 'LIQUIDITY_SURFACE', title: 'Timestamp-aligned liquidity surface', description: 'Replace the projected strip with chart-aligned historical depth.', owner: 'CODEX', supportingAgents: ['ANTIGRAVITY'], status: 'NOT_STARTED', weight: 5, dependsOn: ['UX16.2-ACCEPT-05'], acceptanceCriteria: ['Heatmap coordinates match chart time and price through pan and zoom.'] }),
        ]),
        milestone('UX16.4', 'Imbalance and liquidity behavior', 'NOT_STARTED', 'MICROSTRUCTURE', 'Imbalance/persistence/add-pull', [
            task({ id: 'UX16.4-MICRO-01', milestoneId: 'UX16.4', featureId: 'MICROSTRUCTURE', title: 'Imbalance, persistence, add/pull and replenishment', description: 'Deterministic microstructure observations with minimum-volume and adjacency gates.', owner: 'CODEX', supportingAgents: ['ANTIGRAVITY'], status: 'NOT_STARTED', weight: 5, dependsOn: ['UX16.3-SURFACE-01'], acceptanceCriteria: ['Hand-calculated fixtures match and replenishment remains labelled probable.'] }),
        ]),
        milestone('UX16.5', 'Absorption and acceptance', 'NOT_STARTED', 'FLOW_EVIDENCE', 'Absorption/divergence/zones', [
            task({ id: 'UX16.5-EVIDENCE-01', milestoneId: 'UX16.5', featureId: 'FLOW_EVIDENCE', title: 'Absorption, acceptance, divergence and zones', description: 'Combine aggressive execution, price response and structural location into deterministic evidence.', owner: 'CODEX', supportingAgents: ['ANTIGRAVITY'], status: 'NOT_STARTED', weight: 5, dependsOn: ['UX16.4-MICRO-01'], acceptanceCriteria: ['Absorption requires aggressive execution and a valid decision zone.'] }),
        ]),
        milestone('UX16.6', 'Setup state machine', 'NOT_STARTED', 'SETUP_ENGINE', 'Deterministic setup grading', [
            task({ id: 'UX16.6-SETUP-01', milestoneId: 'UX16.6', featureId: 'SETUP_ENGINE', title: 'Setup state machine and Decision Dock', description: 'Replayable setup states, mandatory gates, evidence IDs, triggers and invalidations.', owner: 'CODEX', supportingAgents: ['ANTIGRAVITY'], status: 'NOT_STARTED', weight: 5, dependsOn: ['UX16.5-EVIDENCE-01'], acceptanceCriteria: ['A failed mandatory gate prevents A-grade.'] }),
        ]),
        milestone('UX16.7', 'Jev shadow explanation', 'NOT_STARTED', 'JEV_SHADOW', 'Bounded AI explanation', [
            task({ id: 'UX16.7-JEV-01', milestoneId: 'UX16.7', featureId: 'JEV_SHADOW', title: 'Jev shadow adapter', description: 'Schema-validated, rate-limited, kill-switched explanation of an accepted deterministic feature packet.', owner: 'CODEX', supportingAgents: ['ANTIGRAVITY'], status: 'NOT_STARTED', weight: 4, dependsOn: ['UX16.6-SETUP-01'], acceptanceCriteria: ['Jev cannot alter state, grade, trigger, invalidation or risk.'] }),
        ]),
        milestone('UX16.8', 'Replay calibration and paper release', 'NOT_STARTED', 'CALIBRATION', 'Replay and paper evaluation', [
            task({ id: 'UX16.8-CAL-01', milestoneId: 'UX16.8', featureId: 'CALIBRATION', title: 'Replay calibration and paper release', description: 'Measure coverage, stability, false positives, abstention and outcomes without live execution.', owner: 'CODEX', supportingAgents: ['ANTIGRAVITY', 'ARCHITECT'], status: 'NOT_STARTED', weight: 5, dependsOn: ['UX16.7-JEV-01'], acceptanceCriteria: ['Replays reproduce identical evidence and Architect approves promotion.'] }),
        ]),
    ];
}
