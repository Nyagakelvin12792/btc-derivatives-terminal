import { describe, expect, it } from 'vitest';

import { deriveTrueFlowSnapshotV1 } from './true-flow';
import { buildOracleCapture, ORACLE_SCENARIOS } from './true-flow-oracle.test-data';

describe('UX16.2 hand-calculated true-flow oracle', () => {
    for (const scenario of ORACLE_SCENARIOS) {
        it(`${scenario.id}: ${scenario.title}`, () => {
            const capture = buildOracleCapture(scenario);
            const actual = deriveTrueFlowSnapshotV1(capture, {
                interval: scenario.interval,
                priceBucket: scenario.priceBucket,
                valueAreaFraction: 0.7,
            });
            const expected = scenario.expected;

            expect(actual.totals.tradeCount).toBe(expected.tradeCount);
            expect(actual.totals.buyVolumeBtc).toBeCloseTo(expected.buyVolumeBtc, 12);
            expect(actual.totals.sellVolumeBtc).toBeCloseTo(expected.sellVolumeBtc, 12);
            expect(actual.totals.buyNotionalUsd).toBeCloseTo(expected.buyNotionalUsd, 9);
            expect(actual.totals.sellNotionalUsd).toBeCloseTo(expected.sellNotionalUsd, 9);
            expect(actual.totals.totalNotionalUsd).toBeCloseTo(expected.totalNotionalUsd, 9);
            expect(actual.totals.deltaNotionalUsd).toBeCloseTo(expected.deltaNotionalUsd, 9);

            expect(actual.cvdSegments.length).toBe(expected.cvdSegmentFinals.length);
            actual.cvdSegments.forEach((segment, index) => {
                expect(segment.finalCumulativeDeltaNotionalUsd)
                    .toBeCloseTo(expected.cvdSegmentFinals[index], 9);
            });
            expect(actual.cvdSegments.reduce((sum, segment) => sum + segment.bars.length, 0))
                .toBe(expected.cvdBarCount);
            expect(actual.footprintBars).toHaveLength(expected.footprintBarCount);
            expect(actual.tradeVolumeProfile.rows).toHaveLength(expected.profileRowCount);
            expect(actual.tradeVolumeProfile.pocPrice).toBe(expected.pocPrice);
            expect(actual.tradeVolumeProfile.vahPrice).toBe(expected.vahPrice);
            expect(actual.tradeVolumeProfile.valPrice).toBe(expected.valPrice);
            expect(actual.tradeVolumeProfile.coverageKind).toBe(expected.coverageKind);

            const cellTradeCount = actual.footprintBars.reduce((barSum, bar) =>
                barSum + bar.footprint.cells.reduce((cellSum, cell) => cellSum + cell.tradeCount, 0), 0);
            const cellNotional = actual.footprintBars.reduce((barSum, bar) =>
                barSum + bar.footprint.cells.reduce((cellSum, cell) => cellSum + cell.totalNotionalUsd, 0), 0);
            const profileTradeCount = actual.tradeVolumeProfile.rows.reduce((sum, row) => sum + row.tradeCount, 0);
            const profileNotional = actual.tradeVolumeProfile.rows.reduce((sum, row) => sum + row.totalNotionalUsd, 0);
            const cumulativeDelta = actual.cvdSegments.reduce((sum, segment) =>
                sum + segment.finalCumulativeDeltaNotionalUsd, 0);

            expect(cellTradeCount).toBe(actual.totals.tradeCount);
            expect(profileTradeCount).toBe(actual.totals.tradeCount);
            expect(cellNotional).toBeCloseTo(actual.totals.totalNotionalUsd, 9);
            expect(profileNotional).toBeCloseTo(actual.totals.totalNotionalUsd, 9);
            expect(cumulativeDelta).toBeCloseTo(actual.totals.deltaNotionalUsd, 9);
        });
    }
});
