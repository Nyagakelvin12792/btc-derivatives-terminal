import { describe, expect, it } from 'vitest';
import {
    ORDERFLOW_SCHEMA_VERSION,
    type CaptureCoverageV1,
    type MarketEvidenceV1,
    SetupAssessmentV1Schema,
} from './contracts';
import type { DecisionZoneV1 } from './evidence-contracts';
import { createCaptureCoverageV1 } from './provenance';
import {
    evaluateSetupAssessment,
    getSetupDirection,
    isSetupActionable,
    replaySetupStateSequence,
} from './setup-engine';

function createMockCoverage(overrides?: Partial<CaptureCoverageV1>): CaptureCoverageV1 {
    const base = createCaptureCoverageV1({
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
    });

    return {
        ...base,
        quality: 'HIGH',
        freshnessMs: 50,
        ...overrides,
    };
}

function createMockZone(overrides?: Partial<DecisionZoneV1>): DecisionZoneV1 {
    return {
        id: 'zone-test-1',
        schemaVersion: 1,
        name: 'PW $95,000 Support',
        kind: 'PUT_WALL',
        priceLow: 94_900,
        priceHigh: 95_100,
        midPrice: 95_000,
        toleranceUsd: 50,
        strengthScore: 92,
        contributors: ['Deribit Put Wall 95k'],
        sources: ['OPTIONS_PUT_WALL'],
        isApproximate: false,
        asOf: 100_000,
        ...overrides,
    };
}

function createMockEvidence(overrides?: Partial<MarketEvidenceV1>): MarketEvidenceV1 {
    return {
        id: 'ev-test-1',
        schemaVersion: 1,
        kind: 'BULLISH_ABSORPTION',
        direction: 'BULLISH',
        startTime: 98_000,
        endTime: 99_500,
        priceLow: 94_950,
        priceHigh: 95_050,
        strengthPercentile: 90,
        confidence: 'HIGH',
        reasonCodes: ['PASSIVE_BID_ABSORPTION'],
        sourceRefs: ['tape-window-1'],
        quality: createMockCoverage(),
        invalidatedAt: null,
        ...overrides,
    };
}

describe('Setup State Machine Engine (UX16.6)', () => {
    it('returns INSUFFICIENT_DATA when coverage quality is UNAVAILABLE or sequence is OFFLINE', () => {
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 95_000,
            zones: [createMockZone()],
            evidence: [createMockEvidence()],
            coverage: createMockCoverage({ quality: 'UNAVAILABLE', sequenceState: 'OFFLINE' }),
            sequenceState: 'OFFLINE',
        });

        expect(assessment.state).toBe('INSUFFICIENT_DATA');
        expect(assessment.grade).toBe('NONE');
        expect(assessment.mandatoryGates.dataIntegrity).toBe('MISSING');
        expect(() => SetupAssessmentV1Schema.parse(assessment)).not.toThrow();
    });

    it('returns AVOID when sequence has a GAP or corrupted feed', () => {
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 95_000,
            zones: [createMockZone()],
            evidence: [createMockEvidence()],
            coverage: createMockCoverage({ gapCount: 2, sequenceState: 'GAP', quality: 'LOW' }),
            sequenceState: 'GAP',
        });

        expect(assessment.state).toBe('AVOID');
        expect(assessment.grade).toBe('NONE');
        expect(assessment.mandatoryGates.dataIntegrity).toBe('FAIL');
        expect(() => SetupAssessmentV1Schema.parse(assessment)).not.toThrow();
    });

    it('returns NO_SETUP when spot price is not inside or near any decision zone', () => {
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 98_500, // Away from zone [94,900 - 95,100]
            zones: [createMockZone()],
            evidence: [],
            coverage: createMockCoverage(),
            sequenceState: 'LIVE',
        });

        expect(assessment.state).toBe('NO_SETUP');
        expect(assessment.grade).toBe('NONE');
        expect(assessment.mandatoryGates.location).toBe('MISSING');
        expect(assessment.zone).toBeNull();
    });

    it('prevents A_GRADE when approximate volume profile zone cannot satisfy mandatory gate', () => {
        const approxZone = createMockZone({
            id: 'zone-approx-1',
            name: 'Approximate VP VAH',
            kind: 'VALUE_AREA_HIGH',
            isApproximate: true,
            sources: ['VOLUME_PROFILE_APPROXIMATE'],
        });

        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 95_000,
            zones: [approxZone],
            evidence: [
                createMockEvidence({ kind: 'BULLISH_ABSORPTION' }),
                createMockEvidence({ id: 'ev-2', kind: 'BULLISH_CVD_DIVERGENCE' }),
                createMockEvidence({ id: 'ev-3', kind: 'STACKED_BUY_IMBALANCE' }),
            ],
            coverage: createMockCoverage({ quality: 'HIGH' }),
            sequenceState: 'LIVE',
        });

        expect(assessment.mandatoryGates.location).toBe('FAIL');
        expect(assessment.grade).not.toBe('A');
        expect(assessment.state).not.toBe('A_GRADE_LONG');
    });

    it('returns WATCH_LONG when price enters a valid zone but execution evidence is missing', () => {
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 95_000,
            zones: [createMockZone()],
            evidence: [], // No order flow evidence yet
            coverage: createMockCoverage(),
            sequenceState: 'LIVE',
            preferredDirection: 'LONG',
        });

        expect(assessment.state).toBe('WATCH_LONG');
        expect(assessment.grade).toBe('WATCH');
        expect(assessment.mandatoryGates.location).toBe('PASS');
        expect(assessment.mandatoryGates.aggression).toBe('MISSING');
        expect(assessment.mandatoryGates.response).toBe('MISSING');
        expect(assessment.mandatoryGates.confirmation).toBe('MISSING');
        expect(assessment.zone).not.toBeNull();
        expect(assessment.invalidation).not.toBeNull();
        expect(getSetupDirection(assessment.state)).toBe('LONG');
    });

    it('returns CONFIRMING_LONG when absorption or aggression is present before confirmation', () => {
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 95_000,
            zones: [createMockZone()],
            evidence: [
                createMockEvidence({
                    id: 'abs-1',
                    kind: 'BULLISH_ABSORPTION',
                    direction: 'BULLISH',
                }),
            ],
            coverage: createMockCoverage(),
            sequenceState: 'LIVE',
            preferredDirection: 'LONG',
        });

        expect(assessment.state).toBe('CONFIRMING_LONG');
        expect(assessment.grade).toBe('B');
        expect(assessment.mandatoryGates.location).toBe('PASS');
        expect(assessment.mandatoryGates.aggression).toBe('PASS');
        expect(assessment.mandatoryGates.response).toBe('PASS');
        expect(assessment.mandatoryGates.confirmation).toBe('MISSING');
        expect(assessment.trigger).not.toBeNull();
        expect(assessment.invalidation).not.toBeNull();
        expect(isSetupActionable(assessment)).toBe(true);
    });

    it('transitions to A_GRADE_LONG when all 7 mandatory gates pass, enhancers align, and quality is HIGH', () => {
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 95_020,
            zones: [createMockZone({ kind: 'PUT_WALL' })],
            evidence: [
                createMockEvidence({
                    id: 'abs-1',
                    kind: 'BULLISH_ABSORPTION',
                    direction: 'BULLISH',
                }),
                createMockEvidence({
                    id: 'div-1',
                    kind: 'BULLISH_CVD_DIVERGENCE',
                    direction: 'BULLISH',
                }),
                createMockEvidence({
                    id: 'wall-1',
                    kind: 'PERSISTENT_LIQUIDITY',
                    direction: 'BULLISH',
                }),
            ],
            coverage: createMockCoverage({ quality: 'HIGH' }),
            sequenceState: 'LIVE',
            preferredDirection: 'LONG',
        });

        expect(assessment.state).toBe('A_GRADE_LONG');
        expect(assessment.grade).toBe('A');
        expect(Object.values(assessment.mandatoryGates).every((gate) => gate === 'PASS')).toBe(true);
        expect(assessment.dataQuality.quality).toBe('HIGH');
        expect(assessment.trigger?.price).toBeGreaterThan(95_000);
        expect(assessment.invalidation?.price).toBeLessThan(94_900);
        expect(assessment.conflictIds.length).toBe(0);
        expect(() => SetupAssessmentV1Schema.parse(assessment)).not.toThrow();
    });

    it('transitions to INVALIDATED when price breaches the structural invalidation price', () => {
        const zone = createMockZone({ priceLow: 94_900, priceHigh: 95_100 });
        // Zone floor is 94_900, buffer is ~30. Invalidation is ~94_870.
        // If spot price dumps to 94_800:
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 94_800,
            zones: [zone],
            evidence: [
                createMockEvidence({
                    id: 'abs-1',
                    kind: 'BULLISH_ABSORPTION',
                    direction: 'BULLISH',
                }),
            ],
            coverage: createMockCoverage(),
            sequenceState: 'LIVE',
            preferredDirection: 'LONG',
        });

        expect(assessment.mandatoryGates.invalidation).toBe('FAIL');
        expect(assessment.state).toBe('INVALIDATED');
        expect(assessment.grade).toBe('NONE');
        expect(assessment.invalidation).not.toBeNull();
    });

    it('records conflicting evidence in conflictIds and never hides them', () => {
        const assessment = evaluateSetupAssessment({
            asOf: 100_000,
            spotPrice: 95_000,
            zones: [createMockZone()],
            evidence: [
                createMockEvidence({
                    id: 'abs-bull',
                    kind: 'BULLISH_ABSORPTION',
                    direction: 'BULLISH',
                }),
                createMockEvidence({
                    id: 'div-bear',
                    kind: 'BEARISH_CVD_DIVERGENCE',
                    direction: 'BEARISH',
                }),
            ],
            coverage: createMockCoverage({ quality: 'HIGH' }),
            sequenceState: 'LIVE',
            preferredDirection: 'LONG',
        });

        expect(assessment.evidenceIds).toContain('abs-bull');
        expect(assessment.conflictIds).toContain('div-bear');
        // Conflicting divergence prevents A-grade
        expect(assessment.grade).not.toBe('A');
    });

    it('replays a deterministic setup state transition sequence', () => {
        const zone = createMockZone({ priceLow: 94_900, priceHigh: 95_100 });
        const coverage = createMockCoverage();

        const history = replaySetupStateSequence([
            // Step 1: Approaching zone from far above -> NO_SETUP
            {
                asOf: 100_000,
                spotPrice: 96_500,
                zones: [zone],
                evidence: [],
                coverage,
            },
            // Step 2: Arrives in zone -> WATCH_LONG
            {
                asOf: 101_000,
                spotPrice: 95_050,
                zones: [zone],
                evidence: [],
                coverage,
                preferredDirection: 'LONG',
            },
            // Step 3: Absorption occurs -> CONFIRMING_LONG (Grade B)
            {
                asOf: 102_000,
                spotPrice: 95_020,
                zones: [zone],
                evidence: [
                    createMockEvidence({ id: 'e1', kind: 'BULLISH_ABSORPTION', direction: 'BULLISH' }),
                ],
                coverage,
                preferredDirection: 'LONG',
            },
            // Step 4: Divergence + Wall support -> A_GRADE_LONG (Grade A)
            {
                asOf: 103_000,
                spotPrice: 95_040,
                zones: [zone],
                evidence: [
                    createMockEvidence({ id: 'e1', kind: 'BULLISH_ABSORPTION', direction: 'BULLISH' }),
                    createMockEvidence({ id: 'e2', kind: 'BULLISH_CVD_DIVERGENCE', direction: 'BULLISH' }),
                    createMockEvidence({ id: 'e3', kind: 'PERSISTENT_LIQUIDITY', direction: 'BULLISH' }),
                ],
                coverage,
                preferredDirection: 'LONG',
            },
            // Step 5: Heavy breakdown below invalidation -> INVALIDATED
            {
                asOf: 104_000,
                spotPrice: 94_800,
                zones: [zone],
                evidence: [
                    createMockEvidence({ id: 'e1', kind: 'BULLISH_ABSORPTION', direction: 'BULLISH' }),
                ],
                coverage,
                preferredDirection: 'LONG',
            },
        ]);

        expect(history[0].state).toBe('NO_SETUP');
        expect(history[1].state).toBe('WATCH_LONG');
        expect(history[2].state).toBe('CONFIRMING_LONG');
        expect(history[3].state).toBe('A_GRADE_LONG');
        expect(history[4].state).toBe('INVALIDATED');
    });
});
