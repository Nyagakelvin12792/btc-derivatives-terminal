import { z } from 'zod';
import {
    CaptureCoverageV1Schema,
    FootprintCellV1Schema,
    MarketEvidenceV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
} from './contracts';

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveFinite = z.number().positive().max(Number.MAX_VALUE);
const nonNegativeFinite = z.number().nonnegative().max(Number.MAX_VALUE);
const finite = z.number().finite();

/**
 * Configuration options for Footprint diagonal and stacked imbalance.
 * Section 12.3: Initial research defaults: ratio 3.0, stacked rows 3, ignore zero 1.
 */
export const ImbalanceConfigV1Schema = z.object({
    ratioThreshold: z.number().min(1.0).max(100).default(3.0),
    minDominantNotionalUsd: nonNegativeFinite.default(50_000),
    minDeltaNotionalUsd: nonNegativeFinite.default(25_000),
    stackedRowCount: z.number().int().min(2).max(10).default(3),
    ignoreZeroComparisons: z.boolean().default(true),
}).strict();

export type ImbalanceConfigV1 = z.infer<typeof ImbalanceConfigV1Schema>;

export const DEFAULT_IMBALANCE_CONFIG: ImbalanceConfigV1 = {
    ratioThreshold: 3.0,
    minDominantNotionalUsd: 50_000,
    minDeltaNotionalUsd: 25_000,
    stackedRowCount: 3,
    ignoreZeroComparisons: true,
};

/**
 * Stacked imbalance zone representing consecutive adjacent footprint rows.
 */
export const StackedImbalanceZoneV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    side: z.enum(['BUY', 'SELL']),
    priceLow: positiveFinite,
    priceHigh: positiveFinite,
    rowCount: z.number().int().min(2).max(100),
    totalNotionalUsd: nonNegativeFinite,
    dominantNotionalUsd: nonNegativeFinite,
    meanRatio: positiveFinite,
    candleOpenTime: safeInteger,
}).strict();

export type StackedImbalanceZoneV1 = z.infer<typeof StackedImbalanceZoneV1Schema>;

/**
 * Section 12.6: Queue imbalance across declared basis-point windows (5, 10, 25 bps).
 */
export const QueueImbalanceWindowV1Schema = z.object({
    windowBps: z.number().positive().max(10_000),
    bidDepthNotionalUsd: nonNegativeFinite,
    askDepthNotionalUsd: nonNegativeFinite,
    imbalance: z.number().min(-1).max(1),
    timestamp: safeInteger,
}).strict();

export type QueueImbalanceWindowV1 = z.infer<typeof QueueImbalanceWindowV1Schema>;

/**
 * Section 12.7: Cont-style Order Flow Imbalance (OFI).
 */
export const OrderFlowImbalanceV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    eventTime: safeInteger,
    rawOfi: finite,
    normalizedOfi: z.number().min(-1).max(1),
    windowMs: z.number().int().positive(),
    sequenceValid: z.boolean(),
}).strict();

export type OrderFlowImbalanceV1 = z.infer<typeof OrderFlowImbalanceV1Schema>;

/**
 * Section 12.8: Liquidity persistence tracked by continuous time, not message count.
 */
export const LiquidityPersistenceV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    priceBucket: positiveFinite,
    side: z.enum(['BID', 'ASK']),
    firstSeenTime: safeInteger,
    lastSeenTime: safeInteger,
    persistenceMs: safeInteger,
    meanNotionalUsd: nonNegativeFinite,
    maxNotionalUsd: nonNegativeFinite,
    endNotionalUsd: nonNegativeFinite,
    timeAboveThresholdMs: safeInteger,
    isPersistent: z.boolean(),
    sequenceValid: z.boolean(),
}).strict().superRefine((value, context) => {
    if (value.lastSeenTime < value.firstSeenTime) {
        context.addIssue({ code: 'custom', message: 'Last seen time cannot precede first seen time', path: ['lastSeenTime'] });
    }
    if (value.maxNotionalUsd < value.meanNotionalUsd) {
        context.addIssue({ code: 'custom', message: 'Max notional cannot be less than mean notional', path: ['maxNotionalUsd'] });
    }
});

export type LiquidityPersistenceV1 = z.infer<typeof LiquidityPersistenceV1Schema>;

/**
 * Section 12.9: Add and Pull event estimation.
 * Explicitly labelled as estimated since market by price (MBP) cannot attribute cancellations with certainty.
 */
export const AddPullEventV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    eventTime: safeInteger,
    priceBucket: positiveFinite,
    side: z.enum(['BID', 'ASK']),
    netBookChangeUsd: finite,
    estimatedAddUsd: nonNegativeFinite,
    estimatedRemoveUsd: nonNegativeFinite,
    observedExecutionUsd: nonNegativeFinite,
    estimatedPullUsd: nonNegativeFinite,
    isEstimated: z.literal(true),
}).strict();

export type AddPullEventV1 = z.infer<typeof AddPullEventV1Schema>;

/**
 * Section 12.10: Probable replenishment candidate.
 * Mandatory label: PROBABLE_REPLENISHMENT; never ICEBERG_CONFIRMED.
 */
export const ProbableReplenishmentV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    eventTime: safeInteger,
    priceBucket: positiveFinite,
    side: z.enum(['BID', 'ASK']),
    executedAgainstNotionalUsd: positiveFinite,
    refilledNotionalUsd: positiveFinite,
    refillRatio: positiveFinite,
    timeToRefillMs: safeInteger,
    repeatCount: z.number().int().positive(),
    label: z.literal('PROBABLE_REPLENISHMENT'),
    sequenceValid: z.boolean(),
}).strict();

export type ProbableReplenishmentV1 = z.infer<typeof ProbableReplenishmentV1Schema>;

/**
 * Composite Microstructure snapshot for a trading session.
 */
export const MicrostructureSnapshotV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    timestamp: safeInteger,
    queueImbalances: z.array(QueueImbalanceWindowV1Schema),
    recentOfi: OrderFlowImbalanceV1Schema.nullable(),
    persistentWalls: z.array(LiquidityPersistenceV1Schema).max(50),
    addPullEvents: z.array(AddPullEventV1Schema).max(100),
    replenishments: z.array(ProbableReplenishmentV1Schema).max(50),
    stackedImbalances: z.array(StackedImbalanceZoneV1Schema).max(50),
    coverage: CaptureCoverageV1Schema,
}).strict();

export type MicrostructureSnapshotV1 = z.infer<typeof MicrostructureSnapshotV1Schema>;
