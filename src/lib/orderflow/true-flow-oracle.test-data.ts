import {
    AggregateTradeCaptureSnapshotV1Schema,
    ClassifiedTradeV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    TradeCaptureBoundaryV1Schema,
    type AggregateTradeCaptureSnapshotV1,
    type ClassifiedTradeV1,
    type TradeCaptureBoundaryV1,
} from './contracts';
import { createCaptureCoverageV1 } from './provenance';
import type { TrueFlowInterval, TradeVolumeProfileCoverageKind } from './true-flow-contracts';

export const ORACLE_BASE_TIME = Date.UTC(2026, 9, 30, 12, 0, 0);

type Aggressor = 'BUY' | 'SELL';
type TradeInput = readonly [id: number, seconds: number, price: number, quantityBtc: number, aggressor: Aggressor];
type BoundaryInput = readonly [reason: 'RECONNECT' | 'AGGREGATE_ID_GAP', previousId: number, nextId: number | null];

export interface OracleExpected {
    tradeCount: number;
    buyVolumeBtc: number;
    sellVolumeBtc: number;
    buyNotionalUsd: number;
    sellNotionalUsd: number;
    totalNotionalUsd: number;
    deltaNotionalUsd: number;
    cvdSegmentFinals: number[];
    cvdBarCount: number;
    footprintBarCount: number;
    profileRowCount: number;
    pocPrice: number | null;
    vahPrice: number | null;
    valPrice: number | null;
    coverageKind: TradeVolumeProfileCoverageKind;
}

export interface OracleScenario {
    id: string;
    title: string;
    interval: TrueFlowInterval;
    priceBucket: number;
    trades: readonly TradeInput[];
    boundaries?: readonly BoundaryInput[];
    gapCount?: number;
    expected: OracleExpected;
}

const zero = {
    tradeCount: 0,
    buyVolumeBtc: 0,
    sellVolumeBtc: 0,
    buyNotionalUsd: 0,
    sellNotionalUsd: 0,
    totalNotionalUsd: 0,
    deltaNotionalUsd: 0,
    cvdSegmentFinals: [],
    cvdBarCount: 0,
    footprintBarCount: 0,
    profileRowCount: 0,
    pocPrice: null,
    vahPrice: null,
    valPrice: null,
    coverageKind: 'CAPTURED_EXACT',
} satisfies OracleExpected;

const oneBuy = {
    tradeCount: 1, buyVolumeBtc: 2, sellVolumeBtc: 0,
    buyNotionalUsd: 200, sellNotionalUsd: 0, totalNotionalUsd: 200, deltaNotionalUsd: 200,
    cvdSegmentFinals: [200], cvdBarCount: 1, footprintBarCount: 1, profileRowCount: 1,
    pocPrice: 100.5, vahPrice: 101, valPrice: 100, coverageKind: 'CAPTURED_EXACT',
} satisfies OracleExpected;

const twoBuys = {
    tradeCount: 2, buyVolumeBtc: 2, sellVolumeBtc: 0,
    buyNotionalUsd: 200, sellNotionalUsd: 0, totalNotionalUsd: 200, deltaNotionalUsd: 200,
    cvdSegmentFinals: [200], cvdBarCount: 2, footprintBarCount: 2, profileRowCount: 1,
    pocPrice: 100.5, vahPrice: 101, valPrice: 100, coverageKind: 'CAPTURED_EXACT',
} satisfies OracleExpected;

/** Independent hand-calculated values; no production calculation is called here. */
export const ORACLE_SCENARIOS: readonly OracleScenario[] = [
    {
        id: 'S01', title: 'Clean multi-bar buy/sell reconciliation', interval: '1m', priceBucket: 1,
        trades: [[1, 5, 100, 1, 'BUY'], [2, 15, 101, 2, 'SELL'], [3, 65, 100, 3, 'BUY']],
        expected: {
            tradeCount: 3, buyVolumeBtc: 4, sellVolumeBtc: 2,
            buyNotionalUsd: 400, sellNotionalUsd: 202, totalNotionalUsd: 602, deltaNotionalUsd: 198,
            cvdSegmentFinals: [198], cvdBarCount: 2, footprintBarCount: 2, profileRowCount: 2,
            pocPrice: 100.5, vahPrice: 102, valPrice: 100, coverageKind: 'CAPTURED_EXACT',
        },
    },
    {
        id: 'S02', title: 'Forward aggregate-ID gap', interval: '1m', priceBucket: 1,
        trades: [[1, 5, 100, 1, 'BUY'], [3, 65, 100, 2, 'SELL']],
        boundaries: [['AGGREGATE_ID_GAP', 1, 3]], gapCount: 1,
        expected: {
            tradeCount: 2, buyVolumeBtc: 1, sellVolumeBtc: 2,
            buyNotionalUsd: 100, sellNotionalUsd: 200, totalNotionalUsd: 300, deltaNotionalUsd: -100,
            cvdSegmentFinals: [100, -200], cvdBarCount: 2, footprintBarCount: 2, profileRowCount: 1,
            pocPrice: 100.5, vahPrice: 101, valPrice: 100, coverageKind: 'CAPTURED_WITH_GAPS',
        },
    },
    {
        id: 'S03', title: 'Reconnect with contiguous aggregate IDs', interval: '1m', priceBucket: 1,
        trades: [[1, 5, 100, 1, 'BUY'], [2, 65, 100, 2, 'SELL']],
        boundaries: [['RECONNECT', 1, null]], gapCount: 0,
        expected: {
            tradeCount: 2, buyVolumeBtc: 1, sellVolumeBtc: 2,
            buyNotionalUsd: 100, sellNotionalUsd: 200, totalNotionalUsd: 300, deltaNotionalUsd: -100,
            cvdSegmentFinals: [100, -200], cvdBarCount: 2, footprintBarCount: 2, profileRowCount: 1,
            pocPrice: 100.5, vahPrice: 101, valPrice: 100, coverageKind: 'CAPTURED_WITH_GAPS',
        },
    },
    {
        id: 'S04', title: 'Capture begins inside an interval', interval: '1m', priceBucket: 1,
        trades: [[1, 125, 100, 1, 'BUY']],
        expected: { ...oneBuy, buyVolumeBtc: 1, buyNotionalUsd: 100, totalNotionalUsd: 100, deltaNotionalUsd: 100, cvdSegmentFinals: [100] },
    },
    { id: 'S05', title: 'Empty capture', interval: '1m', priceBucket: 1, trades: [], expected: zero },
    {
        id: 'S06', title: 'Equal notional POC tie chooses lower row', interval: '1m', priceBucket: 1,
        trades: [[1, 5, 100, 1, 'BUY'], [2, 10, 101, 100 / 101, 'SELL']],
        expected: {
            tradeCount: 2, buyVolumeBtc: 1, sellVolumeBtc: 100 / 101,
            buyNotionalUsd: 100, sellNotionalUsd: 100, totalNotionalUsd: 200, deltaNotionalUsd: 0,
            cvdSegmentFinals: [0], cvdBarCount: 1, footprintBarCount: 1, profileRowCount: 2,
            pocPrice: 100.5, vahPrice: 102, valPrice: 100, coverageKind: 'CAPTURED_EXACT',
        },
    },
    {
        id: 'S07', title: 'Fractional BTC and USD notionals', interval: '1m', priceBucket: 1,
        trades: [[1, 5, 100, 0.5, 'BUY'], [2, 10, 101, 0.25, 'SELL']],
        expected: {
            tradeCount: 2, buyVolumeBtc: 0.5, sellVolumeBtc: 0.25,
            buyNotionalUsd: 50, sellNotionalUsd: 25.25, totalNotionalUsd: 75.25, deltaNotionalUsd: 24.75,
            cvdSegmentFinals: [24.75], cvdBarCount: 1, footprintBarCount: 1, profileRowCount: 2,
            pocPrice: 100.5, vahPrice: 102, valPrice: 100, coverageKind: 'CAPTURED_EXACT',
        },
    },
    { id: 'S08', title: 'Empty time interval is not invented', interval: '1m', priceBucket: 1,
      trades: [[1, 5, 100, 1, 'BUY'], [2, 125, 100, 1, 'BUY']], expected: twoBuys },
    { id: 'S09', title: 'Sell-only capture', interval: '1m', priceBucket: 1,
      trades: [[1, 5, 100, 2, 'SELL']], expected: {
        ...oneBuy, buyVolumeBtc: 0, sellVolumeBtc: 2, buyNotionalUsd: 0,
        sellNotionalUsd: 200, deltaNotionalUsd: -200, cvdSegmentFinals: [-200],
      } },
    { id: 'S10', title: 'Buy-only capture', interval: '1m', priceBucket: 1,
      trades: [[1, 5, 100, 2, 'BUY']], expected: oneBuy },
    { id: 'S11', title: 'Price exactly on bucket boundary', interval: '1m', priceBucket: 1,
      trades: [[1, 5, 100, 1, 'BUY'], [2, 10, 101, 1, 'SELL']], expected: {
        tradeCount: 2, buyVolumeBtc: 1, sellVolumeBtc: 1,
        buyNotionalUsd: 100, sellNotionalUsd: 101, totalNotionalUsd: 201, deltaNotionalUsd: -1,
        cvdSegmentFinals: [-1], cvdBarCount: 1, footprintBarCount: 1, profileRowCount: 2,
        pocPrice: 101.5, vahPrice: 102, valPrice: 100, coverageKind: 'CAPTURED_EXACT',
      } },
    { id: 'S12', title: 'Five-minute interval boundary', interval: '5m', priceBucket: 1,
      trades: [[1, 5, 100, 1, 'BUY'], [2, 301, 100, 1, 'BUY']], expected: twoBuys },
    { id: 'S13', title: 'One-hour grouping', interval: '1h', priceBucket: 1,
      trades: [[1, 5, 100, 1, 'BUY'], [2, 301, 100, 1, 'BUY']], expected: { ...twoBuys, cvdBarCount: 1, footprintBarCount: 1 } },
    { id: 'S14', title: 'Four-hour grouping', interval: '4h', priceBucket: 1,
      trades: [[1, 5, 100, 1, 'BUY'], [2, 301, 100, 1, 'BUY']], expected: { ...twoBuys, cvdBarCount: 1, footprintBarCount: 1 } },
    { id: 'S15', title: 'Daily grouping', interval: '1d', priceBucket: 1,
      trades: [[1, 5, 100, 1, 'BUY'], [2, 301, 100, 1, 'BUY']], expected: { ...twoBuys, cvdBarCount: 1, footprintBarCount: 1 } },
    { id: 'S16', title: 'Gap then reconnect', interval: '1m', priceBucket: 1,
      trades: [[1, 5, 100, 1, 'BUY'], [3, 65, 100, 2, 'SELL'], [4, 125, 100, 1, 'BUY']],
      boundaries: [['AGGREGATE_ID_GAP', 1, 3], ['RECONNECT', 3, null]], gapCount: 2,
      expected: {
        tradeCount: 3, buyVolumeBtc: 2, sellVolumeBtc: 2,
        buyNotionalUsd: 200, sellNotionalUsd: 200, totalNotionalUsd: 400, deltaNotionalUsd: 0,
        cvdSegmentFinals: [100, -200, 100], cvdBarCount: 3, footprintBarCount: 3, profileRowCount: 1,
        pocPrice: 100.5, vahPrice: 101, valPrice: 100, coverageKind: 'CAPTURED_WITH_GAPS',
      } },
] as const;

function tradeFrom(input: TradeInput): ClassifiedTradeV1 {
    const [id, seconds, price, quantityBtc, aggressor] = input;
    return ClassifiedTradeV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        venue: 'BINANCE_SPOT', symbol: 'BTCUSDT', aggregateTradeId: id,
        firstTradeId: id, lastTradeId: id,
        eventTime: ORACLE_BASE_TIME + seconds * 1_000,
        tradeTime: ORACLE_BASE_TIME + seconds * 1_000,
        price, quantityBtc, notionalUsd: price * quantityBtc,
        aggressor, buyerIsMaker: aggressor === 'SELL',
    });
}

function boundaryFrom(input: BoundaryInput, index: number): TradeCaptureBoundaryV1 {
    const [reason, previousAggregateTradeId, nextAggregateTradeId] = input;
    return TradeCaptureBoundaryV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        boundaryId: `oracle-boundary-${index}-${reason.toLowerCase()}`,
        reason,
        occurredAt: ORACLE_BASE_TIME + (index + 1) * 60_000,
        previousAggregateTradeId,
        nextAggregateTradeId,
        missingAggregateTradeCount: reason === 'AGGREGATE_ID_GAP' && nextAggregateTradeId !== null
            ? nextAggregateTradeId - previousAggregateTradeId - 1
            : null,
    });
}

export function buildOracleCapture(scenario: OracleScenario): AggregateTradeCaptureSnapshotV1 {
    const trades = scenario.trades.map(tradeFrom);
    const boundaries: TradeCaptureBoundaryV1[] = trades.length > 0 ? [TradeCaptureBoundaryV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        boundaryId: 'oracle-capture-start', reason: 'CAPTURE_START', occurredAt: ORACLE_BASE_TIME,
        previousAggregateTradeId: null, nextAggregateTradeId: trades[0].aggregateTradeId,
        missingAggregateTradeCount: null,
    })] : [];
    boundaries.push(...(scenario.boundaries ?? []).map(boundaryFrom));
    const first = trades[0];
    const last = trades.at(-1);
    const capturedAt = (last?.eventTime ?? ORACLE_BASE_TIME) + 100;
    return AggregateTradeCaptureSnapshotV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        trades,
        boundaries,
        coverage: createCaptureCoverageV1({
            dataMode: 'REPLAY', source: 'UX16_FIXTURE', venue: 'BINANCE_SPOT', symbol: 'BTCUSDT',
            capturedAt,
            eventTime: last?.eventTime ?? capturedAt,
            coverageStart: first?.tradeTime ?? null,
            coverageEnd: last?.tradeTime ?? null,
            sequenceState: scenario.gapCount ? 'GAP' : 'LIVE',
            gapCount: scenario.gapCount ?? 0,
            precision: 'TRADE', approximation: 'NONE',
        }),
        stats: {
            acceptedCount: trades.length, duplicateCount: 0, outOfOrderCount: 0,
            invalidCount: 0, reconnectCount: (scenario.boundaries ?? []).filter((boundary) => boundary[0] === 'RECONNECT').length,
        },
        lastAggregateTradeId: last?.aggregateTradeId ?? null,
    });
}

export function oracleScenario(id: string): OracleScenario {
    const scenario = ORACLE_SCENARIOS.find((candidate) => candidate.id === id);
    if (!scenario) throw new Error(`Unknown oracle scenario: ${id}`);
    return scenario;
}
