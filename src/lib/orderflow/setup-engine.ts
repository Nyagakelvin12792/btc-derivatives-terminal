/**
 * Setup State Machine Engine (Milestone UX16.6)
 *
 * Implements deterministic setup state classification, 7 mandatory gates,
 * enhancers, conflict isolation, trigger/invalidation generation, and replayable grading.
 *
 * All assessments strictly validate against `SetupAssessmentV1Schema`.
 */

import {
    ORDERFLOW_SCHEMA_VERSION,
    type CaptureCoverageV1,
    type MarketEvidenceV1,
    type SetupAssessmentV1,
    type SetupState,
    SetupAssessmentV1Schema,
} from './contracts';
import type { DecisionZoneV1 } from './evidence-contracts';
import { canSatisfyMandatoryGate } from './evidence-engine';

export interface EvaluateSetupAssessmentOptions {
    asOf: number;
    spotPrice: number;
    zones: DecisionZoneV1[];
    evidence: MarketEvidenceV1[];
    coverage: CaptureCoverageV1;
    sequenceState?: 'LIVE' | 'GAP' | 'CONNECTING' | 'REPLAY' | 'OFFLINE';
    riskSettings?: {
        accountEquityUsd?: number;
        maxRiskPerTradeUsd?: number;
        maxRiskPct?: number;
        leverage?: number;
    };
    preferredDirection?: 'LONG' | 'SHORT' | 'AUTO';
    deterministicVersion?: string;
    overrideZone?: { low: number; high: number; label: string } | null;
}

/**
 * Evaluates the deterministic setup state machine for BTCUSDT.
 */
export function evaluateSetupAssessment(options: EvaluateSetupAssessmentOptions): SetupAssessmentV1 {
    const {
        asOf,
        spotPrice,
        zones,
        evidence,
        coverage,
        sequenceState = 'LIVE',
        preferredDirection = 'AUTO',
        deterministicVersion = 'ux16.6-setup-engine',
        overrideZone,
    } = options;

    // --- GATE 1: Data Integrity ---
    let dataIntegrityGate: 'PASS' | 'FAIL' | 'MISSING' = 'MISSING';
    if (coverage.quality === 'UNAVAILABLE' || sequenceState === 'OFFLINE' || coverage.sequenceState === 'OFFLINE') {
        dataIntegrityGate = 'MISSING';
    } else if (sequenceState === 'GAP' || coverage.sequenceState === 'GAP' || coverage.gapCount > 0) {
        dataIntegrityGate = 'FAIL';
    } else if (sequenceState === 'LIVE' || sequenceState === 'REPLAY') {
        if (coverage.quality === 'HIGH' || coverage.quality === 'MEDIUM') {
            dataIntegrityGate = 'PASS';
        } else if (coverage.quality === 'LOW') {
            dataIntegrityGate = 'FAIL';
        } else {
            dataIntegrityGate = 'MISSING';
        }
    }

    // --- GATE 2: Location (Decision Zone) ---
    let locationGate: 'PASS' | 'FAIL' | 'MISSING' = 'MISSING';
    let activeZone: { low: number; high: number; label: string } | null = null;
    let matchingZoneObject: DecisionZoneV1 | null = null;

    if (overrideZone) {
        activeZone = overrideZone;
        locationGate = 'PASS';
    } else if (zones.length > 0) {
        // Find nearest zone where spot price is inside, testing, or recently breached
        // Sort zones by proximity to spotPrice
        const sortedZones = [...zones].sort((a, b) => {
            const distA = Math.max(0, a.priceLow - spotPrice, spotPrice - a.priceHigh);
            const distB = Math.max(0, b.priceLow - spotPrice, spotPrice - b.priceHigh);
            return distA - distB;
        });

        const nearest = sortedZones[0];
        const width = Math.max(10, nearest.priceHigh - nearest.priceLow);
        const testingTolerance = Math.max(30, width * 0.25);
        const maxProximityDistance = Math.max(150, width * 0.75);
        const distanceToZone = Math.max(0, nearest.priceLow - spotPrice, spotPrice - nearest.priceHigh);

        if (distanceToZone <= maxProximityDistance) {
            matchingZoneObject = nearest;
            const gateCheck = canSatisfyMandatoryGate(nearest);
            if (!gateCheck.allowed || nearest.isApproximate || nearest.sources.some((s) => s.includes('APPROXIMATE'))) {
                // Approximate volume profile zone cannot satisfy mandatory gate
                locationGate = 'FAIL';
            } else {
                locationGate = 'PASS';
            }
            activeZone = {
                low: nearest.priceLow,
                high: nearest.priceHigh,
                label: nearest.name,
            };
        } else {
            locationGate = 'MISSING';
        }
    }

    // --- Direction Determination ---
    let direction: 'LONG' | 'SHORT' = 'LONG';
    if (preferredDirection === 'LONG') {
        direction = 'LONG';
    } else if (preferredDirection === 'SHORT') {
        direction = 'SHORT';
    } else {
        // Auto direction determination based on evidence and zone characteristics
        let bullishEvidenceCount = 0;
        let bearishEvidenceCount = 0;

        for (const item of evidence) {
            if (
                item.kind === 'BULLISH_ABSORPTION' ||
                item.kind === 'STACKED_BUY_IMBALANCE' ||
                item.kind === 'BUY_IMBALANCE' ||
                item.kind === 'BULLISH_CVD_DIVERGENCE' ||
                item.kind === 'ACCEPTANCE_ABOVE'
            ) {
                bullishEvidenceCount++;
            } else if (
                item.kind === 'BEARISH_ABSORPTION' ||
                item.kind === 'STACKED_SELL_IMBALANCE' ||
                item.kind === 'SELL_IMBALANCE' ||
                item.kind === 'BEARISH_CVD_DIVERGENCE' ||
                item.kind === 'ACCEPTANCE_BELOW'
            ) {
                bearishEvidenceCount++;
            }
        }

        if (matchingZoneObject) {
            if (matchingZoneObject.kind === 'PUT_WALL' || matchingZoneObject.kind === 'VALUE_AREA_LOW') {
                bullishEvidenceCount += 2;
            } else if (matchingZoneObject.kind === 'CALL_WALL' || matchingZoneObject.kind === 'VALUE_AREA_HIGH') {
                bearishEvidenceCount += 2;
            }
        }

        direction = bullishEvidenceCount >= bearishEvidenceCount ? 'LONG' : 'SHORT';
    }

    // --- Separate Aligned vs Conflicting Evidence ---
    const alignedEvidenceIds: string[] = [];
    const conflictEvidenceIds: string[] = [];

    for (const item of evidence) {
        if (item.kind === 'DATA_CONFLICT') {
            conflictEvidenceIds.push(item.id);
            continue;
        }

        if (direction === 'LONG') {
            if (
                item.kind === 'BULLISH_ABSORPTION' ||
                item.kind === 'STACKED_BUY_IMBALANCE' ||
                item.kind === 'BUY_IMBALANCE' ||
                item.kind === 'BULLISH_CVD_DIVERGENCE' ||
                item.kind === 'ACCEPTANCE_ABOVE' ||
                item.direction === 'BULLISH'
            ) {
                alignedEvidenceIds.push(item.id);
            } else if (
                item.kind === 'BEARISH_ABSORPTION' ||
                item.kind === 'ACCEPTANCE_BELOW' ||
                item.kind === 'BEARISH_CVD_DIVERGENCE' ||
                item.direction === 'BEARISH'
            ) {
                conflictEvidenceIds.push(item.id);
            }
        } else {
            // SHORT
            if (
                item.kind === 'BEARISH_ABSORPTION' ||
                item.kind === 'STACKED_SELL_IMBALANCE' ||
                item.kind === 'SELL_IMBALANCE' ||
                item.kind === 'BEARISH_CVD_DIVERGENCE' ||
                item.kind === 'ACCEPTANCE_BELOW' ||
                item.direction === 'BEARISH'
            ) {
                alignedEvidenceIds.push(item.id);
            } else if (
                item.kind === 'BULLISH_ABSORPTION' ||
                item.kind === 'ACCEPTANCE_ABOVE' ||
                item.kind === 'BULLISH_CVD_DIVERGENCE' ||
                item.direction === 'BULLISH'
            ) {
                conflictEvidenceIds.push(item.id);
            }
        }
    }

    // --- GATE 3: Aggression ---
    let aggressionGate: 'PASS' | 'FAIL' | 'MISSING' = 'MISSING';
    const hasAggression = evidence.some((e) => {
        if (direction === 'LONG') {
            return (
                e.kind === 'BULLISH_ABSORPTION' ||
                e.kind === 'STACKED_BUY_IMBALANCE' ||
                e.kind === 'BUY_IMBALANCE'
            );
        } else {
            return (
                e.kind === 'BEARISH_ABSORPTION' ||
                e.kind === 'STACKED_SELL_IMBALANCE' ||
                e.kind === 'SELL_IMBALANCE'
            );
        }
    });

    if (hasAggression) {
        aggressionGate = 'PASS';
    } else {
        aggressionGate = 'MISSING';
    }

    // --- GATE 4: Response ---
    let responseGate: 'PASS' | 'FAIL' | 'MISSING' = 'MISSING';
    const hasOpposingAcceptance = evidence.some((e) => {
        return direction === 'LONG'
            ? e.kind === 'ACCEPTANCE_BELOW'
            : e.kind === 'ACCEPTANCE_ABOVE';
    });

    if (hasOpposingAcceptance) {
        responseGate = 'FAIL';
    } else {
        const hasFavorableResponse = evidence.some((e) => {
            if (direction === 'LONG') {
                return e.kind === 'BULLISH_ABSORPTION' || e.kind === 'ACCEPTANCE_ABOVE';
            } else {
                return e.kind === 'BEARISH_ABSORPTION' || e.kind === 'ACCEPTANCE_BELOW';
            }
        });
        if (hasFavorableResponse) {
            responseGate = 'PASS';
        } else {
            responseGate = 'MISSING';
        }
    }

    // --- GATE 5: Confirmation ---
    let confirmationGate: 'PASS' | 'FAIL' | 'MISSING' = 'MISSING';
    const hasDivergence = evidence.some((e) => {
        return direction === 'LONG'
            ? e.kind === 'BULLISH_CVD_DIVERGENCE'
            : e.kind === 'BEARISH_CVD_DIVERGENCE';
    });

    // Confirmation can come from CVD divergence or subsequent stacked imbalance
    const hasFollowThrough = evidence.some((e) => {
        return direction === 'LONG'
            ? e.kind === 'STACKED_BUY_IMBALANCE'
            : e.kind === 'STACKED_SELL_IMBALANCE';
    });

    if (hasDivergence || hasFollowThrough) {
        confirmationGate = 'PASS';
    } else {
        confirmationGate = 'MISSING';
    }

    // --- Invalidation & GATE 6: Invalidation ---
    let invalidation: { description: string; price: number | null } | null = null;
    let invalidationGate: 'PASS' | 'FAIL' | 'MISSING' = 'MISSING';

    if (activeZone) {
        const zoneHeight = Math.max(10, activeZone.high - activeZone.low);
        const buffer = Math.max(15, zoneHeight * 0.15);

        if (direction === 'LONG') {
            const invPrice = Math.round((activeZone.low - buffer) * 100) / 100;
            invalidation = {
                description: `1m close below structural zone floor ($${Math.round(invPrice).toLocaleString()})`,
                price: invPrice,
            };
            if (spotPrice <= invPrice) {
                invalidationGate = 'FAIL';
            } else {
                invalidationGate = 'PASS';
            }
        } else {
            const invPrice = Math.round((activeZone.high + buffer) * 100) / 100;
            invalidation = {
                description: `1m close above structural zone ceiling ($${Math.round(invPrice).toLocaleString()})`,
                price: invPrice,
            };
            if (spotPrice >= invPrice) {
                invalidationGate = 'FAIL';
            } else {
                invalidationGate = 'PASS';
            }
        }
    } else {
        invalidation = null;
        invalidationGate = 'MISSING';
    }

    // --- Trigger Definition ---
    let trigger: { description: string; price: number | null } | null = null;
    if (activeZone) {
        if (direction === 'LONG') {
            const triggerPrice = Math.round((activeZone.high + 10) * 100) / 100;
            trigger = {
                description: `Reclaim and 1m close above $${Math.round(triggerPrice).toLocaleString()} with positive delta`,
                price: triggerPrice,
            };
        } else {
            const triggerPrice = Math.round((activeZone.low - 10) * 100) / 100;
            trigger = {
                description: `Rejection and 1m close below $${Math.round(triggerPrice).toLocaleString()} with negative delta`,
                price: triggerPrice,
            };
        }
    }

    // --- GATE 7: Risk Compatibility ---
    let riskCompatibilityGate: 'PASS' | 'FAIL' | 'MISSING' = 'MISSING';
    if (invalidation && invalidation.price !== null && activeZone) {
        const riskDistance =
            direction === 'LONG'
                ? spotPrice - invalidation.price
                : invalidation.price - spotPrice;

        if (riskDistance > 0 && riskDistance / spotPrice <= 0.05) {
            riskCompatibilityGate = 'PASS';
        } else {
            riskCompatibilityGate = 'FAIL';
        }
    } else {
        riskCompatibilityGate = 'MISSING';
    }

    // --- ENHANCERS ---
    const enhancers: Record<string, 'ALIGNED' | 'CONFLICTING' | 'UNAVAILABLE'> = {
        optionsRegime: 'UNAVAILABLE',
        persistentLiquidity: 'UNAVAILABLE',
        cvdDivergence: 'UNAVAILABLE',
        volumeProfile: 'UNAVAILABLE',
    };

    // 1. Persistent liquidity enhancer
    const hasPersistentWall = evidence.some((e) => e.kind === 'PERSISTENT_LIQUIDITY');
    if (hasPersistentWall) {
        const hasAlignedWall = evidence.some(
            (e) =>
                e.kind === 'PERSISTENT_LIQUIDITY' &&
                ((direction === 'LONG' && e.direction === 'BULLISH') ||
                    (direction === 'SHORT' && e.direction === 'BEARISH'))
        );
        enhancers.persistentLiquidity = hasAlignedWall ? 'ALIGNED' : 'CONFLICTING';
    }

    // 2. CVD divergence enhancer
    const hasCvdDiv = evidence.some(
        (e) => e.kind === 'BULLISH_CVD_DIVERGENCE' || e.kind === 'BEARISH_CVD_DIVERGENCE'
    );
    if (hasCvdDiv) {
        const hasAlignedDiv = evidence.some((e) =>
            direction === 'LONG'
                ? e.kind === 'BULLISH_CVD_DIVERGENCE'
                : e.kind === 'BEARISH_CVD_DIVERGENCE'
        );
        enhancers.cvdDivergence = hasAlignedDiv ? 'ALIGNED' : 'CONFLICTING';
    }

    // 3. Options regime enhancer
    if (matchingZoneObject) {
        if (
            (direction === 'LONG' && matchingZoneObject.kind === 'PUT_WALL') ||
            (direction === 'SHORT' && matchingZoneObject.kind === 'CALL_WALL')
        ) {
            enhancers.optionsRegime = 'ALIGNED';
        } else if (
            (direction === 'LONG' && matchingZoneObject.kind === 'CALL_WALL') ||
            (direction === 'SHORT' && matchingZoneObject.kind === 'PUT_WALL')
        ) {
            enhancers.optionsRegime = 'CONFLICTING';
        }
    }

    // 4. Volume profile enhancer
    if (matchingZoneObject) {
        if (
            matchingZoneObject.kind === 'POINT_OF_CONTROL' ||
            (direction === 'LONG' && matchingZoneObject.kind === 'VALUE_AREA_LOW') ||
            (direction === 'SHORT' && matchingZoneObject.kind === 'VALUE_AREA_HIGH')
        ) {
            enhancers.volumeProfile = 'ALIGNED';
        }
    }

    const mandatoryGates: Record<string, 'PASS' | 'FAIL' | 'MISSING'> = {
        dataIntegrity: dataIntegrityGate,
        location: locationGate,
        aggression: aggressionGate,
        response: responseGate,
        confirmation: confirmationGate,
        invalidation: invalidationGate,
        riskCompatibility: riskCompatibilityGate,
    };

    // --- State and Grade Resolution ---
    let state: SetupState = 'NO_SETUP';
    let grade: 'A' | 'B' | 'WATCH' | 'NONE' = 'NONE';

    // Rule 1: Critical data missing -> INSUFFICIENT_DATA
    if (dataIntegrityGate === 'MISSING' || coverage.quality === 'UNAVAILABLE') {
        state = 'INSUFFICIENT_DATA';
        grade = 'NONE';
    }
    // Rule 2: Critical failure, sequence gap, or severe data conflict -> AVOID
    else if (dataIntegrityGate === 'FAIL' || conflictEvidenceIds.length > 2) {
        state = 'AVOID';
        grade = 'NONE';
    }
    // Rule 3: Invalidation breached -> INVALIDATED
    else if (activeZone !== null && invalidationGate === 'FAIL') {
        state = 'INVALIDATED';
        grade = 'NONE';
    }
    // Rule 4: No location or location failed -> NO_SETUP
    else if (locationGate === 'MISSING' || locationGate === 'FAIL') {
        state = 'NO_SETUP';
        grade = 'NONE';
    }
    // Rule 5: Location PASS & Data integrity PASS -> evaluate setup grade
    else {
        const allMandatoryPass = Object.values(mandatoryGates).every((g) => g === 'PASS');
        const alignedEnhancersCount = Object.values(enhancers).filter((e) => e === 'ALIGNED').length;
        const noConflicts = conflictEvidenceIds.length === 0;

        if (
            allMandatoryPass &&
            alignedEnhancersCount >= 2 &&
            noConflicts &&
            coverage.quality === 'HIGH' &&
            trigger !== null &&
            invalidation !== null
        ) {
            state = direction === 'LONG' ? 'A_GRADE_LONG' : 'A_GRADE_SHORT';
            grade = 'A';
        } else if (
            mandatoryGates.dataIntegrity === 'PASS' &&
            mandatoryGates.location === 'PASS' &&
            mandatoryGates.invalidation === 'PASS' &&
            mandatoryGates.riskCompatibility === 'PASS' &&
            (mandatoryGates.aggression === 'PASS' || mandatoryGates.response === 'PASS')
        ) {
            state = direction === 'LONG' ? 'CONFIRMING_LONG' : 'CONFIRMING_SHORT';
            grade = 'B';
        } else if (mandatoryGates.location === 'PASS') {
            state = direction === 'LONG' ? 'WATCH_LONG' : 'WATCH_SHORT';
            grade = 'WATCH';
        } else {
            state = 'NO_SETUP';
            grade = 'NONE';
        }
    }

    const assessment: SetupAssessmentV1 = {
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        state,
        asOf,
        symbol: 'BTCUSDT',
        contextTimeframes: ['4h', '1h'],
        triggerTimeframe: '5m',
        zone: activeZone,
        trigger,
        invalidation,
        mandatoryGates,
        enhancers,
        evidenceIds: alignedEvidenceIds.slice(0, 32),
        conflictIds: conflictEvidenceIds.slice(0, 32),
        grade,
        dataQuality: coverage,
        deterministicVersion,
    };

    // Strictly validate against Zod schema
    return SetupAssessmentV1Schema.parse(assessment);
}

/**
 * Replays a sequence of setup evaluation states deterministically.
 */
export function replaySetupStateSequence(steps: EvaluateSetupAssessmentOptions[]): SetupAssessmentV1[] {
    return steps.map((step) => evaluateSetupAssessment(step));
}

/**
 * Checks if a setup is in an actionable state (A_GRADE or CONFIRMING with trigger).
 */
export function isSetupActionable(assessment: SetupAssessmentV1): boolean {
    return (
        (assessment.grade === 'A' || assessment.grade === 'B') &&
        assessment.trigger !== null &&
        assessment.trigger.price !== null
    );
}

/**
 * Returns the directional bias of a setup assessment.
 */
export function getSetupDirection(state: SetupState): 'LONG' | 'SHORT' | 'NEUTRAL' {
    if (state === 'A_GRADE_LONG' || state === 'CONFIRMING_LONG' || state === 'WATCH_LONG') {
        return 'LONG';
    }
    if (state === 'A_GRADE_SHORT' || state === 'CONFIRMING_SHORT' || state === 'WATCH_SHORT') {
        return 'SHORT';
    }
    return 'NEUTRAL';
}
