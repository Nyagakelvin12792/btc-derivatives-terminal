import {
    MilestoneProgressV1Schema,
    type AgentId,
    type EvidenceStatus,
    type MilestoneProgressV1,
    type ProjectTaskV1,
    type WorkStatus,
} from './contracts';

const UPDATED_AT = '2026-11-03T00:00:00.000Z';

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

export function buildUx16Milestones(): MilestoneProgressV1[] {
    const contractCommit = '447a9d2';
    const runtimeCommit = 'dea002c';
    const currentEvidence: EvidenceStatus = 'TESTED';
    const currentTests: ProjectTaskV1['evidence']['tests'] = [{
            id: 'ux16-2-true-flow-focused',
            command: 'npx vitest run src/lib/orderflow/true-flow.test.ts && npx tsc --noEmit',
            result: 'PASS',
            passed: 7,
            failed: 0,
            skipped: 0,
            executedAt: '2026-10-30T00:00:00.000Z',
            commit: contractCommit,
            artifactPaths: [],
        }];
    const runtimeTests: ProjectTaskV1['evidence']['tests'] = [{
            id: 'ux16-2-runtime-focused',
            command: 'npx vitest run true-flow-session, aggregate-trade-runtime, worker-protocol, feed-state, and true-flow suites; npx tsc --noEmit',
            result: 'PASS',
            passed: 20,
            failed: 0,
            skipped: 0,
            executedAt: '2026-10-30T00:00:00.000Z',
            commit: runtimeCommit,
            artifactPaths: [],
        }];

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
        milestone('UX16.2', 'True CVD, footprint, and trade VP', 'REVIEW_REQUIRED', 'TRUE_FLOW', 'Trade-derived flow', [
            task({
                id: 'UX16.2-CALC-01', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Canonical true-flow contracts and pure derivation',
                description: 'Derive gap-safe CVD segments, footprint cells and captured-trade VP from one classified tape.',
                owner: 'CODEX', status: 'REVIEW_REQUIRED', weight: 4,
                acceptanceCriteria: ['Tape, CVD, footprint and VP totals reconcile exactly.', 'CVD resets across gaps.', 'UX16.4 imbalance remains disabled.'],
                branch: 'codex/ux16.2-true-flow', commit: contractCommit, evidenceStatus: currentEvidence, tests: currentTests,
            }),
            task({
                id: 'UX16.2-RUNTIME-02', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Incremental worker/runtime aggregation',
                description: 'Maintain bounded derived snapshots without shrinking session totals when raw tape retention rolls.',
                owner: 'CODEX', status: 'REVIEW_REQUIRED', weight: 4, dependsOn: ['UX16.2-CALC-01'],
                acceptanceCriteria: ['Worker emits bounded canonical snapshots.', 'Rolling tape eviction does not reduce session aggregates.'],
                branch: 'codex/ux16.2-true-flow', commit: runtimeCommit, evidenceStatus: currentEvidence, tests: runtimeTests,
            }),
            task({
                id: 'UX16.2-UI-03', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'True-flow presentation and semantic zoom',
                description: 'Render discontinuous CVD, footprint geometry and exact/mixed trade profile states.',
                owner: 'ANTIGRAVITY', supportingAgents: ['CODEX'], status: 'REVIEW_REQUIRED', weight: 3, dependsOn: ['UX16.2-CALC-01'],
                acceptanceCriteria: ['Numbers hide before geometry.', 'No footprint renders before capture.', 'Mixed coverage is visually distinct.'],
                branch: 'codex/ux16.2-true-flow', commit: 'c8e7072', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-2-ui-browser', command: 'npx playwright test --config=playwright.ux16.config.ts', result: 'PASS', passed: 38, failed: 0, skipped: 2, executedAt: UPDATED_AT, commit: 'c8e7072', artifactPaths: ['.artifacts/ui-overhaul/project-control-milestones-1920x1080.png', '.artifacts/ui-overhaul/ux16-2-true-flow-desktop-1920x1080.png'] }],
            }),
            task({
                id: 'UX16.2-VALIDATION-04', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Independent oracle and reconciliation suite',
                description: 'Hand-calculated fixtures and adversarial gap/reconnect tests independent of production calculations.',
                owner: 'DEEPSEEK', supportingAgents: ['CODEX'], status: 'REVIEW_REQUIRED', weight: 2, dependsOn: ['UX16.2-CALC-01'],
                acceptanceCriteria: ['Oracle totals match canonical output.', 'Duplicates and rejected events never affect totals.'],
                branch: 'agent/deepseek-ux16.2-validation', commit: '9da7073', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-2-oracle-suite', command: 'npx vitest run true-flow-reconciliation.test.ts true-flow-boundaries.test.ts', result: 'PASS', passed: 21, failed: 0, skipped: 0, executedAt: UPDATED_AT, commit: '9da7073', artifactPaths: [] }],
            }),
            task({
                id: 'UX16.2-ACCEPT-05', milestoneId: 'UX16.2', featureId: 'TRUE_FLOW',
                title: 'Integrated acceptance checkpoint',
                description: 'Full unit, type, lint, build, browser and visual review of the assembled milestone.',
                owner: 'ARCHITECT', supportingAgents: ['CODEX', 'ANTIGRAVITY', 'DEEPSEEK'], status: 'REVIEW_REQUIRED', weight: 2,
                dependsOn: ['UX16.2-RUNTIME-02', 'UX16.2-UI-03', 'UX16.2-VALIDATION-04'],
                acceptanceCriteria: ['All five UX16.2 plan acceptance gates pass.'],
                branch: 'codex/ux16.2-true-flow', commit: 'c8e7072', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-2-assembled', command: 'npx vitest run; npx tsc --noEmit; npx eslint scoped; npx playwright test --config=playwright.ux16.config.ts', result: 'PASS', passed: 343, failed: 0, skipped: 2, executedAt: UPDATED_AT, commit: 'c8e7072', artifactPaths: ['docs/ui-ux/UX16_2_VISUAL_ACCEPTANCE.md', 'docs/ui-ux/UX16_2_VALIDATION_MATRIX.md'] }],
            }),
        ]),
        milestone('UX16.3', 'Liquidity Surface V2', 'REVIEW_REQUIRED', 'LIQUIDITY_SURFACE', 'Timestamp-aligned depth', [
            task({
                id: 'UX16.3-CONTRACTS-01', milestoneId: 'UX16.3', featureId: 'LIQUIDITY_SURFACE',
                title: 'Liquidity Surface V2 contracts and schemas',
                description: 'Zod schemas, density modes (FOCUSED/FULL), color ramp and projection contracts.',
                owner: 'ANTIGRAVITY', status: 'COMPLETE', weight: 2, dependsOn: ['UX16.2-ACCEPT-05'],
                acceptanceCriteria: ['Zod schemas validate density mode, settings, and projected cells.'],
                branch: 'agent/gemini-ux16.3-surface', commit: '5b60857', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-3-contracts', command: 'npx vitest run src/components/terminal/liquidity-surface-v2.test.ts', result: 'PASS', passed: 6, failed: 0, skipped: 0, executedAt: UPDATED_AT, commit: '5b60857', artifactPaths: [] }],
            }),
            task({
                id: 'UX16.3-PROJECTION-01', milestoneId: 'UX16.3', featureId: 'LIQUIDITY_SURFACE',
                title: 'Timestamp-aligned depth projection engine',
                description: 'Map depth X to chart event times and Y to price scale; eliminate right-hand strip.',
                owner: 'ANTIGRAVITY', status: 'COMPLETE', weight: 3, dependsOn: ['UX16.3-CONTRACTS-01'],
                acceptanceCriteria: ['Heatmap X matches event time, Y matches price, sequence gaps produce whitespace.'],
                branch: 'agent/gemini-ux16.3-surface', commit: '5b60857', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-3-projection', command: 'npx vitest run src/components/terminal/liquidity-surface-v2.test.ts', result: 'PASS', passed: 6, failed: 0, skipped: 0, executedAt: UPDATED_AT, commit: '5b60857', artifactPaths: [] }],
            }),
            task({
                id: 'UX16.3-RENDER-01', milestoneId: 'UX16.3', featureId: 'LIQUIDITY_SURFACE',
                title: 'Subordinate Canvas renderer and neutral amber ramp',
                description: 'Canvas primitive rendering below candles with graphite-to-amber ramp and persistent outlines.',
                owner: 'ANTIGRAVITY', status: 'COMPLETE', weight: 3, dependsOn: ['UX16.3-PROJECTION-01'],
                acceptanceCriteria: ['Subordinate to candles, no green/red directional colors, persistent walls outlined.'],
                branch: 'agent/gemini-ux16.3-surface', commit: '5b60857', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-3-render', command: 'npx vitest run src/components/terminal/liquidity-surface-v2.test.ts', result: 'PASS', passed: 6, failed: 0, skipped: 0, executedAt: UPDATED_AT, commit: '5b60857', artifactPaths: [] }],
            }),
            task({
                id: 'UX16.3-CONTROLS-01', milestoneId: 'UX16.3', featureId: 'LIQUIDITY_SURFACE',
                title: 'Density mode toggle and pause controls',
                description: 'Interactive FOCUSED/FULL density toggle, PAUSED badge, and chart synchronization.',
                owner: 'ANTIGRAVITY', status: 'COMPLETE', weight: 2, dependsOn: ['UX16.3-RENDER-01'],
                acceptanceCriteria: ['FOCUSED filters distant levels, FULL retains viewport depth, PAUSED displays honestly.'],
                branch: 'agent/gemini-ux16.3-surface', commit: '5b60857', evidenceStatus: 'TESTED',
                tests: [{ id: 'ux16-3-controls', command: 'npx vitest run src/components/terminal/liquidity-surface-v2.test.ts', result: 'PASS', passed: 6, failed: 0, skipped: 0, executedAt: UPDATED_AT, commit: '5b60857', artifactPaths: [] }],
            }),
            task({
                id: 'UX16.3-VERIFY-01', milestoneId: 'UX16.3', featureId: 'LIQUIDITY_SURFACE',
                title: 'Integrated test verification and regression',
                description: 'Full repository unit test suite and Playwright browser regression.',
                owner: 'ANTIGRAVITY', status: 'COMPLETE', weight: 2, dependsOn: ['UX16.3-CONTROLS-01'],
                acceptanceCriteria: ['All 48 test files pass with 0 errors.', 'Playwright cross-viewport test passes with screenshots.'],
                branch: 'agent/gemini-ux16.3-surface', commit: 'ce6bc4b', evidenceStatus: 'TESTED',
                tests: [
                    { id: 'ux16-3-all-tests', command: 'npx vitest run', result: 'PASS', passed: 311, failed: 0, skipped: 0, executedAt: UPDATED_AT, commit: 'ce6bc4b', artifactPaths: [] },
                    { id: 'ux16-3-playwright', command: 'npx playwright test tests/ui/ux16-liquidity-surface.pw.ts --config=playwright.ux16.config.ts', result: 'PASS', passed: 4, failed: 0, skipped: 0, executedAt: UPDATED_AT, commit: 'ce6bc4b', artifactPaths: ['.artifacts/ui-overhaul/ux16-3-liquidity-surface-desktop-1920x1080.png', '.artifacts/ui-overhaul/ux16-3-liquidity-surface-compact-1664x936.png', '.artifacts/ui-overhaul/ux16-3-liquidity-surface-laptop-1366x768.png', '.artifacts/ui-overhaul/ux16-3-liquidity-surface-mobile-390x844.png'] },
                ],
            }),
        ]),
        milestone('UX16.4', 'Imbalance and liquidity behavior', 'COMPLETE', 'MICROSTRUCTURE', 'Imbalance/persistence/add-pull', [
            task({
                id: 'UX16.4-MICRO-01',
                milestoneId: 'UX16.4',
                featureId: 'MICROSTRUCTURE',
                title: 'Imbalance, persistence, add/pull and replenishment',
                description: 'Deterministic microstructure observations with minimum-volume and adjacency gates.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX16.3-VERIFY-01'],
                acceptanceCriteria: [
                    'Diagonal comparisons match hand-calculated fixtures.',
                    'Small-volume ratios do not qualify (< $50k).',
                    'Stacked imbalance requires >= 3 adjacent rows.',
                    'Persistence uses continuous elapsed time, not message counts.',
                    'Pulls exclude observed executions where possible.',
                    'Replenishment strictly labelled PROBABLE_REPLENISHMENT.',
                ],
                branch: 'agent/gemini-ux16.4-microstructure',
                commit: 'ce6bc4b',
                evidenceStatus: 'TESTED',
                tests: [
                    {
                        id: 'ux16-4-microstructure-unit',
                        command: 'npx vitest run src/lib/orderflow/microstructure.test.ts',
                        result: 'PASS',
                        passed: 12,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: 'ce6bc4b',
                        artifactPaths: [],
                    },
                    {
                        id: 'ux16-4-playwright-acceptance',
                        command: 'npx playwright test tests/ui/ux16-microstructure.pw.ts --config=playwright.ux16.config.ts',
                        result: 'PASS',
                        passed: 2,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: 'ce6bc4b',
                        artifactPaths: [
                            '.artifacts/ui-overhaul/ux16-4-microstructure-desktop-1920x1080.png',
                            '.artifacts/ui-overhaul/ux16-4-microstructure-compact-1664x936.png',
                            '.artifacts/ui-overhaul/ux16-4-microstructure-laptop-1366x768.png',
                            '.artifacts/ui-overhaul/ux16-4-microstructure-mobile-390x844.png',
                        ],
                    },
                    {
                        id: 'ux16-4-all-unit-tests',
                        command: 'npx vitest run',
                        result: 'PASS',
                        passed: 323,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: 'ce6bc4b',
                        artifactPaths: [],
                    },
                ],
            }),
        ]),
        milestone('UX16.5', 'Absorption and acceptance', 'COMPLETE', 'FLOW_EVIDENCE', 'Absorption/divergence/zones', [
            task({
                id: 'UX16.5-EVIDENCE-01',
                milestoneId: 'UX16.5',
                featureId: 'FLOW_EVIDENCE',
                title: 'Absorption, acceptance, divergence and zones',
                description: 'Combine aggressive execution, price response and structural location into deterministic evidence.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX16.4-MICRO-01'],
                acceptanceCriteria: [
                    'Absorption requires aggressive execution and a valid decision zone.',
                    'Acceptance and absorption cannot both remain active for the same side/level/time window.',
                    'Divergence exposes its compared pivots.',
                    'Every event contains reason codes and source references.',
                ],
                branch: 'agent/gemini-ux16.5-flow-evidence',
                commit: '0b5b20d',
                evidenceStatus: 'TESTED',
                tests: [
                    {
                        id: 'ux16-5-evidence-unit-tests',
                        command: 'npx vitest run src/lib/orderflow/evidence-engine.test.ts',
                        result: 'PASS',
                        passed: 9,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '0b5b20d',
                        artifactPaths: [],
                    },
                    {
                        id: 'ux16-5-playwright-acceptance',
                        command: 'npx playwright test tests/ui/ux16-flow-evidence.pw.ts',
                        result: 'PASS',
                        passed: 2,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '0b5b20d',
                        artifactPaths: [
                            '.artifacts/ui-overhaul/ux16-5-evidence-desktop-1920x1080.png',
                            '.artifacts/ui-overhaul/ux16-5-evidence-compact-1664x936.png',
                            '.artifacts/ui-overhaul/ux16-5-evidence-laptop-1366x768.png',
                            '.artifacts/ui-overhaul/ux16-5-evidence-mobile-390x844.png',
                        ],
                    },
                    {
                        id: 'ux16-5-all-unit-tests',
                        command: 'npx vitest run',
                        result: 'PASS',
                        passed: 332,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '0b5b20d',
                        artifactPaths: [],
                    },
                ],
            }),
        ]),
        milestone('UX16.6', 'Setup state machine', 'COMPLETE', 'SETUP_ENGINE', 'Deterministic setup grading', [
            task({
                id: 'UX16.6-SETUP-01',
                milestoneId: 'UX16.6',
                featureId: 'SETUP_ENGINE',
                title: 'Setup state machine and Decision Dock',
                description: 'Replayable setup states, mandatory gates, evidence IDs, triggers and invalidations.',
                owner: 'CODEX',
                supportingAgents: ['ANTIGRAVITY'],
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX16.5-EVIDENCE-01'],
                acceptanceCriteria: ['A failed mandatory gate prevents A-grade.'],
                branch: 'agent/gemini-ux16.6-setup-engine',
                commit: '7345d3c',
                evidenceStatus: 'TESTED',
                tests: [
                    {
                        id: 'ux16-6-vitest-setup-engine',
                        command: 'npx vitest run src/lib/orderflow/setup-engine.test.ts',
                        result: 'PASS',
                        passed: 10,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '7345d3c',
                        artifactPaths: [],
                    },
                    {
                        id: 'ux16-6-playwright-setup-dock',
                        command: 'npx playwright test tests/ui/ux16-setup-dock.pw.ts',
                        result: 'PASS',
                        passed: 2,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '7345d3c',
                        artifactPaths: [
                            '.artifacts/ui-overhaul/ux16-6-setup-desktop-1920x1080.png',
                            '.artifacts/ui-overhaul/ux16-6-setup-compact-1664x936.png',
                            '.artifacts/ui-overhaul/ux16-6-setup-laptop-1366x768.png',
                            '.artifacts/ui-overhaul/ux16-6-setup-mobile-390x844.png',
                        ],
                    },
                    {
                        id: 'ux16-6-all-unit-tests',
                        command: 'npx vitest run',
                        result: 'PASS',
                        passed: 342,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '7345d3c',
                        artifactPaths: [],
                    },
                ],
            }),
        ]),
        milestone('UX16.7', 'Jev shadow explanation', 'COMPLETE', 'JEV_SHADOW', 'Bounded AI explanation', [
            task({
                id: 'UX16.7-JEV-01',
                milestoneId: 'UX16.7',
                featureId: 'JEV_SHADOW',
                title: 'Jev shadow adapter',
                description: 'Schema-validated, rate-limited, kill-switched explanation of an accepted deterministic feature packet.',
                owner: 'CODEX',
                supportingAgents: ['ANTIGRAVITY'],
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX16.6-SETUP-01'],
                acceptanceCriteria: ['Jev cannot alter state, grade, trigger, invalidation or risk.'],
                branch: 'agent/gemini-ux16.7-jev-shadow',
                commit: '23122e2',
                evidenceStatus: 'TESTED',
                tests: [
                    {
                        id: 'ux16-7-vitest-adapter',
                        command: 'npx vitest run src/lib/orderflow/jev-adapter.test.ts',
                        result: 'PASS',
                        passed: 7,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '23122e2',
                        artifactPaths: [],
                    },
                    {
                        id: 'ux16-7-vitest-route',
                        command: 'npx vitest run src/app/api/orderflow/jev/route.test.ts',
                        result: 'PASS',
                        passed: 5,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '23122e2',
                        artifactPaths: [],
                    },
                    {
                        id: 'ux16-7-playwright-jev',
                        command: 'npx playwright test tests/ui/ux16-jev-shadow.pw.ts',
                        result: 'PASS',
                        passed: 2,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '23122e2',
                        artifactPaths: [
                            '.artifacts/ui-overhaul/ux16-7-jev-desktop-1920x1080.png',
                            '.artifacts/ui-overhaul/ux16-7-jev-compact-1664x936.png',
                            '.artifacts/ui-overhaul/ux16-7-jev-laptop-1366x768.png',
                            '.artifacts/ui-overhaul/ux16-7-jev-mobile-390x844.png',
                        ],
                    },
                    {
                        id: 'ux16-7-all-unit-tests',
                        command: 'npx vitest run',
                        result: 'PASS',
                        passed: 354,
                        failed: 0,
                        skipped: 0,
                        executedAt: UPDATED_AT,
                        commit: '23122e2',
                        artifactPaths: [],
                    },
                ],
            }),
        ]),
        milestone('UX16.8', 'Replay calibration and paper release', 'IN_PROGRESS', 'CALIBRATION', 'Replay and paper evaluation', [
            task({ id: 'UX16.8-CAL-01', milestoneId: 'UX16.8', featureId: 'CALIBRATION', title: 'Replay calibration and paper release', description: 'Measure coverage, stability, false positives, abstention and outcomes without live execution.', owner: 'CODEX', supportingAgents: ['ANTIGRAVITY', 'ARCHITECT'], status: 'IN_PROGRESS', weight: 5, dependsOn: ['UX16.7-JEV-01'], acceptanceCriteria: ['Replays reproduce identical evidence and Architect approves promotion.'] }),
        ]),
    ];
}


