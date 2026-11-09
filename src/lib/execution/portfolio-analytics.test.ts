import { describe, expect, it } from 'vitest';
import { PaperAccountLedger } from './paper-ledger';
import { buildPortfolioAnalyticsReport } from './portfolio-analytics';

describe('UX20.4-PORTFOLIO-03 Portfolio Analytics & Attribution Engine', () => {
    it('computes equity curve, drawdown, and attribution slices by strategy, source, session, and regime', () => {
        const startTs = Date.UTC(2026, 10, 2, 14, 0, 0);
        const ledger = new PaperAccountLedger({
            startingCapitalUsdt: 10_000,
            initialTimestampMs: startTs,
        });

        // Trade 1: Winning Long (+2.4R)
        ledger.openPositionWithSizing({
            timestampMs: startTs,
            side: 'LONG',
            entryPrice: 70_000,
            stopPrice: 69_500,
            targetPrice: 71_200,
            strategyId: 'NY_VALUE_RETEST_V1',
            executionSource: 'STRATEGY_LAB',
            sessionTag: 'NEW_YORK',
            regimeTag: 'POSITIVE_GAMMA',
        });
        ledger.processBar({
            timestampMs: startTs + 600_000,
            open: 70_000,
            high: 71_300,
            low: 69_950,
            close: 71_250,
        });

        // Trade 2: Losing Short (-1R)
        ledger.openPositionWithSizing({
            timestampMs: startTs + 1200_000,
            side: 'SHORT',
            entryPrice: 71_000,
            stopPrice: 71_500,
            targetPrice: 69_800,
            strategyId: 'MANUAL_DISCRETIONARY',
            executionSource: 'MANUAL',
            sessionTag: 'LONDON',
            regimeTag: 'NEGATIVE_GAMMA',
        });
        ledger.processBar({
            timestampMs: startTs + 1800_000,
            open: 71_000,
            high: 71_600,
            low: 70_900,
            close: 71_550,
        });

        const report = buildPortfolioAnalyticsReport(ledger.getSnapshot());
        expect(report.performanceSummary.totalTrades).toBe(2);
        expect(report.performanceSummary.winCount).toBe(1);
        expect(report.performanceSummary.lossCount).toBe(1);
        expect(report.performanceSummary.expectancyR).toBeGreaterThan(0);
        expect(report.equityCurve).toHaveLength(2);
        expect(report.attribution.byStrategy).toHaveLength(2);
        expect(report.attribution.byExecutionSource).toHaveLength(2);
        expect(report.attribution.bySession).toHaveLength(2);
        expect(report.attribution.byRegime).toHaveLength(2);
    });
});
