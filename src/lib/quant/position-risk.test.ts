import { describe, expect, it } from 'vitest';
import { calculatePositionRisk, type PositionRiskInput } from './position-risk';

function baseInput(overrides: Partial<PositionRiskInput> = {}): PositionRiskInput {
    return {
        side: 'long',
        account: {
            equityUsd: 10_000,
            risk: { mode: 'percent', value: 0.5 },
            leverage: 10,
        },
        instrument: {
            entryPrice: 68_000,
            stopPrice: 67_800,
            targetPrice: 69_000,
            quantityStep: 0.001,
        },
        ...overrides,
    };
}

describe('position risk engine', () => {
    it('calculates a canonical risk-limited long position', () => {
        const result = calculatePositionRisk(baseInput());

        expect(result.status).toBe('ready');
        expect(result.errors).toEqual([]);
        expect(result.budget?.requestedUsd).toBe(50);
        expect(result.metrics?.quantity).toBe(0.25);
        expect(result.metrics?.underlyingUnits).toBe(0.25);
        expect(result.metrics?.limitedBy).toBe('risk');
        expect(result.metrics?.lossAtStopUsd).toBe(50);
        expect(result.metrics?.profitAtTargetUsd).toBe(250);
        expect(result.metrics?.rewardToRisk).toBe(5);
        expect(result.metrics?.notionalUsd).toBe(17_000);
        expect(result.metrics?.marginRequiredUsd).toBe(1_700);
    });

    it('uses the same deterministic model for a valid short position', () => {
        const result = calculatePositionRisk(baseInput({
            side: 'short',
            instrument: {
                entryPrice: 68_000,
                stopPrice: 68_200,
                targetPrice: 67_000,
                quantityStep: 0.001,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.metrics?.quantity).toBe(0.25);
        expect(result.metrics?.lossAtStopUsd).toBe(50);
        expect(result.metrics?.profitAtTargetUsd).toBe(250);
        expect(result.metrics?.rewardToRisk).toBe(5);
    });

    it('caps quantity by leverage when buying power is the smaller bound', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 1_000,
                risk: { mode: 'amount', value: 500 },
                leverage: 1,
            },
            instrument: {
                entryPrice: 100,
                stopPrice: 99,
                targetPrice: 103,
                quantityStep: 1,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.metrics?.quantity).toBe(10);
        expect(result.metrics?.limitedBy).toBe('leverage');
        expect(result.metrics?.notionalUsd).toBe(1_000);
        expect(result.warnings).toContain('QUANTITY_CAPPED_BY_LEVERAGE');
    });

    it('includes entry, stop-exit fees, and two-sided slippage in stop risk', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'amount', value: 100 },
                leverage: 100,
            },
            instrument: {
                entryPrice: 100,
                stopPrice: 90,
                targetPrice: 130,
                quantityStep: 0.01,
            },
            costs: {
                entryFeeRate: 0.001,
                exitFeeRate: 0.001,
                slippageBpsPerSide: 10,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.perQuantity?.stopExecutionCostsUsd).toBeCloseTo(0.38, 10);
        expect(result.perQuantity?.totalLossAtStopUsd).toBeCloseTo(10.38, 10);
        expect(result.metrics?.quantity).toBe(9.63);
        expect(result.metrics?.lossAtStopUsd).toBeLessThanOrEqual(100);
        expect(result.metrics?.profitAtTargetUsd).toBeCloseTo(284.4702, 6);
    });

    it('caps requested risk at the remaining daily loss budget', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'amount', value: 200 },
                leverage: 10,
                dailyLossLimitUsd: 300,
                realizedPnlTodayUsd: -250,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.budget?.remainingDailyLossUsd).toBe(50);
        expect(result.budget?.effectiveUsd).toBe(50);
        expect(result.metrics?.lossAtStopUsd).toBe(50);
        expect(result.warnings).toContain('RISK_CAPPED_BY_DAILY_LOSS_LIMIT');
    });

    it('does not let realized gains increase the configured daily loss budget', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'amount', value: 500 },
                leverage: 10,
                dailyLossLimitUsd: 300,
                realizedPnlTodayUsd: 1_000,
            },
        }));

        expect(result.budget?.remainingDailyLossUsd).toBe(300);
        expect(result.budget?.effectiveUsd).toBe(300);
    });

    it('caps requested risk at the remaining drawdown budget', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'amount', value: 200 },
                leverage: 10,
                maxDrawdownUsd: 500,
                currentDrawdownUsd: 450,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.budget?.remainingDrawdownUsd).toBe(50);
        expect(result.budget?.effectiveUsd).toBe(50);
        expect(result.warnings).toContain('RISK_CAPPED_BY_MAX_DRAWDOWN');
    });

    it('blocks a position after the daily loss limit is exhausted', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'percent', value: 0.5 },
                leverage: 10,
                dailyLossLimitUsd: 300,
                realizedPnlTodayUsd: -300,
            },
        }));

        expect(result.status).toBe('blocked');
        expect(result.errors).toContain('DAILY_LOSS_LIMIT_EXHAUSTED');
        expect(result.metrics).toBeNull();
    });

    it('blocks a position after the maximum drawdown budget is exhausted', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'percent', value: 0.5 },
                leverage: 10,
                maxDrawdownUsd: 500,
                currentDrawdownUsd: 500,
            },
        }));

        expect(result.status).toBe('blocked');
        expect(result.errors).toContain('MAX_DRAWDOWN_EXHAUSTED');
    });

    it('rejects invalid long and short price geometry', () => {
        const invalidLong = calculatePositionRisk(baseInput({
            instrument: { entryPrice: 100, stopPrice: 101, targetPrice: 110 },
        }));
        const invalidShort = calculatePositionRisk(baseInput({
            side: 'short',
            instrument: { entryPrice: 100, stopPrice: 99, targetPrice: 90 },
        }));

        expect(invalidLong.status).toBe('invalid');
        expect(invalidLong.errors).toEqual(['INVALID_LONG_GEOMETRY']);
        expect(invalidShort.status).toBe('invalid');
        expect(invalidShort.errors).toEqual(['INVALID_SHORT_GEOMETRY']);
    });

    it('rounds down to the permitted quantity step without exceeding risk', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'amount', value: 10 },
                leverage: 100,
            },
            instrument: {
                entryPrice: 100,
                stopPrice: 97,
                targetPrice: 106,
                quantityStep: 0.25,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.quantityCaps?.risk).toBeCloseTo(10 / 3, 10);
        expect(result.metrics?.quantity).toBe(3.25);
        expect(result.metrics?.lossAtStopUsd).toBe(9.75);
    });

    it('blocks when the rounded quantity is below the exchange minimum', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 100,
                risk: { mode: 'amount', value: 1 },
                leverage: 1,
            },
            instrument: {
                entryPrice: 100,
                stopPrice: 90,
                targetPrice: 120,
                quantityStep: 0.1,
                minimumQuantity: 2,
            },
        }));

        expect(result.status).toBe('blocked');
        expect(result.errors).toContain('QUANTITY_BELOW_MINIMUM');
        expect(result.metrics).toBeNull();
    });

    it('supports contract lot size and point value explicitly', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'amount', value: 100 },
                leverage: 10,
            },
            instrument: {
                entryPrice: 100,
                stopPrice: 98,
                targetPrice: 104,
                pointValueUsdPerPriceUnit: 2,
                lotSize: 5,
                quantityStep: 1,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.perQuantity?.priceLossAtStopUsd).toBe(20);
        expect(result.perQuantity?.notionalUsd).toBe(1_000);
        expect(result.metrics?.quantity).toBe(5);
        expect(result.metrics?.underlyingUnits).toBe(25);
    });

    it('applies the configured maximum quantity cap', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 100_000,
                risk: { mode: 'amount', value: 5_000 },
                leverage: 10,
            },
            instrument: {
                entryPrice: 100,
                stopPrice: 90,
                targetPrice: 130,
                quantityStep: 1,
                maximumQuantity: 25,
            },
        }));

        expect(result.status).toBe('ready');
        expect(result.metrics?.quantity).toBe(25);
        expect(result.metrics?.limitedBy).toBe('maximum-quantity');
        expect(result.warnings).toContain('QUANTITY_CAPPED_BY_MAXIMUM');
    });

    it('rejects non-finite and out-of-range inputs fail-closed', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: Number.NaN,
                risk: { mode: 'percent', value: 101 },
                leverage: Number.POSITIVE_INFINITY,
                dailyLossLimitUsd: -1,
            },
            instrument: {
                entryPrice: 0,
                stopPrice: -1,
                targetPrice: Number.NaN,
                quantityStep: 0,
            },
            costs: {
                entryFeeRate: -0.1,
                exitFeeRate: 2,
                slippageBpsPerSide: -1,
            },
        }));

        expect(result.status).toBe('invalid');
        expect(result.errors).toEqual(expect.arrayContaining([
            'INVALID_ACCOUNT_EQUITY',
            'INVALID_RISK_REQUEST',
            'INVALID_LEVERAGE',
            'INVALID_DAILY_LOSS_LIMIT',
            'INVALID_ENTRY_PRICE',
            'INVALID_STOP_PRICE',
            'INVALID_TARGET_PRICE',
            'INVALID_QUANTITY_STEP',
            'INVALID_ENTRY_FEE_RATE',
            'INVALID_EXIT_FEE_RATE',
            'INVALID_SLIPPAGE',
        ]));
        expect(result.metrics).toBeNull();
    });

    it('rejects a target whose expected reward is consumed by costs', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: 10_000,
                risk: { mode: 'amount', value: 100 },
                leverage: 10,
            },
            instrument: {
                entryPrice: 100,
                stopPrice: 90,
                targetPrice: 101,
            },
            costs: {
                entryFeeRate: 0.01,
                exitFeeRate: 0.01,
                slippageBpsPerSide: 100,
            },
        }));

        expect(result.status).toBe('invalid');
        expect(result.errors).toEqual(['NON_POSITIVE_REWARD_AFTER_COSTS']);
        expect(result.metrics).toBeNull();
    });

    it('fails closed when otherwise finite inputs overflow derived arithmetic', () => {
        const result = calculatePositionRisk(baseInput({
            account: {
                equityUsd: Number.MAX_VALUE,
                risk: { mode: 'amount', value: 100 },
                leverage: 1_000,
            },
        }));

        expect(result.status).toBe('invalid');
        expect(result.errors).toEqual(['DERIVED_VALUE_OVERFLOW']);
        expect(result.metrics).toBeNull();
    });
});
