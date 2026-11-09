import { describe, expect, it } from 'vitest';
import {
    calculateFeeInclusivePositionSize,
    floorToLot,
    PaperAccountLedger,
} from './paper-ledger';
import { SimulatedOrderFillEngine } from '../simulation/order-fill-engine';

describe('UX20.4-LEDGER-01 Paper Capital & Fee-Inclusive Sizing Engine', () => {
    it('computes exact fee-inclusive sizing with lot flooring and cash cap (§6.3)', () => {
        // 10,000 USDT equity, 0.25% risk = 25 USDT risk budget
        // Entry = 70,000, Stop = 69,500, Target = 71,200
        const res = calculateFeeInclusivePositionSize({
            equityUsdt: 10_000,
            availableCashUsdt: 10_000,
            entryPrice: 70_000,
            stopPrice: 69_500,
            targetPrice: 71_200,
            riskFraction: 0.0025,
            entryIsMaker: true,
        });

        expect(res.valid).toBe(true);
        expect(res.riskBudgetUsdt).toBe(25);
        // loss_per_btc = 70000 * 1.0002 - 69500 * (1 - 0.0007) = 70014 - 69451.35 = 562.65
        expect(res.lossPerBtcUsdt).toBeCloseTo(562.65, 4);
        // raw_qty = 25 / 562.65 = 0.04443259... -> floored to 0.0001 = 0.0444 BTC
        expect(res.finalQuantityBtc).toBe(0.0444);
        expect(res.estimatedStopLossUsdt).toBeLessThanOrEqual(25);
        expect(res.netRewardToRisk).toBeGreaterThan(2.0);
    });

    it('enforces the 1.5% New York calendar-week equity-loss lock and unlocks on next week rollover', () => {
        const startTs = Date.UTC(2026, 10, 2, 14, 30, 0); // Monday Nov 2, 2026 NY session
        const ledger = new PaperAccountLedger({
            startingCapitalUsdt: 10_000,
            initialTimestampMs: startTs,
            weeklyLossLimitFraction: 0.015, // 1.5% = $150 loss lock
        });

        // Execute 6 losing trades at 0.25% ($25) each -> reaches 1.5% weekly loss
        for (let i = 0; i < 6; i++) {
            const t = startTs + i * 3600_000;
            const opened = ledger.openPositionWithSizing({
                timestampMs: t,
                side: 'LONG',
                entryPrice: 70_000,
                stopPrice: 69_500,
                targetPrice: 71_200,
                riskFraction: 0.0026, // slightly above 0.25% so lot rounding hits ~$25.88 loss
            });
            expect(opened.accepted).toBe(true);
            ledger.processBar({
                timestampMs: t + 300_000,
                open: 70_000,
                high: 70_050,
                low: 69_400, // hits stop
                close: 69_450,
            });
        }

        const lockedSnap = ledger.getSnapshot();
        expect(lockedSnap.weeklyLossLocked).toBe(true);
        expect(lockedSnap.weeklyLossPct).toBeGreaterThanOrEqual(1.5);

        // 7th trade in the same NY week is blocked
        const blockedAttempt = ledger.openPositionWithSizing({
            timestampMs: startTs + 7 * 3600_000,
            side: 'LONG',
            entryPrice: 70_000,
            stopPrice: 69_500,
            targetPrice: 71_200,
        });
        expect(blockedAttempt.accepted).toBe(false);
        expect(blockedAttempt.reason).toContain('Weekly loss lock active');

        // Roll forward 7 days to next Monday in NY -> lock resets
        const nextWeekTs = startTs + 7 * 24 * 3600_000;
        const unlockedAttempt = ledger.openPositionWithSizing({
            timestampMs: nextWeekTs,
            side: 'LONG',
            entryPrice: 70_000,
            stopPrice: 69_500,
            targetPrice: 71_200,
        });
        expect(unlockedAttempt.accepted).toBe(true);
    });

    it('rejects non-finite NaN/Infinity order quantities and prices in SimulatedOrderFillEngine (P2-8)', () => {
        const engine = new SimulatedOrderFillEngine();
        expect(() =>
            engine.submitOrder({
                side: 'BUY',
                type: 'MARKET',
                quantity: Number.NaN,
                currentPrice: 70_000,
            }),
        ).toThrow();
        expect(() =>
            engine.submitOrder({
                side: 'BUY',
                type: 'LIMIT',
                quantity: 0.1,
                limitPrice: Number.POSITIVE_INFINITY,
            }),
        ).toThrow();
        expect(floorToLot(Number.NaN, 0.0001)).toBe(0);
    });
});
