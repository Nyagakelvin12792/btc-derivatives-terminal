import { beforeEach, describe, expect, it } from 'vitest';
import {
    ORDERFLOW_SCHEMA_VERSION,
    type CaptureCoverageV1,
    type SetupAssessmentV1,
} from './contracts';
import { createCaptureCoverageV1 } from './provenance';
import {
    computeFeaturePacketHash,
    type JevShadowRequestV1,
    JevShadowRequestV1Schema,
    JevShadowResponseV1Schema,
} from './jev-contracts';
import {
    clearJevShadowCache,
    createAbstainResponse,
    evaluateJevShadow,
} from './jev-adapter';

function createMockCoverage(): CaptureCoverageV1 {
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
    });
}

function createMockAssessment(overrides?: Partial<SetupAssessmentV1>): SetupAssessmentV1 {
    return {
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        state: 'A_GRADE_LONG',
        asOf: 100_000,
        symbol: 'BTCUSDT',
        contextTimeframes: ['4h', '1h'],
        triggerTimeframe: '5m',
        zone: { low: 94_900, high: 95_100, label: 'PW $95,000 Support' },
        trigger: { description: 'Reclaim of $95,120', price: 95_120 },
        invalidation: { description: '1m close below $94,870', price: 94_870 },
        mandatoryGates: {
            dataIntegrity: 'PASS',
            location: 'PASS',
            aggression: 'PASS',
            response: 'PASS',
            confirmation: 'PASS',
            invalidation: 'PASS',
            riskCompatibility: 'PASS',
        },
        enhancers: {
            optionsRegime: 'ALIGNED',
            persistentLiquidity: 'ALIGNED',
            cvdDivergence: 'ALIGNED',
            volumeProfile: 'ALIGNED',
        },
        evidenceIds: ['ev-1'],
        conflictIds: [],
        grade: 'A',
        dataQuality: createMockCoverage(),
        deterministicVersion: 'ux16.6-setup-engine',
        ...overrides,
    };
}

function createMockRequest(assessment?: SetupAssessmentV1): JevShadowRequestV1 {
    const a = assessment ?? createMockAssessment();
    const hash = computeFeaturePacketHash({
        state: a.state,
        grade: a.grade,
        zoneLabel: a.zone?.label,
        zoneLow: a.zone?.low,
        zoneHigh: a.zone?.high,
        triggerPrice: a.trigger?.price,
        invalidationPrice: a.invalidation?.price,
        evidenceIds: a.evidenceIds,
        conflictIds: a.conflictIds,
        mandatoryGates: a.mandatoryGates,
    });

    return {
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        assessment: a,
        evidence: [
            {
                id: 'ev-1',
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
                sourceRefs: ['tape-1'],
                quality: createMockCoverage(),
                invalidatedAt: null,
            },
        ],
        higherTimeframeContext: {
            h4Trend: 'BULLISH',
            h1Structure: 'Testing higher-low structural support at $95k',
        },
        optionsContext: {
            gammaRegime: 'POSITIVE',
            callWall: 98_000,
            putWall: 95_000,
            netGex: 120_000_000,
        },
        riskSummary: {
            entryReferencePrice: 95_020,
            invalidationPrice: 94_870,
            riskDistanceUsd: 150,
            riskPct: 0.16,
        },
        missingInputs: [],
        featurePacketHash: hash,
    };
}

describe('Jev Shadow Adapter (UX16.7)', () => {
    beforeEach(() => {
        clearJevShadowCache();
    });

    it('computes a deterministic feature packet hash that changes when features change', () => {
        const req1 = createMockRequest();
        const hash1 = req1.featurePacketHash;

        // Change state from A_GRADE_LONG to WATCH_LONG
        const req2 = createMockRequest(
            createMockAssessment({ state: 'WATCH_LONG', grade: 'WATCH' })
        );
        const hash2 = req2.featurePacketHash;

        expect(hash1).not.toBe(hash2);
        expect(hash1.startsWith('jev-')).toBe(true);
        expect(hash2.startsWith('jev-')).toBe(true);
    });

    it('abstains immediately when kill switch disables the adapter', async () => {
        const req = createMockRequest();
        const response = await evaluateJevShadow({
            request: req,
            enabled: false, // Kill switch disabled
        });

        expect(response.stance).toBe('ABSTAIN');
        expect(response.summary).toContain('kill switch');
        expect(response.featurePacketHash).toBe(req.featurePacketHash);
        expect(() => JevShadowResponseV1Schema.parse(response)).not.toThrow();
    });

    it('abstains when deterministic state is INSUFFICIENT_DATA or AVOID or NO_SETUP', async () => {
        const req = createMockRequest(
            createMockAssessment({
                state: 'INSUFFICIENT_DATA',
                grade: 'NONE',
                mandatoryGates: { dataIntegrity: 'MISSING' },
            })
        );
        const response = await evaluateJevShadow({
            request: req,
            enabled: true,
        });

        expect(response.stance).toBe('ABSTAIN');
        expect(response.summary).toContain('INSUFFICIENT_DATA');
    });

    it('degrades to ABSTAIN on upstream timeout', async () => {
        const req = createMockRequest();
        const response = await evaluateJevShadow({
            request: req,
            enabled: true,
            timeoutMs: 50,
            mockEvaluator: async () => {
                await new Promise((resolve) => setTimeout(resolve, 200));
                return { stance: 'AGREE' };
            },
        });

        expect(response.stance).toBe('ABSTAIN');
        expect(response.summary).toContain('timed out');
    });

    it('evaluates an A-grade setup and returns AGREE stance with structured explanation', async () => {
        const req = createMockRequest();
        const response = await evaluateJevShadow({
            request: req,
            enabled: true,
            apiKey: 'test-key',
        });

        expect(response.stance).toBe('AGREE');
        expect(response.summary).toContain('Institutional order flow confirms');
        expect(response.strongestEvidence.length).toBeGreaterThan(0);
        expect(response.featurePacketHash).toBe(req.featurePacketHash);
        expect(() => JevShadowResponseV1Schema.parse(response)).not.toThrow();
    });

    it('cannot alter deterministic assessment, gates, trigger, invalidation, or risk', async () => {
        const req = createMockRequest();
        const originalState = req.assessment.state;
        const originalGrade = req.assessment.grade;
        const originalGates = { ...req.assessment.mandatoryGates };
        const originalTrigger = req.assessment.trigger?.price;
        const originalInv = req.assessment.invalidation?.price;

        const response = await evaluateJevShadow({
            request: req,
            enabled: true,
            apiKey: 'test-key',
        });

        // The assessment object in the request remains strictly unchanged
        expect(req.assessment.state).toBe(originalState);
        expect(req.assessment.grade).toBe(originalGrade);
        expect(req.assessment.mandatoryGates).toEqual(originalGates);
        expect(req.assessment.trigger?.price).toBe(originalTrigger);
        expect(req.assessment.invalidation?.price).toBe(originalInv);

        // Response contains restatement without altering anything
        expect(response.invalidationRestatement).toBe(req.assessment.invalidation?.description);
    });

    it('caches response by featurePacketHash', async () => {
        const req = createMockRequest();
        let callCount = 0;

        const evalOptions = {
            request: req,
            enabled: true,
            mockEvaluator: async () => {
                callCount++;
                return { stance: 'AGREE' as const, summary: 'First call result' };
            },
        };

        const res1 = await evaluateJevShadow(evalOptions);
        const res2 = await evaluateJevShadow(evalOptions);

        expect(callCount).toBe(1);
        expect(res1.featurePacketHash).toBe(res2.featurePacketHash);
    });
});
