import { describe, expect, it } from 'vitest';
import {
    evaluateNyValueRetestV1,
    type NyValueRetestBar5m,
} from './ny-value-retest';

describe('UX20.6-RULES-03 NY_VALUE_RETEST_V1 Deterministic Strategy Evaluator', () => {
    const baseBar: NyValueRetestBar5m = {
        timestampMs: Date.UTC(2026, 10, 10, 15, 15, 0), // 10:15 EST (inside 10:00-11:30 ET Decision Window)
        open: 69_520,
        high: 69_620,
        low: 69_420,
        close: 69_580,
        volume: 140,
        buyVolume: 85,
        sellVolume: 55,
        delta: 30,
        cvdClose: 420,
        lowerWickAbsorptionRatio: 0.48,
        bullishStackedImbalanceCount: 2,
    };

    it('qualifies a valid Long VAL retest with passive bid absorption and >= 1.8R net reward', () => {
        const res = evaluateNyValueRetestV1({
            bar: baseBar,
            recentBars5m: [
                { ...baseBar, timestampMs: baseBar.timestampMs - 600_000, cvdClose: 380 },
                { ...baseBar, timestampMs: baseBar.timestampMs - 300_000, cvdClose: 390 },
                baseBar,
            ],
            developingPoc: 70_050,
            developingVah: 70_350,
            developingVal: 69_500,
            sessionVwap: 69_980,
            atr14_5m: 120,
            optionsContext: {
                available: true,
                gammaRegime: 'POSITIVE',
                callWall: 71_500,
                putWall: 69_000,
                gammaFlip: 69_500,
            },
            accountContext: {
                equityUsdt: 10_000,
                availableCashUsdt: 10_000,
                weeklyLossLocked: false,
                hasOpenPosition: false,
                tradesTakenInSession: 0,
                consecutiveLossesInSession: 0,
            },
            dataHealth: {
                feedHealthy: true,
                spreadBps: 1.5,
            },
        });

        expect(res.qualifies).toBe(true);
        expect(res.side).toBe('LONG');
        expect(res.firstFailedGate).toBeNull();
        expect(res.sizing?.finalQuantityBtc).toBeGreaterThan(0);
        expect(res.sizing?.netRewardToRisk).toBeGreaterThanOrEqual(1.8);
    });

    it('rejects setups outside the 10:00-11:30 ET Decision Window with GATE_1_DATA_AND_SESSION', () => {
        const offHoursBar: NyValueRetestBar5m = {
            ...baseBar,
            timestampMs: Date.UTC(2026, 10, 10, 4, 0, 0), // 23:00 EST
        };
        const res = evaluateNyValueRetestV1({
            bar: offHoursBar,
            recentBars5m: [offHoursBar],
            developingPoc: 70_050,
            developingVah: 70_350,
            developingVal: 69_500,
            sessionVwap: 69_980,
            atr14_5m: 120,
            accountContext: {
                equityUsdt: 10_000,
                availableCashUsdt: 10_000,
                weeklyLossLocked: false,
                hasOpenPosition: false,
                tradesTakenInSession: 0,
                consecutiveLossesInSession: 0,
            },
            dataHealth: {
                feedHealthy: true,
                spreadBps: 1.5,
            },
        });

        expect(res.qualifies).toBe(false);
        expect(res.firstFailedGate).toBe('GATE_1_DATA_AND_SESSION');
    });
});
