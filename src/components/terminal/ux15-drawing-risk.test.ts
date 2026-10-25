import { describe, expect, it } from 'vitest';
import {
    calculatePositionRisk,
} from '../../lib/quant/position-risk';
import {
    applyDrawingDrag,
    createDefaultFibonacciSettings,
    createDrawing,
    createPositionDrawing,
    EMPTY_HISTORY,
    fibonacciLevelPrices,
    nudgeDrawing,
    parseFibonacciLevels,
    projectDrawing,
    pushHistory,
    redoHistory,
    sanitizePersistedDrawings,
    timeToLogicalIndex,
    undoHistory,
    type ChartProjector,
    type DrawingPoint,
} from './drawing-model';
import {
    DEFAULT_RISK_SETTINGS,
    evaluatePositionRiskForDrawing,
    type PositionRiskSettings,
} from './RiskTerminal';

describe('UX15.1 Pure Drawing Model & Semantic Projection', () => {
    const mockProjector: ChartProjector = {
        timeToX: (time: number) => (time - 1_700_000_000) * 0.1,
        priceToY: (price: number) => 1_000 - (price - 60_000) * 0.1,
        width: 1200,
        height: 800,
    };

    it('persists drawings using semantic UTC time and price anchors only', () => {
        const point1: DrawingPoint = { time: 1_700_000_100, price: 65_000 };
        const point2: DrawingPoint = { time: 1_700_000_500, price: 68_000 };
        const trendline = createDrawing('tl-1', 'trendline', [point1, point2]);

        expect(trendline.id).toBe('tl-1');
        expect(trendline.type).toBe('trendline');
        expect(trendline.points).toEqual([point1, point2]);
        expect(trendline.locked).toBe(false);
        expect(trendline.hidden).toBe(false);
    });

    it('projects horizontal lines across the entire chart viewport width', () => {
        const point: DrawingPoint = { time: 1_700_000_100, price: 67_000 };
        const horizontal = createDrawing('h-1', 'horizontal', [point]);
        const view = projectDrawing(horizontal, mockProjector);

        expect(view).not.toBeNull();
        expect(view!.points).toHaveLength(1);
        expect(view!.points[0].x).toBe(0);
        expect(view!.points[0].y).toBe(mockProjector.priceToY(67_000));
    });

    it('projects Fibonacci retracement with levels and horizontal extent', () => {
        const p1: DrawingPoint = { time: 1_700_000_000, price: 60_000 };
        const p2: DrawingPoint = { time: 1_700_001_000, price: 70_000 };
        const fib = createDrawing('fib-1', 'fibonacci', [p1, p2]);
        const view = projectDrawing(fib, mockProjector);

        expect(view).not.toBeNull();
        expect(view!.fibonacci).toBeDefined();
        expect(view!.fibonacci!.leftX).toBe(mockProjector.timeToX(1_700_000_000));
        expect(view!.fibonacci!.rightX).toBe(mockProjector.timeToX(1_700_001_000));

        // When extendRight is enabled, rightX extends to full canvas width
        fib.fibonacci!.extendRight = true;
        const extendedView = projectDrawing(fib, mockProjector);
        expect(extendedView!.fibonacci!.rightX).toBe(1200);
    });

    it('projects Long and Short position objects with separate entry, stop, and target Y levels', () => {
        const entryPoint: DrawingPoint = { time: 1_700_000_000, price: 65_000 };
        const longPos = createPositionDrawing('long-1', 'long-position', entryPoint, 1_700_005_000);
        const view = projectDrawing(longPos, mockProjector);

        expect(view).not.toBeNull();
        expect(view!.position).toBeDefined();
        expect(view!.position!.leftX).toBe(mockProjector.timeToX(1_700_000_000));
        expect(view!.position!.rightX).toBe(mockProjector.timeToX(1_700_005_000));
        expect(view!.position!.entryY).toBe(mockProjector.priceToY(65_000));
        expect(view!.position!.stopY).toBe(mockProjector.priceToY(longPos.position!.stop));
        expect(view!.position!.targetY).toBe(mockProjector.priceToY(longPos.position!.target));
    });

    it('sanitizes persisted drawings, removing malformed items and preserving valid ones', () => {
        const validLong = createPositionDrawing('valid-long', 'long-position', { time: 1_700_000_000, price: 68_000 }, 1_700_002_000);
        const malformed = [
            null,
            { id: 'bad-1', type: 'unknown-tool' },
            { id: 'bad-2', type: 'trendline', points: [{ time: NaN, price: 50 }] },
            { id: 'bad-3', type: 'long-position', points: [{ time: 1_700_000_000, price: 68_000 }], position: { entry: 68_000 } }, // missing stop and target
            validLong,
        ];
        const sanitized = sanitizePersistedDrawings(malformed);
        expect(sanitized).toHaveLength(1);
        expect(sanitized[0].id).toBe('valid-long');
    });

    it('maps UTC time to fractional logical bar indices correctly', () => {
        const barTimes = [100, 200, 300, 400, 500];
        expect(timeToLogicalIndex(barTimes, 100, 100)).toBe(0);
        expect(timeToLogicalIndex(barTimes, 300, 100)).toBe(2);
        expect(timeToLogicalIndex(barTimes, 250, 100)).toBe(1.5);
        expect(timeToLogicalIndex(barTimes, 50, 100)).toBe(-0.5);
        expect(timeToLogicalIndex(barTimes, 600, 100)).toBe(5);
    });
});

describe('UX15.1 Fibonacci Retracement & Level Calculations', () => {
    it('computes linear retracement levels between low and high anchors', () => {
        const p1: DrawingPoint = { time: 1_000, price: 60_000 };
        const p2: DrawingPoint = { time: 2_000, price: 70_000 };
        const settings = createDefaultFibonacciSettings();

        const levels = fibonacciLevelPrices([p1, p2], settings);
        const levelMap = Object.fromEntries(levels.map((lvl) => [String(lvl.value), lvl.price]));

        // Anchors: first = 60,000, second = 70,000.
        // Level 0 sits at second (70,000) and Level 1 sits at first (60,000).
        expect(levelMap['0']).toBe(70_000);
        expect(levelMap['1']).toBe(60_000);
        expect(levelMap['0.5']).toBe(65_000);
        expect(levelMap['0.618']).toBeCloseTo(70_000 - 10_000 * 0.618, 2);
        expect(levelMap['0.382']).toBeCloseTo(70_000 - 10_000 * 0.382, 2);
    });

    it('inverts level orientation when reverse is set', () => {
        const p1: DrawingPoint = { time: 1_000, price: 60_000 };
        const p2: DrawingPoint = { time: 2_000, price: 70_000 };
        const settings = createDefaultFibonacciSettings();
        settings.reverse = true;

        const levels = fibonacciLevelPrices([p1, p2], settings);
        const levelMap = Object.fromEntries(levels.map((lvl) => [String(lvl.value), lvl.price]));

        expect(levelMap['0']).toBe(60_000);
        expect(levelMap['1']).toBe(70_000);
        expect(levelMap['0.5']).toBe(65_000);
    });

    it('parses custom ratio text correctly and rejects invalid numbers', () => {
        expect(parseFibonacciLevels('0, 0.5, 0.618, 1.618')).toEqual([0, 0.5, 0.618, 1.618]);
        expect(parseFibonacciLevels('0.382; 0.786 1.272')).toEqual([0.382, 0.786, 1.272]);
        expect(parseFibonacciLevels('invalid text')).toBeNull();
        expect(parseFibonacciLevels('15.5')).toBeNull(); // > 10
    });
});

describe('UX15.2 Long/Short Position Geometry & Risk Engine Integration', () => {
    it('creates long positions with default valid geometry: stop < entry < target', () => {
        const entry = 70_000;
        const long = createPositionDrawing('long-1', 'long-position', { time: 1_000, price: entry }, 2_000);

        expect(long.position!.stop).toBeLessThan(entry);
        expect(long.position!.target).toBeGreaterThan(entry);

        const result = evaluatePositionRiskForDrawing(long, DEFAULT_RISK_SETTINGS);
        expect(result).not.toBeNull();
        expect(result!.status).toBe('ready');
        expect(result!.metrics).toBeDefined();
        // Gross distance ratio is exactly 2.0 (2% target / 1% stop)
        expect(result!.metrics!.targetDistancePercent / result!.metrics!.stopDistancePercent).toBeCloseTo(2.0, 1);
        // Net reward to risk after execution fees and slippage is positive and > 1.5
        expect(result!.metrics!.rewardToRisk).toBeGreaterThan(1.5);
    });

    it('creates short positions with default valid geometry: target < entry < stop', () => {
        const entry = 70_000;
        const short = createPositionDrawing('short-1', 'short-position', { time: 1_000, price: entry }, 2_000);

        expect(short.position!.stop).toBeGreaterThan(entry);
        expect(short.position!.target).toBeLessThan(entry);

        const result = evaluatePositionRiskForDrawing(short, DEFAULT_RISK_SETTINGS);
        expect(result).not.toBeNull();
        expect(result!.status).toBe('ready');
        expect(result!.metrics).toBeDefined();
        expect(result!.metrics!.targetDistancePercent / result!.metrics!.stopDistancePercent).toBeCloseTo(2.0, 1);
        expect(result!.metrics!.rewardToRisk).toBeGreaterThan(1.5);
    });

    it('blocks execution status and emits invalid geometry if long lines cross (stop >= entry)', () => {
        const long = createPositionDrawing('long-crossed', 'long-position', { time: 1_000, price: 65_000 }, 2_000);
        // Drag stop above entry
        long.position!.stop = 66_000;

        const result = evaluatePositionRiskForDrawing(long, DEFAULT_RISK_SETTINGS);
        expect(result).not.toBeNull();
        expect(result!.status).toBe('invalid');
        expect(result!.errors).toContain('INVALID_LONG_GEOMETRY');
    });

    it('blocks execution status and emits invalid geometry if short lines cross (stop <= entry)', () => {
        const short = createPositionDrawing('short-crossed', 'short-position', { time: 1_000, price: 65_000 }, 2_000);
        // Drag stop below entry
        short.position!.stop = 64_000;

        const result = evaluatePositionRiskForDrawing(short, DEFAULT_RISK_SETTINGS);
        expect(result).not.toBeNull();
        expect(result!.status).toBe('invalid');
        expect(result!.errors).toContain('INVALID_SHORT_GEOMETRY');
    });

    it('blocks status with DAILY_LOSS_LIMIT_EXHAUSTED when daily loss limit is hit', () => {
        const long = createPositionDrawing('long-budget', 'long-position', { time: 1_000, price: 65_000 }, 2_000);
        const exhaustedSettings: PositionRiskSettings = {
            ...DEFAULT_RISK_SETTINGS,
            dailyLossLimitUsd: 2_000,
            realizedPnlTodayUsd: -2_000, // already lost daily limit
        };

        const result = evaluatePositionRiskForDrawing(long, exhaustedSettings);
        expect(result).not.toBeNull();
        expect(result!.status).toBe('blocked');
        expect(result!.errors).toContain('DAILY_LOSS_LIMIT_EXHAUSTED');
    });
});

describe('UX15.1 & UX15.2 Dragging, Modification, and Immutability', () => {
    it('drags stop line independently without changing entry or target price', () => {
        const long = createPositionDrawing('long-1', 'long-position', { time: 1_000, price: 65_000 }, 2_000);
        const originalEntry = long.position!.entry;
        const originalTarget = long.position!.target;

        const dragged = applyDrawingDrag(long, { kind: 'position-line', line: 'stop' }, {
            current: { time: 1_000, price: 63_500 },
            priceDelta: 0,
            shiftTime: (t) => t,
        });

        expect(dragged.position!.stop).toBe(63_500);
        expect(dragged.position!.entry).toBe(originalEntry);
        expect(dragged.position!.target).toBe(originalTarget);
    });

    it('drags entry line and updates both position.entry and points.price', () => {
        const long = createPositionDrawing('long-1', 'long-position', { time: 1_000, price: 65_000 }, 2_000);

        const dragged = applyDrawingDrag(long, { kind: 'position-line', line: 'entry' }, {
            current: { time: 1_000, price: 66_000 },
            priceDelta: 1_000,
            shiftTime: (t) => t,
        });

        expect(dragged.position!.entry).toBe(66_000);
        expect(dragged.points[0].price).toBe(66_000);
        expect(dragged.points[1].price).toBe(66_000);
    });

    it('shifts whole body moving entry, stop, target, and time together', () => {
        const long = createPositionDrawing('long-1', 'long-position', { time: 1_000, price: 65_000 }, 2_000);
        const stopDistance = long.position!.entry - long.position!.stop;
        const targetDistance = long.position!.target - long.position!.entry;

        const moved = applyDrawingDrag(long, { kind: 'body' }, {
            current: { time: 1_500, price: 67_000 },
            priceDelta: 2_000,
            shiftTime: (t) => t + 500,
        });

        expect(moved.points[0].time).toBe(1_500);
        expect(moved.points[1].time).toBe(2_500);
        expect(moved.position!.entry).toBe(67_000);
        expect(moved.position!.entry - moved.position!.stop).toBeCloseTo(stopDistance, 4);
        expect(moved.position!.target - moved.position!.entry).toBeCloseTo(targetDistance, 4);
    });

    it('resizes horizontal extent without changing any price levels', () => {
        const long = createPositionDrawing('long-1', 'long-position', { time: 1_000, price: 65_000 }, 2_000);

        const resized = applyDrawingDrag(long, { kind: 'position-extent' }, {
            current: { time: 3_500, price: 65_000 },
            priceDelta: 0,
            shiftTime: (t) => t,
        });

        expect(resized.points[0].time).toBe(1_000);
        expect(resized.points[1].time).toBe(3_500);
        expect(resized.position!.entry).toBe(long.position!.entry);
        expect(resized.position!.stop).toBe(long.position!.stop);
        expect(resized.position!.target).toBe(long.position!.target);
    });

    it('prevents any modification on locked drawings', () => {
        const long = createPositionDrawing('long-1', 'long-position', { time: 1_000, price: 65_000 }, 2_000);
        long.locked = true;

        const attempted = applyDrawingDrag(long, { kind: 'position-line', line: 'stop' }, {
            current: { time: 1_000, price: 50_000 },
            priceDelta: -15_000,
            shiftTime: (t) => t,
        });
        expect(attempted).toBe(long);
        expect(attempted.position!.stop).toBe(long.position!.stop);

        const nudged = nudgeDrawing(long, 500, (t) => t);
        expect(nudged.position!.entry).toBe(long.position!.entry);
    });
});

describe('UX15.1 Undo / Redo History Stack', () => {
    it('manages undo and redo transitions cleanly across operations', () => {
        let history = EMPTY_HISTORY;
        const d1 = [createDrawing('1', 'horizontal', [{ time: 100, price: 60_000 }])];
        const d2 = [...d1, createDrawing('2', 'horizontal', [{ time: 200, price: 65_000 }])];
        const d3 = [...d2, createDrawing('3', 'horizontal', [{ time: 300, price: 70_000 }])];

        history = pushHistory(history, d1);
        history = pushHistory(history, d2);

        // Undo to d2
        const undo1 = undoHistory(history, d3);
        expect(undo1).not.toBeNull();
        expect(undo1!.drawings).toHaveLength(2);
        expect(undo1!.drawings[1].id).toBe('2');

        // Undo to d1
        const undo2 = undoHistory(undo1!.history, undo1!.drawings);
        expect(undo2).not.toBeNull();
        expect(undo2!.drawings).toHaveLength(1);
        expect(undo2!.drawings[0].id).toBe('1');

        // Redo to d2
        const redo1 = redoHistory(undo2!.history, undo2!.drawings);
        expect(redo1).not.toBeNull();
        expect(redo1!.drawings).toHaveLength(2);
        expect(redo1!.drawings[1].id).toBe('2');
    });

    it('returns null when attempting to undo an empty history', () => {
        expect(undoHistory(EMPTY_HISTORY, [])).toBeNull();
        expect(redoHistory(EMPTY_HISTORY, [])).toBeNull();
    });
});

describe('UX15.2 Shared Model Agreement Between Chart HUD and Risk Terminal', () => {
    it('produces identical calculations for chart HUD and Risk terminal from the same quant engine', () => {
        const drawing = createPositionDrawing('long-sync', 'long-position', { time: 1_000, price: 68_000 }, 2_000);
        drawing.position!.stop = 67_320; // 1% stop
        drawing.position!.target = 69_360; // 2% target

        // Evaluation used by the Chart Drawing Layer HUD
        const chartResult = evaluatePositionRiskForDrawing(drawing, DEFAULT_RISK_SETTINGS);

        // Direct calculation performed by the Risk Terminal
        const directResult = calculatePositionRisk({
            side: 'long',
            account: {
                equityUsd: DEFAULT_RISK_SETTINGS.equityUsd,
                risk: { mode: 'percent', value: DEFAULT_RISK_SETTINGS.riskValue },
                leverage: DEFAULT_RISK_SETTINGS.leverage,
                dailyLossLimitUsd: DEFAULT_RISK_SETTINGS.dailyLossLimitUsd,
                realizedPnlTodayUsd: DEFAULT_RISK_SETTINGS.realizedPnlTodayUsd,
                maxDrawdownUsd: DEFAULT_RISK_SETTINGS.maxDrawdownUsd,
                currentDrawdownUsd: DEFAULT_RISK_SETTINGS.currentDrawdownUsd,
            },
            instrument: {
                entryPrice: drawing.position!.entry,
                stopPrice: drawing.position!.stop,
                targetPrice: drawing.position!.target,
                pointValueUsdPerPriceUnit: DEFAULT_RISK_SETTINGS.pointValueUsdPerPriceUnit,
                lotSize: DEFAULT_RISK_SETTINGS.lotSize,
                quantityStep: DEFAULT_RISK_SETTINGS.quantityStep,
                minimumQuantity: DEFAULT_RISK_SETTINGS.minimumQuantity,
                maximumQuantity: DEFAULT_RISK_SETTINGS.maximumQuantity,
            },
            costs: {
                entryFeeRate: DEFAULT_RISK_SETTINGS.entryFeeRate,
                exitFeeRate: DEFAULT_RISK_SETTINGS.exitFeeRate,
                slippageBpsPerSide: DEFAULT_RISK_SETTINGS.slippageBpsPerSide,
            },
        });

        expect(chartResult).not.toBeNull();
        expect(chartResult!.status).toBe(directResult.status);
        expect(chartResult!.metrics!.quantity).toBe(directResult.metrics!.quantity);
        expect(chartResult!.metrics!.lossAtStopUsd).toBe(directResult.metrics!.lossAtStopUsd);
        expect(chartResult!.metrics!.profitAtTargetUsd).toBe(directResult.metrics!.profitAtTargetUsd);
        expect(chartResult!.metrics!.rewardToRisk).toBe(directResult.metrics!.rewardToRisk);
        expect(chartResult!.metrics!.notionalUsd).toBe(directResult.metrics!.notionalUsd);
        expect(chartResult!.metrics!.limitedBy).toBe(directResult.metrics!.limitedBy);
    });
});
