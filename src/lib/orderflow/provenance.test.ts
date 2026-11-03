import { describe, expect, it } from 'vitest';
import {
    assessCoverageQuality,
    calculateFreshnessMs,
    createCaptureCoverageV1,
    dataIntegrityStatusFromCoverage,
    isExactCapturedCoverage,
    refreshCaptureCoverageV1,
} from './provenance';

function coverage(overrides: Parameters<typeof createCaptureCoverageV1>[0] extends infer T ? Partial<T> : never = {}) {
    return createCaptureCoverageV1({
        dataMode: 'LIVE',
        source: 'BINANCE_SPOT',
        venue: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        capturedAt: 100_500,
        eventTime: 100_000,
        coverageStart: 60_000,
        coverageEnd: 100_000,
        sequenceState: 'LIVE',
        gapCount: 0,
        precision: 'TRADE',
        approximation: 'NONE',
        ...overrides,
    });
}

describe('UX16 provenance and capture coverage', () => {
    it('derives freshness and high quality from valid continuous coverage', () => {
        const result = coverage();
        expect(result.freshnessMs).toBe(500);
        expect(result.quality).toBe('HIGH');
        expect(dataIntegrityStatusFromCoverage(result)).toBe('READY');
        expect(isExactCapturedCoverage(result)).toBe(true);
    });

    it('degrades gaps and offline sources without inventing coverage', () => {
        const gap = coverage({ sequenceState: 'GAP', gapCount: 1 });
        expect(gap.quality).toBe('LOW');
        expect(dataIntegrityStatusFromCoverage(gap)).toBe('PARTIAL');
        expect(isExactCapturedCoverage(gap)).toBe(false);

        const offline = coverage({ coverageStart: null, coverageEnd: null, sequenceState: 'OFFLINE' });
        expect(offline.quality).toBe('UNAVAILABLE');
        expect(dataIntegrityStatusFromCoverage(offline)).toBe('UNAVAILABLE');
    });

    it('keeps replay and shadow provenance explicit', () => {
        expect(dataIntegrityStatusFromCoverage(coverage({ dataMode: 'REPLAY' }))).toBe('REPLAY');
        expect(dataIntegrityStatusFromCoverage(coverage({ dataMode: 'SHADOW' }))).toBe('SHADOW');
    });

    it('refreshes staleness from the event timestamp without mutating source times', () => {
        const original = coverage();
        const refreshed = refreshCaptureCoverageV1(original, 107_000);
        expect(refreshed.eventTime).toBe(original.eventTime);
        expect(refreshed.coverageStart).toBe(original.coverageStart);
        expect(refreshed.freshnessMs).toBe(7_000);
        expect(refreshed.quality).toBe('LOW');
    });

    it('validates timestamps and threshold ordering', () => {
        expect(calculateFreshnessMs(99_000, 100_000)).toBe(0);
        expect(() => calculateFreshnessMs(-1, 0)).toThrow(RangeError);
        expect(() => assessCoverageQuality(coverage(), {
            highFreshnessMs: 5_000,
            mediumFreshnessMs: 1_000,
            minimumCoverageMs: 0,
        })).toThrow(RangeError);
    });
});
