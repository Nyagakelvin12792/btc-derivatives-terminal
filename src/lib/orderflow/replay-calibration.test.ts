import { describe, expect, it } from 'vitest';
import {
    getStandardReplayFixtures,
    runReplayCalibration,
    ReplayCalibrationReportV1Schema,
} from './replay-calibration';

describe('replay-calibration suite (UX16.8)', () => {
    it('defines exactly 12 standard labeled replay fixtures covering required market conditions', () => {
        const fixtures = getStandardReplayFixtures();
        expect(fixtures.length).toBe(12);

        const conditions = fixtures.map((f) => f.condition);
        expect(conditions).toContain('ABSORPTION');
        expect(conditions).toContain('SPOOF');
        expect(conditions).toContain('FAILED_ABSORPTION');
        expect(conditions).toContain('VOLATILITY');
        expect(conditions).toContain('TREND');
        expect(conditions).toContain('RANGE');
        expect(conditions).toContain('GAP');
        expect(conditions).toContain('GENUINE_PERSISTENCE');
    });

    it('executes all 12 fixtures with 100% deterministic reproducibility', () => {
        const report = runReplayCalibration();
        const parsed = ReplayCalibrationReportV1Schema.parse(report);

        expect(parsed.fixturesCount).toBe(12);
        expect(parsed.metrics.reproducibilityRate).toBe(1.0);
        expect(parsed.metrics.falsePositiveRatePct).toBe(0.0);
        expect(parsed.allPassed).toBe(true);
        expect(parsed.calibrationPassed).toBe(true);
        expect(parsed.architectSignoffStatus).toBe('APPROVED_FOR_PAPER');
    });

    it('verifies RF-01 persistent bid absorption triggers CONFIRMING_LONG with all mandatory gates PASS', () => {
        const report = runReplayCalibration();
        const rf01 = report.results.find((r) => r.fixtureId === 'RF-01-BID-ABSORPTION-RECLAIM');
        expect(rf01).toBeDefined();
        expect(rf01?.passed).toBe(true);
        expect(rf01?.actualState).toBe('CONFIRMING_LONG');
        expect(rf01?.actualGrade).toBe('B');
        expect(rf01?.actualDirection).toBe('LONG');
        expect(rf01?.assessment.mandatoryGates.aggression).toBe('PASS');
        expect(rf01?.assessment.mandatoryGates.response).toBe('PASS');
        expect(rf01?.assessment.mandatoryGates.confirmation).toBe('PASS');
    });

    it('verifies RF-03 spoof liquidity pull fails aggression and response gates without phantom absorption', () => {
        const report = runReplayCalibration();
        const rf03 = report.results.find((r) => r.fixtureId === 'RF-03-WALL-SPOOF-PULLED');
        expect(rf03).toBeDefined();
        expect(rf03?.actualState).toBe('WATCH_LONG');
        expect(rf03?.assessment.mandatoryGates.aggression).toBe('MISSING');
        expect(rf03?.assessment.mandatoryGates.response).toBe('MISSING');
        expect(rf03?.passed).toBe(true);
    });

    it('verifies RF-04 consumed wall and acceptance below support triggers INVALIDATED state', () => {
        const report = runReplayCalibration();
        const rf04 = report.results.find((r) => r.fixtureId === 'RF-04-WALL-CONSUMED-ACCEPTANCE');
        expect(rf04).toBeDefined();
        expect(rf04?.passed).toBe(true);
        expect(rf04?.actualState).toBe('INVALIDATED');
        expect(rf04?.assessment.mandatoryGates.invalidation).toBe('FAIL');
    });

    it('verifies RF-06 stacked imbalance with no location fails location gate and yields NO_SETUP', () => {
        const report = runReplayCalibration();
        const rf06 = report.results.find((r) => r.fixtureId === 'RF-06-STACKED-IMBALANCE-NO-LOCATION');
        expect(rf06).toBeDefined();
        expect(rf06?.actualState).toBe('NO_SETUP');
        expect(rf06?.assessment.mandatoryGates.location).toBe('MISSING');
        expect(rf06?.passed).toBe(true);
    });

    it('verifies RF-08 sequence gap during absorption fails dataIntegrity and triggers AVOID state', () => {
        const report = runReplayCalibration();
        const rf08 = report.results.find((r) => r.fixtureId === 'RF-08-SEQUENCE-GAP-ABSORPTION');
        expect(rf08).toBeDefined();
        expect(rf08?.passed).toBe(true);
        expect(rf08?.actualState).toBe('AVOID');
        expect(rf08?.assessment.mandatoryGates.dataIntegrity).toBe('FAIL');
    });

    it('verifies RF-10 options wall aligned with flow boosts setup to A_GRADE_LONG', () => {
        const report = runReplayCalibration();
        const rf10 = report.results.find((r) => r.fixtureId === 'RF-10-OPTIONS-WALL-ALIGNED');
        expect(rf10).toBeDefined();
        expect(rf10?.passed).toBe(true);
        expect(rf10?.actualState).toBe('A_GRADE_LONG');
        expect(rf10?.actualGrade).toBe('A');
        expect(rf10?.assessment.enhancers.optionsRegime).toBe('ALIGNED');
        expect(rf10?.assessment.conflictIds.length).toBe(0);
    });

    it('verifies RF-11 options wall conflict caps grade at B and records conflict ID', () => {
        const report = runReplayCalibration();
        const rf11 = report.results.find((r) => r.fixtureId === 'RF-11-OPTIONS-WALL-CONFLICT');
        expect(rf11).toBeDefined();
        expect(rf11?.passed).toBe(true);
        expect(rf11?.actualState).toBe('CONFIRMING_LONG');
        expect(rf11?.actualGrade).toBe('B');
        expect(rf11?.assessment.conflictIds.length).toBeGreaterThan(0);
    });

    it('verifies RF-12 approximate profile boundary strictly fails mandatory location gate', () => {
        const report = runReplayCalibration();
        const rf12 = report.results.find((r) => r.fixtureId === 'RF-12-APPROXIMATE-PROFILE-BOUNDARY');
        expect(rf12).toBeDefined();
        expect(rf12?.passed).toBe(true);
        expect(rf12?.actualState).toBe('NO_SETUP');
        expect(rf12?.assessment.mandatoryGates.location).toBe('FAIL');
    });
});
