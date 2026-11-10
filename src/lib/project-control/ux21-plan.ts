import type { AgentId, MilestoneProgressV1, ProjectTaskV1 } from './contracts';

const REGISTERED_AT = '2026-11-10T08:44:00.000Z';

type TaskDefinition = [
    suffix: string,
    title: string,
    description: string,
    acceptanceCriteria: string[],
    dependsOn?: string[],
    owner?: AgentId,
];

function milestone(
    id: string,
    title: string,
    definitions: TaskDefinition[],
): MilestoneProgressV1 {
    const featureId = `${id}-FOOTPRINT`;
    const tasks: ProjectTaskV1[] = definitions.map(([
        suffix, taskTitle, description, acceptanceCriteria, dependsOn = [], owner = 'CODEX',
    ]) => ({
        id: `${id}-${suffix}`,
        milestoneId: id,
        featureId,
        title: taskTitle,
        description,
        owner,
        supportingAgents: [],
        status: 'NOT_STARTED',
        weight: 1,
        dependsOn,
        acceptanceCriteria,
        blockers: [],
        startedAt: null,
        completedAt: null,
        updatedAt: REGISTERED_AT,
        evidence: {
            branch: null,
            commit: null,
            pullRequestUrl: null,
            handoffPath: owner === 'CODEX' ? '.agents/handoffs/codex.md' : null,
            evidenceStatus: 'UNVERIFIED',
            tests: [],
            reviewedBy: null,
            reviewedAt: null,
        },
    }));

    return {
        id,
        title,
        status: 'NOT_STARTED',
        features: [{ id: featureId, milestoneId: id, title, status: 'NOT_STARTED', tasks }],
    };
}

export function buildUx21Milestones(): MilestoneProgressV1[] {
    return [
        milestone('UX21.0', 'Footprint research and baseline', [
            ['RESEARCH', 'ATAS reference research', 'Review the nine official ATAS references and compare documented behavior to terminal capabilities.', [
                'Reference matrix records interactions, input data, formulas, display, complexity, gaps, and acceptance checks.',
                'Distinguish public behavior from architecture inferred for this terminal.',
            ]],
            ['AUDIT', 'Reproduce and audit the current Footprint', 'Trace the screenshot symptoms through renderer, coordination, capture, and studies.', [
                'Record baseline revision, reproducible cases, root causes, and modules to preserve.',
                'Capture before screenshots and document actual live history coverage.',
            ]],
        ]),
        milestone('UX21.1', 'Independent chart and workspace', [
            ['CHART', 'Independent Footprint chart controller', 'Separate Footprint chart identity, viewport, selection, and rendering from the Candlestick coordinate system.', [
                'Footprint mounts with independent time and price scales.',
                'Candle and price-level selection use the chart’s own coordinates.',
            ], ['UX21.0-AUDIT']],
            ['SCALES', 'Interactive time and price scales', 'Implement cursor-centered zoom, panning, dynamic labels, latest and fit controls, and manual price overrides.', [
                'Scrolling, zoom, and live updates preserve the intended viewport.',
                'Readable adaptive labels, current price, and manual price scaling stay aligned with Footprint rows.',
            ], ['UX21.1-CHART']],
            ['LAYOUT', 'Resizable and persistent workspace layouts', 'Offer Candlestick, side-by-side, and side-by-side with studies layouts.', [
                'Desktop divider is draggable and each chart retains its own price scale.',
                'Layout, divider, link and study preferences survive a reload.',
            ], ['UX21.1-CHART']],
            ['SYNC', 'Timestamp-based pane coordination', 'Coordinate linked time, timeframe, selection, and crosshair while preserving independent control when unlinked.', [
                'Use interval membership for mixed timeframes and never reuse screen pixels.',
                'Range and crosshair updates terminate without feedback loops.',
            ], ['UX21.1-CHART']],
            ['DRAW', 'Footprint drawing interactions', 'Support chart-anchored drawing tools and preserve validated Candlestick interactions.', [
                'Drawing anchors survive time and price scale changes and remain selectable and editable.',
            ], ['UX21.1-SCALES']],
        ]),
        milestone('UX21.2', 'Observed trade integrity and rendering', [
            ['TAPE', 'Developing candles and coverage', 'Use exchange aggressor classifications and distinguish unavailable, untraded, and observed zero values.', [
                'Active candle updates from observed trades and completed candles are stable across later trades.',
                'Show instrument and coverage boundaries and keep incomplete candles labeled.',
            ], ['UX21.0-AUDIT']],
            ['BINS', 'Price aggregation and imbalance validation', 'Separate exchange tick size from display bins and validate preserved Bid, Ask, Delta, and volume.', [
                'Regrouping preserves totals and recomputes POC deterministically.',
                'Diagonal and stacked imbalances honor configurable thresholds and minimum volume.',
            ], ['UX21.2-TAPE']],
            ['TIMEFRAMES', 'Footprint timeframes and adaptive detail', 'Support observed-trade timeframes from M1 through Daily, emphasizing H1 and H4.', [
                'Candle boundaries and trade-based OHLC reconcile across timeframes.',
                'Wide, medium, and close zooms vary detail without inventing historical coverage.',
            ], ['UX21.2-TAPE', 'UX21.2-BINS']],
            ['MODES', 'Readable candles and compact display controls', 'Reduce toolbar clutter and separate cluster content from visual presentation and advanced settings.', [
                'Bid × Ask, Delta, Volume, Delta Profile, Volume Profile, and Heatmap are accessible.',
                'Developing candles, POC, and meaningful imbalances are readable without dense borders or fabricated zeroes.',
            ], ['UX21.1-SCALES', 'UX21.2-BINS']],
        ]),
        milestone('UX21.3', 'Footprint studies and candle inspection', [
            ['STATS', 'Candle-aligned Delta statistics', 'Render configurable statistics directly beneath their Footprint candles.', [
                'Statistics use the same time-to-pixel mapping and normalized candles as the Footprint.',
                'Selection highlights a column, and users can hide, reorder, resize, collapse, and copy.',
            ], ['UX21.1-SCALES', 'UX21.2-BINS']],
            ['CVD', 'Aligned true CVD', 'Reuse observed aggressor-side data and expose optional CVD on a synchronized time axis.', [
                'CVD is aligned to its parent chart and exposes incomplete coverage without substituting proxy volume.',
            ], ['UX21.2-TAPE']],
            ['INSPECT', 'Footprint Candle Inspector', 'Expose exact OHLC, volume, Delta, POC, concentrations and source coverage for the selected candle.', [
                'Inspector values and selected levels reconcile against the observed candle and active price grouping.',
            ], ['UX21.2-BINS', 'UX21.3-STATS']],
        ]),
        milestone('UX21.4', 'Replay, performance, and independent acceptance', [
            ['REPLAY', 'Causal historical Footprint replay', 'Construct developing candles from chronological captured trades and coordinate replay between panes.', [
                'At each replay cursor, later trades cannot contribute to OHLC, price bins, statistics, or CVD.',
                'Replay exposes coverage limitations and supports seeking and timeframe changes.',
            ], ['UX21.1-SYNC', 'UX21.3-STATS', 'UX21.3-CVD']],
            ['PERF', 'Measure renderer and interaction performance', 'Profile live updates, zoom, pan, and cursor movement on suitable desktop hardware and large H1/H4 fixtures.', [
                'Record dataset sizes, browser, device, frame times and pointer latency.',
                'Target approximately 60 FPS and record any unmet performance budget.',
            ], ['UX21.2-MODES', 'UX21.3-STATS']],
            ['TEST', 'Run numerical and visual regression suites', 'Verify independent and linked charts, resizing, saved settings, H1/H4, and data reconciliation.', [
                'Typecheck, full unit suite, production build, and browser regressions pass.',
                'Record before-and-after screenshots and compare rendered statistics against numerical fixtures.',
            ], ['UX21.1-LAYOUT', 'UX21.1-DRAW', 'UX21.2-TIMEFRAMES', 'UX21.3-INSPECT', 'UX21.4-REPLAY', 'UX21.4-PERF']],
            ['ACCEPT', 'Independent release acceptance', 'Review exact source revision, test evidence, benchmarks, capture coverage, and remaining limitations.', [
                'An independent reviewer records acceptance against the full brief.',
                'Production checks, if run, identify the verified revision and deployed URL.',
            ], ['UX21.0-RESEARCH', 'UX21.4-TEST'], 'ARCHITECT'],
        ]),
    ];
}
