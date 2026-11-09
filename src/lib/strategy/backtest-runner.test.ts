import { describe, expect, it } from 'vitest';
import {
    computeBootstrapLower95ExpectancyR,
    evaluateStrategyResearchGate,
    runChronologicalStrategyBacktest,
} from './backtest-runner';
import type { NyValueRetestBar5m } from './ny-value-retest';

describe('UX20.6-STRAT-02 Chronological Backtest Runner & Ablation Suite', () => {
    it('executes chronological split, ablations, and 2x friction stress test in an isolated BACKTEST_ACCOUNT', () => {
        const baseTs = Date.UTC(2026, 10, 10, 15, 0, 0); // 10:00 EST
        const bars: NyValueRetestBar5m[] = [];
        for (let i = 0; i < 40; i++) {
            const isDip = i % 5 === 2;
            const open = isDip ? 69_550 : 69_800;
            const low = isDip ? 69_400 : 69_750;
            const high = isDip ? 69_650 : 70_400;
            const close = isDip ? 69_600 : 70_350;
            bars.push({
                timestampMs: baseTs + i * 5 * 60_000,
                open,
                high,
                low,
                close,
                volume: 150,
                buyVolume: 95,
                sellVolume: 55,
                delta: 40,
                cvdClose: 500 + i * 10,
                lowerWickAbsorptionRatio: 0.45,
                bullishStackedImbalanceCount: 2,
            });
        }

        const report = runChronologicalStrategyBacktest({
            datasetId: 'synthetic-ny-session-test',
            bars,
            startingCapitalUsdt: 10_000,
            inSampleFraction: 0.25,
        });

        expect(report.accountScope).toBe('BACKTEST_ACCOUNT');
        expect(report.ablationSummaries).toHaveLength(6);
        expect(report.primaryOosSummary.ablationId).toBe('FULL_NY_VALUE_RETEST_V1');
        // Since sample size is < 40 OOS trades, research gate must honestly report not passed
        expect(report.researchGateVerdict.passed).toBe(false);
        expect(report.researchGateVerdict.reasons[0]).toContain('below the minimum 40-trade sample size');
    });

    it('computes deterministic bootstrap 95% lower bound and passes research gate when all §6.5 criteria hold', () => {
        const lower95 = computeBootstrapLower95ExpectancyR(
            Array.from({ length: 45 }, () => 0.45),
        );
        expect(lower95).toBeCloseTo(0.45, 2);

        const verdict = evaluateStrategyResearchGate(
            {
                ablationId: 'FULL_NY_VALUE_RETEST_V1',
                tradeCount: 45,
                winRatePct: 55.5,
                profitFactor: 1.65,
                expectancyR: 0.38,
                bootstrapLower95ExpectancyR: 0.14,
                maxDrawdownPct: 3.2,
                netReturnPct: 4.5,
                endingEquityUsdt: 10_450,
            },
            {
                ablationId: 'FRICTION_2X_STRESS',
                tradeCount: 45,
                winRatePct: 51.1,
                profitFactor: 1.28,
                expectancyR: 0.12,
                bootstrapLower95ExpectancyR: 0.02,
                maxDrawdownPct: 4.1,
                netReturnPct: 1.4,
                endingEquityUsdt: 10_140,
            },
            40,
        );
        expect(verdict.passed).toBe(true);
        expect(verdict.reasons).toHaveLength(0);
    });
});
