import { describe, expect, it } from 'vitest';

import {
    ClassifiedTradeV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    TradeCaptureBoundaryV1Schema,
    type ClassifiedTradeV1,
} from './contracts';
import { createCaptureCoverageV1 } from './provenance';
import { TrueFlowSessionAccumulator } from './true-flow-session';

const BASE_TIME = Date.UTC(2026, 9, 30, 12, 0, 0);

function trade(id: number, seconds: number, price: number, quantity: number, aggressor: 'BUY' | 'SELL'): ClassifiedTradeV1 {
    return ClassifiedTradeV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        venue: 'BINANCE_SPOT', symbol: 'BTCUSDT', aggregateTradeId: id, firstTradeId: id, lastTradeId: id,
        eventTime: BASE_TIME + seconds * 1_000, tradeTime: BASE_TIME + seconds * 1_000,
        price, quantityBtc: quantity, notionalUsd: price * quantity,
        aggressor, buyerIsMaker: aggressor === 'SELL',
    });
}

function coverage(lastTime: number, gapCount = 0) {
    return createCaptureCoverageV1({
        dataMode: 'REPLAY', source: 'UX16_FIXTURE', venue: 'BINANCE_SPOT', symbol: 'BTCUSDT',
        capturedAt: lastTime + 100, eventTime: lastTime, coverageStart: BASE_TIME, coverageEnd: lastTime,
        sequenceState: gapCount > 0 ? 'GAP' : 'LIVE', gapCount, precision: 'TRADE', approximation: 'NONE',
    });
}

function boundary(reason: 'CAPTURE_START' | 'RECONNECT' | 'AGGREGATE_ID_GAP', previous: number | null, next: number | null) {
    return TradeCaptureBoundaryV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        boundaryId: `${reason}-${previous ?? 'none'}-${next ?? 'none'}`,
        reason,
        occurredAt: BASE_TIME,
        previousAggregateTradeId: previous,
        nextAggregateTradeId: next,
        missingAggregateTradeCount: reason === 'AGGREGATE_ID_GAP' && previous !== null && next !== null ? next - previous - 1 : null,
    });
}

describe('TrueFlowSessionAccumulator', () => {
    it('retains session totals independently of raw-tape retention', () => {
        const session = new TrueFlowSessionAccumulator({ interval: '1m', priceBucket: 1 });
        session.recordBoundary(boundary('CAPTURE_START', null, 1));
        session.ingest(trade(1, 1, 100, 1, 'BUY'));
        session.ingest(trade(2, 2, 101, 1, 'SELL'));
        session.ingest(trade(3, 3, 102, 2, 'BUY'));

        // A raw tape may retain only trade 3 at this point; the compressed
        // session authority must still retain all accepted totals.
        const snapshot = session.snapshot(coverage(BASE_TIME + 3_000));
        expect(snapshot.totals).toMatchObject({ tradeCount: 3, totalNotionalUsd: 405, deltaNotionalUsd: 203 });
        expect(snapshot.tradeVolumeProfile.rows).toHaveLength(3);
        expect(snapshot.footprintBars[0].footprint.cells.reduce((sum, cell) => sum + cell.tradeCount, 0)).toBe(3);
    });

    it('splits reconnect and gap boundaries into discontinuous CVD segments', () => {
        const session = new TrueFlowSessionAccumulator({ interval: '1m', priceBucket: 1 });
        session.recordBoundary(boundary('CAPTURE_START', null, 10));
        session.ingest(trade(10, 1, 100, 1, 'BUY'));
        session.recordBoundary(boundary('RECONNECT', 10, null));
        session.ingest(trade(11, 2, 100, 1, 'SELL'));
        session.recordBoundary(boundary('AGGREGATE_ID_GAP', 11, 13));
        session.ingest(trade(13, 3, 100, 2, 'BUY'));
        const snapshot = session.snapshot(coverage(BASE_TIME + 3_000, 1));
        expect(snapshot.cvdSegments).toHaveLength(3);
        expect(snapshot.cvdSegments.map((segment) => segment.finalCumulativeDeltaNotionalUsd)).toEqual([100, -100, 200]);
        expect(snapshot.cvdSegments[1].startReasons).toEqual(['RECONNECT']);
        expect(snapshot.cvdSegments[2].startReasons).toEqual(['AGGREGATE_ID_GAP']);
        expect(snapshot.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
    });

    it('labels reconnect-split profile coverage as gapped even when supplied gapCount is zero', () => {
        const session = new TrueFlowSessionAccumulator({ interval: '1m', priceBucket: 1 });
        session.recordBoundary(boundary('CAPTURE_START', null, 20));
        session.ingest(trade(20, 1, 100, 1, 'BUY'));
        session.recordBoundary(boundary('RECONNECT', 20, null));
        session.ingest(trade(21, 2, 100, 1, 'SELL'));
        const snapshot = session.snapshot(coverage(BASE_TIME + 2_000, 0));
        expect(snapshot.cvdSegments).toHaveLength(2);
        expect(snapshot.tradeVolumeProfile.coverageKind).toBe('CAPTURED_WITH_GAPS');
    });

    it('fails closed at configured derived-state limits', () => {
        const session = new TrueFlowSessionAccumulator({ interval: '1m', priceBucket: 1, maxProfileRows: 1 });
        session.recordBoundary(boundary('CAPTURE_START', null, 1));
        session.ingest(trade(1, 1, 100, 1, 'BUY'));
        expect(() => session.ingest(trade(2, 2, 101, 1, 'BUY'))).toThrow('profile row limit');
        const snapshot = session.snapshot(coverage(BASE_TIME + 1_000));
        expect(snapshot.totals.tradeCount).toBe(1);
        expect(snapshot.footprintBars[0].footprint.cells).toHaveLength(1);
    });

    it('rejects duplicate or late accepted IDs defensively', () => {
        const session = new TrueFlowSessionAccumulator();
        session.recordBoundary(boundary('CAPTURE_START', null, 1));
        session.ingest(trade(1, 1, 100, 1, 'BUY'));
        expect(() => session.ingest(trade(1, 2, 100, 1, 'BUY'))).toThrow('strictly increasing');
    });
});
