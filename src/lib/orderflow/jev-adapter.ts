/**
 * Jev Shadow Server Adapter (Milestone UX16.7 & UX20.2-JEV-01)
 *
 * Implements server-side schema-validated, canonical-keyed, kill-switched deterministic
 * explanation of an accepted setup feature packet.
 *
 * Security & Integrity Guarantees (UX20.2-JEV-01):
 * - Zero external LLM/provider calls with or without an API key ($0 spend).
 * - Server-derived canonical packet hash prevents cross-user client hash collisions.
 * - Abstention check runs BEFORE cache lookup so NO_SETUP after AGREE never returns a cached AGREE.
 * - Bounded in-memory cache (max 256 entries, 60s TTL).
 */

import {
    ORDERFLOW_SCHEMA_VERSION,
    computeFeaturePacketHash,
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

const cache = new Map<string, { response: JevShadowResponseV1; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 256;

export function clearJevShadowCache(): void {
    cache.clear();
}

function setBoundedCache(key: string, response: JevShadowResponseV1): void {
    const now = Date.now();
    if (cache.size >= MAX_CACHE_ENTRIES) {
        // Evict expired or oldest entry
        for (const [k, v] of cache.entries()) {
            if (v.expiresAt <= now) {
                cache.delete(k);
            }
        }
        if (cache.size >= MAX_CACHE_ENTRIES) {
            const firstKey = cache.keys().next().value;
            if (firstKey !== undefined) cache.delete(firstKey);
        }
    }
    cache.set(key, { response, expiresAt: now + CACHE_TTL_MS });
}

export function computeServerCanonicalPacketHash(request: JevShadowRequestV1): string {
    const a = request.assessment;
    return computeFeaturePacketHash({
        state: a.state,
        grade: a.grade,
        zoneLabel: a.zone?.label ?? null,
        zoneLow: a.zone?.low ?? null,
        zoneHigh: a.zone?.high ?? null,
        triggerPrice: a.trigger?.price ?? null,
        invalidationPrice: a.invalidation?.price ?? null,
        evidenceIds: a.evidenceIds,
        conflictIds: a.conflictIds,
        mandatoryGates: a.mandatoryGates,
    });
}

export function createAbstainResponse(
    featurePacketHash: string,
    reason: string,
    model: string = 'jev-v1-local-deterministic'
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

export async function evaluateJevShadow(options: EvaluateJevShadowOptions): Promise<JevShadowResponseV1> {
    const {
        request,
        enabled = process.env.JEV_SHADOW_ENABLED === 'true',
        model = 'jev-v1-local-deterministic',
        timeoutMs = 4000,
        mockEvaluator,
    } = options;

    // 1. Strict Schema Validation on Input Request
    const validatedRequest = JevShadowRequestV1Schema.parse(request);
    const serverCanonicalHash = computeServerCanonicalPacketHash(validatedRequest);
    const responseHash = validatedRequest.featurePacketHash;
    if (model !== 'jev-v1-local-deterministic') {
        return createAbstainResponse(responseHash, 'Unsupported Jev model.');
    }

    // 2. Kill Switch Safeguard
    if (!enabled) {
        return createAbstainResponse(responseHash, 'Jev shadow explanation is disabled by kill switch.', model);
    }

    // 3. Abstention Check BEFORE Cache Lookup (prevents reused client key returning stale AGREE on NO_SETUP)
    if (
        validatedRequest.assessment.state === 'INSUFFICIENT_DATA' ||
        validatedRequest.assessment.state === 'AVOID' ||
        validatedRequest.assessment.state === 'NO_SETUP' ||
        validatedRequest.missingInputs.length > 0 ||
        validatedRequest.assessment.dataQuality.quality === 'UNAVAILABLE'
    ) {
        const reason = validatedRequest.missingInputs.length > 0
            ? `Missing required market inputs (${validatedRequest.missingInputs.join(', ')}). Jev shadow abstains.`
            : `Deterministic state is ${validatedRequest.assessment.state}. Jev shadow abstains on unqualified setups.`;
        return createAbstainResponse(responseHash, reason, model);
    }

    // 4. Server-Owned Canonical Cache Key Lookup
    const cacheKey = `${serverCanonicalHash}::${responseHash}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.response;
    }

    // 5. Pure Local Deterministic Synthesis (or test mockEvaluator) — Zero external LLM calls
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
                featurePacketHash: responseHash,
            });
        } else {
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
                featurePacketHash: responseHash,
            });
        }

        if (responsePayload.featurePacketHash !== responseHash) {
            return createAbstainResponse(responseHash, 'Feature packet hash mismatch detected. Response discarded.', model);
        }

        setBoundedCache(cacheKey, responsePayload);
        return responsePayload;
    } catch {
        return createAbstainResponse(responseHash, 'Jev shadow evaluation unavailable.', model);
    }
}
