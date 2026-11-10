import { z } from 'zod';

import {
    CaptureCoverageV1Schema,
    FootprintBarV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    TrueFlowIntervalSchema,
    TradeCaptureBoundaryReasonSchema,
} from './contracts';

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveFinite = z.number().positive().max(Number.MAX_VALUE);
const nonNegativeFinite = z.number().nonnegative().max(Number.MAX_VALUE);
const finite = z.number().finite();

function approximatelyEqual(left: number, right: number): boolean {
    const tolerance = Math.max(1e-8, Math.abs(right) * 1e-10);
    return Math.abs(left - right) <= tolerance;
}

export { TrueFlowIntervalSchema };
export type TrueFlowInterval = z.infer<typeof TrueFlowIntervalSchema>;

export const TRUE_FLOW_INTERVAL_MS: Readonly<Record<TrueFlowInterval, number>> = {
    '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
    '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

export const TrueFlowTotalsV1Schema = z.object({
    tradeCount: safeInteger,
    buyVolumeBtc: nonNegativeFinite,
    sellVolumeBtc: nonNegativeFinite,
    buyNotionalUsd: nonNegativeFinite,
    sellNotionalUsd: nonNegativeFinite,
    totalNotionalUsd: nonNegativeFinite,
    deltaNotionalUsd: finite,
}).strict().superRefine((value, context) => {
    if (!approximatelyEqual(value.totalNotionalUsd, value.buyNotionalUsd + value.sellNotionalUsd)) {
        context.addIssue({ code: 'custom', message: 'True-flow total notional is inconsistent', path: ['totalNotionalUsd'] });
    }
    if (!approximatelyEqual(value.deltaNotionalUsd, value.buyNotionalUsd - value.sellNotionalUsd)) {
        context.addIssue({ code: 'custom', message: 'True-flow delta notional is inconsistent', path: ['deltaNotionalUsd'] });
    }
});

export type TrueFlowTotalsV1 = z.infer<typeof TrueFlowTotalsV1Schema>;

export const CvdBarV1Schema = TrueFlowTotalsV1Schema.extend({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    openTime: safeInteger,
    closeTime: safeInteger,
    interval: TrueFlowIntervalSchema,
    cumulativeDeltaNotionalUsd: finite,
}).strict().superRefine((value, context) => {
    if (value.closeTime <= value.openTime) {
        context.addIssue({ code: 'custom', message: 'CVD close time must follow open time', path: ['closeTime'] });
    }
});

export type CvdBarV1 = z.infer<typeof CvdBarV1Schema>;

export const CvdSegmentV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    segmentId: z.string().trim().min(1).max(128),
    startBoundaryIds: z.array(z.string().trim().min(1).max(160)).max(8),
    startReasons: z.array(TradeCaptureBoundaryReasonSchema).max(8),
    bars: z.array(CvdBarV1Schema).max(20_000),
    finalCumulativeDeltaNotionalUsd: finite,
    coverage: CaptureCoverageV1Schema,
}).strict().superRefine((value, context) => {
    if (value.startBoundaryIds.length !== value.startReasons.length) {
        context.addIssue({ code: 'custom', message: 'CVD boundary IDs and reasons must align', path: ['startReasons'] });
    }
    const finalBar = value.bars.at(-1);
    if (finalBar && !approximatelyEqual(finalBar.cumulativeDeltaNotionalUsd, value.finalCumulativeDeltaNotionalUsd)) {
        context.addIssue({ code: 'custom', message: 'CVD segment final delta is inconsistent', path: ['finalCumulativeDeltaNotionalUsd'] });
    }
});

export type CvdSegmentV1 = z.infer<typeof CvdSegmentV1Schema>;

export const SegmentedFootprintBarV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    segmentId: z.string().trim().min(1).max(128),
    startBoundaryIds: z.array(z.string().trim().min(1).max(160)).max(8),
    footprint: FootprintBarV1Schema,
}).strict();

export type SegmentedFootprintBarV1 = z.infer<typeof SegmentedFootprintBarV1Schema>;

export const TradeVolumeProfileRowV1Schema = TrueFlowTotalsV1Schema.extend({
    bucketIndex: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    priceLow: positiveFinite,
    priceHigh: positiveFinite,
    priceMid: positiveFinite,
}).strict().superRefine((value, context) => {
    if (value.priceHigh <= value.priceLow || value.priceMid < value.priceLow || value.priceMid > value.priceHigh) {
        context.addIssue({ code: 'custom', message: 'Trade VP price bounds are invalid', path: ['priceHigh'] });
    }
});

export type TradeVolumeProfileRowV1 = z.infer<typeof TradeVolumeProfileRowV1Schema>;

export const TradeVolumeProfileCoverageKindSchema = z.enum([
    'CAPTURED_EXACT',
    'CAPTURED_WITH_GAPS',
    'MIXED_APPROXIMATE',
]);

export type TradeVolumeProfileCoverageKind = z.infer<typeof TradeVolumeProfileCoverageKindSchema>;

export const TradeVolumeProfileV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    priceBucket: positiveFinite,
    coverageKind: TradeVolumeProfileCoverageKindSchema,
    rows: z.array(TradeVolumeProfileRowV1Schema).max(20_000),
    totals: TrueFlowTotalsV1Schema,
    pocPrice: positiveFinite.nullable(),
    valueAreaFraction: z.number().min(0.5).max(0.99),
    vahPrice: positiveFinite.nullable(),
    valPrice: positiveFinite.nullable(),
    coverage: CaptureCoverageV1Schema,
}).strict().superRefine((value, context) => {
    if (value.rows.length === 0 && (value.pocPrice !== null || value.vahPrice !== null || value.valPrice !== null)) {
        context.addIssue({ code: 'custom', message: 'An empty trade VP cannot declare POC/VA levels', path: ['pocPrice'] });
    }
    if (value.rows.length > 0 && (value.pocPrice === null || value.vahPrice === null || value.valPrice === null)) {
        context.addIssue({ code: 'custom', message: 'A populated trade VP requires POC/VA levels', path: ['pocPrice'] });
    }
    if (value.vahPrice !== null && value.valPrice !== null && value.vahPrice < value.valPrice) {
        context.addIssue({ code: 'custom', message: 'VAH cannot be below VAL', path: ['vahPrice'] });
    }
    if (value.coverageKind === 'CAPTURED_EXACT' && value.coverage.gapCount > 0) {
        context.addIssue({ code: 'custom', message: 'Gapped coverage cannot be labelled captured exact', path: ['coverageKind'] });
    }
    if (value.coverageKind === 'MIXED_APPROXIMATE' && value.coverage.approximation !== 'MIXED_COVERAGE') {
        context.addIssue({ code: 'custom', message: 'Mixed profile coverage must declare mixed approximation', path: ['coverage', 'approximation'] });
    }
});

export type TradeVolumeProfileV1 = z.infer<typeof TradeVolumeProfileV1Schema>;

export const TrueFlowSnapshotV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    interval: TrueFlowIntervalSchema,
    priceBucket: positiveFinite,
    cvdSegments: z.array(CvdSegmentV1Schema).max(10_000),
    footprintBars: z.array(SegmentedFootprintBarV1Schema).max(20_000),
    tradeVolumeProfile: TradeVolumeProfileV1Schema,
    totals: TrueFlowTotalsV1Schema,
    coverage: CaptureCoverageV1Schema,
}).strict();

export type TrueFlowSnapshotV1 = z.infer<typeof TrueFlowSnapshotV1Schema>;
