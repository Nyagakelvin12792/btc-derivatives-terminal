import { z } from 'zod';

export const ORDERFLOW_SCHEMA_VERSION = 1 as const;

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveFinite = z.number().positive().max(Number.MAX_VALUE);
const nonNegativeFinite = z.number().nonnegative().max(Number.MAX_VALUE);
const boundedLabel = z.string().trim().min(1).max(160);

function approximatelyEqual(left: number, right: number): boolean {
    const tolerance = Math.max(1e-8, Math.abs(right) * 1e-10);
    return Math.abs(left - right) <= tolerance;
}

export const OrderflowDataModeSchema = z.enum(['LIVE', 'REPLAY', 'SHADOW']);
export const OrderflowSourceSchema = z.enum([
    'BINANCE_SPOT',
    'DERIBIT_OPTIONS',
    'ORDERFLOW_DERIVED',
    'UX16_FIXTURE',
]);
export const OrderflowVenueSchema = z.enum(['BINANCE_SPOT', 'DERIBIT', 'MIXED', 'NOT_APPLICABLE']);
export const OrderflowSequenceStateSchema = z.enum([
    'BUFFERING',
    'LIVE',
    'STALE',
    'GAP',
    'OFFLINE',
    'NOT_APPLICABLE',
]);
export const OrderflowPrecisionSchema = z.enum([
    'TRADE',
    'DEPTH_BUCKET',
    'BAR',
    'MIXED',
    'STRUCTURAL',
]);
export const OrderflowApproximationSchema = z.enum(['NONE', 'BAR_DERIVED', 'MIXED_COVERAGE']);
export const DataQualitySchema = z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE']);

export const CaptureCoverageV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    dataMode: OrderflowDataModeSchema,
    source: OrderflowSourceSchema,
    venue: OrderflowVenueSchema,
    symbol: z.literal('BTCUSDT'),
    capturedAt: safeInteger,
    eventTime: safeInteger,
    coverageStart: safeInteger.nullable(),
    coverageEnd: safeInteger.nullable(),
    freshnessMs: safeInteger,
    sequenceState: OrderflowSequenceStateSchema,
    gapCount: safeInteger,
    precision: OrderflowPrecisionSchema,
    approximation: OrderflowApproximationSchema,
    quality: DataQualitySchema,
}).strict().superRefine((value, context) => {
    const hasStart = value.coverageStart !== null;
    const hasEnd = value.coverageEnd !== null;
    if (hasStart !== hasEnd) {
        context.addIssue({
            code: 'custom',
            message: 'Coverage start and end must either both exist or both be null',
            path: ['coverageEnd'],
        });
    }
    if (value.coverageStart !== null && value.coverageEnd !== null && value.coverageEnd < value.coverageStart) {
        context.addIssue({
            code: 'custom',
            message: 'Coverage end must not precede coverage start',
            path: ['coverageEnd'],
        });
    }
    if (value.approximation === 'NONE' && value.precision === 'MIXED') {
        context.addIssue({
            code: 'custom',
            message: 'Mixed precision must declare an approximation',
            path: ['approximation'],
        });
    }
    if (value.quality === 'HIGH' && (value.sequenceState === 'GAP' || value.sequenceState === 'OFFLINE')) {
        context.addIssue({
            code: 'custom',
            message: 'Gap or offline coverage cannot be high quality',
            path: ['quality'],
        });
    }
});

export type CaptureCoverageV1 = z.infer<typeof CaptureCoverageV1Schema>;

export const ClassifiedTradeV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    venue: z.literal('BINANCE_SPOT'),
    symbol: z.literal('BTCUSDT'),
    aggregateTradeId: safeInteger,
    firstTradeId: safeInteger,
    lastTradeId: safeInteger,
    eventTime: safeInteger,
    tradeTime: safeInteger,
    price: positiveFinite,
    quantityBtc: positiveFinite,
    notionalUsd: positiveFinite,
    aggressor: z.enum(['BUY', 'SELL']),
    buyerIsMaker: z.boolean(),
}).strict().superRefine((value, context) => {
    if (value.lastTradeId < value.firstTradeId) {
        context.addIssue({
            code: 'custom',
            message: 'Last trade ID must not precede first trade ID',
            path: ['lastTradeId'],
        });
    }
    if (!approximatelyEqual(value.notionalUsd, value.price * value.quantityBtc)) {
        context.addIssue({
            code: 'custom',
            message: 'Trade notional must equal price multiplied by quantity',
            path: ['notionalUsd'],
        });
    }
    if ((value.buyerIsMaker && value.aggressor !== 'SELL') || (!value.buyerIsMaker && value.aggressor !== 'BUY')) {
        context.addIssue({
            code: 'custom',
            message: 'Trade aggressor must follow the buyer-maker classification rule',
            path: ['aggressor'],
        });
    }
});

export type ClassifiedTradeV1 = z.infer<typeof ClassifiedTradeV1Schema>;

export const TradeCaptureBoundaryReasonSchema = z.enum([
    'CAPTURE_START',
    'RECONNECT',
    'AGGREGATE_ID_GAP',
]);

export type TradeCaptureBoundaryReason = z.infer<typeof TradeCaptureBoundaryReasonSchema>;

export const TradeCaptureBoundaryV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    boundaryId: z.string().trim().min(1).max(160),
    reason: TradeCaptureBoundaryReasonSchema,
    occurredAt: safeInteger,
    previousAggregateTradeId: safeInteger.nullable(),
    nextAggregateTradeId: safeInteger.nullable(),
    missingAggregateTradeCount: safeInteger.nullable(),
}).strict().superRefine((value, context) => {
    if (value.reason === 'CAPTURE_START' && value.previousAggregateTradeId !== null) {
        context.addIssue({
            code: 'custom',
            message: 'Capture start cannot have a previous aggregate trade ID',
            path: ['previousAggregateTradeId'],
        });
    }
    if (value.reason === 'AGGREGATE_ID_GAP') {
        if (value.previousAggregateTradeId === null || value.nextAggregateTradeId === null) {
            context.addIssue({
                code: 'custom',
                message: 'Aggregate-ID gaps require both boundary IDs',
                path: ['nextAggregateTradeId'],
            });
            return;
        }
        const expectedMissing = value.nextAggregateTradeId - value.previousAggregateTradeId - 1;
        if (expectedMissing <= 0 || value.missingAggregateTradeCount !== expectedMissing) {
            context.addIssue({
                code: 'custom',
                message: 'Aggregate-ID gap count must exactly match the missing ID range',
                path: ['missingAggregateTradeCount'],
            });
        }
    } else if (value.missingAggregateTradeCount !== null) {
        context.addIssue({
            code: 'custom',
            message: 'Only aggregate-ID gaps may declare missing trades',
            path: ['missingAggregateTradeCount'],
        });
    }
});

export type TradeCaptureBoundaryV1 = z.infer<typeof TradeCaptureBoundaryV1Schema>;

export const AggregateTradeCaptureStatsV1Schema = z.object({
    acceptedCount: safeInteger,
    duplicateCount: safeInteger,
    outOfOrderCount: safeInteger,
    invalidCount: safeInteger,
    reconnectCount: safeInteger,
}).strict();

export type AggregateTradeCaptureStatsV1 = z.infer<typeof AggregateTradeCaptureStatsV1Schema>;

export const AggregateTradeCaptureSnapshotV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    trades: z.array(ClassifiedTradeV1Schema).max(100_000),
    boundaries: z.array(TradeCaptureBoundaryV1Schema).max(10_000),
    coverage: CaptureCoverageV1Schema,
    stats: AggregateTradeCaptureStatsV1Schema,
    lastAggregateTradeId: safeInteger.nullable(),
}).strict();

export type AggregateTradeCaptureSnapshotV1 = z.infer<typeof AggregateTradeCaptureSnapshotV1Schema>;

export const AggregateTradeCapabilityV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    enabled: z.boolean(),
    dataMode: z.literal('SHADOW'),
    source: z.literal('BINANCE_SPOT'),
    symbol: z.literal('BTCUSDT'),
}).strict();

export type AggregateTradeCapabilityV1 = z.infer<typeof AggregateTradeCapabilityV1Schema>;

export const FootprintCellV1Schema = z.object({
    priceLow: positiveFinite,
    priceHigh: positiveFinite,
    priceMid: positiveFinite,
    buyVolumeBtc: nonNegativeFinite,
    sellVolumeBtc: nonNegativeFinite,
    buyNotionalUsd: nonNegativeFinite,
    sellNotionalUsd: nonNegativeFinite,
    totalNotionalUsd: nonNegativeFinite,
    deltaNotionalUsd: z.number().finite(),
    tradeCount: safeInteger,
    buyImbalance: z.boolean(),
    sellImbalance: z.boolean(),
    imbalanceRatio: nonNegativeFinite.nullable(),
}).strict().superRefine((value, context) => {
    if (value.priceHigh < value.priceLow || value.priceMid < value.priceLow || value.priceMid > value.priceHigh) {
        context.addIssue({ code: 'custom', message: 'Footprint price bounds are invalid', path: ['priceHigh'] });
    }
    if (value.buyImbalance && value.sellImbalance) {
        context.addIssue({ code: 'custom', message: 'A footprint cell cannot be both buy and sell imbalanced', path: ['sellImbalance'] });
    }
    if (!approximatelyEqual(value.totalNotionalUsd, value.buyNotionalUsd + value.sellNotionalUsd)) {
        context.addIssue({ code: 'custom', message: 'Footprint total notional is inconsistent', path: ['totalNotionalUsd'] });
    }
    if (!approximatelyEqual(value.deltaNotionalUsd, value.buyNotionalUsd - value.sellNotionalUsd)) {
        context.addIssue({ code: 'custom', message: 'Footprint delta notional is inconsistent', path: ['deltaNotionalUsd'] });
    }
});

export type FootprintCellV1 = z.infer<typeof FootprintCellV1Schema>;

export const FootprintBarV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    openTime: safeInteger,
    closeTime: safeInteger,
    interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']),
    priceBucket: positiveFinite,
    cells: z.array(FootprintCellV1Schema).max(5_000),
    totalNotionalUsd: nonNegativeFinite,
    deltaNotionalUsd: z.number().finite(),
    pocPrice: positiveFinite.nullable(),
    minRunningDeltaUsd: z.number().finite(),
    maxRunningDeltaUsd: z.number().finite(),
    coverage: CaptureCoverageV1Schema,
}).strict().superRefine((value, context) => {
    if (value.closeTime <= value.openTime) {
        context.addIssue({ code: 'custom', message: 'Footprint close time must follow open time', path: ['closeTime'] });
    }
    if (value.maxRunningDeltaUsd < value.minRunningDeltaUsd) {
        context.addIssue({ code: 'custom', message: 'Running delta bounds are invalid', path: ['maxRunningDeltaUsd'] });
    }
});

export type FootprintBarV1 = z.infer<typeof FootprintBarV1Schema>;

export const DepthBucketV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    bucketStart: safeInteger,
    bucketEnd: safeInteger,
    priceLow: positiveFinite,
    priceHigh: positiveFinite,
    side: z.enum(['BID', 'ASK']),
    meanNotionalUsd: nonNegativeFinite,
    maxNotionalUsd: nonNegativeFinite,
    endNotionalUsd: nonNegativeFinite,
    addedNotionalUsd: nonNegativeFinite,
    removedNotionalUsd: nonNegativeFinite,
    executedAgainstUsd: nonNegativeFinite,
    persistenceMs: safeInteger,
    observationCount: safeInteger,
    sequenceValid: z.boolean(),
    coverage: CaptureCoverageV1Schema,
}).strict().superRefine((value, context) => {
    if (value.bucketEnd <= value.bucketStart) {
        context.addIssue({ code: 'custom', message: 'Depth bucket end must follow its start', path: ['bucketEnd'] });
    }
    if (value.priceHigh < value.priceLow) {
        context.addIssue({ code: 'custom', message: 'Depth price bounds are invalid', path: ['priceHigh'] });
    }
    if (value.maxNotionalUsd < value.meanNotionalUsd) {
        context.addIssue({ code: 'custom', message: 'Maximum depth cannot be below mean depth', path: ['maxNotionalUsd'] });
    }
});

export type DepthBucketV1 = z.infer<typeof DepthBucketV1Schema>;

export const EvidenceKindSchema = z.enum([
    'STRUCTURAL_LEVEL',
    'PERSISTENT_LIQUIDITY',
    'LIQUIDITY_ADD',
    'LIQUIDITY_PULL',
    'PROBABLE_REPLENISHMENT',
    'BUY_IMBALANCE',
    'SELL_IMBALANCE',
    'STACKED_BUY_IMBALANCE',
    'STACKED_SELL_IMBALANCE',
    'BULLISH_ABSORPTION',
    'BEARISH_ABSORPTION',
    'BULLISH_CVD_DIVERGENCE',
    'BEARISH_CVD_DIVERGENCE',
    'ACCEPTANCE_ABOVE',
    'ACCEPTANCE_BELOW',
    'DATA_CONFLICT',
]);

export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const MarketEvidenceV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    kind: EvidenceKindSchema,
    direction: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
    startTime: safeInteger,
    endTime: safeInteger.nullable(),
    priceLow: positiveFinite,
    priceHigh: positiveFinite,
    strengthPercentile: z.number().min(0).max(100),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    reasonCodes: z.array(z.string().trim().min(1).max(64)).max(32),
    sourceRefs: z.array(z.string().trim().min(1).max(160)).max(32),
    quality: CaptureCoverageV1Schema,
    invalidatedAt: safeInteger.nullable(),
}).strict().superRefine((value, context) => {
    if (value.endTime !== null && value.endTime < value.startTime) {
        context.addIssue({ code: 'custom', message: 'Evidence end time must not precede its start', path: ['endTime'] });
    }
    if (value.priceHigh < value.priceLow) {
        context.addIssue({ code: 'custom', message: 'Evidence price bounds are invalid', path: ['priceHigh'] });
    }
    if (value.invalidatedAt !== null && value.invalidatedAt < value.startTime) {
        context.addIssue({ code: 'custom', message: 'Evidence invalidation must not precede its start', path: ['invalidatedAt'] });
    }
});

export type MarketEvidenceV1 = z.infer<typeof MarketEvidenceV1Schema>;

export const SetupStateSchema = z.enum([
    'NO_SETUP',
    'WATCH_LONG',
    'WATCH_SHORT',
    'CONFIRMING_LONG',
    'CONFIRMING_SHORT',
    'A_GRADE_LONG',
    'A_GRADE_SHORT',
    'INVALIDATED',
    'AVOID',
    'INSUFFICIENT_DATA',
]);

export type SetupState = z.infer<typeof SetupStateSchema>;

const gateState = z.enum(['PASS', 'FAIL', 'MISSING']);
const enhancerState = z.enum(['ALIGNED', 'CONFLICTING', 'UNAVAILABLE']);

export const SetupAssessmentV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    state: SetupStateSchema,
    asOf: safeInteger,
    symbol: z.literal('BTCUSDT'),
    contextTimeframes: z.tuple([z.literal('4h'), z.literal('1h')]),
    triggerTimeframe: z.enum(['1m', '5m']),
    zone: z.object({ low: positiveFinite, high: positiveFinite, label: boundedLabel }).strict().nullable(),
    trigger: z.object({ description: boundedLabel, price: positiveFinite.nullable() }).strict().nullable(),
    invalidation: z.object({ description: boundedLabel, price: positiveFinite.nullable() }).strict().nullable(),
    mandatoryGates: z.record(z.string().trim().min(1).max(64), gateState),
    enhancers: z.record(z.string().trim().min(1).max(64), enhancerState),
    evidenceIds: z.array(z.string().trim().min(1).max(128)).max(64),
    conflictIds: z.array(z.string().trim().min(1).max(128)).max(64),
    grade: z.enum(['A', 'B', 'WATCH', 'NONE']),
    dataQuality: CaptureCoverageV1Schema,
    deterministicVersion: z.string().trim().min(1).max(64),
}).strict().superRefine((value, context) => {
    if (value.zone !== null && value.zone.high < value.zone.low) {
        context.addIssue({ code: 'custom', message: 'Setup zone bounds are invalid', path: ['zone', 'high'] });
    }
    const isAGradeState = value.state === 'A_GRADE_LONG' || value.state === 'A_GRADE_SHORT';
    if ((value.grade === 'A') !== isAGradeState) {
        context.addIssue({ code: 'custom', message: 'Grade A must correspond to an A-grade setup state', path: ['grade'] });
    }
    if (value.grade === 'A' && Object.values(value.mandatoryGates).some((gate) => gate !== 'PASS')) {
        context.addIssue({ code: 'custom', message: 'Grade A requires every mandatory gate to pass', path: ['mandatoryGates'] });
    }
    if (value.grade === 'A' && value.dataQuality.quality !== 'HIGH') {
        context.addIssue({ code: 'custom', message: 'Grade A requires high data quality', path: ['dataQuality', 'quality'] });
    }
    if (value.grade === 'A' && (value.trigger === null || value.invalidation === null)) {
        context.addIssue({ code: 'custom', message: 'Grade A requires a trigger and invalidation', path: ['trigger'] });
    }
});

export type SetupAssessmentV1 = z.infer<typeof SetupAssessmentV1Schema>;

export const DataIntegrityStatusSchema = z.enum([
    'LOADING',
    'READY',
    'PARTIAL',
    'STALE',
    'UNAVAILABLE',
    'ERROR',
    'REPLAY',
    'SHADOW',
]);

export type DataIntegrityStatus = z.infer<typeof DataIntegrityStatusSchema>;

export const DataIntegritySourceV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    key: z.enum(['CANDLES', 'OPTIONS', 'DEPTH', 'TRADES', 'SETUP', 'JEV']),
    label: boundedLabel,
    status: DataIntegrityStatusSchema,
    detail: z.string().trim().max(240).nullable(),
    coverage: CaptureCoverageV1Schema,
}).strict();

export type DataIntegritySourceV1 = z.infer<typeof DataIntegritySourceV1Schema>;

export const Ux16ContractFixtureV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    fixtureId: z.string().trim().min(1).max(128),
    scenario: boundedLabel,
    dataMode: z.literal('REPLAY'),
    trades: z.array(ClassifiedTradeV1Schema).max(10_000),
    depthBuckets: z.array(DepthBucketV1Schema).max(10_000),
    evidence: z.array(MarketEvidenceV1Schema).max(1_000),
    setup: SetupAssessmentV1Schema,
    integrity: z.array(DataIntegritySourceV1Schema).min(1).max(16),
}).strict();

export type Ux16ContractFixtureV1 = z.infer<typeof Ux16ContractFixtureV1Schema>;
