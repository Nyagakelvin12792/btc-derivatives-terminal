import { describe, expect, it } from 'vitest';

import { deriveTrueFlowSnapshotV1 } from './true-flow';
import { ORACLE_SCENARIOS } from './true-flow-oracle.test-data';

describe('UX16.2 independent true-flow oracle', () => {
    for (const scenario of ORACLE_SCENARIOS) {
        it(`${scenario.id}: ${scenario.title}`, () => {
            const capture = scenario.buildCapture();
            const actual = deriveTrueFlowSnapshotV1(capture, {
                interval: scenario.interval,
                priceBucket: scenario.priceBucket,
                valueAreaFraction: scenario.valueAreaFraction,
            });

            // Expected cells and totals are explicit literals in the oracle;
            // they are not computed by a second copy of the production engine.
            expect(actual).toEqual(scenario.expected);

            const footprintTradeCount = actual.footprintBars.reduce((sum, bar) =>
                sum + bar.footprint.cells.reduce((cellSum, cell) => cellSum + cell.tradeCount, 0), 0);
            const footprintNotional = actual.footprintBars.reduce((sum, bar) =>
                sum + bar.footprint.totalNotionalUsd, 0);
            const profileTradeCount = actual.tradeVolumeProfile.rows.reduce((sum, row) => sum + row.tradeCount, 0);
            const profileNotional = actual.tradeVolumeProfile.rows.reduce((sum, row) => sum + row.totalNotionalUsd, 0);
            const cvdDelta = actual.cvdSegments.reduce((sum, segment) =>
                sum + segment.finalCumulativeDeltaNotionalUsd, 0);

            expect(footprintTradeCount).toBe(actual.totals.tradeCount);
            expect(profileTradeCount).toBe(actual.totals.tradeCount);
            expect(footprintNotional).toBeCloseTo(actual.totals.totalNotionalUsd, 9);
            expect(profileNotional).toBeCloseTo(actual.totals.totalNotionalUsd, 9);
            expect(cvdDelta).toBeCloseTo(actual.totals.deltaNotionalUsd, 9);
        });
    }

    it('keeps every UX16.4 imbalance flag absent from true-flow cells', () => {
        for (const scenario of ORACLE_SCENARIOS) {
            const actual = deriveTrueFlowSnapshotV1(scenario.buildCapture(), {
                interval: scenario.interval,
                priceBucket: scenario.priceBucket,
                valueAreaFraction: scenario.valueAreaFraction,
            });
            for (const bar of actual.footprintBars) {
                for (const cell of bar.footprint.cells) {
                    expect(cell.buyImbalance).toBe(false);
                    expect(cell.sellImbalance).toBe(false);
                    expect(cell.imbalanceRatio).toBeNull();
                }
            }
        }
    });
});
