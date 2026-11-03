import {
    CaptureCoverageV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    type CaptureCoverageV1,
    type DataIntegrityStatus,
} from './contracts';

export type CaptureCoverageInput = Omit<
    CaptureCoverageV1,
    'schemaVersion' | 'freshnessMs' | 'quality'
> & {
    freshnessMs?: number;
    quality?: CaptureCoverageV1['quality'];
};

export interface CoverageQualityThresholds {
    highFreshnessMs: number;
    mediumFreshnessMs: number;
    minimumCoverageMs: number;
}

export const DEFAULT_COVERAGE_QUALITY_THRESHOLDS: CoverageQualityThresholds = Object.freeze({
    highFreshnessMs: 2_000,
    mediumFreshnessMs: 5_000,
    minimumCoverageMs: 30_000,
});

function validateThresholds(thresholds: CoverageQualityThresholds): CoverageQualityThresholds {
    if (!Number.isSafeInteger(thresholds.highFreshnessMs) || thresholds.highFreshnessMs < 0) {
        throw new RangeError('highFreshnessMs must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(thresholds.mediumFreshnessMs) || thresholds.mediumFreshnessMs < thresholds.highFreshnessMs) {
        throw new RangeError('mediumFreshnessMs must be a safe integer at least as large as highFreshnessMs');
    }
    if (!Number.isSafeInteger(thresholds.minimumCoverageMs) || thresholds.minimumCoverageMs < 0) {
        throw new RangeError('minimumCoverageMs must be a non-negative safe integer');
    }
    return thresholds;
}

export function calculateFreshnessMs(capturedAt: number, eventTime: number): number {
    if (!Number.isSafeInteger(capturedAt) || capturedAt < 0 || !Number.isSafeInteger(eventTime) || eventTime < 0) {
        throw new RangeError('Capture and event times must be non-negative safe integers');
    }
    return Math.max(0, capturedAt - eventTime);
}

export function assessCoverageQuality(
    coverage: Pick<CaptureCoverageV1, 'coverageStart' | 'coverageEnd' | 'freshnessMs' | 'sequenceState' | 'gapCount'>,
    thresholds: CoverageQualityThresholds = DEFAULT_COVERAGE_QUALITY_THRESHOLDS,
): CaptureCoverageV1['quality'] {
    const checked = validateThresholds(thresholds);
    if (coverage.sequenceState === 'OFFLINE' || coverage.coverageStart === null || coverage.coverageEnd === null) {
        return 'UNAVAILABLE';
    }
    if (coverage.sequenceState === 'GAP' || coverage.gapCount > 0 || coverage.freshnessMs > checked.mediumFreshnessMs) {
        return 'LOW';
    }
    const duration = coverage.coverageEnd - coverage.coverageStart;
    if (coverage.sequenceState === 'LIVE'
        && coverage.freshnessMs <= checked.highFreshnessMs
        && duration >= checked.minimumCoverageMs) {
        return 'HIGH';
    }
    return 'MEDIUM';
}

export function createCaptureCoverageV1(input: CaptureCoverageInput): CaptureCoverageV1 {
    const freshnessMs = input.freshnessMs ?? calculateFreshnessMs(input.capturedAt, input.eventTime);
    const quality = input.quality ?? assessCoverageQuality({ ...input, freshnessMs });
    return CaptureCoverageV1Schema.parse({
        ...input,
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        freshnessMs,
        quality,
    });
}

export function refreshCaptureCoverageV1(coverage: CaptureCoverageV1, capturedAt: number): CaptureCoverageV1 {
    return createCaptureCoverageV1({
        ...coverage,
        capturedAt,
        freshnessMs: calculateFreshnessMs(capturedAt, coverage.eventTime),
        quality: undefined,
    });
}

export function dataIntegrityStatusFromCoverage(coverage: CaptureCoverageV1): DataIntegrityStatus {
    if (coverage.dataMode === 'REPLAY') return 'REPLAY';
    if (coverage.dataMode === 'SHADOW') return 'SHADOW';
    if (coverage.sequenceState === 'BUFFERING') return 'LOADING';
    if (coverage.sequenceState === 'STALE') return 'STALE';
    if (coverage.sequenceState === 'OFFLINE' || coverage.quality === 'UNAVAILABLE') return 'UNAVAILABLE';
    if (coverage.sequenceState === 'GAP' || coverage.gapCount > 0 || coverage.quality === 'LOW') return 'PARTIAL';
    return 'READY';
}

export function isExactCapturedCoverage(coverage: CaptureCoverageV1): boolean {
    return coverage.approximation === 'NONE'
        && coverage.gapCount === 0
        && coverage.sequenceState === 'LIVE'
        && coverage.quality !== 'UNAVAILABLE';
}
