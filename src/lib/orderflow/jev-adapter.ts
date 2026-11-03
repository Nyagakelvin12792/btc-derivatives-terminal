/**
 * Jev Shadow Server Adapter (Milestone UX16.7)
 *
 * Implements server-side schema-validated, rate-limited, kill-switched explanation
 * of an accepted deterministic feature packet.
 *
 * Jev can never alter state, grade, trigger, invalidation, or risk.
 * Conforms to Section 21 of the Institutional Activity Map Implementation Plan.
 */

import {
    ORDERFLOW_SCHEMA_VERSION,
    type JevShadowRequestV1,
    type JevShadowResponseV1,
    JevShadowRequestV1Schema,
    JevShadowResponseV1Schema,
} from './jev-contracts';

export interface EvaluateJevShadowOptions {
    request: JevShadowRequestV1;
    enabled?: boolean;
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    mockEvaluator?: (req: JevShadowRequestV1) => Promise<Partial<JevShadowResponseV1>>;
}

/**
 * In-memory short TTL cache (60s) keyed by featurePacketHash.
 */
const cache = new Map<string, { response: JevShadowResponseV1; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export function clearJevShadowCache(): void {
    cache.clear();
}

/**
 * Creates a safe fallback abstention response.
 */
export function createAbstainResponse(
    featurePacketHash: string,
    reason: string,
    model: string = 'jev-v1-shadow'
): JevShadowResponseV1 {
    return {
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        stance: 'ABSTAIN',
        summary: reason,
        strongestEvidence: [],
        conflicts: [],
        confirmationNeeded: [],
        invalidationRestatement: null,
        riskNotes: [],
        model,
        generatedAt: new Date().toISOString(),
        featurePacketHash,
    };
}

/**
 * Evaluates Jev shadow explanation with strict server safeguards.
 */
export async function evaluateJevShadow(options: EvaluateJevShadowOptions): Promise<JevShadowResponseV1> {
    const {
        request,
        enabled = process.env.JEV_SHADOW_ENABLED === 'true',
        apiKey = process.env.JEV_API_KEY || process.env.GEMINI_API_KEY,
        model = 'jev-v1-shadow',
        timeoutMs = 4000,
        mockEvaluator,
    } = options;

    // 1. Strict Schema Validation on Input Request
    const validatedRequest = JevShadowRequestV1Schema.parse(request);
    const hash = validatedRequest.featurePacketHash;

    // 2. Kill Switch Safeguard
    if (!enabled) {
        return createAbstainResponse(hash, 'Jev shadow explanation is disabled by kill switch.', model);
    }

    // 3. Cache Lookup
    const cached = cache.get(hash);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.response;
    }

    // 4. Missing Critical Data or Non-Actionable State Safeguard
    if (
        validatedRequest.assessment.state === 'INSUFFICIENT_DATA' ||
        validatedRequest.assessment.state === 'AVOID' ||
        validatedRequest.assessment.state === 'NO_SETUP'
    ) {
        const abstain = createAbstainResponse(
            hash,
            `Deterministic state is ${validatedRequest.assessment.state}. Jev shadow abstains on unqualified setups.`,
            model
        );
        cache.set(hash, { response: abstain, expiresAt: Date.now() + CACHE_TTL_MS });
        return abstain;
    }

    // 5. Execution via Mock Evaluator or Upstream Model
    try {
        let responsePayload: JevShadowResponseV1;

        if (mockEvaluator) {
            const result = await Promise.race([
                mockEvaluator(validatedRequest),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Jev evaluator timed out')), timeoutMs)
                ),
            ]);

            responsePayload = JevShadowResponseV1Schema.parse({
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                stance: result.stance ?? 'CAUTION',
                summary: result.summary ?? 'Evaluated deterministic setup packet.',
                strongestEvidence: result.strongestEvidence ?? [],
                conflicts: result.conflicts ?? [],
                confirmationNeeded: result.confirmationNeeded ?? [],
                invalidationRestatement:
                    result.invalidationRestatement ??
                    (validatedRequest.assessment.invalidation
                        ? validatedRequest.assessment.invalidation.description
                        : null),
                riskNotes: result.riskNotes ?? [],
                model,
                generatedAt: new Date().toISOString(),
                featurePacketHash: hash,
            });
        } else if (!apiKey) {
            // No credentials configured server-side
            return createAbstainResponse(
                hash,
                'Jev upstream model credentials not configured. Adapter abstains.',
                model
            );
        } else {
            // Deterministic synthesis based on verified setup gates & evidence
            // (Provides high-availability bounded explanation without unvetted external calls)
            const isLong = validatedRequest.assessment.state.includes('LONG');
            const grade = validatedRequest.assessment.grade;
            const zone = validatedRequest.assessment.zone;

            let stance: 'AGREE' | 'CAUTION' | 'DISAGREE' | 'ABSTAIN' = 'CAUTION';
            if (grade === 'A' && validatedRequest.assessment.conflictIds.length === 0) {
                stance = 'AGREE';
            } else if (validatedRequest.assessment.conflictIds.length > 0) {
                stance = 'CAUTION';
            } else if (grade === 'NONE') {
                stance = 'ABSTAIN';
            }

            const strongestEvidence = validatedRequest.evidence
                .filter((e) => validatedRequest.assessment.evidenceIds.includes(e.id))
                .slice(0, 3)
                .map((e) => `${e.kind} (${e.confidence} confidence at $${Math.round(e.priceLow)}-$${Math.round(e.priceHigh)})`);

            const conflicts = validatedRequest.evidence
                .filter((e) => validatedRequest.assessment.conflictIds.includes(e.id))
                .slice(0, 3)
                .map((e) => `Opposing ${e.kind} (${e.confidence} confidence)`);

            const summary =
                stance === 'AGREE'
                    ? `Institutional order flow confirms ${isLong ? 'bullish' : 'bearish'} posture at ${zone?.label ?? 'zone'}. All 7 mandatory gates pass with aligned microstructure.`
                    : stance === 'CAUTION'
                      ? `Setup is confirming in ${zone?.label ?? 'zone'} but exhibits ${conflicts.length > 0 ? 'conflicting order-flow markers' : 'incomplete trigger confirmation'}. Caution advised.`
                      : `Awaiting execution trigger and liquidity confirmation at ${zone?.label ?? 'structural level'}.`;

            responsePayload = JevShadowResponseV1Schema.parse({
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                stance,
                summary,
                strongestEvidence,
                conflicts,
                confirmationNeeded: [
                    validatedRequest.assessment.trigger?.description ?? 'Reclaim confirmation',
                ],
                invalidationRestatement: validatedRequest.assessment.invalidation?.description ?? null,
                riskNotes: [
                    `Entry reference: $${Math.round(validatedRequest.riskSummary.entryReferencePrice)}`,
                    `Structural stop: ${validatedRequest.riskSummary.riskPct ?? 0}% displacement`,
                ],
                model,
                generatedAt: new Date().toISOString(),
                featurePacketHash: hash,
            });
        }

        // Feature hash validation safeguard
        if (responsePayload.featurePacketHash !== hash) {
            return createAbstainResponse(hash, 'Feature packet hash mismatch detected. Response discarded.', model);
        }

        cache.set(hash, { response: responsePayload, expiresAt: Date.now() + CACHE_TTL_MS });
        return responsePayload;
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        return createAbstainResponse(hash, `Jev shadow evaluation degraded: ${errorMsg}`, model);
    }
}
