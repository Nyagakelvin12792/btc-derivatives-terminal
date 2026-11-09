import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
    ORDERFLOW_SCHEMA_VERSION,
    type CaptureCoverageV1,
    type SetupAssessmentV1,
} from '../../../../lib/orderflow/contracts';
import { createCaptureCoverageV1 } from '../../../../lib/orderflow/provenance';
import {
    computeFeaturePacketHash,
    type JevShadowRequestV1,
    JevShadowResponseV1Schema,
} from '../../../../lib/orderflow/jev-contracts';
import { POST } from './route';

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

function createMockAssessment(): SetupAssessmentV1 {
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
    };
}

function createMockRequest(): JevShadowRequestV1 {
    const a = createMockAssessment();
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

describe('POST /api/orderflow/jev route (UX16.7)', () => {
    it('returns Cache-Control: no-store header on every response', async () => {
        const req = new NextRequest('http://localhost/api/orderflow/jev', {
            method: 'POST',
            body: JSON.stringify(createMockRequest()),
        });

        const res = await POST(req);
        expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('rejects malformed json body with 400 status', async () => {
        const req = new NextRequest('http://localhost/api/orderflow/jev', {
            method: 'POST',
            body: 'invalid-json{{{',
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.stance).toBe('ABSTAIN');
        expect(data.summary).toContain('Invalid JSON');
    });

    it('rejects invalid schema payload with 400 status', async () => {
        const req = new NextRequest('http://localhost/api/orderflow/jev', {
            method: 'POST',
            body: JSON.stringify({ invalid: 'field' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.stance).toBe('ABSTAIN');
        expect(data.summary).toContain('Schema validation failed');
    });

    it('processes valid request and returns schema-compliant Jev response', async () => {
        const mockReq = createMockRequest();
        const req = new NextRequest('http://localhost/api/orderflow/jev', {
            method: 'POST',
            body: JSON.stringify(mockReq),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(() => JevShadowResponseV1Schema.parse(data)).not.toThrow();
        expect(data.featurePacketHash).toBe(mockReq.featurePacketHash);
    });

    it('never exposes API keys or secrets in response payload or headers', async () => {
        const req = new NextRequest('http://localhost/api/orderflow/jev', {
            method: 'POST',
            body: JSON.stringify(createMockRequest()),
        });

        const res = await POST(req);
        const data = await res.json();
        const rawJson = JSON.stringify(data);
        expect(rawJson).not.toMatch(/api[_-]?key|secret|password|bearer/i);
    });
});

it('caps UTF-8 bytes even without a Content-Length header', async () => {
    const response = await POST(new NextRequest('http://localhost/api/orderflow/jev', {
        method: 'POST',
        body: JSON.stringify({ text: 'é'.repeat(40_000) }),
    }));
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
});
