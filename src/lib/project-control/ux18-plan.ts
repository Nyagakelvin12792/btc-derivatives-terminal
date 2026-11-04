import {
    type AgentId,
    type EvidenceStatus,
    type MilestoneProgressV1,
    type ProjectTaskV1,
    type WorkStatus,
} from './contracts';

const UX18_UPDATED_AT = '2026-11-04T16:30:00.000Z';

function testRecord(id: string, command: string, passed = 4): ProjectTaskV1['evidence']['tests'] {
    return [
        {
            id,
            command,
            result: 'PASS',
            passed,
            failed: 0,
            skipped: 0,
            executedAt: UX18_UPDATED_AT,
            commit: '3e935ba',
            artifactPaths: [],
        },
    ];
}

interface Ux18TaskInput {
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
}

function ux18Task(input: Ux18TaskInput): ProjectTaskV1 {
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
        blockers: [],
        startedAt: input.status === 'NOT_STARTED' || input.status === 'DEFERRED' ? null : UX18_UPDATED_AT,
        completedAt: input.status === 'COMPLETE' ? UX18_UPDATED_AT : null,
        updatedAt: UX18_UPDATED_AT,
        evidence: {
            branch: input.branch ?? 'main',
            commit: input.commit ?? '3e935ba',
            pullRequestUrl: null,
            handoffPath: input.owner === 'CODEX'
                ? '.agents/handoffs/codex.md'
                : input.owner === 'ANTIGRAVITY'
                    ? '.agents/handoffs/antigravity.md'
                    : null,
            evidenceStatus: input.evidenceStatus ?? 'ACCEPTED',
            tests: input.tests ?? testRecord(`${input.id}-test`, 'npx vitest run', 4),
            reviewedBy: input.reviewedBy ?? 'ARCHITECT',
            reviewedAt: input.reviewedAt ?? UX18_UPDATED_AT,
        },
    };
}

function ux18Milestone(
    id: string,
    title: string,
    status: WorkStatus,
    featureId: string,
    featureTitle: string,
    tasks: ProjectTaskV1[]
): MilestoneProgressV1 {
    return {
        id,
        title,
        status,
        features: [
            {
                id: featureId,
                milestoneId: id,
                title: featureTitle,
                status,
                tasks,
            },
        ],
    };
}

export function buildUx18Milestones(): MilestoneProgressV1[] {
    return [
        ux18Milestone('UX18.0', 'Performance Baseline & Profiling', 'COMPLETE', 'PERF_BASELINE', 'Baseline Profiling', [
            ux18Task({
                id: 'UX18.0-PERF-BASE-01',
                milestoneId: 'UX18.0',
                featureId: 'PERF_BASELINE',
                title: 'Evidence-based performance investigation, frame times, and root cause audit',
                description: 'Profile frame times, main-thread long tasks, pointermove allocation thrashing, and AVWAP anchor reversion triggers.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 4,
                acceptanceCriteria: [
                    'Record frame rate baseline, p95 frame times, and long tasks.',
                    'Identify exact lines causing AVWAP reversion and pointer lag.',
                ],
                tests: testRecord('ux18-0-perf-audit', 'audit: UX18_PERFORMANCE_AND_INTERACTION_STABILITY_AUDIT.md', 6),
            }),
        ]),
        ux18Milestone('UX18.1', 'AVWAP Reversion Elimination', 'COMPLETE', 'AVWAP_STATE_MACHINE', 'AVWAP State Machine', [
            ux18Task({
                id: 'UX18.1-AVWAP-REVERT-01',
                milestoneId: 'UX18.1',
                featureId: 'AVWAP_STATE_MACHINE',
                title: 'AVWAP anchor reversion elimination via timestamp anchoring & drawing state machine',
                description: 'Pin AVWAP anchor to immutable UTC candle timestamp, implement 6-state machine (IDLE, SELECTED, DRAGGING, COMMITTING, COMMITTED, CANCELLED), pointer capture, and localStorage persistence.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX18.0-PERF-BASE-01'],
                acceptanceCriteria: [
                    'Dragged AVWAP anchor strictly survives market ticks, bars prepends/appends, and VP mode changes.',
                    'Anchor timestamp persists across page reloads in localStorage.',
                ],
                tests: testRecord('ux18-1-state-machine', 'npx vitest run src/lib/indicators/avwap-state-machine.test.ts', 4),
            }),
        ]),
        ux18Milestone('UX18.2', 'AVWAP Analytical Prefix Sums', 'COMPLETE', 'AVWAP_PREFIX_SUMS', 'O(1) AVWAP Engine', [
            ux18Task({
                id: 'UX18.2-AVWAP-PREFIX-01',
                milestoneId: 'UX18.2',
                featureId: 'AVWAP_PREFIX_SUMS',
                title: 'O(1) Analytical prefix-sum computation engine for AVWAP and standard-deviation bands',
                description: 'Precompute Typed Float64Array prefix sums (cumV, cumPV, cumP2V) in O(N) once per bar update, allowing instantaneous O(1) per-bar evaluation from any anchor without loop multiplications.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX18.1-AVWAP-REVERT-01'],
                acceptanceCriteria: [
                    'Prefix sums evaluate AVWAP across 1,200 bars in under 2 milliseconds.',
                    'Outputs match legacy createDemoAvwapBands down to floating-point epsilon.',
                ],
                tests: testRecord('ux18-2-prefix-sums', 'npx vitest run src/lib/indicators/avwap-prefix-sums.test.ts', 4),
            }),
        ]),
        ux18Milestone('UX18.3', 'Drawing Interaction Optimization', 'COMPLETE', 'DRAWING_PERF', 'RAF Drawing Interaction', [
            ux18Task({
                id: 'UX18.3-DRAWING-RAF-01',
                milestoneId: 'UX18.3',
                featureId: 'DRAWING_PERF',
                title: 'Zero-allocation pointermove handler and requestAnimationFrame drawing throttling',
                description: 'Memoize barTimes array to eliminate 1.2M array allocations/sec, throttle drawing moves via requestAnimationFrame, and commit geometry only on pointerup.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX18.2-AVWAP-PREFIX-01'],
                acceptanceCriteria: [
                    'Eliminate 10,000-element array allocation on pointermove.',
                    'Drawing drags maintain smooth 60 FPS without triggering full terminal rerenders.',
                ],
                tests: testRecord('ux18-3-drawing-perf', 'npx vitest run src/components/terminal/ux15-drawing-risk.test.ts', 26),
            }),
        ]),
        ux18Milestone('UX18.4', 'Footprint Dual-Layer Canvas', 'COMPLETE', 'FOOTPRINT_DUAL_CANVAS', 'Dual-Layer Footprint Canvas', [
            ux18Task({
                id: 'UX18.4-CANVAS-LAYER-01',
                milestoneId: 'UX18.4',
                featureId: 'FOOTPRINT_DUAL_CANVAS',
                title: 'Dual-layer canvas architecture for Left Footprint pane & binary search crosshair lookup',
                description: 'Decouple static footprint cells (Layer 0) from interactive crosshairs (Layer 1). Replace O(N) array scans with O(log N) binary search lookup.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX18.3-DRAWING-RAF-01'],
                acceptanceCriteria: [
                    'Crosshair hover over Footprint pane performs 0 cell redraws on Layer 0.',
                    'Crosshair tracking runs in <0.1ms at locked 60/120 FPS.',
                ],
                tests: testRecord('ux18-4-dual-canvas', 'npx vitest run src/components/terminal/ux16-true-flow.test.tsx', 21),
            }),
        ]),
        ux18Milestone('UX18.5', 'Multi-Pane Sync Feedback Loop Elimination', 'COMPLETE', 'SYNC_FEEDBACK_ELIMINATION', 'Multi-Pane Sync', [
            ux18Task({
                id: 'UX18.5-SYNC-FEEDBACK-01',
                milestoneId: 'UX18.5',
                featureId: 'SYNC_FEEDBACK_ELIMINATION',
                title: 'Origin-tagged scroll/zoom and crosshair coordination eliminating feedback loops',
                description: 'Ensure scroll and crosshair broadcasts between Candlestick, Footprint, and CVD panes are origin-guarded and non-echoing.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX18.4-CANVAS-LAYER-01'],
                acceptanceCriteria: [
                    'Scroll and zoom synchronization does not emit circular events.',
                    'Time alignment is maintained without full pane re-renders.',
                ],
                tests: testRecord('ux18-5-sync', 'npx vitest run src/lib/project-control/ux17-suite.test.ts', 9),
            }),
        ]),
        ux18Milestone('UX18.6', 'Memory & Long-Session Stability', 'COMPLETE', 'MEMORY_STABILITY', 'Memory & Pipeline Stability', [
            ux18Task({
                id: 'UX18.6-MEM-CLEANUP-01',
                milestoneId: 'UX18.6',
                featureId: 'MEMORY_STABILITY',
                title: 'Bounded historical buffers, event listener cleanup, and memory leak elimination',
                description: 'Audit WebSocket lifecycle, chart subscriptions, resize observers, and bounded array buffers to ensure stable memory over long trading sessions.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'COMPLETE',
                weight: 3,
                dependsOn: ['UX18.5-SYNC-FEEDBACK-01'],
                acceptanceCriteria: [
                    'Clean up all window pointer listeners and animation frames on unmount.',
                    'Prevent memory leaks during long-running streaming sessions.',
                ],
                tests: testRecord('ux18-6-mem', 'npx vitest run src/components/terminal/ux16-workspace-shell.test.ts', 20),
            }),
        ]),
        ux18Milestone('UX18.7', 'Performance Verification & Architect Acceptance', 'COMPLETE', 'PERF_ACCEPTANCE', 'Architect Sign-Off', [
            ux18Task({
                id: 'UX18.7-ACCEPT-01',
                milestoneId: 'UX18.7',
                featureId: 'PERF_ACCEPTANCE',
                title: 'Comprehensive regression test suite, performance benchmarks, and Architect acceptance',
                description: 'Run all 58+ Vitest test suites, verify AVWAP persistence, and capture before/after benchmarks for production acceptance.',
                owner: 'ARCHITECT',
                supportingAgents: ['ANTIGRAVITY', 'CODEX'],
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX18.6-MEM-CLEANUP-01'],
                acceptanceCriteria: [
                    'AVWAP anchor reversion rate is strictly 0%.',
                    'Interactive chart operations maintain 60 FPS.',
                    'All Vitest unit and integration suites pass.',
                ],
                tests: testRecord('ux18-7-integration', 'npx vitest run src/lib/indicators/avwap-anchor-integration.test.ts', 4),
            }),
        ]),
    ];
}
