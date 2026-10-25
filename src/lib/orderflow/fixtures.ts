import {
    DataIntegritySourceV1Schema,
    DepthBucketV1Schema,
    MarketEvidenceV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    SetupAssessmentV1Schema,
    Ux16ContractFixtureV1Schema,
    type Ux16ContractFixtureV1,
} from './contracts';
import { createCaptureCoverageV1 } from './provenance';
import { parseBinanceAggregateTrade } from './trade-classifier';

const FIXTURE_START = 1_761_350_400_000;
const FIXTURE_END = FIXTURE_START + 60_000;

const tapeCoverage = createCaptureCoverageV1({
    dataMode: 'REPLAY',
    source: 'UX16_FIXTURE',
    venue: 'BINANCE_SPOT',
    symbol: 'BTCUSDT',
    capturedAt: FIXTURE_END + 100,
    eventTime: FIXTURE_END,
    coverageStart: FIXTURE_START,
    coverageEnd: FIXTURE_END,
    sequenceState: 'LIVE',
    gapCount: 0,
    precision: 'TRADE',
    approximation: 'NONE',
});

const depthCoverage = createCaptureCoverageV1({
    ...tapeCoverage,
    precision: 'DEPTH_BUCKET',
});

const optionsCoverage = createCaptureCoverageV1({
    dataMode: 'REPLAY',
    source: 'DERIBIT_OPTIONS',
    venue: 'DERIBIT',
    symbol: 'BTCUSDT',
    capturedAt: FIXTURE_END + 100,
    eventTime: FIXTURE_END - 2_500,
    coverageStart: FIXTURE_START,
    coverageEnd: FIXTURE_END,
    sequenceState: 'NOT_APPLICABLE',
    gapCount: 0,
    precision: 'STRUCTURAL',
    approximation: 'NONE',
});

const firstTrade = parseBinanceAggregateTrade({
    e: 'aggTrade', E: FIXTURE_START + 10_000, s: 'BTCUSDT', a: 40_001,
    p: '80250.00', q: '0.750', f: 70_001, l: 70_003, T: FIXTURE_START + 9_990,
    m: false, M: true,
});

const secondTrade = parseBinanceAggregateTrade({
    e: 'aggTrade', E: FIXTURE_START + 25_000, s: 'BTCUSDT', a: 40_002,
    p: '80240.00', q: '1.250', f: 70_004, l: 70_008, T: FIXTURE_START + 24_990,
    m: true, M: true,
}, { previousAggregateTradeId: firstTrade.aggregateTradeId });

const depthBucket = DepthBucketV1Schema.parse({
    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
    bucketStart: FIXTURE_START,
    bucketEnd: FIXTURE_END,
    priceLow: 80_230,
    priceHigh: 80_240,
    side: 'BID',
    meanNotionalUsd: 480_000,
    maxNotionalUsd: 610_000,
    endNotionalUsd: 520_000,
    addedNotionalUsd: 150_000,
    removedNotionalUsd: 110_000,
    executedAgainstUsd: 100_300,
    persistenceMs: 48_000,
    observationCount: 96,
    sequenceValid: true,
    coverage: depthCoverage,
});

const evidence = MarketEvidenceV1Schema.parse({
    id: 'fixture-persistent-bid-80240',
    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
    kind: 'PERSISTENT_LIQUIDITY',
    direction: 'BULLISH',
    startTime: FIXTURE_START,
    endTime: FIXTURE_END,
    priceLow: 80_230,
    priceHigh: 80_240,
    strengthPercentile: 94,
    confidence: 'MEDIUM',
    reasonCodes: ['FIXTURE_PERSISTENCE_ONLY'],
    sourceRefs: ['depth-bucket:fixture:80230-80240'],
    quality: depthCoverage,
    invalidatedAt: null,
});

const setup = SetupAssessmentV1Schema.parse({
    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
    state: 'WATCH_LONG',
    asOf: FIXTURE_END,
    symbol: 'BTCUSDT',
    contextTimeframes: ['4h', '1h'],
    triggerTimeframe: '5m',
    zone: { low: 80_200, high: 80_260, label: 'REPLAY decision zone' },
    trigger: { description: 'Await deterministic execution confirmation', price: null },
    invalidation: { description: 'Replay invalidation below the decision zone', price: 80_190 },
    mandatoryGates: {
        dataIntegrity: 'PASS',
        location: 'PASS',
        aggression: 'MISSING',
        response: 'MISSING',
        confirmation: 'MISSING',
        invalidation: 'PASS',
        riskCompatibility: 'MISSING',
    },
    enhancers: {
        persistentLiquidity: 'ALIGNED',
        optionsStructure: 'UNAVAILABLE',
    },
    evidenceIds: [evidence.id],
    conflictIds: [],
    grade: 'WATCH',
    dataQuality: tapeCoverage,
    deterministicVersion: 'ux16-fixture-v1',
});

const integrity = [
    DataIntegritySourceV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        key: 'CANDLES',
        label: 'Binance candles replay',
        status: 'REPLAY',
        detail: 'Deterministic UX16.0 fixture; not live market data.',
        coverage: { ...tapeCoverage, precision: 'BAR', approximation: 'BAR_DERIVED', quality: 'MEDIUM' },
    }),
    DataIntegritySourceV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        key: 'OPTIONS',
        label: 'Deribit options replay',
        status: 'REPLAY',
        detail: 'Deterministic UX16.0 fixture; not live market data.',
        coverage: optionsCoverage,
    }),
    DataIntegritySourceV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        key: 'DEPTH',
        label: 'Binance L2 replay',
        status: 'REPLAY',
        detail: 'Deterministic UX16.0 fixture; not live market data.',
        coverage: depthCoverage,
    }),
    DataIntegritySourceV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        key: 'TRADES',
        label: 'Binance tape replay',
        status: 'REPLAY',
        detail: 'Deterministic UX16.0 fixture; not live market data.',
        coverage: tapeCoverage,
    }),
    DataIntegritySourceV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        key: 'JEV',
        label: 'Jev shadow disabled',
        status: 'SHADOW',
        detail: 'UX16.7 has not been authorized.',
        coverage: createCaptureCoverageV1({
            dataMode: 'SHADOW',
            source: 'UX16_FIXTURE',
            venue: 'NOT_APPLICABLE',
            symbol: 'BTCUSDT',
            capturedAt: FIXTURE_END,
            eventTime: FIXTURE_END,
            coverageStart: null,
            coverageEnd: null,
            sequenceState: 'OFFLINE',
            gapCount: 0,
            precision: 'STRUCTURAL',
            approximation: 'NONE',
        }),
    }),
];

export const UX16_DATA_INTEGRITY_STATUS_FIXTURES_V1 = Object.freeze(
    [
        'LOADING',
        'READY',
        'PARTIAL',
        'STALE',
        'UNAVAILABLE',
        'ERROR',
        'REPLAY',
        'SHADOW',
    ].map((status, index) => DataIntegritySourceV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        key: status === 'SHADOW' ? 'JEV' : 'TRADES',
        label: `UX16.0 ${status.toLowerCase()} visual fixture`,
        status,
        detail: 'UI-state fixture only; never present this as live market data.',
        coverage: status === 'SHADOW'
            ? createCaptureCoverageV1({
                dataMode: 'SHADOW',
                source: 'UX16_FIXTURE',
                venue: 'NOT_APPLICABLE',
                symbol: 'BTCUSDT',
                capturedAt: FIXTURE_END + index,
                eventTime: FIXTURE_END,
                coverageStart: null,
                coverageEnd: null,
                sequenceState: 'OFFLINE',
                gapCount: 0,
                precision: 'STRUCTURAL',
                approximation: 'NONE',
            })
            : createCaptureCoverageV1({
                ...tapeCoverage,
                capturedAt: FIXTURE_END + 100 + index,
                quality: status === 'UNAVAILABLE' || status === 'ERROR' ? 'UNAVAILABLE' : undefined,
            }),
    })),
);

export const UX16_REPLAY_CONTRACT_FIXTURE_V1: Ux16ContractFixtureV1 = Ux16ContractFixtureV1Schema.parse({
    schemaVersion: ORDERFLOW_SCHEMA_VERSION,
    fixtureId: 'ux16-contract-replay-v1',
    scenario: 'Replay-only persistent bid waiting for execution confirmation',
    dataMode: 'REPLAY',
    trades: [firstTrade, secondTrade],
    depthBuckets: [depthBucket],
    evidence: [evidence],
    setup,
    integrity,
});
