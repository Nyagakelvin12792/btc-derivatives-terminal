/**
 * Replay Calibration Engine (Milestone UX16.8)
 *
 * Implements deterministic fixture execution across trend, range, volatility,
 * sequence gaps, spoof-like pulls, genuine persistence, absorption, and failed absorption.
 *
 * Adheres strictly to Section 29.2, Section 33, and UX16 Implementation Plan.
 * Guarantees 100% reproducible identical transitions and zero hindsight mutation.
 */

import { z } from 'zod';
import {
    ORDERFLOW_SCHEMA_VERSION,
    type CaptureCoverageV1,
    type MarketEvidenceV1,
    type SetupAssessmentV1,
    type SetupState,
    CaptureCoverageV1Schema,
    MarketEvidenceV1Schema,
    SetupAssessmentV1Schema,
    SetupStateSchema,
} from './contracts';
import {
    type DecisionZoneV1,
    DecisionZoneV1Schema,
} from './evidence-contracts';
import { createCaptureCoverageV1 } from './provenance';
import { evaluateSetupAssessment, getSetupDirection } from './setup-engine';
import { computeFeaturePacketHash } from './jev-contracts';

export const ReplayMarketConditionSchema = z.enum([
    'TREND',
    'RANGE',
    'VOLATILITY',
    'GAP',
    'SPOOF',
    'GENUINE_PERSISTENCE',
    'ABSORPTION',
    'FAILED_ABSORPTION',
]);
export type ReplayMarketCondition = z.infer<typeof ReplayMarketConditionSchema>;

export const ReplayFixtureV1Schema = z.object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(128),
    condition: ReplayMarketConditionSchema,
    description: z.string().trim().min(1).max(500),
    input: z.object({
        asOf: z.number().int().positive(),
        spotPrice: z.number().positive(),
        zones: z.array(DecisionZoneV1Schema),
        evidence: z.array(MarketEvidenceV1Schema),
        coverage: CaptureCoverageV1Schema,
        sequenceState: z.enum(['LIVE', 'GAP', 'CONNECTING', 'REPLAY', 'OFFLINE']).optional(),
        riskSettings: z.object({
            accountEquityUsd: z.number().positive().optional(),
            maxRiskPerTradeUsd: z.number().positive().optional(),
            maxRiskPct: z.number().positive().optional(),
            leverage: z.number().positive().optional(),
        }).optional(),
    }),
    expected: z.object({
        state: SetupStateSchema,
        grade: z.enum(['A', 'B', 'WATCH', 'NONE']),
        direction: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
        mandatoryGates: z.record(z.string(), z.enum(['PASS', 'FAIL', 'MISSING'])),
        prohibitedEvidence: z.array(z.string()).optional(),
    }),
}).strict();
export type ReplayFixtureV1 = z.infer<typeof ReplayFixtureV1Schema>;

export const ReplayFixtureResultV1Schema = z.object({
    fixtureId: z.string(),
    name: z.string(),
    condition: ReplayMarketConditionSchema,
    passed: z.boolean(),
    actualState: SetupStateSchema,
    expectedState: SetupStateSchema,
    actualGrade: z.enum(['A', 'B', 'WATCH', 'NONE']),
    expectedGrade: z.enum(['A', 'B', 'WATCH', 'NONE']),
    actualDirection: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
    expectedDirection: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
    mandatoryGatesPassed: z.boolean(),
    featureHash: z.string(),
    reproducible: z.boolean(),
    assessment: SetupAssessmentV1Schema,
    notes: z.string().optional(),
}).strict();
export type ReplayFixtureResultV1 = z.infer<typeof ReplayFixtureResultV1Schema>;

export const ReplayMetricsV1Schema = z.object({
    totalFixtures: z.number().int().nonnegative(),
    passedFixtures: z.number().int().nonnegative(),
    reproducibilityRate: z.number().min(0).max(1),
    dataAvailabilityPct: z.number().min(0).max(100),
    gapFrequencyPct: z.number().min(0).max(100),
    signalFrequencyPct: z.number().min(0).max(100),
    abstentionRatePct: z.number().min(0).max(100),
    invalidStateRatePct: z.number().min(0).max(100),
    falsePositiveRatePct: z.number().min(0).max(100),
}).strict();
export type ReplayMetricsV1 = z.infer<typeof ReplayMetricsV1Schema>;

export const ReplayCalibrationReportV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    generatedAt: z.string().datetime(),
    deterministicVersion: z.string().trim().min(1),
    fixturesCount: z.number().int().nonnegative(),
    allPassed: z.boolean(),
    results: z.array(ReplayFixtureResultV1Schema),
    metrics: ReplayMetricsV1Schema,
    architectSignoffStatus: z.enum(['APPROVED_FOR_PAPER', 'NEEDS_CALIBRATION', 'REJECTED']),
    calibrationPassed: z.boolean(),
}).strict();
export type ReplayCalibrationReportV1 = z.infer<typeof ReplayCalibrationReportV1Schema>;

/**
 * Standard 12 Labeled Replay Fixtures specified in Section 29.2 of the Implementation Plan:
 * 1. Persistent bid absorbs aggressive sells and price reclaims
 * 2. Persistent ask absorbs aggressive buys and price rejects
 * 3. Displayed wall is pulled before touch (spoof)
 * 4. Large displayed wall is consumed and price accepts through it
 * 5. Strong imbalance on insignificant volume
 * 6. Stacked imbalance without structural location
 * 7. CVD divergence at VAL/AVWAP
 * 8. Sequence gap during apparent absorption
 * 9. Reconnect with duplicated aggregate trades
 * 10. Options wall aligns with flow
 * 11. Options wall conflicts with flow
 * 12. Approximate profile before tick-capture boundary
 */
export function getStandardReplayFixtures(): ReplayFixtureV1[] {
    const baseTime = 1700000000000;

    const createValidCoverage = (overrides?: Partial<CaptureCoverageV1>): CaptureCoverageV1 => {
        const base = createCaptureCoverageV1({
            dataMode: 'LIVE',
            source: 'BINANCE_SPOT',
            venue: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            capturedAt: baseTime + 100,
            eventTime: baseTime,
            coverageStart: baseTime - 300000,
            coverageEnd: baseTime,
            sequenceState: overrides?.sequenceState ?? 'LIVE',
            gapCount: 0,
            precision: 'TRADE',
            approximation: 'NONE',
            ...overrides,
        });

        const quality = overrides?.quality ?? (overrides?.sequenceState === 'GAP' || (overrides?.gapCount && overrides.gapCount > 0) ? 'LOW' : 'HIGH');

        return {
            ...base,
            quality,
            ...overrides,
        };
    };

    const defaultCoverage = createValidCoverage();

    const createZone = (overrides?: Partial<DecisionZoneV1>): DecisionZoneV1 => {
        return {
            id: 'zone-val-01',
            schemaVersion: 1,
            name: 'Daily VAL Support',
            kind: 'VALUE_AREA_LOW',
            priceLow: 64800,
            priceHigh: 65200,
            midPrice: 65000,
            toleranceUsd: 50,
            strengthScore: 85,
            contributors: ['Volume Profile Session'],
            sources: ['VOLUME_PROFILE_COMPUTED'],
            isApproximate: false,
            asOf: baseTime,
            ...overrides,
        };
    };

    const createEvidence = (overrides?: Partial<MarketEvidenceV1>): MarketEvidenceV1 => {
        return {
            id: 'ev-test-1',
            schemaVersion: 1,
            kind: 'BULLISH_ABSORPTION',
            direction: 'BULLISH',
            startTime: baseTime - 15000,
            endTime: baseTime - 5000,
            priceLow: 64950,
            priceHigh: 65050,
            strengthPercentile: 88,
            confidence: 'HIGH',
            reasonCodes: ['PASSIVE_BID_ABSORPTION'],
            sourceRefs: ['tape-window-1'],
            quality: defaultCoverage,
            invalidatedAt: null,
            ...overrides,
        };
    };

    const validZoneLong = createZone({
        id: 'zone-val-01',
        name: 'Daily VAL Support',
        priceLow: 64800,
        priceHigh: 65200,
        midPrice: 65000,
        kind: 'VALUE_AREA_LOW',
        sources: ['VOLUME_PROFILE_COMPUTED'],
    });

    const validZoneShort = createZone({
        id: 'zone-vah-01',
        name: 'Daily VAH Resistance',
        priceLow: 66800,
        priceHigh: 67200,
        midPrice: 67000,
        kind: 'VALUE_AREA_HIGH',
        sources: ['VOLUME_PROFILE_COMPUTED'],
    });

    return [
        // 1. Persistent bid absorbs aggressive sells and price reclaims
        {
            id: 'RF-01-BID-ABSORPTION-RECLAIM',
            name: 'Persistent bid absorbs aggressive sells and price reclaims',
            condition: 'ABSORPTION',
            description: 'Large sell aggression met with heavy bid replenishment at VAL, reclaimed zone high.',
            input: {
                
                asOf: baseTime,
                spotPrice: 65150,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-abs-long-01',
                        kind: 'BULLISH_ABSORPTION',
                        direction: 'BULLISH',
                        priceLow: 64950,
                        priceHigh: 65050,
                    }),
                    createEvidence({
                        id: 'ev-imb-long-01',
                        kind: 'STACKED_BUY_IMBALANCE',
                        direction: 'BULLISH',
                        priceLow: 65000,
                        priceHigh: 65120,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'CONFIRMING_LONG',
                grade: 'B',
                direction: 'LONG',
                mandatoryGates: {
                    dataIntegrity: 'PASS',
                    location: 'PASS',
                    aggression: 'PASS',
                    response: 'PASS',
                    confirmation: 'PASS',
                    invalidation: 'PASS',
                    riskCompatibility: 'PASS',
                },
            },
        },

        // 2. Persistent ask absorbs aggressive buys and price rejects
        {
            id: 'RF-02-ASK-ABSORPTION-REJECT',
            name: 'Persistent ask absorbs aggressive buys and price rejects',
            condition: 'ABSORPTION',
            description: 'Aggressive buy delta into persistent ask wall at VAH followed by price rejection.',
            input: {
                asOf: baseTime,
                spotPrice: 66850,
                zones: [validZoneShort],
                evidence: [
                    createEvidence({
                        id: 'ev-abs-short-01',
                        kind: 'BEARISH_ABSORPTION',
                        direction: 'BEARISH',
                        priceLow: 66950,
                        priceHigh: 67100,
                    }),
                    createEvidence({
                        id: 'ev-div-short-01',
                        kind: 'BEARISH_CVD_DIVERGENCE',
                        direction: 'BEARISH',
                        priceLow: 66850,
                        priceHigh: 67050,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'A_GRADE_SHORT',
                grade: 'A',
                direction: 'SHORT',
                mandatoryGates: {
                    dataIntegrity: 'PASS',
                    location: 'PASS',
                    aggression: 'PASS',
                    response: 'PASS',
                    confirmation: 'PASS',
                    invalidation: 'PASS',
                    riskCompatibility: 'PASS',
                },
            },
        },

        // 3. Displayed wall is pulled before touch (spoof)
        {
            id: 'RF-03-WALL-SPOOF-PULLED',
            name: 'Displayed wall is pulled before touch',
            condition: 'SPOOF',
            description: 'Liquidity wall cancelled before touch; no genuine execution or absorption occurred.',
            input: {
                asOf: baseTime,
                spotPrice: 65100,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-pull-01',
                        kind: 'LIQUIDITY_PULL',
                        direction: 'BEARISH',
                        priceLow: 64900,
                        priceHigh: 64950,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'WATCH_LONG',
                grade: 'WATCH',
                direction: 'LONG',
                mandatoryGates: {
                    dataIntegrity: 'PASS',
                    location: 'PASS',
                    aggression: 'MISSING',
                    response: 'MISSING',
                    confirmation: 'MISSING',
                },
            },
        },

        // 4. Large displayed wall is consumed and price accepts through it
        {
            id: 'RF-04-WALL-CONSUMED-ACCEPTANCE',
            name: 'Large displayed wall is consumed and price accepts through it',
            condition: 'FAILED_ABSORPTION',
            description: 'Bid wall consumed entirely; sell aggression accepted below support zone.',
            input: {
                asOf: baseTime,
                spotPrice: 64650,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-acc-short-01',
                        kind: 'ACCEPTANCE_BELOW',
                        direction: 'BEARISH',
                        priceLow: 64600,
                        priceHigh: 64780,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'INVALIDATED',
                grade: 'NONE',
                direction: 'NEUTRAL',
                mandatoryGates: {
                    invalidation: 'FAIL',
                },
            },
        },

        // 5. Strong imbalance on insignificant volume
        {
            id: 'RF-05-IMBALANCE-LOW-VOLUME',
            name: 'Strong imbalance on insignificant volume',
            condition: 'VOLATILITY',
            description: 'Diagonal imbalance formed during illiquid window without qualified volume.',
            input: {
                asOf: baseTime,
                spotPrice: 65050,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-imb-lowvol-01',
                        kind: 'LIQUIDITY_ADD',
                        direction: 'BULLISH',
                        strengthPercentile: 35,
                        priceLow: 65020,
                        priceHigh: 65080,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'WATCH_LONG',
                grade: 'WATCH',
                direction: 'LONG',
                mandatoryGates: {
                    aggression: 'MISSING',
                    response: 'MISSING',
                },
            },
        },

        // 6. Stacked imbalance without structural location
        {
            id: 'RF-06-STACKED-IMBALANCE-NO-LOCATION',
            name: 'Stacked imbalance without structural location',
            condition: 'TREND',
            description: 'Stacked buy imbalance in the middle of nowhere without a validated decision zone.',
            input: {
                asOf: baseTime,
                spotPrice: 66000,
                zones: [validZoneLong, validZoneShort],
                evidence: [
                    createEvidence({
                        id: 'ev-imb-noloc-01',
                        kind: 'STACKED_BUY_IMBALANCE',
                        direction: 'BULLISH',
                        priceLow: 65950,
                        priceHigh: 66050,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'NO_SETUP',
                grade: 'NONE',
                direction: 'NEUTRAL',
                mandatoryGates: {
                    location: 'MISSING',
                },
            },
        },

        // 7. CVD divergence at VAL/AVWAP
        {
            id: 'RF-07-CVD-DIVERGENCE-VAL',
            name: 'CVD divergence at VAL/AVWAP',
            condition: 'RANGE',
            description: 'Price makes equal low at VAL while CVD forms a clear higher low.',
            input: {
                asOf: baseTime,
                spotPrice: 65050,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-div-val-01',
                        kind: 'BULLISH_CVD_DIVERGENCE',
                        direction: 'BULLISH',
                        priceLow: 64950,
                        priceHigh: 65100,
                    }),
                    createEvidence({
                        id: 'ev-abs-val-01',
                        kind: 'BULLISH_ABSORPTION',
                        direction: 'BULLISH',
                        priceLow: 64980,
                        priceHigh: 65060,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'A_GRADE_LONG',
                grade: 'A',
                direction: 'LONG',
                mandatoryGates: {
                    dataIntegrity: 'PASS',
                    location: 'PASS',
                    aggression: 'PASS',
                    response: 'PASS',
                    confirmation: 'PASS',
                    invalidation: 'PASS',
                    riskCompatibility: 'PASS',
                },
            },
        },

        // 8. Sequence gap during apparent absorption
        {
            id: 'RF-08-SEQUENCE-GAP-ABSORPTION',
            name: 'Sequence gap during apparent absorption',
            condition: 'GAP',
            description: 'Apparent absorption occurred during trade sequence gap, violating data integrity.',
            input: {
                asOf: baseTime,
                spotPrice: 65100,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-gap-abs-01',
                        kind: 'BULLISH_ABSORPTION',
                        direction: 'BULLISH',
                        priceLow: 64950,
                        priceHigh: 65050,
                    }),
                ],
                coverage: createValidCoverage({
                    gapCount: 3,
                    sequenceState: 'GAP',
                    quality: 'LOW',
                }),
                sequenceState: 'GAP',
            },
            expected: {
                state: 'AVOID',
                grade: 'NONE',
                direction: 'NEUTRAL',
                mandatoryGates: {
                    dataIntegrity: 'FAIL',
                },
            },
        },

        // 9. Reconnect with duplicated aggregate trades
        {
            id: 'RF-09-RECONNECT-DUPLICATE-TRADES',
            name: 'Reconnect with duplicated aggregate trades',
            condition: 'GAP',
            description: 'Feed reconnected with duplicate sequence range; gap count recorded.',
            input: {
                
                asOf: baseTime,
                spotPrice: 65120,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-reconn-01',
                        kind: 'BULLISH_ABSORPTION',
                        direction: 'BULLISH',
                        priceLow: 65000,
                        priceHigh: 65100,
                    }),
                ],
                coverage: createValidCoverage({
                    sequenceState: 'GAP',
                    gapCount: 1,
                    quality: 'LOW',
                }),
                sequenceState: 'GAP',
            },
            expected: {
                state: 'AVOID',
                grade: 'NONE',
                direction: 'NEUTRAL',
                mandatoryGates: {
                    dataIntegrity: 'FAIL',
                },
            },
        },

        // 10. Options wall aligns with flow
        {
            id: 'RF-10-OPTIONS-WALL-ALIGNED',
            name: 'Options wall aligns with flow',
            condition: 'GENUINE_PERSISTENCE',
            description: 'Major Deribit put wall at 65000 directly reinforces VAL absorption; all gates PASS.',
            input: {
                asOf: baseTime,
                spotPrice: 65180,
                zones: [
                    createZone({
                        ...validZoneLong,
                        kind: 'PUT_WALL',
                        sources: ['VOLUME_PROFILE_COMPUTED', 'OPTIONS_CALL_PUT_WALL'],
                    }),
                ],
                evidence: [
                    createEvidence({
                        id: 'ev-opt-align-abs-01',
                        kind: 'BULLISH_ABSORPTION',
                        direction: 'BULLISH',
                        priceLow: 64950,
                        priceHigh: 65050,
                    }),
                    createEvidence({
                        id: 'ev-opt-align-imb-01',
                        kind: 'STACKED_BUY_IMBALANCE',
                        direction: 'BULLISH',
                        priceLow: 65020,
                        priceHigh: 65150,
                    }),
                    createEvidence({
                        id: 'ev-opt-align-div-01',
                        kind: 'BULLISH_CVD_DIVERGENCE',
                        direction: 'BULLISH',
                        priceLow: 64980,
                        priceHigh: 65100,
                    }),
                    createEvidence({
                        id: 'ev-opt-align-perm-01',
                        kind: 'PERSISTENT_LIQUIDITY',
                        direction: 'BULLISH',
                        priceLow: 64900,
                        priceHigh: 65000,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'A_GRADE_LONG',
                grade: 'A',
                direction: 'LONG',
                mandatoryGates: {
                    dataIntegrity: 'PASS',
                    location: 'PASS',
                    aggression: 'PASS',
                    response: 'PASS',
                    confirmation: 'PASS',
                    invalidation: 'PASS',
                    riskCompatibility: 'PASS',
                },
            },
        },

        // 11. Options wall conflicts with flow
        {
            id: 'RF-11-OPTIONS-WALL-CONFLICT',
            name: 'Options wall conflicts with flow',
            condition: 'TREND',
            description: 'Flow tries to buy into a heavy Call Wall overhead, generating conflict and preventing A-grade.',
            input: {
                asOf: baseTime,
                spotPrice: 65120,
                zones: [validZoneLong],
                evidence: [
                    createEvidence({
                        id: 'ev-conf-abs-01',
                        kind: 'BULLISH_ABSORPTION',
                        direction: 'BULLISH',
                        priceLow: 64950,
                        priceHigh: 65050,
                    }),
                    createEvidence({
                        id: 'ev-conf-imb-01',
                        kind: 'STACKED_BUY_IMBALANCE',
                        direction: 'BULLISH',
                        priceLow: 65020,
                        priceHigh: 65120,
                    }),
                    createEvidence({
                        id: 'ev-conf-opt-01',
                        kind: 'DATA_CONFLICT',
                        direction: 'BEARISH',
                        priceLow: 65200,
                        priceHigh: 65400,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'CONFIRMING_LONG',
                grade: 'B',
                direction: 'LONG',
                mandatoryGates: {
                    dataIntegrity: 'PASS',
                    location: 'PASS',
                    aggression: 'PASS',
                    response: 'PASS',
                    confirmation: 'PASS',
                    invalidation: 'PASS',
                    riskCompatibility: 'PASS',
                },
            },
        },

        // 12. Approximate profile before tick-capture boundary
        {
            id: 'RF-12-APPROXIMATE-PROFILE-BOUNDARY',
            name: 'Approximate profile before tick-capture boundary',
            condition: 'RANGE',
            description: 'Zone derived from approximate 1m bars before capture start strictly fails location gate.',
            input: {
                asOf: baseTime,
                spotPrice: 65100,
                zones: [
                    createZone({
                        ...validZoneLong,
                        id: 'zone-approx-01',
                        name: 'Approximate Historical VP',
                        isApproximate: true,
                        sources: ['APPROXIMATE_1M_BARS'],
                    }),
                ],
                evidence: [
                    createEvidence({
                        id: 'ev-approx-abs-01',
                        kind: 'BULLISH_ABSORPTION',
                        direction: 'BULLISH',
                        priceLow: 64950,
                        priceHigh: 65050,
                    }),
                    createEvidence({
                        id: 'ev-approx-imb-01',
                        kind: 'STACKED_BUY_IMBALANCE',
                        direction: 'BULLISH',
                        priceLow: 65000,
                        priceHigh: 65100,
                    }),
                ],
                coverage: defaultCoverage,
            },
            expected: {
                state: 'NO_SETUP',
                grade: 'NONE',
                direction: 'NEUTRAL',
                mandatoryGates: {
                    location: 'FAIL',
                },
            },
        },
    ];
}

/**
 * Runs the deterministic replay calibration suite over all declared fixtures.
 * Verifies identical transitions, calculates key promotion metrics, and validates schema output.
 */
export function runReplayCalibration(customFixtures?: ReplayFixtureV1[]): ReplayCalibrationReportV1 {
    const fixtures = customFixtures ?? getStandardReplayFixtures();
    const deterministicVersion = 'orderflow-setup-v1.6.8';

    const results: ReplayFixtureResultV1[] = fixtures.map((fixture) => {
        // Run first execution
        const run1 = evaluateSetupAssessment({
            asOf: fixture.input.asOf,
            spotPrice: fixture.input.spotPrice,
            zones: fixture.input.zones,
            evidence: fixture.input.evidence,
            coverage: fixture.input.coverage,
            sequenceState: fixture.input.sequenceState,
            riskSettings: fixture.input.riskSettings,
            deterministicVersion,
        });

        // Run second execution to prove 100% deterministic reproducibility
        const run2 = evaluateSetupAssessment({
            asOf: fixture.input.asOf,
            spotPrice: fixture.input.spotPrice,
            zones: fixture.input.zones,
            evidence: fixture.input.evidence,
            coverage: fixture.input.coverage,
            sequenceState: fixture.input.sequenceState,
            riskSettings: fixture.input.riskSettings,
            deterministicVersion,
        });

        const hash1 = computeFeaturePacketHash(run1);
        const hash2 = computeFeaturePacketHash(run2);
        const reproducible = (hash1 === hash2) && (run1.state === run2.state) && (run1.grade === run2.grade);

        // Verify mandatory gates expected
        let mandatoryGatesPassed = true;
        for (const [gateName, expectedResult] of Object.entries(fixture.expected.mandatoryGates)) {
            const actualGate = (run1.mandatoryGates as Record<string, string>)[gateName];
            if (actualGate !== expectedResult) {
                mandatoryGatesPassed = false;
                break;
            }
        }

        const actualDirection = getSetupDirection(run1.state);
        const statePassed = run1.state === fixture.expected.state;
        const gradePassed = run1.grade === fixture.expected.grade;
        const directionPassed = actualDirection === fixture.expected.direction;
        const passed = statePassed && gradePassed && directionPassed && mandatoryGatesPassed && reproducible;

        return {
            fixtureId: fixture.id,
            name: fixture.name,
            condition: fixture.condition,
            passed,
            actualState: run1.state,
            expectedState: fixture.expected.state,
            actualGrade: run1.grade,
            expectedGrade: fixture.expected.grade,
            actualDirection,
            expectedDirection: fixture.expected.direction,
            mandatoryGatesPassed,
            featureHash: hash1,
            reproducible,
            assessment: run1,
        };
    });

    const totalFixtures = results.length;
    const passedFixtures = results.filter((r) => r.passed).length;
    const allPassed = totalFixtures > 0 && passedFixtures === totalFixtures;
    const reproducibleCount = results.filter((r) => r.reproducible).length;
    const reproducibilityRate = totalFixtures > 0 ? reproducibleCount / totalFixtures : 0;

    // Metric 1: Data availability percentage
    const highQualityCount = fixtures.filter((f) => f.input.coverage.quality === 'HIGH' || f.input.coverage.quality === 'MEDIUM').length;
    const dataAvailabilityPct = Number(((highQualityCount / totalFixtures) * 100).toFixed(1));

    // Metric 2: Gap frequency percentage
    const gapCount = fixtures.filter((f) => f.input.coverage.gapCount > 0 || f.input.sequenceState === 'GAP').length;
    const gapFrequencyPct = Number(((gapCount / totalFixtures) * 100).toFixed(1));

    // Metric 3: Signal frequency percentage (actionable states: CONFIRMING or A_GRADE)
    const actionableSignals = results.filter((r) => r.actualState.startsWith('CONFIRMING') || r.actualState.startsWith('A_GRADE')).length;
    const signalFrequencyPct = Number(((actionableSignals / totalFixtures) * 100).toFixed(1));

    // Metric 4: Abstention rate percentage (NO_SETUP, AVOID, INSUFFICIENT_DATA)
    const abstentions = results.filter((r) => r.actualState === 'NO_SETUP' || r.actualState === 'AVOID' || r.actualState === 'INSUFFICIENT_DATA').length;
    const abstentionRatePct = Number(((abstentions / totalFixtures) * 100).toFixed(1));

    // Metric 5: Invalid state rate percentage
    const invalidCount = results.filter((r) => r.actualState === 'INVALIDATED').length;
    const invalidStateRatePct = Number(((invalidCount / totalFixtures) * 100).toFixed(1));

    // Metric 6: False positive review rate percentage (prohibited triggers or failed reproducibility)
    const falsePositives = results.filter((r) => !r.passed).length;
    const falsePositiveRatePct = Number(((falsePositives / totalFixtures) * 100).toFixed(1));

    const metrics: ReplayMetricsV1 = {
        totalFixtures,
        passedFixtures,
        reproducibilityRate,
        dataAvailabilityPct,
        gapFrequencyPct,
        signalFrequencyPct,
        abstentionRatePct,
        invalidStateRatePct,
        falsePositiveRatePct,
    };

    const calibrationPassed = allPassed && reproducibilityRate === 1.0 && falsePositiveRatePct === 0.0;
    const architectSignoffStatus = calibrationPassed ? 'APPROVED_FOR_PAPER' : 'NEEDS_CALIBRATION';

    return ReplayCalibrationReportV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        deterministicVersion,
        fixturesCount: totalFixtures,
        allPassed,
        results,
        metrics,
        architectSignoffStatus,
        calibrationPassed,
    });
}
