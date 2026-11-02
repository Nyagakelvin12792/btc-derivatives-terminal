import { describe, expect, it } from 'vitest';

import { UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1 } from './aggregate-trade-replay-fixtures';
import { replayAggregateTradeCapture } from './aggregate-trade-replay';
import { deriveTrueFlowSnapshotV1 } from './true-flow';
import { buildOracleCapture, oracleScenario } from './true-flow-oracle.test-data';

function derive(id: string) {
    const scenario = oracleScenario(id);
    return deriveTrueFlowSnapshotV1(buildOracleCapture(scenario), {
        interval: scenario.interval,
        priceBucket: scenario.priceBucket,
        valueAreaFraction: 0.7,
    });
}

describe('UX16.2 capture boundaries', () => {
    it('resets CVD on gaps and reconnects without linking segments', () => {
        for (const id of ['S02', 'S03', 'S16']) {
            const result = derive(id);
            expect(result.cvdSegments.length).toBeGreaterThan(1);
            expect(result.cvdSegments[1].bars[0].cumulativeDeltaNotionalUsd)
                .toBe(result.cvdSegments[1].bars[0].deltaNotionalUsd);
            expect(result.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
        }
        expect(derive('S02').cvdSegments[1].startReasons).toContain('AGGREGATE_ID_GAP');
        expect(derive('S03').cvdSegments[1].startReasons).toContain('RECONNECT');
    });

    it('does not make footprint coverage extend before the first trade', () => {
        const result = derive('S04');
        const firstTradeTime = buildOracleCapture(oracleScenario('S04')).trades[0].tradeTime;
        expect(result.footprintBars[0].footprint.coverage.coverageStart).toBe(firstTradeTime);
        expect(result.footprintBars.every((bar) =>
            bar.footprint.coverage.coverageStart !== null
            && bar.footprint.coverage.coverageStart >= firstTradeTime)).toBe(true);
        expect(derive('S05').footprintBars).toEqual([]);
    });

    it('does not invent an empty intermediate interval', () => {
        const result = derive('S08');
        expect(result.cvdSegments[0].bars).toHaveLength(2);
        expect(result.cvdSegments[0].bars.map((bar) => bar.openTime)).toEqual([
            Date.UTC(2026, 9, 30, 12, 0),
            Date.UTC(2026, 9, 30, 12, 2),
        ]);
    });

    it('rejects duplicate, late, and malformed source events before derivation', () => {
        const replay = replayAggregateTradeCapture(UX16_AGGREGATE_TRADE_REPLAY_FIXTURE_V1);
        expect(replay.outcomes.map((outcome) => outcome.status)).toEqual([
            'ACCEPTED', 'ACCEPTED', 'DUPLICATE', 'OUT_OF_ORDER', 'ACCEPTED', 'INVALID',
        ]);
        const result = deriveTrueFlowSnapshotV1(replay.snapshot, { interval: '1m', priceBucket: 10 });
        expect(result.totals.tradeCount).toBe(3);
        expect(result.tradeVolumeProfile.totals.tradeCount).toBe(3);
        expect(result.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
    });

    it('keeps UX16.4 imbalance flags disabled in every oracle cell', () => {
        for (const id of ['S01', 'S02', 'S07']) {
            const result = derive(id);
            for (const bar of result.footprintBars) {
                for (const cell of bar.footprint.cells) {
                    expect(cell.buyImbalance).toBe(false);
                    expect(cell.sellImbalance).toBe(false);
                    expect(cell.imbalanceRatio).toBeNull();
                }
            }
        }
    });
});
