import { describe, expect, it } from 'vitest';

import {
    AggregateTradeCaptureSnapshotV1Schema,
    ClassifiedTradeV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    TradeCaptureBoundaryV1Schema,
    type ClassifiedTradeV1,
} from './contracts';
import { createCaptureCoverageV1 } from './provenance';
import { deriveTrueFlowSnapshotV1 } from './true-flow';

const BASE_TIME = Date.UTC(2026, 9, 30, 12, 0, 0);

function trade(
    aggregateTradeId: number,
    seconds: number,
    price: number,
    quantityBtc: number,
    aggressor: 'BUY' | 'SELL',
): ClassifiedTradeV1 {
    return ClassifiedTradeV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        venue: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        aggregateTradeId,
        firstTradeId: aggregateTradeId,
        lastTradeId: aggregateTradeId,
        eventTime: BASE_TIME + seconds * 1_000,
        tradeTime: BASE_TIME + seconds * 1_000,
        price,
        quantityBtc,
        notionalUsd: price * quantityBtc,
        aggressor,
        buyerIsMaker: aggressor === 'SELL',
    });
}

function capture(trades: ClassifiedTradeV1[], gap = false) {
    const first = trades[0];
    const last = trades.at(-1);
    const boundaries = [TradeCaptureBoundaryV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        boundaryId: 'capture-start',
        reason: 'CAPTURE_START',
        occurredAt: BASE_TIME,
        previousAggregateTradeId: null,
        nextAggregateTradeId: first?.aggregateTradeId ?? null,
        missingAggregateTradeCount: null,
    })];
    if (gap) {
        boundaries.push(TradeCaptureBoundaryV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            boundaryId: 'gap-103-105',
            reason: 'AGGREGATE_ID_GAP',
            occurredAt: BASE_TIME + 70_000,
            previousAggregateTradeId: 103,
            nextAggregateTradeId: 105,
            missingAggregateTradeCount: 1,
        }));
    }
    const capturedAt = (last?.eventTime ?? BASE_TIME) + 100;
    return AggregateTradeCaptureSnapshotV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        trades,
        boundaries,
        coverage: createCaptureCoverageV1({
            dataMode: 'REPLAY',
            source: 'UX16_FIXTURE',
            venue: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            capturedAt,
            eventTime: last?.eventTime ?? capturedAt,
            coverageStart: first?.tradeTime ?? null,
            coverageEnd: last?.tradeTime ?? null,
            sequenceState: gap ? 'GAP' : 'LIVE',
            gapCount: gap ? 1 : 0,
            precision: 'TRADE',
            approximation: 'NONE',
        }),
        stats: {
            acceptedCount: trades.length,
            duplicateCount: 0,
            outOfOrderCount: 0,
            invalidCount: 0,
            reconnectCount: 0,
        },
        lastAggregateTradeId: last?.aggregateTradeId ?? null,
    });
}

describe('UX16.2 true-flow derivation', () => {
    const uninterrupted = capture([
        trade(101, 5, 100, 1, 'BUY'),
        trade(102, 15, 101, 2, 'SELL'),
        trade(103, 65, 100, 3, 'BUY'),
    ]);

    it('reconciles tape totals across CVD, footprint, and trade VP', () => {
        const result = deriveTrueFlowSnapshotV1(uninterrupted, { interval: '1m', priceBucket: 1 });
        expect(result.totals).toMatchObject({
            tradeCount: 3,
            buyVolumeBtc: 4,
            sellVolumeBtc: 2,
            buyNotionalUsd: 400,
            sellNotionalUsd: 202,
            totalNotionalUsd: 602,
            deltaNotionalUsd: 198,
        });
        expect(result.cvdSegments).toHaveLength(1);
        expect(result.cvdSegments[0].bars.map((bar) => bar.cumulativeDeltaNotionalUsd)).toEqual([-102, 198]);
        expect(result.footprintBars.reduce((sum, bar) => sum + bar.footprint.totalNotionalUsd, 0)).toBe(602);
        expect(result.tradeVolumeProfile.totals).toEqual(result.totals);
        expect(result.tradeVolumeProfile.rows.reduce((sum, row) => sum + row.totalNotionalUsd, 0)).toBe(602);
    });

    it('resets CVD after an aggregate-ID gap', () => {
        const gapped = capture([
            trade(101, 5, 100, 1, 'BUY'),
            trade(102, 15, 101, 1, 'SELL'),
            trade(103, 30, 100, 1, 'BUY'),
            trade(105, 70, 102, 2, 'SELL'),
        ], true);
        const result = deriveTrueFlowSnapshotV1(gapped, { interval: '1m', priceBucket: 1 });
        expect(result.cvdSegments).toHaveLength(2);
        expect(result.cvdSegments[0].finalCumulativeDeltaNotionalUsd).toBe(99);
        expect(result.cvdSegments[1].finalCumulativeDeltaNotionalUsd).toBe(-204);
        expect(result.cvdSegments[1].startReasons).toContain('AGGREGATE_ID_GAP');
        expect(result.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
    });

    it('marks reconnect-created multi-segment profile coverage as gapped', () => {
        const trades = [
            trade(501, 1, 100, 1, 'BUY'),
            trade(502, 2, 100, 1, 'SELL'),
        ];
        const input = capture(trades);
        input.boundaries.push(TradeCaptureBoundaryV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            boundaryId: 'reconnect-501',
            reason: 'RECONNECT',
            occurredAt: BASE_TIME + 1_500,
            previousAggregateTradeId: 501,
            nextAggregateTradeId: null,
            missingAggregateTradeCount: null,
        }));
        const result = deriveTrueFlowSnapshotV1(input, { interval: '1m', priceBucket: 1 });
        expect(result.cvdSegments).toHaveLength(2);
        expect(result.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
    });

    it('does not manufacture empty time intervals or pre-capture footprint cells', () => {
        const result = deriveTrueFlowSnapshotV1(capture([
            trade(201, 125, 100, 1, 'BUY'),
            trade(202, 305, 100, 1, 'SELL'),
        ]), { interval: '1m', priceBucket: 1 });
        expect(result.cvdSegments[0].bars).toHaveLength(2);
        expect(result.footprintBars).toHaveLength(2);
        expect(result.footprintBars[0].footprint.coverage.coverageStart).toBe(BASE_TIME + 125_000);
        expect(result.footprintBars.every((bar) =>
            (bar.footprint.coverage.coverageStart ?? 0) >= BASE_TIME + 125_000
        )).toBe(true);
    });

    it('uses deterministic lower-price tie-breaking for POC', () => {
        const result = deriveTrueFlowSnapshotV1(capture([
            trade(301, 1, 100, 1, 'BUY'),
            trade(302, 2, 101, 100 / 101, 'BUY'),
        ]), { interval: '1m', priceBucket: 1 });
        expect(result.tradeVolumeProfile.pocPrice).toBe(100.5);
        expect(result.footprintBars[0].footprint.pocPrice).toBe(100.5);
    });

    it('keeps UX16.4 imbalance fields disabled', () => {
        const result = deriveTrueFlowSnapshotV1(uninterrupted, { interval: '1m', priceBucket: 1 });
        for (const bar of result.footprintBars) {
            for (const cell of bar.footprint.cells) {
                expect(cell.buyImbalance).toBe(false);
                expect(cell.sellImbalance).toBe(false);
                expect(cell.imbalanceRatio).toBeNull();
            }
        }
    });

    it('calculates deterministic POC, VAH, and VAL from captured trades', () => {
        const result = deriveTrueFlowSnapshotV1(capture([
            trade(401, 1, 100, 4, 'BUY'),
            trade(402, 2, 101, 3, 'SELL'),
            trade(403, 3, 102, 2, 'BUY'),
            trade(404, 4, 103, 1, 'SELL'),
        ]), { interval: '1m', priceBucket: 1, valueAreaFraction: 0.7 });
        expect(result.tradeVolumeProfile.pocPrice).toBe(100.5);
        expect(result.tradeVolumeProfile.valPrice).toBe(100);
        expect(result.tradeVolumeProfile.vahPrice).toBe(103);
    });

    it('rejects an invalid price bucket', () => {
        expect(() => deriveTrueFlowSnapshotV1(uninterrupted, { interval: '1m', priceBucket: 0 })).toThrow(
            'priceBucket must be a positive finite number',
        );
    });
});
