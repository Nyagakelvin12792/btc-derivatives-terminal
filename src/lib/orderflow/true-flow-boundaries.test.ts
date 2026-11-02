import { describe, expect, it } from 'vitest';

import { UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1 } from './aggregate-trade-replay-fixtures';
import { replayAggregateTradeCapture } from './aggregate-trade-replay';
import { deriveTrueFlowSnapshotV1 } from './true-flow';
import { oracleScenario } from './true-flow-oracle.test-data';

describe('UX16.2 continuity and capture boundaries', () => {
    it('starts new CVD segments at gap and reconnect boundaries', () => {
        for (const id of ['S04', 'S05']) {
            const scenario = oracleScenario(id);
            const actual = deriveTrueFlowSnapshotV1(scenario.buildCapture(), {
                interval: scenario.interval,
                priceBucket: scenario.priceBucket,
                valueAreaFraction: scenario.valueAreaFraction,
            });
            expect(actual.cvdSegments).toHaveLength(2);
            expect(actual.cvdSegments[0].segmentId).not.toBe(actual.cvdSegments[1].segmentId);
            expect(actual.cvdSegments[1].bars[0].cumulativeDeltaNotionalUsd)
                .toBe(actual.cvdSegments[1].bars[0].deltaNotionalUsd);
            expect(actual.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
        }
    });

    it('does not create footprint cells before the first accepted trade', () => {
        for (const scenario of ORACLE_BOUNDARY_SCENARIOS) {
            const capture = scenario.buildCapture();
            const firstTradeTime = capture.trades[0]?.tradeTime;
            const actual = deriveTrueFlowSnapshotV1(capture, {
                interval: scenario.interval,
                priceBucket: scenario.priceBucket,
                valueAreaFraction: scenario.valueAreaFraction,
            });
            if (firstTradeTime === undefined) {
                expect(actual.footprintBars).toEqual([]);
                continue;
            }
            expect(actual.footprintBars.every((bar) =>
                bar.footprint.coverage.coverageStart !== null
                && bar.footprint.coverage.coverageStart >= firstTradeTime)).toBe(true);
        }
    });

    it('rejects duplicate, late, and malformed source events without adding derived volume', () => {
        const replay = replayAggregateTradeCapture(UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1);
        expect(replay.outcomes.map((outcome) => outcome.status)).toEqual([
            'ACCEPTED', 'ACCEPTED', 'DUPLICATE', 'OUT_OF_ORDER', 'ACCEPTED', 'INVALID',
        ]);
        const actual = deriveTrueFlowSnapshotV1(replay.snapshot, { interval: '1m', priceBucket: 10 });
        expect(actual.totals.tradeCount).toBe(3);
        expect(actual.tradeVolumeProfile.totals.tradeCount).toBe(3);
        expect(actual.cvdSegments).toHaveLength(2);
        expect(actual.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
    });
});

const ORACLE_BOUNDARY_SCENARIOS = [
    oracleScenario('S04'),
    oracleScenario('S05'),
    oracleScenario('S06'),
    oracleScenario('S07'),
    oracleScenario('S16'),
];
