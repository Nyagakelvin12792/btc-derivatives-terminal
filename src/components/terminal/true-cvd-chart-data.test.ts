import { describe, expect, it } from 'vitest';

import { buildOracleCapture, oracleScenario } from '../../lib/orderflow/true-flow-oracle.test-data';
import { deriveTrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow';
import { isCvdBar, projectCapturedCvdToChartTimes } from './true-cvd-chart-data';

const BASE = Date.UTC(2026, 9, 30, 12, 0, 0) / 1_000;

function snapshot(id: string) {
    const scenario = oracleScenario(id);
    return deriveTrueFlowSnapshotV1(buildOracleCapture(scenario), {
        interval: scenario.interval,
        priceBucket: scenario.priceBucket,
        valueAreaFraction: 0.7,
    });
}

describe('captured CVD chart projection', () => {
    it('uses whitespace before capture while preserving the price chart time grid', () => {
        const grid = [BASE - 60, BASE, BASE + 60, BASE + 120] as const;
        const points = projectCapturedCvdToChartTimes(grid, snapshot('S04'));
        expect(points.map((point) => Number(point.time))).toEqual(grid);
        expect(points.slice(0, 3).every((point) => !isCvdBar(point))).toBe(true);
        expect(isCvdBar(points[3])).toBe(true);
        if (isCvdBar(points[3])) {
            expect(points[3]).toMatchObject({ open: 0, close: 100, reset: true });
        }
    });

    it('shows only the current segment after a gap and starts from zero', () => {
        const grid = [BASE, BASE + 60, BASE + 120] as const;
        const points = projectCapturedCvdToChartTimes(grid, snapshot('S02'));
        expect(isCvdBar(points[0])).toBe(false);
        expect(isCvdBar(points[1])).toBe(true);
        if (isCvdBar(points[1])) {
            expect(points[1]).toMatchObject({ open: 0, close: -200, reset: true });
        }
    });
});
