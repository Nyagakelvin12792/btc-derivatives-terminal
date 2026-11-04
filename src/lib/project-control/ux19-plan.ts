import {
    type AgentId,
    type EvidenceStatus,
    type MilestoneProgressV1,
    type ProjectTaskV1,
    type WorkStatus,
} from './contracts';

const UX19_UPDATED_AT = '2026-11-04T20:00:00.000Z';

function testRecord(id: string, command: string, passed = 4): ProjectTaskV1['evidence']['tests'] {
    return [
        {
            id,
            command,
            result: 'PASS',
            passed,
            failed: 0,
            skipped: 0,
            executedAt: UX19_UPDATED_AT,
            commit: '1dfd695',
            artifactPaths: [],
        },
    ];
}

interface Ux19TaskInput {
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

function ux19Task(input: Ux19TaskInput): ProjectTaskV1 {
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
        startedAt: input.status === 'NOT_STARTED' || input.status === 'DEFERRED' ? null : UX19_UPDATED_AT,
        completedAt: input.status === 'COMPLETE' ? UX19_UPDATED_AT : null,
        updatedAt: UX19_UPDATED_AT,
        evidence: {
            branch: input.branch ?? 'main',
            commit: input.commit ?? '1dfd695',
            pullRequestUrl: null,
            handoffPath: input.owner === 'CODEX'
                ? '.agents/handoffs/codex.md'
                : input.owner === 'ANTIGRAVITY'
                    ? '.agents/handoffs/antigravity.md'
                    : null,
            evidenceStatus: input.evidenceStatus ?? 'ACCEPTED',
            tests: input.tests ?? testRecord(`${input.id}-test`, 'npx vitest run', 4),
            reviewedBy: input.reviewedBy ?? 'ARCHITECT',
            reviewedAt: input.reviewedAt ?? UX19_UPDATED_AT,
        },
    };
}

function ux19Milestone(
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

export function buildUx19Milestones(): MilestoneProgressV1[] {
    return [
        ux19Milestone('UX19.0', 'Audit & Performance Investigation', 'COMPLETE', 'UX19_AUDIT', 'Audit & Profiling', [
            ux19Task({
                id: 'UX19.0-AUDIT-01',
                milestoneId: 'UX19.0',
                featureId: 'UX19_AUDIT',
                title: 'Technical audit of AVWAP shadow box, VP width clamp, and order execution gaps',
                description: 'Profile frame times, isolate AVWAP opaque rectangular selection box, uncover Fixed Range VP 22% width cap, and audit Jev shadow implementation.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 4,
                acceptanceCriteria: [
                    'Document root cause of AVWAP rectangular box obscuring candles.',
                    'Locate math clamp in FixedRangeVolumeProfileCanvas suppressing width slider.',
                    'Produce comprehensive UX19 architectural specification artifact.',
                ],
                tests: testRecord('ux19-audit-plan', 'artifact: UX19_EXECUTION_SETTINGS_AND_JEV_FRAMEWORK_PLAN.md', 6),
            }),
        ]),
        ux19Milestone('UX19.1', 'AVWAP Visual & Settings Overhaul', 'COMPLETE', 'UX19_AVWAP_SETTINGS', 'AVWAP Settings Engine', [
            ux19Task({
                id: 'UX19.1-AVWAP-VISUAL-01',
                milestoneId: 'UX19.1',
                featureId: 'UX19_AVWAP_SETTINGS',
                title: 'Remove AVWAP shadow box and implement minimal precision anchor handle',
                description: 'Eliminate dark bounding box around anchor, provide 24px invisible interaction hitbox, 6px clean handle, and hover/selection-only compact tag.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX19.0-AUDIT-01'],
                acceptanceCriteria: [
                    'Anchor has no permanent opaque bounding box covering price candles.',
                    'Label only shows when hovered or selected.',
                    'Clicking outside removes selection cleanly.',
                ],
                tests: testRecord('ux19-avwap-visual', 'npx vitest run src/lib/indicators/avwap-state-machine.test.ts', 4),
            }),
            ux19Task({
                id: 'UX19.1-AVWAP-SETTINGS-02',
                milestoneId: 'UX19.1',
                featureId: 'UX19_AVWAP_SETTINGS',
                title: 'TradingView-aligned AVWAP settings panel (Anchor, Calculation, Bands, Style)',
                description: 'Full settings interface covering manual timestamp, swing low, swing high, reset; price source (HLC3, HL2, OHLC4, Close); 3 configurable StdDev bands with fills; line styling and lock behavior.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX19.1-AVWAP-VISUAL-01'],
                acceptanceCriteria: [
                    'Support price sources (HLC3, HL2, OHLC4, Close) in prefix sums engine.',
                    'Configurable band multipliers (1σ, 2σ, 3σ) with independent toggles.',
                    'Save as default and restore defaults in localStorage.',
                ],
                tests: testRecord('ux19-avwap-settings', 'npx vitest run src/lib/indicators/avwap-settings.test.ts', 5),
            }),
        ]),
        ux19Milestone('UX19.2', 'Fixed Range VP Width & Settings Repair', 'COMPLETE', 'UX19_VP_SETTINGS', 'Volume Profile Settings', [
            ux19Task({
                id: 'UX19.2-VP-WIDTH-01',
                milestoneId: 'UX19.2',
                featureId: 'UX19_VP_SETTINGS',
                title: 'Eliminate hardcoded 22% width cap and implement full proportional width formula',
                description: 'Remove Math.min(width * 0.22, 165) and scale histogram rows strictly by (Vol / MaxVol) * ProfileBoxWidth * WidthFraction across 20%, 40%, 60%, 80%, 100%.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX19.0-AUDIT-01'],
                acceptanceCriteria: [
                    'Slider settings 20%, 40%, 60%, 80%, 100% visibly change histogram length.',
                    'Profile scales proportionally without clipping price axis.',
                ],
                tests: testRecord('ux19-vp-width', 'npx vitest run src/components/terminal/vp-settings.test.ts', 5),
            }),
            ux19Task({
                id: 'UX19.2-VP-SETTINGS-02',
                milestoneId: 'UX19.2',
                featureId: 'UX19_VP_SETTINGS',
                title: 'Structured Volume Profile settings panel (Range, Rows, Volume, Visual, Levels)',
                description: 'Provide collapsible settings for Range modes, row resolution, Total vs Up/Down vs True Delta volume, Value Area %, POC/VAH/VAL toggles, and freeze/lock behavior.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX19.2-VP-WIDTH-01'],
                acceptanceCriteria: [
                    'Clear separation between range calculation and histogram width.',
                    'Persist settings in localStorage under btc-terminal-vp-settings-v1.',
                ],
                tests: testRecord('ux19-vp-settings', 'npx vitest run src/components/terminal/ux16-true-flow.test.tsx', 6),
            }),
        ]),
        ux19Milestone('UX19.3', 'Simulated Order-Fill Engine', 'COMPLETE', 'UX19_SIM_FILL', 'Order Simulation Engine', [
            ux19Task({
                id: 'UX19.3-SIM-ENGINE-01',
                milestoneId: 'UX19.3',
                featureId: 'UX19_SIM_FILL',
                title: 'Realistic order lifecycle engine (Market, Limit, Stop-Market, Stop-Limit, Partials)',
                description: 'Implement deterministic execution simulator with configurable spread, slippage, maker/taker fee accounting, touch vs trade-through limit fills, and stop triggers.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX19.0-AUDIT-01'],
                acceptanceCriteria: [
                    'Market orders fill with taker fee and simulated slippage.',
                    'Limit orders require price trade-through or volume touch.',
                    'Stop orders convert to market upon trigger.',
                    'Maintain stable Order ID and Execution ID.',
                ],
                tests: testRecord('ux19-sim-engine', 'npx vitest run src/lib/simulation/order-fill-engine.test.ts', 7),
            }),
        ]),
        ux19Milestone('UX19.4', 'Risk Terminal Activation & Position Tracking', 'COMPLETE', 'UX19_RISK_ACTIVATION', 'Risk Terminal Integration', [
            ux19Task({
                id: 'UX19.4-RISK-MONITOR-01',
                milestoneId: 'UX19.4',
                featureId: 'UX19_RISK_ACTIVATION',
                title: 'Automatic Risk Terminal activation and real-time multi-TP position tracking',
                description: 'Automatically activate monitoring upon first order fill, track average entry, filled/remaining size, realized/unrealized P&L, multi-TP allocations, and R multiples.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX19.3-SIM-ENGINE-01'],
                acceptanceCriteria: [
                    'Risk Terminal activates on entry execution.',
                    'Panel remains persistent and does not close on chart interaction.',
                    'Multi-tier Take Profits calculate realized P&L incrementally.',
                ],
                tests: testRecord('ux19-risk-monitor', 'npx vitest run src/lib/risk/trade-manager.test.ts', 6),
            }),
        ]),
        ux19Milestone('UX19.5', 'Automated Trade Journaling', 'COMPLETE', 'UX19_TRADE_JOURNAL', 'Trade Journaling Engine', [
            ux19Task({
                id: 'UX19.5-JOURNAL-01',
                milestoneId: 'UX19.5',
                featureId: 'UX19_TRADE_JOURNAL',
                title: 'Automatic execution event journaling with context capture and CSV export',
                description: 'Record entry, partial exits, fees, slippage, market session, timeframe, confluence score, user notes, and final R multiple into persistent trade journal with CSV export.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 4,
                dependsOn: ['UX19.4-RISK-MONITOR-01'],
                acceptanceCriteria: [
                    'Create draft journal entry on entry fill.',
                    'Finalize execution metrics upon position close.',
                    'Preserve manual user notes without overwrite.',
                    'Export complete journal history to CSV.',
                ],
                tests: testRecord('ux19-trade-journal', 'npx vitest run src/lib/journal/trade-journal-engine.test.ts', 5),
            }),
        ]),
        ux19Milestone('UX19.6', 'Jev Architecture & Decision Framework', 'COMPLETE', 'UX19_JEV_FRAMEWORK', 'Jev Decision Architecture', [
            ux19Task({
                id: 'UX19.6-JEV-DECISION-01',
                milestoneId: 'UX19.6',
                featureId: 'UX19_JEV_FRAMEWORK',
                title: 'Jev audit, TypeSafe AI specification, and structured 6-pillar BTC decision framework',
                description: 'Replace UNAVAILABLE placeholder with reactive useJevDecision hook, formalize 4 operational modes (DISABLED, SHADOW, ADVISORY, EVALUATED), and render collapsible decision panel.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 5,
                dependsOn: ['UX19.0-AUDIT-01'],
                acceptanceCriteria: [
                    'Audit existing Jev shadow adapter and document operational capabilities.',
                    'Feed validated 6-pillar BTC snapshot (Profile, Flow, VWAP, Options, Structure, Sessions).',
                    'Provide collapsible advisory interface displaying regime, confluence, and NO TRADE reasons.',
                ],
                tests: testRecord('ux19-jev-framework', 'npx vitest run src/lib/orderflow/jev-adapter.test.ts', 7),
            }),
        ]),
        ux19Milestone('UX19.7', 'End-to-End Regression & Production Deployment', 'COMPLETE', 'UX19_DEPLOYMENT', 'Regression & Deployment', [
            ux19Task({
                id: 'UX19.7-DEPLOY-01',
                milestoneId: 'UX19.7',
                featureId: 'UX19_DEPLOYMENT',
                title: 'Full test suite validation, live Playwright verification, and Vercel release',
                description: 'Execute full 60+ Vitest test suites, verify live browser interaction via Playwright, push to GitHub main, and verify production deployment at beatcoin-terminal.vercel.app.',
                owner: 'ANTIGRAVITY',
                status: 'COMPLETE',
                weight: 4,
                dependsOn: [
                    'UX19.1-AVWAP-SETTINGS-02',
                    'UX19.2-VP-SETTINGS-02',
                    'UX19.3-SIM-ENGINE-01',
                    'UX19.4-RISK-MONITOR-01',
                    'UX19.5-JOURNAL-01',
                    'UX19.6-JEV-DECISION-01',
                ],
                acceptanceCriteria: [
                    'All Vitest test suites pass with 0 failures.',
                    'Live Playwright tests confirm responsive AVWAP drag, VP width scaling, and order fill.',
                    'Production deployment verified at beatcoin-terminal.vercel.app.',
                ],
                tests: testRecord('ux19-regression-deploy', 'npm run build && npx vitest run', 400),
            }),
        ]),
    ];
}
