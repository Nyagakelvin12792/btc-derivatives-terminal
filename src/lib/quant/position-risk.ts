export type PositionSide = 'long' | 'short';

export type RiskRequest =
    | { mode: 'amount'; value: number }
    | { mode: 'percent'; value: number };

export interface PositionAccountRules {
    equityUsd: number;
    risk: RiskRequest;
    leverage: number;
    dailyLossLimitUsd?: number;
    realizedPnlTodayUsd?: number;
    maxDrawdownUsd?: number;
    currentDrawdownUsd?: number;
}

export interface LinearInstrumentRules {
    entryPrice: number;
    stopPrice: number;
    targetPrice: number;
    /** USD P&L produced by one price-unit move for one underlying unit. */
    pointValueUsdPerPriceUnit?: number;
    /** Underlying units represented by one displayed quantity unit. */
    lotSize?: number;
    quantityStep?: number;
    minimumQuantity?: number;
    maximumQuantity?: number;
}

export interface PositionCostRules {
    /** Decimal rate, so 0.001 means 0.1%. */
    entryFeeRate?: number;
    /** Decimal rate, so 0.001 means 0.1%. */
    exitFeeRate?: number;
    /** Adverse slippage allowance on both entry and exit. */
    slippageBpsPerSide?: number;
}

export interface PositionRiskInput {
    side: PositionSide;
    account: PositionAccountRules;
    instrument: LinearInstrumentRules;
    costs?: PositionCostRules;
}

export type PositionRiskErrorCode =
    | 'INVALID_SIDE'
    | 'INVALID_ACCOUNT_EQUITY'
    | 'INVALID_RISK_REQUEST'
    | 'INVALID_LEVERAGE'
    | 'INVALID_DAILY_LOSS_LIMIT'
    | 'INVALID_REALIZED_PNL'
    | 'INVALID_MAX_DRAWDOWN'
    | 'INVALID_CURRENT_DRAWDOWN'
    | 'INVALID_ENTRY_PRICE'
    | 'INVALID_STOP_PRICE'
    | 'INVALID_TARGET_PRICE'
    | 'INVALID_LONG_GEOMETRY'
    | 'INVALID_SHORT_GEOMETRY'
    | 'INVALID_POINT_VALUE'
    | 'INVALID_LOT_SIZE'
    | 'INVALID_QUANTITY_STEP'
    | 'INVALID_MINIMUM_QUANTITY'
    | 'INVALID_MAXIMUM_QUANTITY'
    | 'INVALID_QUANTITY_BOUNDS'
    | 'INVALID_ENTRY_FEE_RATE'
    | 'INVALID_EXIT_FEE_RATE'
    | 'INVALID_SLIPPAGE'
    | 'DERIVED_VALUE_OVERFLOW'
    | 'DAILY_LOSS_LIMIT_EXHAUSTED'
    | 'MAX_DRAWDOWN_EXHAUSTED'
    | 'NON_POSITIVE_REWARD_AFTER_COSTS'
    | 'QUANTITY_BELOW_MINIMUM';

export type PositionRiskWarningCode =
    | 'REQUESTED_RISK_EXCEEDS_EQUITY'
    | 'RISK_CAPPED_BY_DAILY_LOSS_LIMIT'
    | 'RISK_CAPPED_BY_MAX_DRAWDOWN'
    | 'QUANTITY_CAPPED_BY_LEVERAGE'
    | 'QUANTITY_CAPPED_BY_MAXIMUM';

export type PositionRiskLimit = 'risk' | 'leverage' | 'maximum-quantity';

export interface PositionRiskBudget {
    requestedUsd: number;
    remainingDailyLossUsd: number | null;
    remainingDrawdownUsd: number | null;
    effectiveUsd: number;
}

export interface PositionRiskPerQuantity {
    notionalUsd: number;
    priceLossAtStopUsd: number;
    stopExecutionCostsUsd: number;
    totalLossAtStopUsd: number;
    grossProfitAtTargetUsd: number;
    targetExecutionCostsUsd: number;
    netProfitAtTargetUsd: number;
}

export interface PositionRiskQuantityCaps {
    risk: number;
    leverage: number;
    maximum: number | null;
}

export interface PositionRiskMetrics {
    quantity: number;
    underlyingUnits: number;
    quantityPrecision: number;
    limitedBy: PositionRiskLimit;
    notionalUsd: number;
    marginRequiredUsd: number;
    lossAtStopUsd: number;
    profitAtTargetUsd: number;
    rewardToRisk: number;
    stopDistance: number;
    stopDistancePercent: number;
    targetDistance: number;
    targetDistancePercent: number;
}

export interface PositionRiskResult {
    status: 'ready' | 'blocked' | 'invalid';
    errors: PositionRiskErrorCode[];
    warnings: PositionRiskWarningCode[];
    budget: PositionRiskBudget | null;
    perQuantity: PositionRiskPerQuantity | null;
    quantityCaps: PositionRiskQuantityCaps | null;
    metrics: PositionRiskMetrics | null;
}

const DEFAULT_POINT_VALUE = 1;
const DEFAULT_LOT_SIZE = 1;
const DEFAULT_QUANTITY_STEP = 0.001;
const MAX_PERCENT_RISK = 100;
const MAX_LEVERAGE = 1_000;
const MAX_FEE_RATE = 1;
const MAX_SLIPPAGE_BPS = 10_000;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function addError(errors: PositionRiskErrorCode[], condition: boolean, code: PositionRiskErrorCode): void {
    if (condition) errors.push(code);
}

function decimalPlaces(value: number): number {
    const normalized = value.toString().toLowerCase();
    if (normalized.includes('e-')) {
        const [coefficient, exponentText] = normalized.split('e-');
        const coefficientDecimals = coefficient.split('.')[1]?.length ?? 0;
        return Number(exponentText) + coefficientDecimals;
    }
    return normalized.split('.')[1]?.length ?? 0;
}

function floorToStep(value: number, step: number): number {
    const precision = Math.min(12, decimalPlaces(step));
    const tolerance = Math.max(Number.EPSILON * Math.abs(value), step * 1e-12);
    const stepped = Math.floor((value + tolerance) / step) * step;
    return Number(stepped.toFixed(precision));
}

function allFinite(...values: number[]): boolean {
    return values.every(Number.isFinite);
}

function invalidResult(errors: PositionRiskErrorCode[]): PositionRiskResult {
    return {
        status: 'invalid',
        errors,
        warnings: [],
        budget: null,
        perQuantity: null,
        quantityCaps: null,
        metrics: null,
    };
}

/**
 * Calculates a fail-closed position plan for linear instruments only.
 *
 * The returned quantity is expressed in the instrument's displayed quantity
 * units. `lotSize` converts one displayed unit to underlying units, and
 * `pointValueUsdPerPriceUnit` converts a one-price-unit move to USD P&L.
 * This function does not model inverse or quanto contracts and never submits
 * or prepares an executable order.
 */
export function calculatePositionRisk(input: PositionRiskInput): PositionRiskResult {
    const errors: PositionRiskErrorCode[] = [];
    const warnings: PositionRiskWarningCode[] = [];

    addError(errors, input.side !== 'long' && input.side !== 'short', 'INVALID_SIDE');

    const { account, instrument } = input;
    const costs = input.costs ?? {};
    const pointValue = instrument.pointValueUsdPerPriceUnit ?? DEFAULT_POINT_VALUE;
    const lotSize = instrument.lotSize ?? DEFAULT_LOT_SIZE;
    const quantityStep = instrument.quantityStep ?? DEFAULT_QUANTITY_STEP;
    const entryFeeRate = costs.entryFeeRate ?? 0;
    const exitFeeRate = costs.exitFeeRate ?? 0;
    const slippageBps = costs.slippageBpsPerSide ?? 0;
    const realizedPnlTodayUsd = account.realizedPnlTodayUsd ?? 0;
    const currentDrawdownUsd = account.currentDrawdownUsd ?? 0;

    addError(errors, !isFiniteNumber(account.equityUsd) || account.equityUsd <= 0, 'INVALID_ACCOUNT_EQUITY');
    addError(
        errors,
        !account.risk ||
            (account.risk.mode !== 'amount' && account.risk.mode !== 'percent') ||
            !isFiniteNumber(account.risk.value) ||
            account.risk.value <= 0 ||
            (account.risk.mode === 'percent' && account.risk.value > MAX_PERCENT_RISK),
        'INVALID_RISK_REQUEST',
    );
    addError(errors, !isFiniteNumber(account.leverage) || account.leverage <= 0 || account.leverage > MAX_LEVERAGE, 'INVALID_LEVERAGE');
    addError(
        errors,
        account.dailyLossLimitUsd !== undefined &&
            (!isFiniteNumber(account.dailyLossLimitUsd) || account.dailyLossLimitUsd < 0),
        'INVALID_DAILY_LOSS_LIMIT',
    );
    addError(errors, !isFiniteNumber(realizedPnlTodayUsd), 'INVALID_REALIZED_PNL');
    addError(
        errors,
        account.maxDrawdownUsd !== undefined &&
            (!isFiniteNumber(account.maxDrawdownUsd) || account.maxDrawdownUsd < 0),
        'INVALID_MAX_DRAWDOWN',
    );
    addError(errors, !isFiniteNumber(currentDrawdownUsd) || currentDrawdownUsd < 0, 'INVALID_CURRENT_DRAWDOWN');

    addError(errors, !isFiniteNumber(instrument.entryPrice) || instrument.entryPrice <= 0, 'INVALID_ENTRY_PRICE');
    addError(errors, !isFiniteNumber(instrument.stopPrice) || instrument.stopPrice <= 0, 'INVALID_STOP_PRICE');
    addError(errors, !isFiniteNumber(instrument.targetPrice) || instrument.targetPrice <= 0, 'INVALID_TARGET_PRICE');
    addError(errors, !isFiniteNumber(pointValue) || pointValue <= 0, 'INVALID_POINT_VALUE');
    addError(errors, !isFiniteNumber(lotSize) || lotSize <= 0, 'INVALID_LOT_SIZE');
    addError(errors, !isFiniteNumber(quantityStep) || quantityStep <= 0, 'INVALID_QUANTITY_STEP');

    addError(
        errors,
        instrument.minimumQuantity !== undefined &&
            (!isFiniteNumber(instrument.minimumQuantity) || instrument.minimumQuantity <= 0),
        'INVALID_MINIMUM_QUANTITY',
    );
    addError(
        errors,
        instrument.maximumQuantity !== undefined &&
            (!isFiniteNumber(instrument.maximumQuantity) || instrument.maximumQuantity <= 0),
        'INVALID_MAXIMUM_QUANTITY',
    );
    addError(
        errors,
        instrument.minimumQuantity !== undefined &&
            instrument.maximumQuantity !== undefined &&
            isFiniteNumber(instrument.minimumQuantity) &&
            isFiniteNumber(instrument.maximumQuantity) &&
            instrument.minimumQuantity > instrument.maximumQuantity,
        'INVALID_QUANTITY_BOUNDS',
    );

    addError(errors, !isFiniteNumber(entryFeeRate) || entryFeeRate < 0 || entryFeeRate > MAX_FEE_RATE, 'INVALID_ENTRY_FEE_RATE');
    addError(errors, !isFiniteNumber(exitFeeRate) || exitFeeRate < 0 || exitFeeRate > MAX_FEE_RATE, 'INVALID_EXIT_FEE_RATE');
    addError(errors, !isFiniteNumber(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS, 'INVALID_SLIPPAGE');

    if (errors.length > 0) return invalidResult(errors);

    if (input.side === 'long' && !(instrument.stopPrice < instrument.entryPrice && instrument.entryPrice < instrument.targetPrice)) {
        return invalidResult(['INVALID_LONG_GEOMETRY']);
    }
    if (input.side === 'short' && !(instrument.targetPrice < instrument.entryPrice && instrument.entryPrice < instrument.stopPrice)) {
        return invalidResult(['INVALID_SHORT_GEOMETRY']);
    }

    const requestedRiskUsd = account.risk.mode === 'percent'
        ? account.equityUsd * (account.risk.value / 100)
        : account.risk.value;
    if (!Number.isFinite(requestedRiskUsd)) return invalidResult(['DERIVED_VALUE_OVERFLOW']);
    if (requestedRiskUsd > account.equityUsd) warnings.push('REQUESTED_RISK_EXCEEDS_EQUITY');

    const remainingDailyLossUsd = account.dailyLossLimitUsd === undefined
        ? null
        : Math.max(0, account.dailyLossLimitUsd - Math.max(0, -realizedPnlTodayUsd));
    const remainingDrawdownUsd = account.maxDrawdownUsd === undefined
        ? null
        : Math.max(0, account.maxDrawdownUsd - currentDrawdownUsd);

    if (remainingDailyLossUsd === 0) errors.push('DAILY_LOSS_LIMIT_EXHAUSTED');
    if (remainingDrawdownUsd === 0) errors.push('MAX_DRAWDOWN_EXHAUSTED');

    const effectiveRiskUsd = Math.min(
        requestedRiskUsd,
        remainingDailyLossUsd ?? Number.POSITIVE_INFINITY,
        remainingDrawdownUsd ?? Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(effectiveRiskUsd)) return invalidResult(['DERIVED_VALUE_OVERFLOW']);
    const budget: PositionRiskBudget = {
        requestedUsd: requestedRiskUsd,
        remainingDailyLossUsd,
        remainingDrawdownUsd,
        effectiveUsd: effectiveRiskUsd,
    };

    if (remainingDailyLossUsd !== null && effectiveRiskUsd < requestedRiskUsd) {
        warnings.push('RISK_CAPPED_BY_DAILY_LOSS_LIMIT');
    }
    if (remainingDrawdownUsd !== null && effectiveRiskUsd < requestedRiskUsd && remainingDrawdownUsd <= effectiveRiskUsd) {
        warnings.push('RISK_CAPPED_BY_MAX_DRAWDOWN');
    }

    if (errors.length > 0) {
        return {
            status: 'blocked',
            errors,
            warnings,
            budget,
            perQuantity: null,
            quantityCaps: null,
            metrics: null,
        };
    }

    const unitFactor = pointValue * lotSize;
    const notionalPerQuantityUsd = instrument.entryPrice * unitFactor;
    const stopDistance = Math.abs(instrument.entryPrice - instrument.stopPrice);
    const targetDistance = Math.abs(instrument.targetPrice - instrument.entryPrice);
    const priceLossAtStopUsd = stopDistance * unitFactor;
    const grossProfitAtTargetUsd = targetDistance * unitFactor;
    const slippageRate = slippageBps / 10_000;
    const entryExecutionCostsUsd = notionalPerQuantityUsd * (entryFeeRate + slippageRate);
    const stopExecutionCostsUsd = entryExecutionCostsUsd + instrument.stopPrice * unitFactor * (exitFeeRate + slippageRate);
    const targetExecutionCostsUsd = entryExecutionCostsUsd + instrument.targetPrice * unitFactor * (exitFeeRate + slippageRate);
    const totalLossAtStopUsd = priceLossAtStopUsd + stopExecutionCostsUsd;
    const netProfitAtTargetUsd = grossProfitAtTargetUsd - targetExecutionCostsUsd;

    if (!allFinite(
        unitFactor,
        notionalPerQuantityUsd,
        stopDistance,
        targetDistance,
        priceLossAtStopUsd,
        grossProfitAtTargetUsd,
        entryExecutionCostsUsd,
        stopExecutionCostsUsd,
        targetExecutionCostsUsd,
        totalLossAtStopUsd,
        netProfitAtTargetUsd,
    )) {
        return invalidResult(['DERIVED_VALUE_OVERFLOW']);
    }

    const perQuantity: PositionRiskPerQuantity = {
        notionalUsd: notionalPerQuantityUsd,
        priceLossAtStopUsd,
        stopExecutionCostsUsd,
        totalLossAtStopUsd,
        grossProfitAtTargetUsd,
        targetExecutionCostsUsd,
        netProfitAtTargetUsd,
    };

    if (netProfitAtTargetUsd <= 0) {
        return {
            status: 'invalid',
            errors: ['NON_POSITIVE_REWARD_AFTER_COSTS'],
            warnings,
            budget,
            perQuantity,
            quantityCaps: null,
            metrics: null,
        };
    }

    const riskQuantity = effectiveRiskUsd / totalLossAtStopUsd;
    const leverageQuantity = (account.equityUsd * account.leverage) / notionalPerQuantityUsd;
    const maximumQuantity = instrument.maximumQuantity ?? null;
    const rawQuantity = Math.min(riskQuantity, leverageQuantity, maximumQuantity ?? Number.POSITIVE_INFINITY);
    const quantity = floorToStep(rawQuantity, quantityStep);
    const quantityPrecision = Math.min(12, decimalPlaces(quantityStep));

    if (!allFinite(riskQuantity, leverageQuantity, rawQuantity, quantity)) {
        return invalidResult(['DERIVED_VALUE_OVERFLOW']);
    }

    let limitedBy: PositionRiskLimit = 'risk';
    if (leverageQuantity <= riskQuantity && leverageQuantity <= (maximumQuantity ?? Number.POSITIVE_INFINITY)) {
        limitedBy = 'leverage';
        warnings.push('QUANTITY_CAPPED_BY_LEVERAGE');
    } else if (maximumQuantity !== null && maximumQuantity <= riskQuantity && maximumQuantity <= leverageQuantity) {
        limitedBy = 'maximum-quantity';
        warnings.push('QUANTITY_CAPPED_BY_MAXIMUM');
    }

    const quantityCaps: PositionRiskQuantityCaps = {
        risk: riskQuantity,
        leverage: leverageQuantity,
        maximum: maximumQuantity,
    };

    if (quantity <= 0 || (instrument.minimumQuantity !== undefined && quantity < instrument.minimumQuantity)) {
        return {
            status: 'blocked',
            errors: ['QUANTITY_BELOW_MINIMUM'],
            warnings,
            budget,
            perQuantity,
            quantityCaps,
            metrics: null,
        };
    }

    const lossAtStopUsd = quantity * totalLossAtStopUsd;
    const profitAtTargetUsd = quantity * netProfitAtTargetUsd;
    const notionalUsd = quantity * notionalPerQuantityUsd;
    const underlyingUnits = quantity * lotSize;
    const marginRequiredUsd = notionalUsd / account.leverage;
    const rewardToRisk = profitAtTargetUsd / lossAtStopUsd;

    if (!allFinite(
        lossAtStopUsd,
        profitAtTargetUsd,
        notionalUsd,
        underlyingUnits,
        marginRequiredUsd,
        rewardToRisk,
    )) {
        return invalidResult(['DERIVED_VALUE_OVERFLOW']);
    }

    const metrics: PositionRiskMetrics = {
        quantity,
        underlyingUnits,
        quantityPrecision,
        limitedBy,
        notionalUsd,
        marginRequiredUsd,
        lossAtStopUsd,
        profitAtTargetUsd,
        rewardToRisk,
        stopDistance,
        stopDistancePercent: (stopDistance / instrument.entryPrice) * 100,
        targetDistance,
        targetDistancePercent: (targetDistance / instrument.entryPrice) * 100,
    };

    return {
        status: 'ready',
        errors: [],
        warnings,
        budget,
        perQuantity,
        quantityCaps,
        metrics,
    };
}
