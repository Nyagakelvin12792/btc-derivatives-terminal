import { describe, expect, it } from 'vitest';
import {
    evaluateJevGraduationGates,
    JevPaperTicketGatekeeper,
} from './jev-graduation';

describe('UX20.6-JEV-04 Jev Graduation Gates, 60s Ticket Expiry, and Idempotency', () => {
    it('keeps Automatic Paper Trading LOCKED OFF when Research or Operational gates fail or user opt-in is false', () => {
        const statusLocked = evaluateJevGraduationGates({
            deterministicStrategyResearchPassed: false,
            jevIncrementalEdgePassed: false,
            operationalHealthOk: true,
            weeklyLossLocked: false,
            consecutiveLossesInSession: 0,
            userExplicitAutoPaperOptIn: false,
        });

        expect(statusLocked.autoPaperEligible).toBe(false);
        expect(statusLocked.activeTier).toBe('TIER_2_MANUAL_APPROVAL_PAPER');
        expect(statusLocked.blockingReasons.length).toBeGreaterThanOrEqual(2);
    });

    it('enforces 60-second ticket TTL and featurePacketHash idempotency', () => {
        const gatekeeper = new JevPaperTicketGatekeeper();
        const now = 1_700_000_000_000;

        const issued = gatekeeper.issueTicket({
            featurePacketHash: 'jev-abc12345',
            side: 'LONG',
            entryPrice: 70_000,
            stopPrice: 69_500,
            targetPrice: 71_200,
            equityUsdt: 10_000,
            availableCashUsdt: 10_000,
            jevStance: 'AGREE',
            deterministicSetupPassed: true,
            nowMs: now,
        });

        expect(issued.issued).toBe(true);
        expect(issued.ticket).toBeDefined();

        const graduation = evaluateJevGraduationGates({
            deterministicStrategyResearchPassed: false,
            jevIncrementalEdgePassed: false,
            operationalHealthOk: true,
            weeklyLossLocked: false,
            consecutiveLossesInSession: 0,
            userExplicitAutoPaperOptIn: false,
        });

        // Automatic paper attempt must be rejected because research gate is false
        const autoAttempt = gatekeeper.validateTicketForExecution(
            issued.ticket,
            graduation,
            'AUTOMATIC_PAPER',
            now + 5_000,
        );
        expect(autoAttempt.allowed).toBe(false);

        // Manual user approval within 60s succeeds once
        const manualAttempt1 = gatekeeper.validateTicketForExecution(
            issued.ticket,
            graduation,
            'MANUAL_USER_APPROVAL',
            now + 10_000,
        );
        expect(manualAttempt1.allowed).toBe(true);

        // Duplicate submission of the same featurePacketHash is blocked
        const manualDuplicate = gatekeeper.validateTicketForExecution(
            issued.ticket,
            graduation,
            'MANUAL_USER_APPROVAL',
            now + 12_000,
        );
        expect(manualDuplicate.allowed).toBe(false);
        expect(manualDuplicate.reason).toContain('Duplicate featurePacketHash');
    });
});
