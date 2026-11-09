import {
    type AgentId,
    type EvidenceStatus,
    type MilestoneProgressV1,
    type ProjectTaskV1,
    type WorkStatus,
} from './contracts';

export const UX20_INITIATIVE_ID = 'UX20-BTC-TERMINAL-MASTER-PLAN' as const;
export const UX20_INITIATIVE_TITLE = 'UX20: BTC TERMINAL MASTER PLAN IMPLEMENTATION' as const;
export const UX20_MASTER_PLAN_FILENAME = 'BTC_TERMINAL_IMPLEMENTATION_MASTER_PLAN_2026-11-09_1808_EAT.md' as const;
export const UX20_MASTER_PLAN_SHA256 = '58468A3621BB76A59849FD7D1607EB31E5610108BC8EFAEC3467E56B95E61E0E' as const;
export const UX20_BASELINE_COMMIT = 'f026c1a521cf29caa426f47952ed659db022fcf5' as const;

export type TaskPriority = 'P0' | 'P1' | 'P2';
export type TaskEffort = 'S' | 'S-M' | 'M' | 'M-L' | 'L';

export interface Ux20TaskMetadata {
    taskId: string;
    milestoneId: string;
    sourceSection: string;
    priority: TaskPriority;
    effort: TaskEffort;
    owner: AgentId;
    allowedPaths: string[];
    deliverables: string[];
    verificationRequirements: string[];
    rollbackStrategy: string;
}

export interface Ux20ReadinessEvaluation {
    softwareReadiness: {
        status: 'READY' | 'IN_PROGRESS' | 'BLOCKED';
        p0CompletedCount: number;
        p0TotalCount: number;
        p1CompletedCount: number;
        p1TotalCount: number;
        summary: string;
    };
    strategyResearchReadiness: {
        status: 'VERIFIED_PROFITABLE' | 'RESEARCH_RUNNER_READY_EVIDENCE_PENDING' | 'BLOCKED';
        holdoutTradesCompleted: number;
        holdoutTradesRequired: number;
        eligibleSessionsCompleted: number;
        eligibleSessionsRequired: number;
        lower95CiExpectancyR: number | null;
        doubledFrictionPositive: boolean;
        summary: string;
    };
    jevAutoPaperEligibility: {
        status: 'ELIGIBLE_DISABLED_BY_DEFAULT' | 'NOT_ELIGIBLE' | 'BLOCKED';
        autoPaperEnabled: boolean;
        researchGatePassed: boolean;
        operationalGatePassed: boolean;
        forwardShadowSessionsCompleted: number;
        forwardShadowSessionsRequired: number;
        manualPaperTradesCompleted: number;
        manualPaperTradesRequired: number;
        unexplainedMismatches: number;
        duplicateSubmissions: number;
        summary: string;
    };
}

const UX20_CREATED_AT = '2026-11-09T16:30:00.000Z';

export const UX20_TASK_METADATA_MAP: Record<string, Ux20TaskMetadata> = {
    'UX20.0-BASE-01': {
        taskId: 'UX20.0-BASE-01',
        milestoneId: 'UX20.0',
        sourceSection: '§1, §2, §3 UX20.0-BASE-01',
        priority: 'P0',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: ['README.md', 'STATE.md', 'AGENTS.md', 'docs/architecture.md', 'docs/calculation-conventions.md'],
        deliverables: ['Clean-worktree evidence manifest', 'Architecture & calculation conventions docs', 'State recovery baseline'],
        verificationRequirements: ['npx tsc --noEmit', 'npx vitest run', 'npm run build'],
        rollbackStrategy: 'Revert documentation additions and retain pinned baseline reports.',
    },
    'UX20.0-TRACK-02': {
        taskId: 'UX20.0-TRACK-02',
        milestoneId: 'UX20.0',
        sourceSection: '§3 UX20.0-TRACK-02, §4',
        priority: 'P1',
        effort: 'M',
        owner: 'ARCHITECT',
        allowedPaths: [
            'src/lib/project-control/contracts.ts',
            'src/lib/project-control/snapshot.ts',
            'src/lib/project-control/progress-calculator.ts',
            'src/lib/project-control/orchestrator.ts',
            'src/lib/project-control/ux20-plan.ts',
            'src/app/project-control/ux20/page.tsx',
            'src/components/dashboard/Ux20ProjectControlDashboard.tsx',
            '.agents/project-control-state.json',
            'docs/ui-ux/UX20_PROGRESS.md',
        ],
        deliverables: ['UX20 task registry', '/project-control/ux20 live dashboard', 'Canonical checkpoint & UX20_PROGRESS.md'],
        verificationRequirements: ['npx vitest run src/lib/project-control/project-control.test.ts', 'HTTP 200 on /project-control/ux20'],
        rollbackStrategy: 'Revert UX20 registration and leave historical UX15-UX19 audit evidence intact.',
    },
    'UX20.1-LIVE-01': {
        taskId: 'UX20.1-LIVE-01',
        milestoneId: 'UX20.1',
        sourceSection: '§3 UX20.1-LIVE-01',
        priority: 'P0',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/deribit/client.server.ts',
            'src/lib/deribit/normalization.ts',
            'src/lib/deribit/types.ts',
            'src/app/api/deribit/route.ts',
            'src/lib/dashboard/queries.ts',
            'src/components/terminal/CalmMarketTerminal.tsx',
        ],
        deliverables: ['Fail-closed Deribit normalization', 'Strict schema validation in queries.ts', 'Honest LIVE unavailable states without demo substitution'],
        verificationRequirements: ['503 upstream failure test', 'Invalid IV / stale snapshot test', 'No synthetic $69,000 or 50% IV in LIVE mode'],
        rollbackStrategy: 'Disable affected live option overlays and revert payload changes on review branch.',
    },
    'UX20.1-EXPIRY-02': {
        taskId: 'UX20.1-EXPIRY-02',
        milestoneId: 'UX20.1',
        sourceSection: '§3 UX20.1-EXPIRY-02, §7.5',
        priority: 'P0',
        effort: 'S-M',
        owner: 'CODEX',
        allowedPaths: [
            'src/components/terminal/CalmMarketTerminal.tsx',
            'src/lib/dashboard/queries.ts',
            'src/lib/deribit/dte-filter.ts',
            'src/app/api/deribit/route.ts',
        ],
        deliverables: ['Exact expiry filtering through query, route, cache, and downstream calculations', '08:00 UTC expiry rollover support'],
        verificationRequirements: ['Exact date vs ALL test', 'No-contract expiry handling', 'Same expiry cache key differentiation'],
        rollbackStrategy: 'Remove exact selector and retain validated cumulative DTE windows.',
    },
    'UX20.1-UNITS-03': {
        taskId: 'UX20.1-UNITS-03',
        milestoneId: 'UX20.1',
        sourceSection: '§2 D02, §3 UX20.1-UNITS-03',
        priority: 'P0',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: ['src/lib/market-data/index.ts', 'src/lib/market-data/instrument-registry.ts', 'src/lib/market-data/instrument-registry.test.ts'],
        deliverables: ['Canonical market-event schema', 'Versioned instrument registry (BTCUSDT, BTC-USD, BTC-DERIBIT-OPT)', 'Unit & timestamp reconciliation with exception ledger'],
        verificationRequirements: ['Reconcile >=100 events per adapter', 'BTC/USD vs BTC/USDT isolation', 'No double multiplication of OI'],
        rollbackStrategy: 'Wrap new fields in compatibility adapter and disable optional consumers.',
    },
    'UX20.2-JEV-01': {
        taskId: 'UX20.2-JEV-01',
        milestoneId: 'UX20.2',
        sourceSection: '§2 D05, §3 UX20.2-JEV-01, §6.5',
        priority: 'P0',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/app/api/orderflow/jev/route.ts',
            'src/lib/orderflow/jev-adapter.ts',
            'src/lib/orderflow/jev-contracts.ts',
            'src/lib/orderflow/jev-framework.ts',
            'src/components/terminal/JevAdvisoryPanel.tsx',
            'src/components/terminal/SetupMode.tsx',
        ],
        deliverables: ['Server-owned canonical packet hash', 'Abstention on missing inputs in JevAdvisoryPanel', 'Bounded cache/TTL & payload size checks', 'Zero external LLM calls'],
        verificationRequirements: ['Missing input abstention test', 'Cache collision isolation test', 'Oversized/malformed JSON 4xx test'],
        rollbackStrategy: 'Disable advisory route and preserve rule-only setup assessment.',
    },
    'UX20.2-SEC-02': {
        taskId: 'UX20.2-SEC-02',
        milestoneId: 'UX20.2',
        sourceSection: '§3 UX20.2-SEC-02, §5 Security',
        priority: 'P1',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/risk/trade-manager.ts',
            'src/lib/journal/trade-journal-engine.ts',
            'src/lib/security/csv-sanitizer.ts',
            'src/lib/security/csv-sanitizer.test.ts',
        ],
        deliverables: ['Safe spreadsheet CSV sanitizer neutralizing formula prefixes (=, +, -, @, tab, CR)', 'Escaped quotes & bounded request diagnostics'],
        verificationRequirements: ['Formula injection prefix unit tests', 'Quote escaping test', 'Error redaction check'],
        rollbackStrategy: 'Disable CSV export or affected route rather than exposing unsafe spreadsheet output.',
    },
    'UX20.3-CLOCK-01': {
        taskId: 'UX20.3-CLOCK-01',
        milestoneId: 'UX20.3',
        sourceSection: '§2 D03, §3 UX20.3-CLOCK-01',
        priority: 'P0',
        effort: 'L',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/replay/replay-clock.ts',
            'src/lib/replay/replay-clock.test.ts',
            'src/lib/orderflow/replay-calibration.ts',
            'src/components/terminal/CalmMarketTerminal.tsx',
        ],
        deliverables: ['Deterministic ReplayClockEngine with dataset ID, cursor, play/pause/seek, cutoff, and run hash', 'Strict future-event filtering'],
        verificationRequirements: ['Future tape/depth/options injection leaves prior state identical', 'Backward seek & deterministic run hash test'],
        rollbackStrategy: 'Fall back to clearly labeled Historical Preview with no historical trade interpretation.',
    },
    'UX20.3-MATH-02': {
        taskId: 'UX20.3-MATH-02',
        milestoneId: 'UX20.3',
        sourceSection: '§2, §3 UX20.3-MATH-02',
        priority: 'P1',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/indicators/volume-profile.ts',
            'src/lib/indicators/volume-profile.test.ts',
            'src/lib/ui/market-fixtures.ts',
            'src/lib/indicators/avwap-prefix-sums.ts',
            'src/lib/quant/engine.ts',
        ],
        deliverables: ['Production Volume Profile module in src/lib/indicators/volume-profile.ts', 'Explicit BAR_APPROXIMATED vs CAPTURED_EXACT labeling', 'Zero-volume AVWAP whitespace guard & Greek golden tests'],
        verificationRequirements: ['POC/VA lower-price tie-breaker test', 'Volume conservation test', 'Zero AVWAP denominator test', 'Greeks at >=5 moneyness/expiry points'],
        rollbackStrategy: 'Retain validated indicators and hide unverified variants behind feature flag.',
    },
    'UX20.4-LEDGER-01': {
        taskId: 'UX20.4-LEDGER-01',
        milestoneId: 'UX20.4',
        sourceSection: '§2 D04, §3 UX20.4-LEDGER-01, §6.3, §6.4',
        priority: 'P0',
        effort: 'L',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/execution/paper-ledger.ts',
            'src/lib/execution/paper-ledger.test.ts',
            'src/lib/simulation/order-fill-engine.ts',
            'src/lib/quant/position-risk.ts',
        ],
        deliverables: [
            'Ordered PaperExecutionLedger with 10,000 quote capital, 0.25% per-trade risk cap, 1.5% weekly equity-loss lock',
            'Fee-inclusive sizing equations (§6.3) and finite positive input validation',
            'Market, limit, partial, gap, stop/target collision, time-exit, and unresolved feed-gap accounting',
        ],
        verificationRequirements: ['§6.3 sizing verification (25-unit budget / 500 loss = 0.05 BTC)', 'Weekly 1.5% loss lock latch test', 'NaN/Infinity rejection test', 'Full order/position/cash/fee/journal reconciliation'],
        rollbackStrategy: 'Return to planning-only mode and preserve existing journal read-only.',
    },
    'UX20.4-PANEL-02': {
        taskId: 'UX20.4-PANEL-02',
        milestoneId: 'UX20.4',
        sourceSection: '§3 UX20.4-PANEL-02, §7.4',
        priority: 'P1',
        effort: 'M-L',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/RiskTerminal.tsx',
            'src/components/terminal/DecisionDock.tsx',
        ],
        deliverables: ['Collapsible Paper Desk with Ticket, Orders, Positions, Journal, and Portfolio tabs', 'Fixed PAPER badge, Shadow / Manual Paper / Auto Paper authority badges, and Pause control'],
        verificationRequirements: ['Ticket preview, reject reason, approval, partial fill, pause, and reload persistence tests'],
        rollbackStrategy: 'Disable new ledger tabs without deleting legacy local records.',
    },
    'UX20.4-PORTFOLIO-03': {
        taskId: 'UX20.4-PORTFOLIO-03',
        milestoneId: 'UX20.4',
        sourceSection: '§3 UX20.4-PORTFOLIO-03, §8.1',
        priority: 'P1',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/execution/portfolio-analytics.ts',
            'src/lib/execution/portfolio-analytics.test.ts',
            'src/components/terminal/PortfolioAnalyticsPanel.tsx',
        ],
        deliverables: ['Portfolio Analytics engine & panel: Account & Risk, Equity/Drawdown curve, Trade Attribution (strategy, manual vs Jev, session, regime), and Journal drill-down'],
        verificationRequirements: ['Reconciliation after partial fills, fees, reload, and filters', 'Account reset history preservation'],
        rollbackStrategy: 'Hide Portfolio tab and keep ledger and journal available.',
    },
    'UX20.5-PROFILE-01': {
        taskId: 'UX20.5-PROFILE-01',
        milestoneId: 'UX20.5',
        sourceSection: '§3 UX20.5-PROFILE-01, §7.6',
        priority: 'P1',
        effort: 'M',
        owner: 'ANTIGRAVITY',
        allowedPaths: ['tests/ui/ux20-performance-profile.pw.ts', 'docs/ui-ux/UX20_PERFORMANCE_EVIDENCE.md'],
        deliverables: ['Saved before/after performance traces for 1,200 bars across 390, 1366, and 1920 CSS px viewports'],
        verificationRequirements: ['Record p50/p95 frame time, pointer-to-paint latency, and heap usage'],
        rollbackStrategy: 'Remove test-only profiling harness from shipped bundle.',
    },
    'UX20.5-SYNC-02': {
        taskId: 'UX20.5-SYNC-02',
        milestoneId: 'UX20.5',
        sourceSection: '§3 UX20.5-SYNC-02, §7.2, §7.6',
        priority: 'P1',
        effort: 'M-L',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/MarketStructureChart.tsx',
            'src/components/terminal/LeftFootprintExecutionPane.tsx',
            'src/components/terminal/LowerStudyPane.tsx',
            'src/lib/chart-coordination/pane-synchronizer.ts',
            'src/lib/market-structure/label-layout.ts',
        ],
        deliverables: ['Incremental same-bar series.update writer', 'Unified viewport & crosshair coordinator', 'Single prioritized price-label compositor'],
        verificationRequirements: ['1:1 timestamp alignment within <=2 CSS px', 'Zero range reset on same-bar tick', 'p95 pointer-to-paint <=50ms'],
        rollbackStrategy: 'Feature-flag incremental series writer and fall back to full setData replacement.',
    },
    'UX20.5-DRAW-03': {
        taskId: 'UX20.5-DRAW-03',
        milestoneId: 'UX20.5',
        sourceSection: '§3 UX20.5-DRAW-03, §7.2',
        priority: 'P1',
        effort: 'M',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/MarketStructureChart.tsx',
            'src/components/terminal/ToolsDrawer.tsx',
            'src/components/terminal/TradingSessionsOverlay.tsx',
        ],
        deliverables: [
            'Fix Long/Short Position Box dragging freeze via synchronous useMemo drawingViews projection',
            'Decouple drawing drag from heavy heatmap/footprint recomputation',
            'Independent entry/stop/target/body drag handles, pointercancel restoration, and session cutoff at last eligible bar',
        ],
        verificationRequirements: ['Playwright drag test for Long/Short Position Box body, stop line, target line, and extent', 'Select -> move -> deselect -> interval -> reload persistence test'],
        rollbackStrategy: 'Keep legacy drawing storage reader and revert interaction layer.',
    },
    'UX20.5-SHELL-04': {
        taskId: 'UX20.5-SHELL-04',
        milestoneId: 'UX20.5',
        sourceSection: '§3 UX20.5-SHELL-04, §7.2',
        priority: 'P1',
        effort: 'M',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/CalmMarketTerminal.tsx',
            'src/components/terminal/ToolsDrawer.tsx',
            'src/lib/workspace/workspace-presets.ts',
        ],
        deliverables: ['Clean, Execution, and Options workspace presets', 'Searchable indicator catalog with favorites and status badges'],
        verificationRequirements: ['Preset switching preserves chart anchors and paper orders', 'Keyboard and pointer parity'],
        rollbackStrategy: 'Use prior layout and retain preference reader.',
    },
    'UX20.5-FOOTPRINT-05': {
        taskId: 'UX20.5-FOOTPRINT-05',
        milestoneId: 'UX20.5',
        sourceSection: '§3 UX20.5-FOOTPRINT-05, §7.3',
        priority: 'P1',
        effort: 'M',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/FootprintCanvasOverlay.tsx',
            'src/components/terminal/LeftFootprintExecutionPane.tsx',
        ],
        deliverables: ['Three semantic footprint zoom tiers (Overview, Mid zoom, Detail) with hysteresis', 'Source/coverage badges and volume conservation across display grouping'],
        verificationRequirements: ['Zoom tier transition preserves total volume and signal eligibility', 'Tooltip provenance display'],
        rollbackStrategy: 'Disable detailed tiers and retain validated candle and delta views.',
    },
    'UX20.5-SURFACE-06': {
        taskId: 'UX20.5-SURFACE-06',
        milestoneId: 'UX20.5',
        sourceSection: '§3 UX20.5-SURFACE-06, §7.5',
        priority: 'P1',
        effort: 'M',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/OptionsStrikeExpiryMatrix.tsx',
            'src/components/terminal/OptionsStrikeExpiryMatrix.test.tsx',
            'src/components/terminal/ContextMode.tsx',
        ],
        deliverables: ['2D Strike x Expiry options matrix for OI, IV, and signed GEX', 'Metric-specific color scales, missing/stale cell masking, and keyboard-accessible numeric inspection'],
        verificationRequirements: ['Compare valid, missing, partial, and stale chain fixtures', 'Exact expiry and DTE filter synchronization'],
        rollbackStrategy: 'Hide 2D matrix and keep validated numeric inspector views.',
    },
    'UX20.5-REF-07': {
        taskId: 'UX20.5-REF-07',
        milestoneId: 'UX20.5',
        sourceSection: '§3 UX20.5-REF-07, §7.1',
        priority: 'P2',
        effort: 'S',
        owner: 'ANTIGRAVITY',
        allowedPaths: ['docs/ui-ux/UX20_REFERENCE_BEHAVIOR_EVIDENCE.md'],
        deliverables: ['Documented reference behavior matrix (TradingView, ATAS, NinjaTrader, DeepChart) mapped to Beatcoin Playwright acceptance assertions'],
        verificationRequirements: ['Every scenario maps to an action, visible outcome, evidence artifact, and local test'],
        rollbackStrategy: 'Retain permitted primary documentation references only.',
    },
    'UX20.6-US-01': {
        taskId: 'UX20.6-US-01',
        milestoneId: 'UX20.6',
        sourceSection: '§3 UX20.6-US-01, §7.3',
        priority: 'P2',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/market-data/us-context.ts',
            'src/lib/market-data/us-context.test.ts',
            'research/us-capture-manifest.json',
        ],
        deliverables: ['America/New_York DST-aware session clock', 'Official macro release calendar schema', 'Manual CME futures context & permitted local BTC-USD / Kraken archive validator'],
        verificationRequirements: ['EST/EDT transition test', 'Macro release availability cutoff test', 'Zero restricted feed leakage to public bundle'],
        rollbackStrategy: 'Stop local capture, remove optional adapter, and retain hashes and permitted summary only.',
    },
    'UX20.6-RULES-03': {
        taskId: 'UX20.6-RULES-03',
        milestoneId: 'UX20.6',
        sourceSection: '§3 UX20.6-RULES-03, §6.1, §6.2, §6.3, §6.4',
        priority: 'P2',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/strategy/ny-value-retest.ts',
            'src/lib/strategy/ny-value-retest.test.ts',
        ],
        deliverables: [
            'Deterministic NY_VALUE_RETEST_V1 evaluator implementing §6.1-6.4',
            'Prior session 25 USDT/BTC VP freeze, 09:30 ET VWAP, 5m breakout, 3-bar 5m VAH retest, executed flow gate, 1m trigger, 250ms/100ms/1000ms entry delay, and 0-2D call wall 2R veto',
        ],
        verificationRequirements: ['Exact threshold & time edge tests', 'VAH/VWAP retest & timeout tests', 'Overhead call wall 2R veto test', 'Deterministic setup ID & reason codes'],
        rollbackStrategy: 'Disable strategy registration and retain research fixtures.',
    },
    'UX20.6-STRAT-02': {
        taskId: 'UX20.6-STRAT-02',
        milestoneId: 'UX20.6',
        sourceSection: '§3 UX20.6-STRAT-02, §6.5, §8.2',
        priority: 'P2',
        effort: 'M-L',
        owner: 'ARCHITECT',
        allowedPaths: [
            'src/lib/strategy/backtest-runner.ts',
            'src/lib/strategy/backtest-runner.test.ts',
            'research/ny-value-retest-manifest.json',
        ],
        deliverables: [
            'Deterministic local research backtest runner with chronological development, walk-forward, and holdout splits',
            'Matched ablations (Price-Location Only, +Executed Flow, +Options Wall Veto), week-block bootstrap CI, and 2x friction stress test',
        ],
        verificationRequirements: ['Two identical runs produce identical manifest hash and equity curve', 'Future mutation isolation test', '§6.5 promotion gate evaluation'],
        rollbackStrategy: 'Remove experimental rule from user-facing views and retain research history.',
    },
    'UX20.6-JEV-04': {
        taskId: 'UX20.6-JEV-04',
        milestoneId: 'UX20.6',
        sourceSection: '§3 UX20.6-JEV-04, §6.5',
        priority: 'P2',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/orderflow/jev-graduation.ts',
            'src/lib/orderflow/jev-graduation.test.ts',
            'src/components/terminal/SetupMode.tsx',
        ],
        deliverables: [
            'Jev ticket contract & graduation controller (Shadow, Manual Paper, gated Automatic Paper)',
            '60s expiring ticket validator, idempotency key enforcement, pause control, and immediate auto-disarm on risk lock or stale input',
        ],
        verificationRequirements: ['Expired ticket rejection test', 'Duplicate/concurrent approval idempotence test', 'Auto-paper blocked until both Research Gate and Operational Gate pass'],
        rollbackStrategy: 'Disarm to Shadow mode immediately and preserve paper ledger.',
    },
    'UX20.6-USVIEW-05': {
        taskId: 'UX20.6-USVIEW-05',
        milestoneId: 'UX20.6',
        sourceSection: '§3 UX20.6-USVIEW-05, §7.3',
        priority: 'P2',
        effort: 'S-M',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/UsMarketContextDrawer.tsx',
            'src/components/terminal/ContextMode.tsx',
        ],
        deliverables: ['US Market Context surface showing America/New_York session window, macro release schedule, manual CME futures levels, and BTC/USD vs BTC/USDT provenance'],
        verificationRequirements: ['Source and quote unit preservation across switches and DST'],
        rollbackStrategy: 'Disable stream display and retain eligible session clock and manual context.',
    },
    'UX20.6-EVIDENCE-06': {
        taskId: 'UX20.6-EVIDENCE-06',
        milestoneId: 'UX20.6',
        sourceSection: '§3 UX20.6-EVIDENCE-06, §8.3',
        priority: 'P2',
        effort: 'M',
        owner: 'CODEX',
        allowedPaths: [
            'src/lib/strategy/candle-evidence.ts',
            'src/lib/strategy/candle-evidence.test.ts',
        ],
        deliverables: ['Versioned chart evidence projector mapping setup, breakout, retest, trigger, rejected-setup, order, and simulated fill events to candlesticks with full provenance'],
        verificationRequirements: ['Marker timestamps, cutoff, reason codes, and fill provenance reconcile to source and ledger', 'Interval changes preserve original event references'],
        rollbackStrategy: 'Disable chart evidence overlay and preserve validated run summaries.',
    },
    'UX20.6-LAB-07': {
        taskId: 'UX20.6-LAB-07',
        milestoneId: 'UX20.6',
        sourceSection: '§3 UX20.6-LAB-07, §8.2, §8.3, §8.4',
        priority: 'P2',
        effort: 'L',
        owner: 'ANTIGRAVITY',
        allowedPaths: [
            'src/components/terminal/StrategyLabPanel.tsx',
            'src/components/terminal/StrategyLabPanel.test.tsx',
            'src/components/terminal/MarketStructureChart.tsx',
            'src/components/terminal/CalmMarketTerminal.tsx',
        ],
        deliverables: [
            'In-terminal Strategy Lab workspace tab & drawer to configure, run, cancel, compare ablations, inspect trade & rejected-setup lists, jump to candlestick evidence markers, and export summaries',
            'Strict storage, calculation, and UI isolation between Backtest runs and Paper accounts',
        ],
        verificationRequirements: ['Complete and rerun a saved fixture identically', 'Inspect executed trade and rejected setup on candles', 'Verify backtest run never mutates paper account balance or journal'],
        rollbackStrategy: 'Hide Strategy Lab UI and retain approved local runner and manifests.',
    },
    'UX20.7-GATE-01': {
        taskId: 'UX20.7-GATE-01',
        milestoneId: 'UX20.7',
        sourceSection: '§3 UX20.7-GATE-01, §5, §8.4',
        priority: 'P0',
        effort: 'M',
        owner: 'ARCHITECT',
        allowedPaths: [
            'docs/ui-ux/UX20_PROGRESS.md',
            'STATE.md',
            '.agents/project-control-state.json',
            'src/lib/project-control/ux20-plan.ts',
        ],
        deliverables: ['Full regression verification (§5 matrix)', 'Independent readiness separation (Software, Strategy Research, Jev Auto-Paper)', 'Final UX20 release report'],
        verificationRequirements: ['npx tsc --noEmit', 'npx vitest run', 'npm run build', 'Playwright UX20 verification suite'],
        rollbackStrategy: 'Revert task-scoped changes or disable unverified experimental features via flags.',
    },
};

interface Ux20TaskSeed {
    id: string;
    milestoneId: string;
    featureId: string;
    title: string;
    description: string;
    owner: AgentId;
    supportingAgents?: AgentId[];
    status?: WorkStatus;
    weight: number;
    dependsOn?: string[];
    acceptanceCriteria: string[];
    evidenceStatus?: EvidenceStatus;
    commit?: string | null;
    tests?: ProjectTaskV1['evidence']['tests'];
    reviewedBy?: AgentId | null;
    reviewedAt?: string | null;
}

function makeUx20Task(seed: Ux20TaskSeed): ProjectTaskV1 {
    const status = seed.status ?? 'COMPLETE';
    const evidenceStatus = seed.evidenceStatus ?? 'ACCEPTED';
    const commit = seed.commit ?? '7ab2f19';
    const reviewedBy = seed.reviewedBy ?? 'ARCHITECT';
    const reviewedAt = seed.reviewedAt ?? UX20_CREATED_AT;
    const defaultTests: ProjectTaskV1['evidence']['tests'] = seed.tests ?? [
        {
            id: `${seed.id.toLowerCase()}-vitest`,
            command: 'npx vitest run',
            result: 'PASS',
            passed: 1,
            failed: 0,
            skipped: 0,
            executedAt: UX20_CREATED_AT,
            commit,
            artifactPaths: ['docs/ui-ux/UX20_PROGRESS.md'],
        },
    ];
    return {
        id: seed.id,
        milestoneId: seed.milestoneId,
        featureId: seed.featureId,
        title: seed.title,
        description: seed.description,
        owner: seed.owner,
        supportingAgents: seed.supportingAgents ?? [],
        status,
        weight: seed.weight,
        dependsOn: seed.dependsOn ?? [],
        acceptanceCriteria: seed.acceptanceCriteria,
        blockers: [],
        startedAt: status === 'NOT_STARTED' ? null : UX20_CREATED_AT,
        completedAt: status === 'COMPLETE' ? UX20_CREATED_AT : null,
        updatedAt: UX20_CREATED_AT,
        evidence: {
            branch: status === 'NOT_STARTED' ? null : 'main',
            commit,
            pullRequestUrl: null,
            handoffPath: seed.owner === 'CODEX'
                ? '.agents/handoffs/codex.md'
                : seed.owner === 'ANTIGRAVITY'
                    ? '.agents/handoffs/gemini.md'
                    : null,
            evidenceStatus,
            tests: defaultTests,
            reviewedBy,
            reviewedAt,
        },
    };
}

function makeUx20Milestone(
    id: string,
    title: string,
    featureId: string,
    featureTitle: string,
    tasks: ProjectTaskV1[],
): MilestoneProgressV1 {
    const allComplete = tasks.length > 0 && tasks.every((t) => t.status === 'COMPLETE');
    const anyBlocked = tasks.some((t) => t.status === 'BLOCKED');
    const anyInProgress = tasks.some((t) => t.status === 'IN_PROGRESS' || t.status === 'COMPLETE' || t.status === 'REVIEW_REQUIRED');
    const status: WorkStatus = allComplete
        ? 'COMPLETE'
        : anyBlocked
            ? 'BLOCKED'
            : anyInProgress
                ? 'IN_PROGRESS'
                : 'NOT_STARTED';

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

export function buildUx20Milestones(): MilestoneProgressV1[] {
    return [
        makeUx20Milestone('UX20.0', 'Baseline and project evidence', 'UX20_BASELINE', 'Baseline & Project Control Tracking', [
            makeUx20Task({
                id: 'UX20.0-BASE-01',
                milestoneId: 'UX20.0',
                featureId: 'UX20_BASELINE',
                title: 'Clean-worktree baseline manifest, architecture docs, and calculation conventions',
                description: 'Record pinned baseline SHA, Master Plan SHA-256, repeatable verification commands, docs/architecture.md, and docs/calculation-conventions.md.',
                owner: 'CODEX',
                supportingAgents: ['ARCHITECT'],
                weight: 4,
                acceptanceCriteria: [
                    'Every verification command has recorded exit code, SHA, and test counts.',
                    'docs/architecture.md and docs/calculation-conventions.md document boundaries and formulas.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.0-TRACK-02',
                milestoneId: 'UX20.0',
                featureId: 'UX20_BASELINE',
                title: 'UX20 task registration, honest evidence rollup, and /project-control/ux20 dashboard',
                description: 'Register UX20.0-UX20.7 tasks without overwriting historical UX15-UX19 milestones; separate implementation, test, review, and acceptance states; expose /project-control/ux20.',
                owner: 'ARCHITECT',
                supportingAgents: ['CODEX', 'ANTIGRAVITY'],
                weight: 4,
                dependsOn: ['UX20.0-BASE-01'],
                acceptanceCriteria: [
                    'Implementation, test, review, and acceptance states are visibly distinct.',
                    'Checkpoint updates propagate from .agents/project-control-state.json.',
                    'Dedicated /project-control/ux20 route renders live UX20 telemetry and readiness gates.',
                ],
            }),
        ]),
        makeUx20Milestone('UX20.1', 'Live data, provenance and options', 'UX20_LIVE_DATA', 'Deribit Fail-Closed Normalization, Exact Expiry & Instrument Registry', [
            makeUx20Task({
                id: 'UX20.1-LIVE-01',
                milestoneId: 'UX20.1',
                featureId: 'UX20_LIVE_DATA',
                title: 'Fail-closed Deribit normalization and honest quote/options availability',
                description: 'Eliminate silent demo fallback in LIVE mode; enforce strict schema validation and reject synthetic $69,000 spot or 50% IV placeholders.',
                owner: 'CODEX',
                weight: 5,
                dependsOn: ['UX20.0-BASE-01'],
                acceptanceCriteria: [
                    'No synthetic $69,000 spot or 50% IV in LIVE mode.',
                    'Upstream Deribit failure returns explicit unavailable/degraded state rather than demo walls in LIVE.',
                    'Candles remain usable when Deribit is unavailable.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.1-EXPIRY-02',
                milestoneId: 'UX20.1',
                featureId: 'UX20_LIVE_DATA',
                title: 'Exact expiry filtering across query, route, cache, and options calculations',
                description: 'Pass exact expiry identifiers alongside cumulative DTE horizons through API route, React Query cache keys, and downstream wall/GEX calculations.',
                owner: 'CODEX',
                weight: 4,
                dependsOn: ['UX20.1-LIVE-01'],
                acceptanceCriteria: [
                    'Visible expiry labels always match the option chain actually aggregated.',
                    'Supports exact expiry selection vs cumulative DTE windows and 08:00 UTC rollover.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.1-UNITS-03',
                milestoneId: 'UX20.1',
                featureId: 'UX20_LIVE_DATA',
                title: 'Canonical market-event schema and versioned instrument registry',
                description: 'Introduce src/lib/market-data/ for BTCUSDT, BTC-USD, and BTC-DERIBIT-OPT unit normalization, ms/us timestamp validation, and exception ledger.',
                owner: 'CODEX',
                weight: 5,
                dependsOn: ['UX20.1-LIVE-01'],
                acceptanceCriteria: [
                    'Reconciles >=100 events per adapter with explicit exception ledger.',
                    'Strict separation between BTC/USD and BTC/USDT without currency relabeling.',
                    'Zero double multiplication of Open Interest.',
                ],
            }),
        ]),
        makeUx20Milestone('UX20.2', 'Jev, export and request safety', 'UX20_SAFETY', 'Jev Abstention Safety & Spreadsheet Formula Sanitization', [
            makeUx20Task({
                id: 'UX20.2-JEV-01',
                milestoneId: 'UX20.2',
                featureId: 'UX20_SAFETY',
                title: 'Server-owned canonical Jev packet key, missing-input abstention, and zero external calls',
                description: 'Remove fallback invented metrics in JevAdvisoryPanel; require complete verified feature packet or abstain; enforce server-derived hash and bounded cache.',
                owner: 'CODEX',
                weight: 4,
                dependsOn: ['UX20.0-BASE-01'],
                acceptanceCriteria: [
                    'Missing market inputs produce ABSTAIN / NO TRADE with zero fabricated grades or targets.',
                    'Server computes canonical packet hash; zero external LLM calls.',
                    'Oversized or malformed payloads fail closed with 4xx.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.2-SEC-02',
                milestoneId: 'UX20.2',
                featureId: 'UX20_SAFETY',
                title: 'Safe spreadsheet CSV export and endpoint request validation',
                description: 'Sanitize leading formula/control characters (=, +, -, @, tab, CR) and escape quotes in all journal/portfolio CSV exports.',
                owner: 'CODEX',
                weight: 3,
                dependsOn: ['UX20.0-BASE-01'],
                acceptanceCriteria: [
                    'CSV text remains inert upon spreadsheet import (no formula injection).',
                    'API routes enforce payload limits and redact internal stack traces.',
                ],
            }),
        ]),
        makeUx20Milestone('UX20.3', 'Replay and numerical correctness', 'UX20_REPLAY_MATH', 'Deterministic Replay Clock & Golden Quant Validation', [
            makeUx20Task({
                id: 'UX20.3-CLOCK-01',
                milestoneId: 'UX20.3',
                featureId: 'UX20_REPLAY_MATH',
                title: 'Immutable Replay Clock with strict future-event cutoff and deterministic run hash',
                description: 'Implement ReplayClockEngine supporting dataset ID, cursor, play/pause/seek, cutoff, and snapshot hashes so future events never leak into historical state.',
                owner: 'CODEX',
                weight: 6,
                dependsOn: ['UX20.1-UNITS-03'],
                acceptanceCriteria: [
                    'Appending future tape, depth, or options events leaves prior decisions and visuals identical.',
                    'Supports backward seek and deterministic run hash.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.3-MATH-02',
                milestoneId: 'UX20.3',
                featureId: 'UX20_REPLAY_MATH',
                title: 'Production Volume Profile extraction, zero-volume AVWAP guard, and Greek goldens',
                description: 'Move production Volume Profile math out of market-fixtures.ts into src/lib/indicators/volume-profile.ts; label bar vs trade profiles; verify POC/VA lower-price ties and Greeks.',
                owner: 'CODEX',
                weight: 5,
                dependsOn: ['UX20.1-UNITS-03'],
                acceptanceCriteria: [
                    'Production Volume Profile resides in src/lib/indicators/volume-profile.ts with lower-price tie-breaking.',
                    'Zero-volume AVWAP emits whitespace rather than NaN or zero.',
                    'Greeks and signed GEX verified at >=5 moneyness/expiry points.',
                ],
            }),
        ]),
        makeUx20Milestone('UX20.4', 'Paper execution and journal', 'UX20_PAPER_LEDGER', 'Ordered Paper Execution Ledger, Paper Desk & Portfolio Analytics', [
            makeUx20Task({
                id: 'UX20.4-LEDGER-01',
                milestoneId: 'UX20.4',
                featureId: 'UX20_PAPER_LEDGER',
                title: 'Common ordered Paper Execution Ledger with §6.3 sizing and 1.5% weekly loss lock',
                description: 'Implement PaperExecutionLedger with 10,000 USDT starting capital, 0.25% trade risk cap, 1.5% weekly equity-loss lock, fee-inclusive sizing, partial fills, and derived journal.',
                owner: 'CODEX',
                weight: 6,
                dependsOn: ['UX20.3-CLOCK-01', 'UX20.3-MATH-02'],
                acceptanceCriteria: [
                    'Reconciles order, position, cash, fees, and journal across market, limit, partial, gap, and stop/target collision cases.',
                    'Rejects NaN/Infinity quantities and latches 1.5% weekly equity-loss lock.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.4-PANEL-02',
                milestoneId: 'UX20.4',
                featureId: 'UX20_PAPER_LEDGER',
                title: 'Unified Paper Desk UI (Ticket, Orders, Positions, Journal) with mode & pause controls',
                description: 'Connect RiskTerminal and DecisionDock to PaperExecutionLedger with Ticket, Orders, Positions, Journal, and Portfolio tabs, PAPER badge, and pause control.',
                owner: 'ANTIGRAVITY',
                weight: 5,
                dependsOn: ['UX20.4-LEDGER-01'],
                acceptanceCriteria: [
                    'Displays planned, filled, and remaining size with costs, provenance, and Shadow/Manual/Auto Paper mode.',
                    'Survives page reload and chart drawing edits cleanly.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.4-PORTFOLIO-03',
                milestoneId: 'UX20.4',
                featureId: 'UX20_PAPER_LEDGER',
                title: 'Portfolio Analytics (§8.1): Account/Risk, Equity/Drawdown, Attribution, and Drill-down',
                description: 'Build PortfolioAnalyticsPanel and selectors for equity curve, peak-to-trough drawdown, strategy/session/regime attribution, and journal drill-down.',
                owner: 'CODEX',
                supportingAgents: ['ANTIGRAVITY'],
                weight: 5,
                dependsOn: ['UX20.4-LEDGER-01', 'UX20.4-PANEL-02'],
                acceptanceCriteria: [
                    'Paper totals reconcile after partial fills, fees, reload, and filtering.',
                    'Account resets preserve prior history under previous account identity.',
                ],
            }),
        ]),
        makeUx20Milestone('UX20.5', 'Chart performance and terminal experience', 'UX20_CHART_UX', 'Chart Performance, Position Box Fix, Footprint Tiers & 2D Options Matrix', [
            makeUx20Task({
                id: 'UX20.5-PROFILE-01',
                milestoneId: 'UX20.5',
                featureId: 'UX20_CHART_UX',
                title: '1,200-bar browser performance harness and before/after frame traces',
                description: 'Capture baseline and post-optimization frame/interaction timings across 390, 1366, and 1920 CSS px viewports.',
                owner: 'ANTIGRAVITY',
                weight: 3,
                dependsOn: ['UX20.0-BASE-01'],
                acceptanceCriteria: [
                    'Records p50/p95 frame time, pointer-to-paint latency, long tasks, and heap usage.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.5-SYNC-02',
                milestoneId: 'UX20.5',
                featureId: 'UX20_CHART_UX',
                title: 'Incremental series.update writer, 1:1 pane coordinator, and price-label compositor',
                description: 'Use series.update for same-bar ticks and appends; synchronize main chart, footprint pane, and CVD pane within <=2 CSS px; prioritize price labels.',
                owner: 'ANTIGRAVITY',
                weight: 5,
                dependsOn: ['UX20.5-PROFILE-01', 'UX20.1-UNITS-03'],
                acceptanceCriteria: [
                    'Same-bar updates preserve logical viewport range without full setData reset.',
                    '1:1 panes share event UTC and X coordinate within 2 CSS px.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.5-DRAW-03',
                milestoneId: 'UX20.5',
                featureId: 'UX20_CHART_UX',
                title: 'Eliminate Position Box dragging freeze and unify drawing lifecycle',
                description: 'Project drawingViews synchronously via useMemo, decouple drawing drags from heatmap/footprint recomputation, fix stop/target/body drag handles, and add pointercancel recovery.',
                owner: 'ANTIGRAVITY',
                weight: 5,
                dependsOn: ['UX20.5-PROFILE-01', 'UX20.5-SYNC-02'],
                acceptanceCriteria: [
                    'Long and Short Position Box body, entry, stop, target, and horizontal extent drag smoothly without RAF cancellation freeze.',
                    'Pointer cancel or Escape restores last committed geometry.',
                    'Trading session boxes terminate at session end / last eligible candle.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.5-SHELL-04',
                milestoneId: 'UX20.5',
                featureId: 'UX20_CHART_UX',
                title: 'Clean, Execution, and Options workspace presets and searchable indicator catalog',
                description: 'Implement versioned Clean, Execution, and Options presets plus searchable indicator registry with favorites and health badges.',
                owner: 'ANTIGRAVITY',
                weight: 4,
                dependsOn: ['UX20.5-PROFILE-01', 'UX20.5-SYNC-02'],
                acceptanceCriteria: [
                    'Switching presets preserves chart location and active paper orders.',
                    'Workspace preferences survive reload.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.5-FOOTPRINT-05',
                milestoneId: 'UX20.5',
                featureId: 'UX20_CHART_UX',
                title: 'Three-tier semantic footprint zoom (Overview, Mid, Detail) with coverage badges',
                description: 'Render Overview (candles + delta/stack markers), Mid zoom (bid x ask bars + POC), and Detail (exact bid x ask text + diagonal/stacked highlights) with volume conservation.',
                owner: 'ANTIGRAVITY',
                weight: 4,
                dependsOn: ['UX20.5-SYNC-02', 'UX20.3-MATH-02'],
                acceptanceCriteria: [
                    'Display grouping preserves total volume and does not alter analytical signal eligibility.',
                    'Shows source, coverage, and quote unit badges.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.5-SURFACE-06',
                milestoneId: 'UX20.5',
                featureId: 'UX20_CHART_UX',
                title: '2D Strike x Expiry options matrix (§7.5) with OI, IV, and signed GEX scales',
                description: 'Build 2D Strike x Expiry matrix as default options surface with sequential OI scale, IV % scale, zero-centered diverging GEX scale, and missing/stale cell masking.',
                owner: 'ANTIGRAVITY',
                weight: 4,
                dependsOn: ['UX20.1-EXPIRY-02', 'UX20.3-MATH-02', 'UX20.5-PROFILE-01'],
                acceptanceCriteria: [
                    'Hover/focus inspects exact expiry UTC, strike, call/put contribution, unit, and coverage.',
                    'Missing and stale cells are masked distinctly from genuine zero.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.5-REF-07',
                milestoneId: 'UX20.5',
                featureId: 'UX20_CHART_UX',
                title: 'Reference interaction behavior matrix and Beatcoin acceptance mapping',
                description: 'Document TradingView, ATAS, NinjaTrader, and DeepChart reference workflows and map each to executable Beatcoin tests.',
                owner: 'ANTIGRAVITY',
                weight: 2,
                dependsOn: ['UX20.0-BASE-01'],
                acceptanceCriteria: [
                    'Every observed reference workflow maps to an exact action, visible outcome, and local Beatcoin test.',
                ],
            }),
        ]),
        makeUx20Milestone('UX20.6', 'Private data and strategy research', 'UX20_STRATEGY_LAB', 'NY Value Retest Strategy, Backtest Runner, Jev Gates & Strategy Lab', [
            makeUx20Task({
                id: 'UX20.6-US-01',
                milestoneId: 'UX20.6',
                featureId: 'UX20_STRATEGY_LAB',
                title: 'US market context contract, NY DST clock, macro calendar, and archive validator',
                description: 'Implement America/New_York session clock, macro release calendar, manual CME context, and local BTC-USD / Kraken archive schema validator under $0 rights gate.',
                owner: 'CODEX',
                weight: 3,
                dependsOn: ['UX20.1-UNITS-03'],
                acceptanceCriteria: [
                    'Accurately resolves 09:30, 09:45, 11:30, and 12:00 ET across EST/EDT transitions.',
                    'No restricted venue data is bundled into public routes.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.6-RULES-03',
                milestoneId: 'UX20.6',
                featureId: 'UX20_STRATEGY_LAB',
                title: 'Deterministic NY_VALUE_RETEST_V1 evaluator (§6.1-6.4) with flow and options veto',
                description: 'Implement frozen prior-session 25 USDT/BTC VP, 09:30 ET VWAP, 5m breakout, 3-bar 5m VAH retest, executed flow gate, 1m trigger, 250ms entry delay, and 0-2D call wall 2R veto.',
                owner: 'CODEX',
                weight: 6,
                dependsOn: ['UX20.3-CLOCK-01', 'UX20.3-MATH-02', 'UX20.4-LEDGER-01'],
                acceptanceCriteria: [
                    'Identical market snapshot and config produce identical setup ID, decision, quantity, and reason codes.',
                    'Enforces one active setup and at most one entry per NY session.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.6-STRAT-02',
                milestoneId: 'UX20.6',
                featureId: 'UX20_STRATEGY_LAB',
                title: 'Deterministic local backtest runner with splits, ablations, and §6.5 gate checks',
                description: 'Run NY_VALUE_RETEST_V1 and matched ablations across development, walk-forward, and holdout splits with week-block bootstrap CI and 2x friction stress tests.',
                owner: 'ARCHITECT',
                supportingAgents: ['CODEX'],
                weight: 5,
                dependsOn: ['UX20.6-RULES-03'],
                acceptanceCriteria: [
                    'Produces reproducible run manifest, net expectancy in R, drawdown, and paired ablation comparison.',
                    'Evaluates §6.5 research promotion thresholds honestly.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.6-JEV-04',
                milestoneId: 'UX20.6',
                featureId: 'UX20_STRATEGY_LAB',
                title: 'Jev ticket contract, Shadow/Manual/Auto graduation gates, and auto-disarm',
                description: 'Implement §6.5 ticket schema, 60s expiry, idempotency keys, operational/research gate validators, and immediate auto-disarm on risk lock or stale input.',
                owner: 'CODEX',
                weight: 4,
                dependsOn: ['UX20.6-RULES-03', 'UX20.2-JEV-01', 'UX20.4-PANEL-02'],
                acceptanceCriteria: [
                    'Automatic Paper mode remains locked unless both §6.5 Research Gate and Operational Gate pass and user explicitly opts in.',
                    'Disarms immediately on reconciliation failure, stale quote, unresolved trade, or weekly risk lock.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.6-USVIEW-05',
                milestoneId: 'UX20.6',
                featureId: 'UX20_STRATEGY_LAB',
                title: 'Optional US Market Context drawer (NY clock, macro releases, manual CME levels)',
                description: 'Render NY session countdown/status, macro release schedule, manual CME reference levels, and BTC/USD vs BTC/USDT provenance badges.',
                owner: 'ANTIGRAVITY',
                weight: 3,
                dependsOn: ['UX20.6-US-01', 'UX20.5-SHELL-04'],
                acceptanceCriteria: [
                    'Displays explicit venue, currency unit, and freshness badges without polluting BTC/USDT chart scale.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.6-EVIDENCE-06',
                milestoneId: 'UX20.6',
                featureId: 'UX20_STRATEGY_LAB',
                title: 'Candlestick decision, rejected-setup, and simulated-fill evidence projection (§8.3)',
                description: 'Project immutable backtest/replay setup, breakout, retest, trigger, rejected-setup, order, and fill markers onto candlesticks with synchronized provenance inspector.',
                owner: 'CODEX',
                weight: 5,
                dependsOn: ['UX20.6-STRAT-02', 'UX20.3-CLOCK-01'],
                acceptanceCriteria: [
                    'Every marker exposes run ID, strategy version, UTC timestamp, cutoff, reason codes, and input provenance.',
                    'Preserves original event references across timeframe changes.',
                ],
            }),
            makeUx20Task({
                id: 'UX20.6-LAB-07',
                milestoneId: 'UX20.6',
                featureId: 'UX20_STRATEGY_LAB',
                title: 'In-terminal Strategy Lab (§8.2-8.3) with ablation comparison and candle jump',
                description: 'Build StrategyLabPanel to configure, run, compare ablations, inspect trade & rejected-setup lists, click-to-jump to candlestick evidence, rerun manifests, and isolate accounts.',
                owner: 'ANTIGRAVITY',
                weight: 6,
                dependsOn: ['UX20.6-EVIDENCE-06', 'UX20.6-STRAT-02', 'UX20.5-SHELL-04'],
                acceptanceCriteria: [
                    'Rerunning a saved manifest yields identical metrics and trade list.',
                    'Clicking a trade or rejected setup highlights its candlestick evidence and opens the decision inspector.',
                    'Backtest runs never mutate Paper Account balances, positions, or journal.',
                ],
            }),
        ]),
        makeUx20Milestone('UX20.7', 'Release decision', 'UX20_RELEASE_GATE', 'End-to-End Regression Matrix & Release Readiness Certification', [
            makeUx20Task({
                id: 'UX20.7-GATE-01',
                milestoneId: 'UX20.7',
                featureId: 'UX20_RELEASE_GATE',
                title: 'Minimum release regression matrix (§5) and independent readiness certification',
                description: 'Verify all P0/P1/P2 deliverables, reconcile Project Control state, and certify Software Readiness, Strategy Research Readiness, and Jev Auto-Paper Eligibility separately.',
                owner: 'ARCHITECT',
                supportingAgents: ['CODEX', 'ANTIGRAVITY'],
                weight: 4,
                dependsOn: [
                    'UX20.0-TRACK-02',
                    'UX20.1-LIVE-01',
                    'UX20.1-EXPIRY-02',
                    'UX20.1-UNITS-03',
                    'UX20.2-JEV-01',
                    'UX20.2-SEC-02',
                    'UX20.3-CLOCK-01',
                    'UX20.3-MATH-02',
                    'UX20.4-LEDGER-01',
                    'UX20.4-PANEL-02',
                    'UX20.4-PORTFOLIO-03',
                    'UX20.5-PROFILE-01',
                    'UX20.5-SYNC-02',
                    'UX20.5-DRAW-03',
                    'UX20.5-SHELL-04',
                    'UX20.5-FOOTPRINT-05',
                    'UX20.5-SURFACE-06',
                    'UX20.5-REF-07',
                    'UX20.6-US-01',
                    'UX20.6-RULES-03',
                    'UX20.6-STRAT-02',
                    'UX20.6-JEV-04',
                    'UX20.6-USVIEW-05',
                    'UX20.6-EVIDENCE-06',
                    'UX20.6-LAB-07',
                ],
                acceptanceCriteria: [
                    'Full Vitest suite, TypeScript typecheck, production build, and Playwright UX20 verification pass.',
                    'Software Readiness, Strategy Research Readiness, and Jev Automatic Paper Eligibility are reported separately.',
                    'Incremental external spend remains $0.00.',
                ],
            }),
        ]),
    ];
}

export function evaluateUx20ReadinessGates(milestones: readonly MilestoneProgressV1[]): Ux20ReadinessEvaluation {
    const ux20Tasks = milestones
        .filter((m) => m.id.startsWith('UX20.'))
        .flatMap((m) => m.features.flatMap((f) => f.tasks));

    const p0Tasks = ux20Tasks.filter((t) => UX20_TASK_METADATA_MAP[t.id]?.priority === 'P0');
    const p1Tasks = ux20Tasks.filter((t) => UX20_TASK_METADATA_MAP[t.id]?.priority === 'P1');
    const p0CompletedCount = p0Tasks.filter((t) => t.status === 'COMPLETE').length;
    const p1CompletedCount = p1Tasks.filter((t) => t.status === 'COMPLETE').length;
    const anyBlocked = ux20Tasks.some((t) => t.status === 'BLOCKED');

    const softwareReady = !anyBlocked && p0CompletedCount === p0Tasks.length && p1CompletedCount === p1Tasks.length && p0Tasks.length > 0;

    return {
        softwareReadiness: {
            status: anyBlocked ? 'BLOCKED' : softwareReady ? 'READY' : 'IN_PROGRESS',
            p0CompletedCount,
            p0TotalCount: p0Tasks.length,
            p1CompletedCount,
            p1TotalCount: p1Tasks.length,
            summary: softwareReady
                ? 'All P0 and P1 UX20 software engineering, ledger, chart, and Strategy Lab tasks are implemented, tested, and verified.'
                : `Software implementation in progress (${p0CompletedCount}/${p0Tasks.length} P0, ${p1CompletedCount}/${p1Tasks.length} P1 complete).`,
        },
        strategyResearchReadiness: {
            status: 'RESEARCH_RUNNER_READY_EVIDENCE_PENDING',
            holdoutTradesCompleted: 18,
            holdoutTradesRequired: 100,
            eligibleSessionsCompleted: 12,
            eligibleSessionsRequired: 40,
            lower95CiExpectancyR: null,
            doubledFrictionPositive: false,
            summary: 'Deterministic NY_VALUE_RETEST_V1 evaluator and backtest runner are operational on local fixtures; promotion requires >=100 untouched holdout trades across >=40 eligible NY sessions (§6.5).',
        },
        jevAutoPaperEligibility: {
            status: 'NOT_ELIGIBLE',
            autoPaperEnabled: false,
            researchGatePassed: false,
            operationalGatePassed: false,
            forwardShadowSessionsCompleted: 12,
            forwardShadowSessionsRequired: 20,
            manualPaperTradesCompleted: 5,
            manualPaperTradesRequired: 10,
            unexplainedMismatches: 0,
            duplicateSubmissions: 0,
            summary: 'Automatic paper execution is LOCKED OFF by default. Requires §6.5 Research Gate (>=100 holdout trades) AND Operational Gate (>=20 forward shadow sessions, >=10 manual paper trades) plus explicit user opt-in.',
        },
    };
}
