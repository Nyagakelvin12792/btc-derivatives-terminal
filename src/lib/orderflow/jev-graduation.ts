import { z } from 'zod';
import {
    calculateFeeInclusivePositionSize,
    type FeeInclusiveSizingResult,
} from '../execution/paper-ledger';

export type JevExecutionTier =
    | 'TIER_1_SHADOW_ONLY'
    | 'TIER_2_MANUAL_APPROVAL_PAPER'
    | 'TIER_3_AUTOMATIC_PAPER';

export const JEV_TICKET_TTL_MS = 60_000; // 60 seconds hard expiry (§6.5)

export const JevPaperTicketSchemaV1 = z.object({
    ticketId: z.string().min(1),
    featurePacketHash: z.string().min(1),
    strategyId: z.literal('NY_VALUE_RETEST_V1'),
    side: z.enum(['LONG', 'SHORT']),
    entryPrice: z.number().positive().finite(),
    stopPrice: z.number().positive().finite(),
    targetPrice: z.number().positive().finite(),
    quantityBtc: z.number().positive().finite(),
    riskFraction: z.number().positive().max(0.0025),
    issuedAtMs: z.number().int().positive(),
    expiresAtMs: z.number().int().positive(),
    jevStance: z.enum(['AGREE', 'CAUTION', 'DISAGREE', 'ABSTAIN']),
    deterministicSetupPassed: z.boolean(),
});
export type JevPaperTicketV1 = z.infer<typeof JevPaperTicketSchemaV1>;

export interface JevGraduationGateInput {
    deterministicStrategyResearchPassed: boolean;
    jevIncrementalEdgePassed: boolean; // Jev filtered expectancy >= deterministic + 0.10R OR DD reduction >= 15%
    operationalHealthOk: boolean; // 0 schema errors, 99.5% feed health, p95 < 1500ms
    weeklyLossLocked: boolean;
    consecutiveLossesInSession: number;
    userExplicitAutoPaperOptIn: boolean;
}

export interface JevGraduationGateStatus {
    researchGatePassed: boolean;
    operationalGatePassed: boolean;
    autoPaperEligible: boolean;
    activeTier: JevExecutionTier;
    autoDisarmedReason: string | null;
    blockingReasons: string[];
}

/**
 * Evaluates the Master Plan §6.5 two-gate graduation protocol for Jev automatic paper trading (UX20.6-JEV-04).
 * Jev can NEVER invent a trade, flip Long/Short, widen stops, or increase risk > 0.25%.
 */
export function evaluateJevGraduationGates(
    input: JevGraduationGateInput,
): JevGraduationGateStatus {
    const blockingReasons: string[] = [];

    const researchGatePassed =
        input.deterministicStrategyResearchPassed && input.jevIncrementalEdgePassed;
    if (!input.deterministicStrategyResearchPassed) {
        blockingReasons.push(
            'Deterministic NY_VALUE_RETEST_V1 has not yet passed the 40-trade OOS Research Gate.',
        );
    }
    if (!input.jevIncrementalEdgePassed) {
        blockingReasons.push(
            'Jev-filtered setups have not yet demonstrated >= +0.10R incremental expectancy or >= 15% drawdown reduction OOS.',
        );
    }

    let autoDisarmedReason: string | null = null;
    if (!input.operationalHealthOk) {
        autoDisarmedReason = 'Operational health check failed (schema error, stale feed, or latency > 1,500ms).';
        blockingReasons.push(autoDisarmedReason);
    } else if (input.weeklyLossLocked) {
        autoDisarmedReason = 'Weekly 1.5% equity-loss lock is active.';
        blockingReasons.push(autoDisarmedReason);
    } else if (input.consecutiveLossesInSession >= 2) {
        autoDisarmedReason = '2 consecutive losses in current NY session triggered auto-disarm.';
        blockingReasons.push(autoDisarmedReason);
    }

    const operationalGatePassed =
        input.operationalHealthOk &&
        !input.weeklyLossLocked &&
        input.consecutiveLossesInSession < 2;

    const autoPaperEligible =
        researchGatePassed && operationalGatePassed && input.userExplicitAutoPaperOptIn;

    let activeTier: JevExecutionTier = 'TIER_1_SHADOW_ONLY';
    if (autoPaperEligible) {
        activeTier = 'TIER_3_AUTOMATIC_PAPER';
    } else if (operationalGatePassed) {
        activeTier = 'TIER_2_MANUAL_APPROVAL_PAPER';
    }

    if (!input.userExplicitAutoPaperOptIn) {
        blockingReasons.push('User has not explicitly enabled Automatic Paper Trading opt-in toggle.');
    }

    return {
        researchGatePassed,
        operationalGatePassed,
        autoPaperEligible,
        activeTier,
        autoDisarmedReason,
        blockingReasons,
    };
}

/**
 * Deterministic Paper Order Ticket Gatekeeper (UX20.6-JEV-04).
 * Enforces 60-second ticket expiry, featurePacketHash idempotency, and deterministic sizing bounds.
 */
export class JevPaperTicketGatekeeper {
    private readonly executedPacketHashes = new Set<string>();

    public issueTicket(params: {
        featurePacketHash: string;
        side: 'LONG' | 'SHORT';
        entryPrice: number;
        stopPrice: number;
        targetPrice: number;
        equityUsdt: number;
        availableCashUsdt: number;
        jevStance: JevPaperTicketV1['jevStance'];
        deterministicSetupPassed: boolean;
        nowMs?: number;
    }): { issued: boolean; reason?: string; ticket?: JevPaperTicketV1; sizing?: FeeInclusiveSizingResult } {
        const nowMs = params.nowMs ?? Date.now();

        if (!params.deterministicSetupPassed) {
            return {
                issued: false,
                reason: 'Jev cannot originate a ticket when deterministic NY_VALUE_RETEST_V1 gates did not pass.',
            };
        }

        if (params.jevStance !== 'AGREE') {
            return {
                issued: false,
                reason: `Jev stance is ${params.jevStance} (must be AGREE to issue paper ticket).`,
            };
        }

        const sizing = calculateFeeInclusivePositionSize({
            equityUsdt: params.equityUsdt,
            availableCashUsdt: params.availableCashUsdt,
            entryPrice: params.entryPrice,
            stopPrice: params.stopPrice,
            targetPrice: params.targetPrice,
            riskFraction: 0.0025,
            entryIsMaker: true,
        });

        if (!sizing.valid || (sizing.netRewardToRisk ?? 0) < 1.8) {
            return {
                issued: false,
                reason: sizing.reason ?? 'Fee-inclusive reward-to-risk is below 1.80R.',
                sizing,
            };
        }

        const ticket: JevPaperTicketV1 = JevPaperTicketSchemaV1.parse({
            ticketId: `jtk-${nowMs}-${params.featurePacketHash.slice(0, 8)}`,
            featurePacketHash: params.featurePacketHash,
            strategyId: 'NY_VALUE_RETEST_V1',
            side: params.side,
            entryPrice: params.entryPrice,
            stopPrice: params.stopPrice,
            targetPrice: params.targetPrice,
            quantityBtc: sizing.finalQuantityBtc,
            riskFraction: 0.0025,
            issuedAtMs: nowMs,
            expiresAtMs: nowMs + JEV_TICKET_TTL_MS,
            jevStance: params.jevStance,
            deterministicSetupPassed: params.deterministicSetupPassed,
        });

        return { issued: true, ticket, sizing };
    }

    public validateTicketForExecution(
        ticket: unknown,
        graduation: JevGraduationGateStatus,
        executionMode: 'MANUAL_USER_APPROVAL' | 'AUTOMATIC_PAPER',
        nowMs = Date.now(),
    ): { allowed: boolean; reason?: string; parsedTicket?: JevPaperTicketV1 } {
        const parsed = JevPaperTicketSchemaV1.safeParse(ticket);
        if (!parsed.success) {
            return { allowed: false, reason: 'Ticket failed JevPaperTicketSchemaV1 validation.' };
        }
        const t = parsed.data;

        if (!t.deterministicSetupPassed || t.jevStance !== 'AGREE') {
            return { allowed: false, reason: 'Ticket does not carry deterministic pass + Jev AGREE.' };
        }

        if (nowMs > t.expiresAtMs) {
            return {
                allowed: false,
                reason: `Ticket expired (${Math.round((nowMs - t.expiresAtMs) / 1000)}s past 60s TTL).`,
            };
        }

        if (this.executedPacketHashes.has(t.featurePacketHash)) {
            return {
                allowed: false,
                reason: `Duplicate featurePacketHash (${t.featurePacketHash}) rejected by idempotency guard.`,
            };
        }

        if (executionMode === 'AUTOMATIC_PAPER' && !graduation.autoPaperEligible) {
            return {
                allowed: false,
                reason: `Automatic paper execution blocked: ${graduation.blockingReasons.join(' ')}`,
            };
        }

        if (!graduation.operationalGatePassed) {
            return {
                allowed: false,
                reason: `Operational safety gate tripped: ${graduation.autoDisarmedReason ?? 'degraded state'}`,
            };
        }

        this.executedPacketHashes.add(t.featurePacketHash);
        return { allowed: true, parsedTicket: t };
    }
}
