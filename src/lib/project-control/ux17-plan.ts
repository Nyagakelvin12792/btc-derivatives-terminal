import checkpointJson from '../../../.agents/project-control-state.json';
import {
    MilestoneProgressV1Schema,
    type AgentId,
    type EvidenceStatus,
    type MilestoneProgressV1,
    type ProjectTaskV1,
    type WorkStatus,
} from './contracts';
import {
    ExecutionCheckpointV1Schema,
    applyCheckpointToMilestones,
} from './orchestrator';

const UX17_UPDATED_AT = '2026-11-04T13:15:00.000Z';

interface Ux17TaskInput {
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

function ux17Task(input: Ux17TaskInput): ProjectTaskV1 {
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
        startedAt: input.status === 'NOT_STARTED' || input.status === 'DEFERRED' ? null : UX17_UPDATED_AT,
        completedAt: input.status === 'COMPLETE' ? UX17_UPDATED_AT : null,
        updatedAt: UX17_UPDATED_AT,
        evidence: {
            branch: input.branch ?? 'main',
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

function ux17Milestone(
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

export function buildUx17BaseMilestones(): MilestoneProgressV1[] {
    return [
        ux17Milestone('UX17.0', 'Research and Screenshot Audit', 'NOT_STARTED', 'UX17_RESEARCH_AUDIT', 'Design research & UI root-cause audit', [
            ux17Task({
                id: 'UX17.0-AUDIT-01',
                milestoneId: 'UX17.0',
                featureId: 'UX17_RESEARCH_AUDIT',
                title: 'Institutional terminal UX research, screenshot audit & Project Control orchestrator',
                description: 'Documented audit of toolbar clutter, Y-axis compression, session box overflow, heatmap ticks, and Risk Terminal state, plus dependency-aware Project Control checkpoint orchestrator.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX', 'ARCHITECT'],
                status: 'NOT_STARTED',
                weight: 3,
                dependsOn: ['UX16.8-CAL-01'],
                acceptanceCriteria: [
                    'UX17_AUDIT_AND_DESIGN_SYSTEM.md documents all 10 verified root causes and regression risks.',
                    'Dependency-aware Project Control checkpoint orchestrator validates task transitions and bounded retries.',
                ],
            }),
        ]),
        ux17Milestone('UX17.1', 'Design System and Chart Canvas', 'NOT_STARTED', 'UX17_DESIGN_CANVAS', 'Minimalist tokens & quiet chart canvas', [
            ux17Task({
                id: 'UX17.1-CANVAS-01',
                milestoneId: 'UX17.1',
                featureId: 'UX17_DESIGN_CANVAS',
                title: 'Minimalist design system tokens, restrained dark canvas & live Project Control sync',
                description: 'Define reusable semantic tokens for colors, typography, spacing, and 3-tier overlay opacity; apply ultra-subtle gridlines and 15s live dashboard auto-sync.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 3,
                dependsOn: ['UX17.0-AUDIT-01'],
                acceptanceCriteria: [
                    'TERMINAL_DESIGN_TOKENS defines restrained canvas, CVD-safe candle colors, and 3-tier opacity tokens.',
                    'Chart canvas reduces gridline visual noise so price candles remain dominant.',
                    'Project Control Dashboard supports live auto-sync polling with last-synced timestamp.',
                ],
            }),
        ]),
        ux17Milestone('UX17.2', 'Candlestick and Price-Scale Refinement', 'NOT_STARTED', 'UX17_PRICE_SCALE', 'CANDLE_FIT scaling & right-edge label collision solver', [
            ux17Task({
                id: 'UX17.2-SCALE-01',
                milestoneId: 'UX17.2',
                featureId: 'UX17_PRICE_SCALE',
                title: 'Decouple Y-axis from distant option walls (CANDLE_FIT) & collision-aware right-edge labels',
                description: 'Prevent distant Call/Put walls from compressing visible candles into <15% height; solve right-edge label collisions across POC, VAH, VAL, VWAP, Gamma Flip, Walls, Entry, SL, and TP.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 4,
                dependsOn: ['UX17.1-CANVAS-01'],
                acceptanceCriteria: [
                    'Default CANDLE_FIT price scaling fits visible candle High/Low with optional Include Option Walls toggle.',
                    'Right-edge label solver prevents overlapping badges with >= 16px separation and confluence grouping.',
                    'Tabular numerals and CVD-safe candle colors preserve OHLC data integrity.',
                ],
            }),
        ]),
        ux17Milestone('UX17.3', 'Compact Toolbar and Tools Panel', 'NOT_STARTED', 'UX17_TOOLS_PANEL', 'Compact top bar & 8-category progressive disclosure Tools drawer', [
            ux17Task({
                id: 'UX17.3-TOOLBAR-01',
                milestoneId: 'UX17.3',
                featureId: 'UX17_TOOLS_PANEL',
                title: 'Compact global toolbar, live Deribit expiry dropdown & unified 8-category Tools Drawer',
                description: 'Retire permanent 21-button horizontal study chip row and duplicate canvas HUD; provide unified collapsible Tools panel with Visibility, Settings, Reset, Presets, and Advanced controls.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 4,
                dependsOn: ['UX17.2-SCALE-01'],
                acceptanceCriteria: [
                    'Top toolbar exposes essential actions and working Deribit expiry selector dropdown.',
                    'Unified Tools panel organizes tools into 8 institutional categories with progressive disclosure.',
                    'Contextual drawing toolbar anchors directly near the selected drawing rather than top-right corner.',
                ],
            }),
        ]),
        ux17Milestone('UX17.4', 'Indicator Overlay Management', 'NOT_STARTED', 'UX17_OVERLAY_TIERS', 'PRIMARY/SECONDARY/TERTIARY hierarchy, Density modes & 22% VP width', [
            ux17Task({
                id: 'UX17.4-OVERLAY-01',
                milestoneId: 'UX17.4',
                featureId: 'UX17_OVERLAY_TIERS',
                title: '3-tier overlay priority, MINIMAL/STANDARD/DETAILED density modes & 2-click FREE Volume Profile',
                description: 'Implement non-destructive MINIMAL, STANDARD, and DETAILED viewing modes; cap Volume Profile width at 22% of plot width; support interactive 2-click FREE range anchoring.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 4,
                dependsOn: ['UX17.3-TOOLBAR-01'],
                acceptanceCriteria: [
                    'Switching between MINIMAL, STANDARD, and DETAILED modes updates visual density without deleting user settings.',
                    'Volume Profile width is capped at <= 22% of chart width with restrained opacity.',
                    'FREE Volume Profile supports interactive 2-click start/end bar anchoring.',
                ],
            }),
        ]),
        ux17Milestone('UX17.5', 'Session Visualization', 'NOT_STARTED', 'UX17_SESSIONS', 'Clamped session boundaries & subtle institutional session shading', [
            ux17Task({
                id: 'UX17.5-SESSION-01',
                milestoneId: 'UX17.5',
                featureId: 'UX17_SESSIONS',
                title: 'Clamp active session box to lastBarX, remove right-edge ray clutter & add optional session H/L/OR toggles',
                description: 'Ensure historical sessions terminate at exact closing timestamps and active sessions terminate at the latest candle (lastBarX), with subtle shading and compact AS/LON/NY badges.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 3,
                dependsOn: ['UX17.4-OVERLAY-01'],
                acceptanceCriteria: [
                    'Active session boxes clamp strictly to lastBarX and never stretch across empty right-margin space to plotW.',
                    'Historical sessions use low-intensity 3% fill opacity and compact AS, LON, NY, LON/NY badges.',
                    'Tools panel allows toggling session High/Low lines and Opening Range.',
                ],
            }),
        ]),
        ux17Milestone('UX17.6', 'Footprint and CVD Minimalism', 'NOT_STARTED', 'UX17_FOOTPRINT_CVD', 'Unified coordination engine, 3-mode split layout, semantic zoom & Candle Inspector', [
            ux17Task({
                id: 'UX17.6-FOOTPRINT-01',
                milestoneId: 'UX17.6',
                featureId: 'UX17_FOOTPRINT_CVD',
                title: 'Unified Chart Coordinator, Mode A/B/C Dual Synchronized CVD, 1H/4H Semantic Zoom & Selected Candle Inspector',
                description: 'Synchronize Footprint, Candlestick, and Dual CVD subpanes; implement Wide/Medium/Close semantic zoom, volume-conserving tick aggregation, nice price ticks, 6 presets, and Selected Candle Inspector.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 5,
                dependsOn: ['UX17.5-SESSION-01'],
                acceptanceCriteria: [
                    'Mode C renders synchronized Footprint-side CVD below Left Footprint and Candlestick-side CVD below Right Candlestick.',
                    'Adaptive semantic zoom switches cleanly between Wide, Medium, and Close Footprint detail without text overlap.',
                    'Volume-conserving tick aggregation preserves exact Buy, Sell, and Delta totals across all bin sizes.',
                    'Selected Candle Detail Inspector displays full Bid x Ask,POC, cVAH/cVAL, and absorption metrics for any clicked bar.',
                ],
            }),
        ]),
        ux17Milestone('UX17.7', 'Liquidity Heatmap Refinement', 'NOT_STARTED', 'UX17_HEATMAP', 'Sub-bar depth projection, restrained intensity ramp & DOM separation', [
            ux17Task({
                id: 'UX17.7-HEATMAP-01',
                milestoneId: 'UX17.7',
                featureId: 'UX17_HEATMAP',
                title: 'Restrained L2 liquidity heatmap with sub-bar width projection, threshold filters & executed-volume separation',
                description: 'Project captured L2 depth snapshots across readable sub-bar columns on 1H/4H charts, add opacity/threshold filters in Tools panel, and strictly separate resting L2 depth from executed footprint volume.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 3,
                dependsOn: ['UX17.6-FOOTPRINT-01'],
                acceptanceCriteria: [
                    'Liquidity heatmap projects readable sub-bar columns rather than collapsing into a 6px tick mark on 1H charts.',
                    'Tools panel exposes heatmap opacity, minimum depth percentile threshold, and range filtering.',
                    'Executed-volume footprint heatmap and resting L2 liquidity heatmap are clearly distinguished.',
                ],
            }),
        ]),
        ux17Milestone('UX17.8', 'Risk Terminal Integration', 'NOT_STARTED', 'UX17_RISK_TERMINAL', 'Persistent 4-tab Risk Terminal, future-extendable drawings, Multi-TP & Paper/Replay engine', [
            ux17Task({
                id: 'UX17.8-RISK-01',
                milestoneId: 'UX17.8',
                featureId: 'UX17_RISK_TERMINAL',
                title: 'Persistent 4-Tab Risk Terminal, future-extendable position drawings, Multi-TP lifecycle & Paper/Replay journal',
                description: 'Decouple activeTradeId from canvas deselection so Risk Terminal never disappears; allow extending Long/Short drawings into future timestamps; support TP1-TP3, Break-Even stop, Replay ambiguity detection, and Trade Journal/Analytics.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 5,
                dependsOn: ['UX17.7-HEATMAP-01'],
                acceptanceCriteria: [
                    'Clicking blank chart space never clears the active trade or hides the Risk Terminal.',
                    'Long and Short position drawings can be created and dragged into future timestamps beyond the last plotted candle.',
                    '4-tab Risk Terminal (POSITION, RISK, HISTORY, ANALYTICS) supports Multi-TP allocations, Break-Even stops, Paper/Replay execution, A/AA/AAA journal grading, and CSV export.',
                ],
            }),
        ]),
        ux17Milestone('UX17.9', 'Workspace Presets', 'NOT_STARTED', 'UX17_PRESETS', '6 institutional workspace presets & custom preset persistence', [
            ux17Task({
                id: 'UX17.9-PRESETS-01',
                milestoneId: 'UX17.9',
                featureId: 'UX17_PRESETS',
                title: '6 institutional workspace presets (Clean Price Action, Auction Profile, Order Flow, Options, Full Confluence, Execution) & custom presets',
                description: 'Allow one-click switching between 6 curated institutional workspace configurations and saving custom user presets in localStorage without losing underlying indicator configurations.',
                owner: 'ANTIGRAVITY',
                supportingAgents: ['CODEX'],
                status: 'NOT_STARTED',
                weight: 3,
                dependsOn: ['UX17.8-RISK-01'],
                acceptanceCriteria: [
                    'All 6 workspace presets configure layout mode, overlay density, and active indicators non-destructively.',
                    'Users can save, load, and reset custom workspace presets persisted in localStorage.',
                ],
            }),
        ]),
        ux17Milestone('UX17.10', 'Performance and Regression Validation', 'NOT_STARTED', 'UX17_VALIDATION', 'Comprehensive unit & integration regression suite', [
            ux17Task({
                id: 'UX17.10-TEST-01',
                milestoneId: 'UX17.10',
                featureId: 'UX17_VALIDATION',
                title: 'Automated regression tests for chart coordination, label collisions, semantic footprint, future drawings, Multi-TP & Project Control',
                description: 'Execute full unit and integration test suites verifying all UX17 modules and ensuring zero regressions across all existing 56 test files.',
                owner: 'CODEX',
                supportingAgents: ['ANTIGRAVITY', 'DEEPSEEK'],
                status: 'NOT_STARTED',
                weight: 4,
                dependsOn: ['UX17.9-PRESETS-01'],
                acceptanceCriteria: [
                    'All UX17 unit and integration tests pass with 0 errors.',
                    'TypeScript strict compilation (npx tsc --noEmit) passes with 0 errors.',
                ],
            }),
        ]),
        ux17Milestone('UX17.11', 'Final Architect Acceptance', 'NOT_STARTED', 'UX17_ACCEPTANCE', 'Cross-viewport Playwright verification & Architect sign-off', [
            ux17Task({
                id: 'UX17.11-ACCEPT-01',
                milestoneId: 'UX17.11',
                featureId: 'UX17_ACCEPTANCE',
                title: 'End-to-end Playwright visual verification, before/after evidence capture & Architect acceptance',
                description: 'Verify minimalist chart workspace, synchronized Footprint/CVD, Tools panel, Risk Terminal persistence, and Project Control reconciliation across desktop and mobile viewports.',
                owner: 'ARCHITECT',
                supportingAgents: ['ANTIGRAVITY', 'CODEX'],
                status: 'NOT_STARTED',
                weight: 3,
                dependsOn: ['UX17.10-TEST-01'],
                acceptanceCriteria: [
                    'Playwright acceptance suite passes across desktop (1920x1080) and mobile (390x844) viewports.',
                    'Before-and-after screenshots and final acceptance report are recorded in Project Control.',
                ],
            }),
        ]),
    ];
}

export function buildUx17Milestones(): MilestoneProgressV1[] {
    const base = buildUx17BaseMilestones();
    const parsedCheckpoint = ExecutionCheckpointV1Schema.safeParse(checkpointJson);
    if (!parsedCheckpoint.success) {
        return base;
    }
    return applyCheckpointToMilestones(base, parsedCheckpoint.data);
}
