import { describe, expect, it } from 'vitest';
import {
    applyCheckpointToMilestones,
    createInitialCheckpoint,
    findNextEligibleTask,
    transitionTaskFailedOrBlocked,
    transitionTaskInProgress,
    transitionTaskTestedOrAccepted,
} from './orchestrator';
import { buildUx17BaseMilestones, buildUx17Milestones } from './ux17-plan';
import { buildUx16Milestones } from './ux16-plan';
import {
    computeNicePriceTicks,
    resolveRightEdgeLabels,
    type RightEdgeLevelInput,
} from '../market-structure/label-layout';
import {
    aggregateFootprintBarWithConservation,
    computeCoordinatedPriceBounds,
    resolveCoordinatedBarWindow,
    resolveSemanticZoomTier,
    selectAdaptiveFootprintStep,
} from '../chart-coordination/coordinator';
import {
    computePortfolioAnalytics,
    computeTradeMetricsSnapshot,
    createManagedTradeFromDrawing,
    evaluateTradeOnBar,
    exportTradesToCsv,
    validateTakeProfitAllocations,
} from '../risk/trade-manager';
import {
    BUILTIN_WORKSPACE_PRESETS,
    loadCustomWorkspacePresets,
    saveCustomWorkspacePreset,
} from '../workspace/presets';
import type { DemoMarketBar } from '../ui/market-fixtures';

describe('UX17.0 — Execution Orchestrator & Checkpoint Lifecycle', () => {
    it('registers UX17.0 through UX17.11 milestones and resolves task dependencies deterministically', () => {
        const ux17Only = buildUx17Milestones();
        expect(ux17Only.length).toBe(12);
        expect(ux17Only[0].id).toBe('UX17.0');
        expect(ux17Only.at(-1)?.id).toBe('UX17.11');

        const baseMilestones = buildUx17BaseMilestones();
        const nextTask = findNextEligibleTask(baseMilestones);
        expect(nextTask).not.toBeNull();
        expect(nextTask?.milestoneId).toBe('UX17.0');
    });

    it('transitions tasks through IN_PROGRESS -> TESTED -> ACCEPTED and enforces bounded retry blocking', () => {
        const milestones = buildUx17BaseMilestones();
        const eligible = findNextEligibleTask(milestones)!;

        let cp = createInitialCheckpoint('UX17-MINIMALIST-WORKSPACE', '2026-11-04T12:00:00Z', 'abc1234');
        cp = transitionTaskInProgress(cp, eligible, '2026-11-04T12:01:00Z');
        expect(cp.activeTaskId).toBe(eligible.id);
        expect(cp.overrides[eligible.id].status).toBe('IN_PROGRESS');

        // Simulate 3 consecutive failures -> BLOCKED
        cp = transitionTaskFailedOrBlocked(cp, { taskId: eligible.id, error: 'Test failure 1', nowIso: '2026-11-04T12:02:00Z' });
        expect(cp.overrides[eligible.id].status).toBe('IN_PROGRESS');
        cp = transitionTaskFailedOrBlocked(cp, { taskId: eligible.id, error: 'Test failure 2', nowIso: '2026-11-04T12:03:00Z' });
        expect(cp.overrides[eligible.id].status).toBe('IN_PROGRESS');
        cp = transitionTaskFailedOrBlocked(cp, { taskId: eligible.id, error: 'Test failure 3', nowIso: '2026-11-04T12:04:00Z' });
        expect(cp.overrides[eligible.id].status).toBe('BLOCKED');
        expect(cp.overrides[eligible.id].blockers.length).toBe(1);

        // Transition to ACCEPTED with passing test evidence
        cp = transitionTaskTestedOrAccepted(cp, {
            taskId: eligible.id,
            commit: 'def5678',
            acceptedBy: 'ARCHITECT',
            nowIso: '2026-11-04T12:05:00Z',
            tests: [
                {
                    id: 'test-1',
                    command: 'npx vitest run',
                    result: 'PASS',
                    passed: 9,
                    failed: 0,
                    skipped: 0,
                    executedAt: '2026-11-04T12:05:00Z',
                    commit: 'def5678',
                    artifactPaths: [],
                },
            ],
        });
        expect(cp.overrides[eligible.id].status).toBe('COMPLETE');
        expect(cp.overrides[eligible.id].evidenceStatus).toBe('ACCEPTED');

        const applied = applyCheckpointToMilestones(milestones, cp);
        const updatedTask = applied
            .flatMap((m) => m.features)
            .flatMap((f) => f.tasks)
            .find((t) => t.id === eligible.id);
        expect(updatedTask?.status).toBe('COMPLETE');
        expect(updatedTask?.evidence.evidenceStatus).toBe('ACCEPTED');
    });
});

describe('UX17.1 & UX17.5 — Right-Edge Label Collision Solver & Nice Price Ticks', () => {
    it('merges nearby confluence levels and enforces >= 16px vertical separation', () => {
        const inputs: RightEdgeLevelInput[] = [
            { id: 'spot', tag: 'SPOT', price: 78005, y: 200, tier: 'PRIMARY', priority: 100, color: '#2CC7A0' },
            { id: 'call-wall', tag: 'CALL WALL', price: 78000, y: 203, tier: 'PRIMARY', priority: 95, color: '#2CC7A0' },
            { id: 'poc', tag: 'POC', price: 77960, y: 210, tier: 'PRIMARY', priority: 90, color: '#E6B450' },
            { id: 'avwap', tag: 'AVWAP', price: 77940, y: 214, tier: 'SECONDARY', priority: 75, color: '#39A9F5' },
            { id: 'session-hi', tag: 'LON H', price: 77500, y: 310, tier: 'TERTIARY', priority: 50, color: '#8390A0' },
        ];

        const resolvedStandard = resolveRightEdgeLabels(inputs, {
            plotHeight: 480,
            minGapPx: 16,
            mergeDistancePx: 8,
            densityMode: 'STANDARD',
        });

        // TERTIARY filtered out in STANDARD mode; SPOT + CALL WALL merged
        expect(resolvedStandard.some((r) => r.id === 'session-hi')).toBe(false);
        expect(resolvedStandard[0].combinedTag).toContain('SPOT');
        expect(resolvedStandard[0].combinedTag).toContain('CALL WALL');

        // Verify >= 16px vertical separation between consecutive resolved pills
        for (let i = 1; i < resolvedStandard.length; i += 1) {
            expect(resolvedStandard[i].displayY - resolvedStandard[i - 1].displayY).toBeGreaterThanOrEqual(15.9);
        }
    });

    it('computes clean human-readable price ticks without overcrowding', () => {
        const ticks = computeNicePriceTicks(76200, 78600, 10);
        expect(ticks.length).toBeGreaterThanOrEqual(4);
        expect(ticks.length).toBeLessThanOrEqual(14);
        for (let i = 1; i < ticks.length; i += 1) {
            expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
        }
    });
});

describe('UX17.6 — Footprint Conservation, Imbalances & Chart Coordination', () => {
    const sampleBar: DemoMarketBar = {
        time: 1730710800 as DemoMarketBar['time'],
        open: 77500,
        high: 77800,
        low: 77400,
        close: 77750,
        volume: 120,
        takerBuyVolume: 75,
    };

    it('strictly conserves total buy volume, sell volume, and net delta across arbitrary bucket steps', () => {
        const rawCells = [
            { price: 77420, buyVolume: 5, sellVolume: 20 },
            { price: 77510, buyVolume: 25, sellVolume: 5 },
            { price: 77605, buyVolume: 30, sellVolume: 6 },
            { price: 77740, buyVolume: 15, sellVolume: 14 },
        ];

        for (const step of [25, 50, 100]) {
            const agg = aggregateFootprintBarWithConservation({
                bar: sampleBar,
                rawCells,
                bucketStep: step,
                imbalanceRatio: 3.0,
                stackedThreshold: 2,
                provenance: 'LIVE_TAPE',
            });

            const sumBuy = agg.bins.reduce((s, b) => s + b.buyVolume, 0);
            const sumSell = agg.bins.reduce((s, b) => s + b.sellVolume, 0);
            const sumTotal = agg.bins.reduce((s, b) => s + b.totalVolume, 0);

            expect(sumBuy).toBeCloseTo(75, 4);
            expect(sumSell).toBeCloseTo(45, 4);
            expect(sumTotal).toBeCloseTo(120, 4);
            expect(agg.barDelta).toBeCloseTo(30, 4);
            expect(agg.pocPrice).toBeGreaterThanOrEqual(77400);
            expect(agg.pocPrice).toBeLessThanOrEqual(77800);
        }
    });

    it('decouples Y-axis bounds from distant option walls in CANDLE_FIT mode', () => {
        const candleFit = computeCoordinatedPriceBounds({
            visibleBars: [sampleBar],
            fitMode: 'CANDLE_FIT',
            structuralLevels: [72000, 84000],
        });
        const includeWalls = computeCoordinatedPriceBounds({
            visibleBars: [sampleBar],
            fitMode: 'INCLUDE_WALLS',
            structuralLevels: [72000, 84000],
        });

        expect(candleFit.priceSpan).toBeLessThan(1000);
        expect(includeWalls.priceSpan).toBeGreaterThan(12000);
    });

    it('resolves semantic zoom tiers and coordinated bar windows accurately', () => {
        expect(resolveSemanticZoomTier(24, 7)).toBe('WIDE');
        expect(resolveSemanticZoomTier(44, 10)).toBe('MEDIUM');
        expect(resolveSemanticZoomTier(76, 14)).toBe('CLOSE');
        expect(selectAdaptiveFootprintStep([sampleBar], 'AUTO')).toBe(50);

        const bars = Array.from({ length: 50 }, (_, i) => ({
            ...sampleBar,
            time: (1730700000 + i * 3600) as DemoMarketBar['time'],
        }));
        const win = resolveCoordinatedBarWindow({
            bars,
            logicalRange: { from: 10, to: 39 },
            syncMode: 'LINKED_CURSOR_FOCUS',
            maxFocusBars: 12,
            focusTimestamp: 1730700000 + 20 * 3600,
        });
        expect(win.barCount).toBe(12);
        expect(win.startTime).toBeLessThanOrEqual(1730700000 + 20 * 3600);
        expect(win.endTime).toBeGreaterThanOrEqual(1730700000 + 20 * 3600);
    });
});

describe('UX17.8 — Trade Manager, Multi-TP Lifecycle, Break-Even & Intrabar Ambiguity', () => {
    it('evaluates Pending -> Open -> TP1 -> Auto Break-Even -> TP2 lifecycle and flags intrabar ambiguity', () => {
        let trade = createManagedTradeFromDrawing({
            id: 'trd-test-1',
            drawingId: 'drw-1',
            direction: 'LONG',
            entryPrice: 77000,
            stopPrice: 76500,
            targetPrice: 78000,
            startTime: 1000,
            endTime: 5000,
            accountBalanceUsd: 100_000,
            riskPercent: 1.0,
        });

        expect(trade.initialRiskUsd).toBe(1000);
        expect(trade.positionSizeBtc).toBe(2);
        expect(validateTakeProfitAllocations(trade.takeProfits).valid).toBe(true);

        // Arm pending
        trade = { ...trade, status: 'PENDING' };

        // Bar 1: Fills entry @ 77,000
        trade = evaluateTradeOnBar(trade, {
            time: 1100 as DemoMarketBar['time'],
            open: 77100,
            high: 77200,
            low: 76950,
            close: 77150,
            volume: 50,
        });
        expect(trade.status).toBe('OPEN');

        // Bar 2: Hits TP1 (77,600) -> 50% closed, Stop moved to Break-Even (77,000)
        trade = evaluateTradeOnBar(trade, {
            time: 1200 as DemoMarketBar['time'],
            open: 77150,
            high: 77650,
            low: 77100,
            close: 77620,
            volume: 80,
        });
        expect(trade.status).toBe('PARTIALLY_CLOSED');
        expect(trade.remainingAllocationPct).toBe(50);
        expect(trade.currentStopPrice).toBe(77000);
        expect(trade.realizedPnlUsd).toBe(600);

        const snap = computeTradeMetricsSnapshot(trade, 77700);
        expect(snap.unrealizedPnlUsd).toBe(700);

        // Bar 3: Ambiguous bar where both currentStopPrice (77,000) and TP2 (78,000) are inside [low, high]
        const ambigTrade = evaluateTradeOnBar(trade, {
            time: 1300 as DemoMarketBar['time'],
            open: 77500,
            high: 78100,
            low: 76900,
            close: 77200,
            volume: 150,
        });
        expect(ambigTrade.hasAmbiguousIntrabarEvent).toBe(true);
        expect(ambigTrade.status).toBe('STOPPED_OUT');
        expect(ambigTrade.events.some((e) => e.type === 'AMBIGUOUS_INTRABAR_WARNING')).toBe(true);

        // Bar 3 alternative: Clean TP2 hit
        const cleanWin = evaluateTradeOnBar(trade, {
            time: 1300 as DemoMarketBar['time'],
            open: 77620,
            high: 78050,
            low: 77550,
            close: 78020,
            volume: 95,
        });
        expect(cleanWin.status).toBe('CLOSED');
        expect(cleanWin.realizedPnlUsd).toBe(1600);

        const analytics = computePortfolioAnalytics([cleanWin, ambigTrade]);
        expect(analytics.completedTrades).toBe(2);
        expect(analytics.winCount).toBe(2);
        expect(analytics.totalNetPnlUsd).toBe(2200);

        const csv = exportTradesToCsv([cleanWin]);
        expect(csv).toContain('TradeID,Symbol,Timeframe');
        expect(csv).toContain('trd-test-1');
    });
});

describe('UX17.2 — Workspace Presets & Custom Persistence', () => {
    it('defines all 6 institutional workspace presets and persists custom presets cleanly', () => {
        expect(Object.keys(BUILTIN_WORKSPACE_PRESETS)).toEqual([
            'CLEAN_PRICE_ACTION',
            'AUCTION_VOLUME_PROFILE',
            'ORDER_FLOW',
            'OPTIONS_CONTEXT',
            'FULL_CONFLUENCE',
            'TRADE_EXECUTION',
        ]);

        const memory = new Map<string, string>();
        const mockStorage = {
            getItem: (k: string) => memory.get(k) ?? null,
            setItem: (k: string, v: string) => {
                memory.set(k, v);
            },
        };

        const saved = saveCustomWorkspacePreset(
            {
                ...BUILTIN_WORKSPACE_PRESETS.ORDER_FLOW,
                id: 'CUSTOM_NY_OPEN',
                label: 'NY Open Flow',
                shortLabel: 'NY Flow',
                isCustom: true,
            },
            mockStorage,
        );
        expect(saved.length).toBe(1);
        expect(loadCustomWorkspacePresets(mockStorage)[0].id).toBe('CUSTOM_NY_OPEN');
    });
});
