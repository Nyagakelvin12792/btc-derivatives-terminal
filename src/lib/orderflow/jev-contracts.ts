/**
 * Jev Shadow Contracts (Milestone UX16.7)
 *
 * Implements schema-validated request/response contracts for bounded AI explanations.
 * Conforms to Section 21 of the Institutional Activity Map Implementation Plan.
 */

import { z } from 'zod';
import {
    ORDERFLOW_SCHEMA_VERSION,
    MarketEvidenceV1Schema,
    SetupAssessmentV1Schema,
} from './contracts';

export { ORDERFLOW_SCHEMA_VERSION };

export const JevStanceSchema = z.enum(['AGREE', 'CAUTION', 'DISAGREE', 'ABSTAIN']);
export type JevStance = z.infer<typeof JevStanceSchema>;

export const JevHigherTimeframeContextSchema = z.object({
    h4Trend: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
    h1Structure: z.string().trim().max(128),
}).strict();

export type JevHigherTimeframeContext = z.infer<typeof JevHigherTimeframeContextSchema>;

export const JevOptionsContextSchema = z.object({
    gammaRegime: z.string().trim().max(64),
    callWall: z.number().finite().positive(),
    putWall: z.number().finite().positive(),
    netGex: z.number().finite(),
}).strict();

export type JevOptionsContext = z.infer<typeof JevOptionsContextSchema>;

export const JevRiskSummarySchema = z.object({
    entryReferencePrice: z.number().finite().positive(),
    invalidationPrice: z.number().finite().positive().nullable(),
    riskDistanceUsd: z.number().finite().nullable(),
    riskPct: z.number().finite().nullable(),
}).strict();

export type JevRiskSummary = z.infer<typeof JevRiskSummarySchema>;

export const JevShadowRequestV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    assessment: SetupAssessmentV1Schema,
    evidence: z.array(MarketEvidenceV1Schema).max(64),
    higherTimeframeContext: JevHigherTimeframeContextSchema,
    optionsContext: JevOptionsContextSchema,
    riskSummary: JevRiskSummarySchema,
    missingInputs: z.array(z.string().trim().max(128)).max(16),
    featurePacketHash: z.string().trim().min(8).max(128),
}).strict();

export type JevShadowRequestV1 = z.infer<typeof JevShadowRequestV1Schema>;

export const JevShadowResponseV1Schema = z.object({
    schemaVersion: z.literal(ORDERFLOW_SCHEMA_VERSION),
    stance: JevStanceSchema,
    summary: z.string().trim().min(1).max(1000),
    strongestEvidence: z.array(z.string().trim().max(256)).max(16),
    conflicts: z.array(z.string().trim().max(256)).max(16),
    confirmationNeeded: z.array(z.string().trim().max(256)).max(16),
    invalidationRestatement: z.string().trim().max(256).nullable(),
    riskNotes: z.array(z.string().trim().max(256)).max(16),
    model: z.string().trim().min(1).max(64),
    generatedAt: z.string().datetime(),
    featurePacketHash: z.string().trim().min(8).max(128),
}).strict();

export type JevShadowResponseV1 = z.infer<typeof JevShadowResponseV1Schema>;

/**
 * Computes a deterministic 16-character hex hash of a setup feature packet.
 * Uses a pure string hashing algorithm compatible with both browser and node environments.
 */
export function computeFeaturePacketHash(input: {
    state: string;
    grade: string;
    zoneLabel?: string | null;
    zoneLow?: number | null;
    zoneHigh?: number | null;
    triggerPrice?: number | null;
    invalidationPrice?: number | null;
    evidenceIds: string[];
    conflictIds: string[];
    mandatoryGates: Record<string, string>;
}): string {
    const raw = JSON.stringify({
        state: input.state,
        grade: input.grade,
        zone: input.zoneLabel ? `${input.zoneLabel}:${input.zoneLow}-${input.zoneHigh}` : null,
        trigger: input.triggerPrice,
        invalidation: input.invalidationPrice,
        evidence: [...input.evidenceIds].sort(),
        conflicts: [...input.conflictIds].sort(),
        gates: Object.entries(input.mandatoryGates).sort(([a], [b]) => a.localeCompare(b)),
    });

    // FNV-1a 64-bit hash implementation
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) {
        const c = raw.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193);
        h2 = Math.imul(h2 ^ (c >> 8), 0x01000193);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `jev-${hex1}${hex2}`;
}
