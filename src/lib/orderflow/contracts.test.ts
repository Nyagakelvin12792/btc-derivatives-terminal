import { describe, expect, it } from 'vitest';
import {
    CaptureCoverageV1Schema,
    ClassifiedTradeV1Schema,
    MarketEvidenceV1Schema,
    SetupAssessmentV1Schema,
    Ux16ContractFixtureV1Schema,
} from './contracts';
import {
    UX16_DATA_INTEGRITY_STATUS_FIXTURES_V1,
    UX16_REPLAY_CONTRACT_FIXTURE_V1,
} from './fixtures';

describe('UX16 versioned contracts', () => {
    it('validates the replay fixture against every nested version-1 schema', () => {
        const fixture = Ux16ContractFixtureV1Schema.parse(UX16_REPLAY_CONTRACT_FIXTURE_V1);
        expect(fixture.schemaVersion).toBe(1);
        expect(fixture.dataMode).toBe('REPLAY');
        expect(fixture.trades).toHaveLength(2);
        expect(fixture.integrity.every((source) => source.status === 'REPLAY' || source.status === 'SHADOW')).toBe(true);
    });

    it('provides every requested visual data-integrity state without claiming live data', () => {
        expect(UX16_DATA_INTEGRITY_STATUS_FIXTURES_V1.map((fixture) => fixture.status)).toEqual([
            'LOADING',
            'READY',
            'PARTIAL',
            'STALE',
            'UNAVAILABLE',
            'ERROR',
            'REPLAY',
            'SHADOW',
        ]);
        expect(UX16_DATA_INTEGRITY_STATUS_FIXTURES_V1.every((fixture) => fixture.coverage.dataMode !== 'LIVE')).toBe(true);
    });

    it('rejects incomplete and reversed capture coverage', () => {
        const coverage = UX16_REPLAY_CONTRACT_FIXTURE_V1.setup.dataQuality;
        expect(CaptureCoverageV1Schema.safeParse({ ...coverage, coverageEnd: null }).success).toBe(false);
        expect(CaptureCoverageV1Schema.safeParse({
            ...coverage,
            coverageStart: coverage.coverageEnd,
            coverageEnd: coverage.coverageStart,
        }).success).toBe(false);
    });

    it('rejects a future schema version instead of silently accepting it', () => {
        const trade = UX16_REPLAY_CONTRACT_FIXTURE_V1.trades[0];
        expect(ClassifiedTradeV1Schema.safeParse({ ...trade, schemaVersion: 2 }).success).toBe(false);
    });

    it('rejects inconsistent trade notional and aggressor semantics', () => {
        const trade = UX16_REPLAY_CONTRACT_FIXTURE_V1.trades[0];
        expect(ClassifiedTradeV1Schema.safeParse({ ...trade, notionalUsd: trade.notionalUsd + 1 }).success).toBe(false);
        expect(ClassifiedTradeV1Schema.safeParse({ ...trade, aggressor: 'SELL' }).success).toBe(false);
    });

    it('rejects contradictory or unbounded evidence', () => {
        const evidence = UX16_REPLAY_CONTRACT_FIXTURE_V1.evidence[0];
        expect(MarketEvidenceV1Schema.safeParse({ ...evidence, priceHigh: evidence.priceLow - 1 }).success).toBe(false);
        expect(MarketEvidenceV1Schema.safeParse({ ...evidence, strengthPercentile: 101 }).success).toBe(false);
    });

    it('prevents grade A unless the state and every mandatory gate agree', () => {
        const setup = UX16_REPLAY_CONTRACT_FIXTURE_V1.setup;
        expect(SetupAssessmentV1Schema.safeParse({ ...setup, grade: 'A' }).success).toBe(false);
        expect(SetupAssessmentV1Schema.safeParse({
            ...setup,
            state: 'A_GRADE_LONG',
            grade: 'A',
            mandatoryGates: { dataIntegrity: 'PASS', location: 'FAIL' },
        }).success).toBe(false);
        expect(SetupAssessmentV1Schema.safeParse({
            ...setup,
            state: 'A_GRADE_LONG',
            grade: 'A',
            mandatoryGates: { dataIntegrity: 'PASS', location: 'PASS' },
        }).success).toBe(true);
    });
});
