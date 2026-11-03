import { z } from 'zod';
import {
    CaptureCoverageV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
} from './contracts';

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveFinite = z.number().positive().max(Number.MAX_VALUE);
const nonNegativeFinite = z.number().nonnegative().max(Number.MAX_VALUE);

export const DecisionZoneKindSchema = z.enum([
    'CALL_WALL',
    'PUT_WALL',
    'GAMMA_FLIP',
    'VALUE_AREA_HIGH',
    'VALUE_AREA_LOW',
    'POINT_OF_CONTROL',
    'HIGH_VOLUME_NODE',
    'LOW_VOLUME_NODE',
    'PERSISTENT_LIQUIDITY_WALL',
    'USER_DEFINED_LEVEL',
]);

export type DecisionZoneKind = z.infer<typeof DecisionZoneKindSchema>;

export const DecisionZoneV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    name: z.string().trim().min(1).max(128),
    kind: DecisionZoneKindSchema,
    priceLow: positiveFinite,
    priceHigh: positiveFinite,
    midPrice: positiveFinite,
    toleranceUsd: nonNegativeFinite,
    strengthScore: z.number().min(0).max(100),
    contributors: z.array(z.string().trim().min(1).max(128)).min(1).max(16),
    sources: z.array(z.string().trim().min(1).max(64)).min(1).max(16),
    isApproximate: z.boolean(),
    asOf: safeInteger,
}).strict().superRefine((val, ctx) => {
    if (val.priceHigh < val.priceLow) {
        ctx.addIssue({ code: 'custom', message: 'priceHigh cannot be less than priceLow', path: ['priceHigh'] });
    }
    if (val.midPrice < val.priceLow || val.midPrice > val.priceHigh) {
        ctx.addIssue({ code: 'custom', message: 'midPrice must be within priceLow and priceHigh', path: ['midPrice'] });
    }
});

export type DecisionZoneV1 = z.infer<typeof DecisionZoneV1Schema>;

export const AbsorptionObservationV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    side: z.enum(['BULLISH', 'BEARISH']),
    zoneId: z.string().trim().min(1).max(128),
    priceLow: positiveFinite,
    priceHigh: positiveFinite,
    aggressiveVolumeUsd: positiveFinite,
    aggressiveDeltaUsd: z.number().finite(),
    priceDisplacementUsd: nonNegativeFinite,
    absorptionRatio: positiveFinite,
    startTime: safeInteger,
    endTime: safeInteger,
    hasLiquiditySupport: z.boolean(),
    confirmations: z.array(z.string().trim().min(1).max(64)),
    reasonCodes: z.array(z.string().trim().min(1).max(64)).min(1),
    sourceRefs: z.array(z.string().trim().min(1).max(160)).min(1),
}).strict().superRefine((val, ctx) => {
    if (val.priceHigh < val.priceLow) {
        ctx.addIssue({ code: 'custom', message: 'priceHigh cannot be less than priceLow', path: ['priceHigh'] });
    }
    if (val.endTime < val.startTime) {
        ctx.addIssue({ code: 'custom', message: 'endTime cannot precede startTime', path: ['endTime'] });
    }
});

export type AbsorptionObservationV1 = z.infer<typeof AbsorptionObservationV1Schema>;

export const AcceptanceObservationV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    side: z.enum(['ABOVE', 'BELOW']),
    zoneId: z.string().trim().min(1).max(128),
    levelPrice: positiveFinite,
    breakoutVolumeUsd: positiveFinite,
    breakoutDeltaUsd: z.number().finite(),
    dwellDurationMs: nonNegativeFinite,
    closedBeyond: z.boolean(),
    startTime: safeInteger,
    endTime: safeInteger,
    reasonCodes: z.array(z.string().trim().min(1).max(64)).min(1),
    sourceRefs: z.array(z.string().trim().min(1).max(160)).min(1),
}).strict().superRefine((val, ctx) => {
    if (val.endTime < val.startTime) {
        ctx.addIssue({ code: 'custom', message: 'endTime cannot precede startTime', path: ['endTime'] });
    }
});

export type AcceptanceObservationV1 = z.infer<typeof AcceptanceObservationV1Schema>;

export const PivotPointV1Schema = z.object({
    time: safeInteger,
    price: positiveFinite,
    value: z.number().finite(),
}).strict();

export type PivotPointV1 = z.infer<typeof PivotPointV1Schema>;

export const CvdDivergenceV1Schema = z.object({
    id: z.string().trim().min(1).max(128),
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    kind: z.enum(['BULLISH_CVD_DIVERGENCE', 'BEARISH_CVD_DIVERGENCE']),
    pricePivot1: PivotPointV1Schema,
    pricePivot2: PivotPointV1Schema,
    cvdPivot1: PivotPointV1Schema,
    cvdPivot2: PivotPointV1Schema,
    priceDisplacementUsd: z.number().finite(),
    cvdDisplacementUsd: z.number().finite(),
    startTime: safeInteger,
    endTime: safeInteger,
    reasonCodes: z.array(z.string().trim().min(1).max(64)).min(1),
    sourceRefs: z.array(z.string().trim().min(1).max(160)).min(1),
}).strict().superRefine((val, ctx) => {
    if (val.endTime < val.startTime) {
        ctx.addIssue({ code: 'custom', message: 'endTime cannot precede startTime', path: ['endTime'] });
    }
});

export type CvdDivergenceV1 = z.infer<typeof CvdDivergenceV1Schema>;

export const FlowEvidenceSnapshotV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    asOf: safeInteger,
    zones: z.array(DecisionZoneV1Schema),
    absorptions: z.array(AbsorptionObservationV1Schema),
    acceptances: z.array(AcceptanceObservationV1Schema),
    divergences: z.array(CvdDivergenceV1Schema),
    coverage: CaptureCoverageV1Schema,
}).strict();

export type FlowEvidenceSnapshotV1 = z.infer<typeof FlowEvidenceSnapshotV1Schema>;
