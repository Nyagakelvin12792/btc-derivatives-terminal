import { sanitizeCsvCell } from '../security/csv-sanitizer';

export type PaperAccountScope = 'PAPER_ACCOUNT' | 'BACKTEST_ACCOUNT';
export type PaperExecutionSource = 'MANUAL' | 'STRATEGY_LAB' | 'JEV_APPROVED' | 'JEV_AUTO_PAPER';
export type PaperOrderSide = 'BUY' | 'SELL';
export type PaperOrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_LIMIT';
export type PaperOrderStatus =
    | 'PENDING'
    | 'WORKING'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REJECTED';

export interface PaperFeeSchedule {
    makerFeeRate: number; // default 0.0002 (2 bps)
    takerFeeRate: number; // default 0.0005 (5 bps)
    stopSlippageRate: number; // default 0.0002 (2 bps)
    lotStepBtc: number; // default 0.0001 BTC
    minLotBtc: number; // default 0.0001 BTC
}

export const DEFAULT_PAPER_FEE_SCHEDULE: PaperFeeSchedule = {
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    stopSlippageRate: 0.0002,
    lotStepBtc: 0.0001,
    minLotBtc: 0.0001,
};

export interface FeeInclusiveSizingInput {
    equityUsdt: number;
    availableCashUsdt: number;
    entryPrice: number;
    stopPrice: number;
    targetPrice?: number;
    riskBudgetCapUsdt?: number;
    riskFraction?: number; // default 0.0025 (0.25%)
    entryIsMaker?: boolean; // default true for NY_VALUE_RETEST_V1 limit entry
    schedule?: PaperFeeSchedule;
}

export interface FeeInclusiveSizingResult {
    valid: boolean;
    reason?: string;
    riskBudgetUsdt: number;
    entryFeeRate: number;
    stopExitFeeAndSlippageRate: number;
    lossPerBtcUsdt: number;
    rawRiskQtyBtc: number;
    cashCapQtyBtc: number;
    finalQuantityBtc: number;
    notionalEntryUsdt: number;
    estimatedStopLossUsdt: number;
    targetFillPerBtcUsdt: number | null;
    estimatedNetTargetProfitUsdt: number | null;
    netRewardToRisk: number | null;
}

/**
 * Floors a BTC quantity to the configured lot step (e.g. 0.0001 BTC).
 */
export function floorToLot(qtyBtc: number, lotStepBtc = 0.0001): number {
    if (!Number.isFinite(qtyBtc) || qtyBtc <= 0 || !Number.isFinite(lotStepBtc) || lotStepBtc <= 0) {
        return 0;
    }
    const inverse = Math.round(1 / lotStepBtc);
    if (inverse > 0 && Math.abs(1 / inverse - lotStepBtc) < 1e-12) {
        return Math.floor((qtyBtc + 1e-12) * inverse) / inverse;
    }
    return Math.floor(qtyBtc / lotStepBtc) * lotStepBtc;
}

/**
 * Exact Fee-Inclusive Spot/Paper Sizing Formula (Master Plan §6.3):
 * - r = 0.0025 (0.25% of current equity)
 * - risk_budget_usdt = equity_usdt * r
 * - f_in = 0.0002 (maker limit) or 0.0005 (taker market)
 * - f_stop = 0.0005 + 0.0002 = 0.0007 (taker stop + 2 bps adverse slippage)
 * - loss_per_btc = E * (1 + f_in) - S * (1 - f_stop)  [for Long; symmetric for Short]
 * - raw_qty = risk_budget_usdt / loss_per_btc
 * - cash_cap_qty = available_cash_usdt / (E * (1 + f_in))
 * - qty = floor_to_lot(min(raw_qty, cash_cap_qty), 0.0001)
 * - target_fill_per_btc = T * (1 - f_target)
 */
export function calculateFeeInclusivePositionSize(
    input: FeeInclusiveSizingInput,
): FeeInclusiveSizingResult {
    const schedule = input.schedule ?? DEFAULT_PAPER_FEE_SCHEDULE;
    const riskFraction = input.riskFraction ?? 0.0025;

    if (
        !Number.isFinite(input.equityUsdt) ||
        input.equityUsdt <= 0 ||
        !Number.isFinite(input.availableCashUsdt) ||
        input.availableCashUsdt < 0 ||
        !Number.isFinite(input.entryPrice) ||
        input.entryPrice <= 0 ||
        !Number.isFinite(input.stopPrice) ||
        input.stopPrice <= 0 ||
        !Number.isFinite(riskFraction) ||
        riskFraction <= 0 ||
        riskFraction > 0.0025 ||
        (input.riskBudgetCapUsdt !== undefined && (!Number.isFinite(input.riskBudgetCapUsdt) || input.riskBudgetCapUsdt <= 0)) ||
        ![schedule.makerFeeRate, schedule.takerFeeRate, schedule.stopSlippageRate].every((rate) => Number.isFinite(rate) && rate >= 0 && rate < 1)
    ) {
        return {
            valid: false,
            reason: 'Invalid non-finite or non-positive sizing inputs.',
            riskBudgetUsdt: 0,
            entryFeeRate: 0,
            stopExitFeeAndSlippageRate: 0,
            lossPerBtcUsdt: 0,
            rawRiskQtyBtc: 0,
            cashCapQtyBtc: 0,
            finalQuantityBtc: 0,
            notionalEntryUsdt: 0,
            estimatedStopLossUsdt: 0,
            targetFillPerBtcUsdt: null,
            estimatedNetTargetProfitUsdt: null,
            netRewardToRisk: null,
        };
    }

    const isLong = input.entryPrice > input.stopPrice;
    if (Math.abs(input.entryPrice - input.stopPrice) < 1e-8) {
        return {
            valid: false,
            reason: 'Entry price and stop price cannot be identical.',
            riskBudgetUsdt: 0,
            entryFeeRate: 0,
            stopExitFeeAndSlippageRate: 0,
            lossPerBtcUsdt: 0,
            rawRiskQtyBtc: 0,
            cashCapQtyBtc: 0,
            finalQuantityBtc: 0,
            notionalEntryUsdt: 0,
            estimatedStopLossUsdt: 0,
            targetFillPerBtcUsdt: null,
            estimatedNetTargetProfitUsdt: null,
            netRewardToRisk: null,
        };
    }

    const fIn = input.entryIsMaker !== false ? schedule.makerFeeRate : schedule.takerFeeRate;
    const stopFill = input.stopPrice * (isLong ? 1 - schedule.stopSlippageRate : 1 + schedule.stopSlippageRate);
    const fStop = schedule.takerFeeRate + schedule.stopSlippageRate
        + (isLong ? -1 : 1) * schedule.takerFeeRate * schedule.stopSlippageRate;
    const riskBudgetUsdt = Math.min(input.equityUsdt * riskFraction, input.riskBudgetCapUsdt ?? Infinity);

    const lossPerBtcUsdt = isLong
        ? input.entryPrice * (1 + fIn) - stopFill * (1 - schedule.takerFeeRate)
        : stopFill * (1 + schedule.takerFeeRate) - input.entryPrice * (1 - fIn);

    if (lossPerBtcUsdt <= 0) {
        return {
            valid: false,
            reason: 'Calculated loss per BTC is non-positive.',
            riskBudgetUsdt,
            entryFeeRate: fIn,
            stopExitFeeAndSlippageRate: fStop,
            lossPerBtcUsdt,
            rawRiskQtyBtc: 0,
            cashCapQtyBtc: 0,
            finalQuantityBtc: 0,
            notionalEntryUsdt: 0,
            estimatedStopLossUsdt: 0,
            targetFillPerBtcUsdt: null,
            estimatedNetTargetProfitUsdt: null,
            netRewardToRisk: null,
        };
    }

    const rawRiskQtyBtc = riskBudgetUsdt / lossPerBtcUsdt;
    const cashCapQtyBtc = input.availableCashUsdt / (input.entryPrice * (1 + fIn));
    const finalQuantityBtc = floorToLot(Math.min(rawRiskQtyBtc, cashCapQtyBtc), schedule.lotStepBtc);

    if (finalQuantityBtc < schedule.minLotBtc) {
        return {
            valid: false,
            reason: `Calculated quantity (${finalQuantityBtc.toFixed(4)} BTC) is below minimum lot (${schedule.minLotBtc} BTC).`,
            riskBudgetUsdt,
            entryFeeRate: fIn,
            stopExitFeeAndSlippageRate: fStop,
            lossPerBtcUsdt,
            rawRiskQtyBtc,
            cashCapQtyBtc,
            finalQuantityBtc: 0,
            notionalEntryUsdt: 0,
            estimatedStopLossUsdt: 0,
            targetFillPerBtcUsdt: null,
            estimatedNetTargetProfitUsdt: null,
            netRewardToRisk: null,
        };
    }

    const notionalEntryUsdt = finalQuantityBtc * input.entryPrice;
    const estimatedStopLossUsdt = finalQuantityBtc * lossPerBtcUsdt;

    let targetFillPerBtcUsdt: number | null = null;
    let estimatedNetTargetProfitUsdt: number | null = null;
    let netRewardToRisk: number | null = null;

    if (typeof input.targetPrice === 'number' && Number.isFinite(input.targetPrice) && input.targetPrice > 0) {
        const fTarget = schedule.makerFeeRate;
        targetFillPerBtcUsdt = isLong
            ? input.targetPrice * (1 - fTarget)
            : input.targetPrice * (1 + fTarget);
        const profitPerBtc = isLong
            ? targetFillPerBtcUsdt - input.entryPrice * (1 + fIn)
            : input.entryPrice * (1 - fIn) - targetFillPerBtcUsdt;
        estimatedNetTargetProfitUsdt = finalQuantityBtc * profitPerBtc;
        netRewardToRisk = estimatedStopLossUsdt > 0 ? estimatedNetTargetProfitUsdt / estimatedStopLossUsdt : null;
    }

    return {
        valid: true,
        riskBudgetUsdt,
        entryFeeRate: fIn,
        stopExitFeeAndSlippageRate: fStop,
        lossPerBtcUsdt,
        rawRiskQtyBtc,
        cashCapQtyBtc,
        finalQuantityBtc,
        notionalEntryUsdt,
        estimatedStopLossUsdt,
        targetFillPerBtcUsdt,
        estimatedNetTargetProfitUsdt,
        netRewardToRisk,
    };
}

/**
 * Returns the ISO week identifier in America/New_York (`YYYY-Www`) for weekly loss lock tracking.
 */
export function getNewYorkCalendarWeekKey(timestampMs: number): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date(timestampMs));
    const year = Number(parts.find((p) => p.type === 'year')?.value ?? 1970);
    const month = Number(parts.find((p) => p.type === 'month')?.value ?? 1);
    const day = Number(parts.find((p) => p.type === 'day')?.value ?? 1);

    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const dayNum = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export interface PaperJournalEntryV1 {
    tradeId: string;
    accountScope: PaperAccountScope;
    strategyId: string;
    executionSource: PaperExecutionSource;
    sessionTag: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP' | 'OUT_OF_SESSION';
    regimeTag: string;
    side: 'LONG' | 'SHORT';
    openedAtMs: number;
    closedAtMs: number;
    entryPrice: number;
    exitPrice: number;
    stopPrice: number;
    targetPrice: number;
    quantityBtc: number;
    grossPnlUsdt: number;
    feesPaidUsdt: number;
    netPnlUsdt: number;
    initialRiskUsdt: number;
    rMultipleNet: number;
    maeUsdt: number;
    mfeUsdt: number;
    holdingDurationMs: number;
    exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT' | 'MANUAL_CLOSE';
    notes: string;
}

export interface PaperAccountSnapshotV1 {
    accountId: string;
    accountScope: PaperAccountScope;
    startingCapitalUsdt: number;
    cashBalanceUsdt: number;
    realizedPnlUsdt: number;
    unrealizedPnlUsdt: number;
    equityUsdt: number;
    peakEquityUsdt: number;
    drawdownUsdt: number;
    drawdownPct: number;
    reservedCapitalUsdt: number;
    availableCashUsdt: number;
    weeklyStartEquityUsdt: number;
    currentWeekKey: string;
    weeklyLossPct: number;
    weeklyLossLocked: boolean;
    openPosition: {
        tradeId: string;
        strategyId: string;
        executionSource: PaperExecutionSource;
        sessionTag: PaperJournalEntryV1['sessionTag'];
        regimeTag: string;
        side: 'LONG' | 'SHORT';
        quantityBtc: number;
        avgEntryPrice: number;
        stopPrice: number;
        targetPrice: number;
        initialRiskUsdt: number;
        entryFeePaidUsdt: number;
        openedAtMs: number;
        maxHoldUntilMs: number | null;
        maeUsdt: number;
        mfeUsdt: number;
    } | null;
    journal: PaperJournalEntryV1[];
}

/**
 * Deterministic Paper Capital & Execution Ledger (UX20.4-LEDGER-01).
 * Implements 10,000 USDT default starting capital, 0.25% per-trade risk cap,
 * 1.5% New York calendar-week equity-loss lock, and derived immutable trade journal.
 */
export class PaperAccountLedger {
    private state: PaperAccountSnapshotV1;
    private readonly schedule: PaperFeeSchedule;
    private readonly weeklyLossLimitFraction: number;

    constructor(options?: {
        accountId?: string;
        accountScope?: PaperAccountScope;
        startingCapitalUsdt?: number;
        initialTimestampMs?: number;
        weeklyLossLimitFraction?: number;
        schedule?: PaperFeeSchedule;
    }) {
        const startingCapitalUsdt = options?.startingCapitalUsdt ?? 10_000;
        const initialTs = options?.initialTimestampMs ?? Date.now();
        const weekKey = getNewYorkCalendarWeekKey(initialTs);
        this.schedule = options?.schedule ?? DEFAULT_PAPER_FEE_SCHEDULE;
        this.weeklyLossLimitFraction = options?.weeklyLossLimitFraction ?? 0.015; // 1.5%

        this.state = {
            accountId: options?.accountId ?? 'paper-default-10k',
            accountScope: options?.accountScope ?? 'PAPER_ACCOUNT',
            startingCapitalUsdt,
            cashBalanceUsdt: startingCapitalUsdt,
            realizedPnlUsdt: 0,
            unrealizedPnlUsdt: 0,
            equityUsdt: startingCapitalUsdt,
            peakEquityUsdt: startingCapitalUsdt,
            drawdownUsdt: 0,
            drawdownPct: 0,
            reservedCapitalUsdt: 0,
            availableCashUsdt: startingCapitalUsdt,
            weeklyStartEquityUsdt: startingCapitalUsdt,
            currentWeekKey: weekKey,
            weeklyLossPct: 0,
            weeklyLossLocked: false,
            openPosition: null,
            journal: [],
        };
    }

    public getSnapshot(): PaperAccountSnapshotV1 {
        return {
            ...this.state,
            openPosition: this.state.openPosition ? { ...this.state.openPosition } : null,
            journal: [...this.state.journal],
        };
    }

    public resetAccount(timestampMs = Date.now()): PaperAccountSnapshotV1 {
        const startCap = this.state.startingCapitalUsdt;
        const weekKey = getNewYorkCalendarWeekKey(timestampMs);
        this.state = {
            ...this.state,
            cashBalanceUsdt: startCap,
            realizedPnlUsdt: 0,
            unrealizedPnlUsdt: 0,
            equityUsdt: startCap,
            peakEquityUsdt: startCap,
            drawdownUsdt: 0,
            drawdownPct: 0,
            reservedCapitalUsdt: 0,
            availableCashUsdt: startCap,
            weeklyStartEquityUsdt: startCap,
            currentWeekKey: weekKey,
            weeklyLossPct: 0,
            weeklyLossLocked: false,
            openPosition: null,
            journal: [],
        };
        return this.getSnapshot();
    }

    private syncWeekRollover(timestampMs: number): void {
        const weekKey = getNewYorkCalendarWeekKey(timestampMs);
        if (weekKey !== this.state.currentWeekKey) {
            this.state.currentWeekKey = weekKey;
            this.state.weeklyStartEquityUsdt = this.state.equityUsdt;
            this.state.weeklyLossPct = 0;
            this.state.weeklyLossLocked = false;
        }
    }

    private recomputeEquityAndLocks(): void {
        this.state.equityUsdt = Number(
            (this.state.startingCapitalUsdt + this.state.realizedPnlUsdt + this.state.unrealizedPnlUsdt).toFixed(4),
        );
        if (this.state.equityUsdt > this.state.peakEquityUsdt) {
            this.state.peakEquityUsdt = this.state.equityUsdt;
        }
        this.state.drawdownUsdt = Number(Math.max(0, this.state.peakEquityUsdt - this.state.equityUsdt).toFixed(4));
        this.state.drawdownPct =
            this.state.peakEquityUsdt > 0
                ? Number(((this.state.drawdownUsdt / this.state.peakEquityUsdt) * 100).toFixed(3))
                : 0;

        this.state.availableCashUsdt = Number(
            Math.max(0, this.state.cashBalanceUsdt - this.state.reservedCapitalUsdt).toFixed(4),
        );

        const weekDelta = this.state.weeklyStartEquityUsdt - this.state.equityUsdt;
        const weekLossFraction =
            this.state.weeklyStartEquityUsdt > 0 ? Math.max(0, weekDelta / this.state.weeklyStartEquityUsdt) : 0;
        this.state.weeklyLossPct = Number((weekLossFraction * 100).toFixed(3));
        if (weekLossFraction >= this.weeklyLossLimitFraction - 1e-9) {
            this.state.weeklyLossLocked = true;
        }
    }

    public openPositionWithSizing(params: {
        tradeId?: string;
        timestampMs: number;
        side: 'LONG' | 'SHORT';
        entryPrice: number;
        stopPrice: number;
        targetPrice: number;
        entryIsMaker?: boolean;
        riskFraction?: number;
        strategyId?: string;
        executionSource?: PaperExecutionSource;
        sessionTag?: PaperJournalEntryV1['sessionTag'];
        regimeTag?: string;
        maxHoldBars5m?: number;
    }): { accepted: boolean; reason?: string; sizing?: FeeInclusiveSizingResult } {
        if (!Number.isFinite(params.timestampMs) || params.side !== 'LONG'
            || !Number.isFinite(params.targetPrice) || params.targetPrice <= params.entryPrice
            || params.stopPrice >= params.entryPrice) {
            return { accepted: false, reason: 'Invalid long-only spot order geometry or time.' };
        }
        if (params.tradeId && (this.state.openPosition?.tradeId === params.tradeId || this.state.journal.some((trade) => trade.tradeId === params.tradeId))) {
            return { accepted: false, reason: 'Duplicate paper trade ID.' };
        }
        this.syncWeekRollover(params.timestampMs);
        this.recomputeEquityAndLocks();

        if (this.state.weeklyLossLocked) {
            return {
                accepted: false,
                reason: `Weekly loss lock active (${this.state.weeklyLossPct.toFixed(2)}% >= ${(
                    this.weeklyLossLimitFraction * 100
                ).toFixed(2)}%). New entries blocked until next New York calendar week.`,
            };
        }

        if (this.state.openPosition !== null) {
            return {
                accepted: false,
                reason: 'Max 1 concurrent BTC position allowed.',
            };
        }

        const sizing = calculateFeeInclusivePositionSize({
            equityUsdt: this.state.equityUsdt,
            availableCashUsdt: this.state.availableCashUsdt,
            entryPrice: params.entryPrice,
            stopPrice: params.stopPrice,
            targetPrice: params.targetPrice,
            riskFraction: params.riskFraction ?? 0.0025,
            riskBudgetCapUsdt: this.state.equityUsdt - this.state.weeklyStartEquityUsdt * (1 - this.weeklyLossLimitFraction),
            entryIsMaker: params.entryIsMaker ?? true,
            schedule: this.schedule,
        });

        if (!sizing.valid) {
            return {
                accepted: false,
                reason: sizing.reason ?? 'Sizing rejected.',
                sizing,
            };
        }

        const entryFeeUsdt = sizing.notionalEntryUsdt * sizing.entryFeeRate;
        const totalCostUsdt = sizing.notionalEntryUsdt + entryFeeUsdt;

        this.state.reservedCapitalUsdt = Number(totalCostUsdt.toFixed(4));
        this.state.realizedPnlUsdt = Number((this.state.realizedPnlUsdt - entryFeeUsdt).toFixed(4));
        const maxHoldBars = params.maxHoldBars5m ?? 18;
        this.state.openPosition = {
            tradeId: params.tradeId ?? `ptrd-${params.timestampMs}`,
            strategyId: params.strategyId ?? 'NY_VALUE_RETEST_V1',
            executionSource: params.executionSource ?? 'MANUAL',
            sessionTag: params.sessionTag ?? 'NEW_YORK',
            regimeTag: params.regimeTag ?? 'BALANCED_ROTATION',
            side: params.side,
            quantityBtc: sizing.finalQuantityBtc,
            avgEntryPrice: params.entryPrice,
            stopPrice: params.stopPrice,
            targetPrice: params.targetPrice,
            initialRiskUsdt: sizing.estimatedStopLossUsdt,
            entryFeePaidUsdt: entryFeeUsdt,
            openedAtMs: params.timestampMs,
            maxHoldUntilMs: params.timestampMs + maxHoldBars * 5 * 60 * 1000,
            maeUsdt: 0,
            mfeUsdt: 0,
        };

        this.recomputeEquityAndLocks();
        return { accepted: true, sizing };
    }

    public processBar(bar: {
        timestampMs: number;
        open: number;
        high: number;
        low: number;
        close: number;
    }): { closedTrade?: PaperJournalEntryV1 } {
        if (![bar.timestampMs, bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)
            || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) return {};
        this.syncWeekRollover(bar.timestampMs);
        const pos = this.state.openPosition;
        if (!pos || bar.timestampMs <= pos.openedAtMs) {
            return {};
        }

        const sign = pos.side === 'LONG' ? 1 : -1;
        const favPrice = pos.side === 'LONG' ? bar.high : bar.low;
        const advPrice = pos.side === 'LONG' ? bar.low : bar.high;
        const barMfe = (favPrice - pos.avgEntryPrice) * sign * pos.quantityBtc;
        const barMae = (advPrice - pos.avgEntryPrice) * sign * pos.quantityBtc;
        pos.mfeUsdt = Math.max(pos.mfeUsdt, barMfe);
        pos.maeUsdt = Math.min(pos.maeUsdt, barMae);

        const stopHit = pos.side === 'LONG' ? bar.low <= pos.stopPrice : bar.high >= pos.stopPrice;
        const targetHit = pos.side === 'LONG' ? bar.high >= pos.targetPrice : bar.low <= pos.targetPrice;

        // Conservative Stop-First tie-breaking if both stop and target hit in the same bar
        if (stopHit) {
            const stopSlippage = this.schedule.stopSlippageRate;
            const execExitPrice =
                pos.side === 'LONG'
                    ? Math.min(bar.open, pos.stopPrice) * (1 - stopSlippage)
                    : Math.max(bar.open, pos.stopPrice) * (1 + stopSlippage);
            return {
                closedTrade: this.closeOpenPosition({
                    timestampMs: bar.timestampMs,
                    exitPrice: execExitPrice,
                    isMakerExit: false,
                    exitReason: 'STOP_LOSS',
                    notes: targetHit
                        ? 'Intrabar ambiguity: both Stop and Target inside bar; applied Stop-First rule.'
                        : 'Stop loss triggered.',
                }),
            };
        }

        if (targetHit) {
            return {
                closedTrade: this.closeOpenPosition({
                    timestampMs: bar.timestampMs,
                    exitPrice: pos.targetPrice,
                    isMakerExit: true,
                    exitReason: 'TAKE_PROFIT',
                    notes: 'Target limit filled.',
                }),
            };
        }

        if (pos.maxHoldUntilMs !== null && bar.timestampMs >= pos.maxHoldUntilMs) {
            return {
                closedTrade: this.closeOpenPosition({
                    timestampMs: bar.timestampMs,
                    exitPrice: bar.close,
                    isMakerExit: false,
                    exitReason: 'TIME_EXIT',
                    notes: 'Max holding period (18 bars) reached; exited at bar close.',
                }),
            };
        }

        const grossUnrealized = (bar.close - pos.avgEntryPrice) * sign * pos.quantityBtc;
        this.state.unrealizedPnlUsdt = Number(grossUnrealized.toFixed(4));
        this.recomputeEquityAndLocks();
        return {};
    }

    public closeOpenPosition(params: {
        timestampMs: number;
        exitPrice: number;
        isMakerExit: boolean;
        exitReason: PaperJournalEntryV1['exitReason'];
        notes?: string;
    }): PaperJournalEntryV1 {
        const pos = this.state.openPosition;
        if (!pos) {
            throw new Error('No open position to close.');
        }

        const sign = pos.side === 'LONG' ? 1 : -1;
        const exitFeeRate = params.isMakerExit ? this.schedule.makerFeeRate : this.schedule.takerFeeRate;
        const exitNotionalUsdt = pos.quantityBtc * params.exitPrice;
        const exitFeeUsdt = exitNotionalUsdt * exitFeeRate;
        const grossPnlUsdt = (params.exitPrice - pos.avgEntryPrice) * sign * pos.quantityBtc;
        const totalFeesUsdt = pos.entryFeePaidUsdt + exitFeeUsdt;
        const netPnlUsdt = grossPnlUsdt - totalFeesUsdt;

        // Entry fee was already deducted from realizedPnlUsdt at open; add grossPnl - exitFee now
        this.state.realizedPnlUsdt = Number((this.state.realizedPnlUsdt + grossPnlUsdt - exitFeeUsdt).toFixed(4));
        this.state.cashBalanceUsdt = Number((this.state.startingCapitalUsdt + this.state.realizedPnlUsdt).toFixed(4));
        this.state.reservedCapitalUsdt = 0;
        this.state.unrealizedPnlUsdt = 0;
        this.state.openPosition = null;

        const rMultipleNet = pos.initialRiskUsdt > 0 ? netPnlUsdt / pos.initialRiskUsdt : 0;

        const entry: PaperJournalEntryV1 = {
            tradeId: pos.tradeId,
            accountScope: this.state.accountScope,
            strategyId: pos.strategyId,
            executionSource: pos.executionSource,
            sessionTag: pos.sessionTag,
            regimeTag: pos.regimeTag,
            side: pos.side,
            openedAtMs: pos.openedAtMs,
            closedAtMs: params.timestampMs,
            entryPrice: pos.avgEntryPrice,
            exitPrice: params.exitPrice,
            stopPrice: pos.stopPrice,
            targetPrice: pos.targetPrice,
            quantityBtc: pos.quantityBtc,
            grossPnlUsdt: Number(grossPnlUsdt.toFixed(4)),
            feesPaidUsdt: Number(totalFeesUsdt.toFixed(4)),
            netPnlUsdt: Number(netPnlUsdt.toFixed(4)),
            initialRiskUsdt: Number(pos.initialRiskUsdt.toFixed(4)),
            rMultipleNet: Number(rMultipleNet.toFixed(4)),
            maeUsdt: Number(pos.maeUsdt.toFixed(4)),
            mfeUsdt: Number(pos.mfeUsdt.toFixed(4)),
            holdingDurationMs: Math.max(0, params.timestampMs - pos.openedAtMs),
            exitReason: params.exitReason,
            notes: params.notes ?? '',
        };

        this.state.journal.push(entry);
        this.recomputeEquityAndLocks();
        return entry;
    }

    public exportJournalCsv(): string {
        const headers = [
            'TradeID',
            'AccountScope',
            'StrategyID',
            'ExecutionSource',
            'Session',
            'Regime',
            'Side',
            'EntryPrice',
            'ExitPrice',
            'QuantityBTC',
            'GrossPnLUSDT',
            'FeesUSDT',
            'NetPnLUSDT',
            'RMultipleNet',
            'ExitReason',
            'Notes',
        ];
        const rows = this.state.journal.map((j) =>
            [
                sanitizeCsvCell(j.tradeId),
                sanitizeCsvCell(j.accountScope),
                sanitizeCsvCell(j.strategyId),
                sanitizeCsvCell(j.executionSource),
                sanitizeCsvCell(j.sessionTag),
                sanitizeCsvCell(j.regimeTag),
                sanitizeCsvCell(j.side),
                j.entryPrice.toFixed(2),
                j.exitPrice.toFixed(2),
                j.quantityBtc.toFixed(4),
                j.grossPnlUsdt.toFixed(2),
                j.feesPaidUsdt.toFixed(2),
                j.netPnlUsdt.toFixed(2),
                j.rMultipleNet.toFixed(2),
                sanitizeCsvCell(j.exitReason),
                sanitizeCsvCell(j.notes, { forceQuote: true }),
            ].join(','),
        );
        return [headers.join(','), ...rows].join('\n');
    }
}
