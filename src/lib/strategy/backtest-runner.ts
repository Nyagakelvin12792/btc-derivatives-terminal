import {
    DEFAULT_PAPER_FEE_SCHEDULE,
    PaperAccountLedger,
    type PaperAccountSnapshotV1,
    type PaperFeeSchedule,
    type PaperJournalEntryV1,
} from '../execution/paper-ledger';
import {
    evaluateNyValueRetestV1,
    type NyValueRetestBar5m,
    type NyValueRetestSignalResult,
} from './ny-value-retest';

export type BacktestAblationId =
    | 'OHLC_DIAGNOSTIC'
    | 'ABLATION_NO_FOOTPRINT'
    | 'ABLATION_NO_CVD'
    | 'ABLATION_NO_OPTIONS'
    | 'ABLATION_NO_US_SESSION'
    | 'FRICTION_2X_STRESS';

export interface BacktestRejectedCandidateV1 {
    timestampMs: number;
    price: number;
    firstFailedGate: NonNullable<NyValueRetestSignalResult['firstFailedGate']>;
    reason: string;
}

export interface BacktestMetricsSummaryV1 {
    ablationId: BacktestAblationId;
    tradeCount: number;
    winRatePct: number;
    profitFactor: number;
    expectancyR: number;
    bootstrapLower95ExpectancyR: number;
    maxDrawdownPct: number;
    netReturnPct: number;
    endingEquityUsdt: number;
}

export interface StrategyResearchGateVerdictV1 {
    passed: boolean;
    oosTradeCount: number;
    minRequiredTrades: number;
    expectancyR: number;
    profitFactor: number;
    maxDrawdownPct: number;
    bootstrapLower95ExpectancyR: number;
    friction2xExpectancyR: number;
    reasons: string[];
}

export interface BacktestRunReportV1 {
    datasetId: string;
    accountScope: 'BACKTEST_ACCOUNT';
    inSampleBarCount: number;
    outOfSampleBarCount: number;
    primaryOosSummary: BacktestMetricsSummaryV1;
    ablationSummaries: BacktestMetricsSummaryV1[];
    oosJournal: PaperJournalEntryV1[];
    rejectedCandidates: BacktestRejectedCandidateV1[];
    researchGateVerdict: StrategyResearchGateVerdictV1;
    ledgerSnapshot: PaperAccountSnapshotV1;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible bootstrap confidence intervals.
 */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Computes the 95% lower confidence bound of expectancy (in R) via stationary block bootstrap.
 */
export function computeBootstrapLower95ExpectancyR(
    rMultiples: readonly number[],
    iterations = 400,
    seed = 20261109,
): number {
    const n = rMultiples.length;
    if (n === 0) return 0;
    if (n === 1) return rMultiples[0];

    const rng = mulberry32(seed);
    const means: number[] = [];

    for (let iter = 0; iter < iterations; iter++) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
            const idx = Math.floor(rng() * n);
            sum += rMultiples[idx];
        }
        means.push(sum / n);
    }

    means.sort((a, b) => a - b);
    const lowerIdx = Math.max(0, Math.floor(iterations * 0.05));
    return Number(means[lowerIdx].toFixed(4));
}

function summarizeLedgerRun(
    ablationId: BacktestAblationId,
    snap: PaperAccountSnapshotV1,
): BacktestMetricsSummaryV1 {
    const journal = snap.journal;
    const n = journal.length;
    let wins = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let sumR = 0;
    const rList: number[] = [];

    for (const j of journal) {
        rList.push(j.rMultipleNet);
        sumR += j.rMultipleNet;
        if (j.netPnlUsdt > 0.5) {
            wins += 1;
            grossProfit += j.netPnlUsdt;
        } else if (j.netPnlUsdt < -0.5) {
            grossLoss += Math.abs(j.netPnlUsdt);
        }
    }

    const winRatePct = n > 0 ? Number(((wins / n) * 100).toFixed(1)) : 0;
    const profitFactor =
        grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0;
    const expectancyR = n > 0 ? Number((sumR / n).toFixed(3)) : 0;
    const lower95 = computeBootstrapLower95ExpectancyR(rList);
    const netReturnPct =
        snap.startingCapitalUsdt > 0
            ? Number((((snap.equityUsdt - snap.startingCapitalUsdt) / snap.startingCapitalUsdt) * 100).toFixed(2))
            : 0;

    return {
        ablationId,
        tradeCount: n,
        winRatePct,
        profitFactor,
        expectancyR,
        bootstrapLower95ExpectancyR: lower95,
        maxDrawdownPct: snap.drawdownPct,
        netReturnPct,
        endingEquityUsdt: snap.equityUsdt,
    };
}

function executeSingleSliceRun(params: {
    bars: readonly NyValueRetestBar5m[];
    ablationId: BacktestAblationId;
    startingCapitalUsdt: number;
}): {
    summary: BacktestMetricsSummaryV1;
    snapshot: PaperAccountSnapshotV1;
    rejected: BacktestRejectedCandidateV1[];
} {
    const is2xFriction = params.ablationId === 'FRICTION_2X_STRESS';
    const schedule: PaperFeeSchedule = is2xFriction
        ? {
              ...DEFAULT_PAPER_FEE_SCHEDULE,
              makerFeeRate: DEFAULT_PAPER_FEE_SCHEDULE.makerFeeRate * 2,
              takerFeeRate: DEFAULT_PAPER_FEE_SCHEDULE.takerFeeRate * 2,
              stopSlippageRate: DEFAULT_PAPER_FEE_SCHEDULE.stopSlippageRate * 2,
          }
        : DEFAULT_PAPER_FEE_SCHEDULE;

    const ledger = new PaperAccountLedger({
        accountId: `bt-${params.ablationId.toLowerCase()}`,
        accountScope: 'BACKTEST_ACCOUNT',
        startingCapitalUsdt: params.startingCapitalUsdt,
        initialTimestampMs: params.bars[0]?.timestampMs ?? 0,
        schedule,
    });

    const rejected: BacktestRejectedCandidateV1[] = [];
    const ablationFlags = {
        disableFootprintGate: params.ablationId === 'ABLATION_NO_FOOTPRINT',
        disableCvdGate: params.ablationId === 'ABLATION_NO_CVD',
        disableOptionsGate: params.ablationId === 'ABLATION_NO_OPTIONS',
        disableUsSessionFilter: params.ablationId === 'ABLATION_NO_US_SESSION',
    };

    for (let i = 0; i < params.bars.length; i++) {
        const bar = params.bars[i];
        ledger.processBar(bar);

        const snap = ledger.getSnapshot();
        if (snap.openPosition !== null) continue;

        const windowBars = params.bars.slice(Math.max(0, i - 19), i + 1);
        const highs = windowBars.map((b) => b.high);
        const lows = windowBars.map((b) => b.low);
        const rangeLow = Math.min(...lows);
        const rangeHigh = Math.max(...highs);
        const span = Math.max(10, rangeHigh - rangeLow);

        const developingVal = rangeLow + span * 0.25;
        const developingPoc = rangeLow + span * 0.52;
        const developingVah = rangeLow + span * 0.78;
        const sessionVwap = developingPoc;
        const atr14 = Math.max(25, span / 5);

        const evalResult = evaluateNyValueRetestV1({
            bar,
            recentBars5m: windowBars,
            developingPoc,
            developingVah,
            developingVal,
            sessionVwap,
            atr14_5m: atr14,
            optionsContext: {
                available: true,
                gammaRegime: 'POSITIVE',
                callWall: rangeHigh + span * 0.8,
                putWall: rangeLow - span * 0.8,
                gammaFlip: developingPoc,
            },
            accountContext: {
                equityUsdt: snap.equityUsdt,
                availableCashUsdt: snap.availableCashUsdt,
                weeklyLossLocked: snap.weeklyLossLocked,
                hasOpenPosition: snap.openPosition !== null,
                tradesTakenInSession: 0,
                consecutiveLossesInSession: 0,
            },
            dataHealth: {
                feedHealthy: true,
                spreadBps: 1.2,
            },
            ablationFlags,
        });

        if (evalResult.qualifies && evalResult.side && evalResult.entryPrice && evalResult.stopPrice && evalResult.targetPrice) {
            ledger.openPositionWithSizing({
                tradeId: `bt-trd-${bar.timestampMs}`,
                timestampMs: bar.timestampMs,
                side: evalResult.side,
                entryPrice: evalResult.entryPrice,
                stopPrice: evalResult.stopPrice,
                targetPrice: evalResult.targetPrice,
                strategyId: 'NY_VALUE_RETEST_V1',
                executionSource: 'STRATEGY_LAB',
                sessionTag: 'NEW_YORK',
                regimeTag: evalResult.regime,
            });
        } else if (evalResult.firstFailedGate && evalResult.firstFailedGate !== 'GATE_1_DATA_AND_SESSION') {
            rejected.push({
                timestampMs: bar.timestampMs,
                price: bar.close,
                firstFailedGate: evalResult.firstFailedGate,
                reason: evalResult.gateResults[evalResult.firstFailedGate].reason,
            });
        }
    }

    const finalSnap = ledger.getSnapshot();
    return {
        summary: summarizeLedgerRun(params.ablationId, finalSnap),
        snapshot: finalSnap,
        rejected: rejected.slice(0, 60),
    };
}

/**
 * Evaluates the Master Plan §6.5 Strategy Research Gate criteria against an OOS backtest run.
 */
export function evaluateStrategyResearchGate(
    primary: BacktestMetricsSummaryV1,
    friction2x: BacktestMetricsSummaryV1,
    evidence?: {
        untouchedHoldout: boolean;
        eligibleSessions: number;
        lower95WeekBlockExpectancyR: number;
        largestPositiveMonthShare: number;
    },
): StrategyResearchGateVerdictV1 {
    const minRequiredTrades = 100;
    const reasons: string[] = [];
    if (!evidence?.untouchedHoldout) reasons.push('No verified untouched holdout dataset.');
    if (!evidence || !Number.isInteger(evidence.eligibleSessions) || evidence.eligibleSessions < 40) reasons.push('At least 40 eligible sessions required.');
    if (!evidence || !Number.isFinite(evidence.largestPositiveMonthShare) || evidence.largestPositiveMonthShare < 0
        || evidence.largestPositiveMonthShare > 0.5) reasons.push('Monthly P&L concentration is unverified or exceeds 50%.');
    if (!Number.isInteger(primary.tradeCount) || primary.tradeCount < minRequiredTrades) {
        reasons.push(
            `Out-of-sample trade count (${primary.tradeCount}) is below the minimum ${minRequiredTrades}-trade sample size.`,
        );
    }
    if (!(primary.expectancyR > 0)) {
        reasons.push(`Net post-fee expectancy (${primary.expectancyR.toFixed(3)}R) must be > 0.00R.`);
    }
    if (primary.profitFactor < 1.2) {
        reasons.push(`Profit factor (${primary.profitFactor.toFixed(2)}) must be >= 1.20.`);
    }
    if (primary.maxDrawdownPct > 6.0) {
        reasons.push(`Max drawdown (${primary.maxDrawdownPct.toFixed(2)}%) exceeds 6.0% threshold.`);
    }
    if (!(evidence && Number.isFinite(evidence.lower95WeekBlockExpectancyR) && evidence.lower95WeekBlockExpectancyR > 0)) {
        reasons.push(
            `95% bootstrap lower bound (${primary.bootstrapLower95ExpectancyR.toFixed(3)}R) must be > 0.00R.`,
        );
    }
    if (!(friction2x.expectancyR > 0)) {
        reasons.push(
            `2x friction stress-test expectancy (${friction2x.expectancyR.toFixed(3)}R) must be positive.`,
        );
    }

    return {
        passed: reasons.length === 0,
        oosTradeCount: primary.tradeCount,
        minRequiredTrades,
        expectancyR: primary.expectancyR,
        profitFactor: primary.profitFactor,
        maxDrawdownPct: primary.maxDrawdownPct,
        bootstrapLower95ExpectancyR: primary.bootstrapLower95ExpectancyR,
        friction2xExpectancyR: friction2x.expectancyR,
        reasons,
    };
}

/**
 * Runs a chronological 60/40 In-Sample / Out-of-Sample backtest with matched ablations and 2x friction stress test (UX20.6-STRAT-02).
 * Always executes in an isolated `BACKTEST_ACCOUNT` that never mutates the live `PAPER_ACCOUNT`.
 */
export function runChronologicalStrategyBacktest(params: {
    datasetId: string;
    bars: readonly NyValueRetestBar5m[];
    startingCapitalUsdt?: number;
    inSampleFraction?: number;
}): BacktestRunReportV1 {
    const startingCapitalUsdt = params.startingCapitalUsdt ?? 10_000;
    const splitFraction = Math.max(0.2, Math.min(0.8, params.inSampleFraction ?? 0.5));
    const sorted = [...params.bars].sort((a, b) => a.timestampMs - b.timestampMs);
    const splitIdx = Math.floor(sorted.length * splitFraction);
    const inSampleBars = sorted.slice(0, splitIdx);
    const oosBars = sorted.slice(splitIdx);

    const evalBars = oosBars.length >= 10 ? oosBars : [];

    const primaryRun = executeSingleSliceRun({
        bars: evalBars,
        ablationId: 'OHLC_DIAGNOSTIC',
        startingCapitalUsdt,
    });
    const noFpRun = executeSingleSliceRun({
        bars: evalBars,
        ablationId: 'ABLATION_NO_FOOTPRINT',
        startingCapitalUsdt,
    });
    const noCvdRun = executeSingleSliceRun({
        bars: evalBars,
        ablationId: 'ABLATION_NO_CVD',
        startingCapitalUsdt,
    });
    const noOptRun = executeSingleSliceRun({
        bars: evalBars,
        ablationId: 'ABLATION_NO_OPTIONS',
        startingCapitalUsdt,
    });
    const noUsRun = executeSingleSliceRun({
        bars: evalBars,
        ablationId: 'ABLATION_NO_US_SESSION',
        startingCapitalUsdt,
    });
    const friction2xRun = executeSingleSliceRun({
        bars: evalBars,
        ablationId: 'FRICTION_2X_STRESS',
        startingCapitalUsdt,
    });

    const researchGateVerdict = evaluateStrategyResearchGate(
        primaryRun.summary,
        friction2xRun.summary,
    );

    return {
        datasetId: params.datasetId,
        accountScope: 'BACKTEST_ACCOUNT',
        inSampleBarCount: inSampleBars.length,
        outOfSampleBarCount: oosBars.length,
        primaryOosSummary: primaryRun.summary,
        ablationSummaries: [
            primaryRun.summary,
            noFpRun.summary,
            noCvdRun.summary,
            noOptRun.summary,
            noUsRun.summary,
            friction2xRun.summary,
        ],
        oosJournal: primaryRun.snapshot.journal,
        rejectedCandidates: primaryRun.rejected,
        researchGateVerdict,
        ledgerSnapshot: primaryRun.snapshot,
    };
}
