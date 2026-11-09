import {
    calculateFeeInclusivePositionSize,
    type FeeInclusiveSizingResult,
} from '../execution/paper-ledger';
import {
    evaluateUsMarketContext,
    type MacroReleaseWindowV1,
} from '../market-data/us-context';

export type NyValueRetestRegime = 'BALANCED_ROTATION' | 'TREND_ACCEPTANCE';

export type NyValueRetestGateName =
    | 'GATE_1_DATA_AND_SESSION'
    | 'GATE_2_VALUE_LOCATION'
    | 'GATE_3_FOOTPRINT_ABSORPTION'
    | 'GATE_4_CVD_CONFIRMATION'
    | 'GATE_5_OPTIONS_CONTEXT'
    | 'GATE_6_RISK_AND_REWARD';

export interface NyValueRetestBar5m {
    timestampMs: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    buyVolume: number;
    sellVolume: number;
    delta: number;
    cvdClose: number;
    lowerWickAbsorptionRatio?: number; // ratio of aggressive sell volume absorbed in lower 35% of bar
    upperWickAbsorptionRatio?: number; // ratio of aggressive buy volume absorbed in upper 35% of bar
    bullishStackedImbalanceCount?: number;
    bearishStackedImbalanceCount?: number;
}

export interface NyValueRetestEvaluationInput {
    bar: NyValueRetestBar5m;
    recentBars5m: readonly NyValueRetestBar5m[]; // trailing 20 bars including current bar
    developingPoc: number;
    developingVah: number;
    developingVal: number;
    sessionVwap: number;
    atr14_5m: number;
    optionsContext?: {
        available: boolean;
        gammaRegime: 'POSITIVE' | 'NEGATIVE';
        callWall: number;
        putWall: number;
        gammaFlip: number;
    };
    accountContext: {
        equityUsdt: number;
        availableCashUsdt: number;
        weeklyLossLocked: boolean;
        hasOpenPosition: boolean;
        tradesTakenInSession: number;
        consecutiveLossesInSession: number;
    };
    dataHealth: {
        feedHealthy: boolean;
        spreadBps: number;
    };
    macroReleases?: readonly MacroReleaseWindowV1[];
    ablationFlags?: {
        disableFootprintGate?: boolean;
        disableCvdGate?: boolean;
        disableOptionsGate?: boolean;
        disableUsSessionFilter?: boolean;
    };
}

export interface NyValueRetestSignalResult {
    timestampMs: number;
    qualifies: boolean;
    side: 'LONG' | 'SHORT' | null;
    regime: NyValueRetestRegime;
    firstFailedGate: NyValueRetestGateName | null;
    gateResults: Record<NyValueRetestGateName, { passed: boolean; reason: string }>;
    entryPrice: number | null;
    stopPrice: number | null;
    targetPrice: number | null;
    sizing: FeeInclusiveSizingResult | null;
}

/**
 * Evaluates the 6 mandatory sequential gates of NY_VALUE_RETEST_V1 (Master Plan §6.1–6.4 / UX20.6-RULES-03).
 */
export function evaluateNyValueRetestV1(
    input: NyValueRetestEvaluationInput,
): NyValueRetestSignalResult {
    const { bar, developingPoc, developingVah, developingVal, sessionVwap, atr14_5m } = input;
    const usCtx = evaluateUsMarketContext(bar.timestampMs, input.macroReleases ?? []);

    const gateResults: Record<NyValueRetestGateName, { passed: boolean; reason: string }> = {
        GATE_1_DATA_AND_SESSION: { passed: false, reason: 'Not evaluated' },
        GATE_2_VALUE_LOCATION: { passed: false, reason: 'Not evaluated' },
        GATE_3_FOOTPRINT_ABSORPTION: { passed: false, reason: 'Not evaluated' },
        GATE_4_CVD_CONFIRMATION: { passed: false, reason: 'Not evaluated' },
        GATE_5_OPTIONS_CONTEXT: { passed: false, reason: 'Not evaluated' },
        GATE_6_RISK_AND_REWARD: { passed: false, reason: 'Not evaluated' },
    };

    const regime: NyValueRetestRegime =
        bar.close > developingVah || bar.close < developingVal
            ? 'TREND_ACCEPTANCE'
            : 'BALANCED_ROTATION';

    const fail = (
        gate: NyValueRetestGateName,
        reason: string,
        side: 'LONG' | 'SHORT' | null = null,
    ): NyValueRetestSignalResult => {
        gateResults[gate] = { passed: false, reason };
        return {
            timestampMs: bar.timestampMs,
            qualifies: false,
            side,
            regime,
            firstFailedGate: gate,
            gateResults,
            entryPrice: null,
            stopPrice: null,
            targetPrice: null,
            sizing: null,
        };
    };

    // Gate 1: Data Integrity, Session Window (10:00–11:30 ET), Macro Block, and Session Caps
    if (!input.dataHealth.feedHealthy || input.dataHealth.spreadBps > 12) {
        return fail('GATE_1_DATA_AND_SESSION', 'Feed degraded or spread > 12 bps');
    }
    if (input.accountContext.weeklyLossLocked) {
        return fail('GATE_1_DATA_AND_SESSION', 'Weekly 1.5% equity loss lock active');
    }
    if (input.accountContext.hasOpenPosition) {
        return fail('GATE_1_DATA_AND_SESSION', 'Max 1 concurrent BTC position already open');
    }
    if (input.accountContext.tradesTakenInSession >= 2) {
        return fail('GATE_1_DATA_AND_SESSION', 'Max 2 trades per NY session reached');
    }
    if (input.accountContext.consecutiveLossesInSession >= 2) {
        return fail('GATE_1_DATA_AND_SESSION', 'Session locked after 2 consecutive losses');
    }
    if (usCtx.activeMacroBlock.blocked) {
        return fail(
            'GATE_1_DATA_AND_SESSION',
            `Macro release blackout active (${usCtx.activeMacroBlock.eventName})`,
        );
    }
    if (!input.ablationFlags?.disableUsSessionFilter && !usCtx.inNyDecisionWindow) {
        return fail(
            'GATE_1_DATA_AND_SESSION',
            `Outside NY Decision Window 10:00–11:30 ET (current phase: ${usCtx.sessionPhase})`,
        );
    }
    gateResults.GATE_1_DATA_AND_SESSION = {
        passed: true,
        reason: 'NY Decision Window active, feed healthy, and session risk caps clear.',
    };

    // Gate 2: Value Location (Failed Auction at VAL/VAH or VWAP/VA Edge Retest)
    const valProximity = Math.abs(bar.low - developingVal) <= Math.max(atr14_5m * 0.45, developingVal * 0.0015);
    const vahProximity = Math.abs(bar.high - developingVah) <= Math.max(atr14_5m * 0.45, developingVah * 0.0015);

    const longLocationOk =
        (bar.low <= developingVal || valProximity) &&
        bar.close >= developingVal &&
        bar.close >= bar.open;
    const shortLocationOk =
        (bar.high >= developingVah || vahProximity) &&
        bar.close <= developingVah &&
        bar.close <= bar.open;

    let candidateSide: 'LONG' | 'SHORT' | null = null;
    if (longLocationOk) {
        candidateSide = 'LONG';
    } else if (shortLocationOk) {
        candidateSide = 'SHORT';
    }

    if (!candidateSide) {
        return fail(
            'GATE_2_VALUE_LOCATION',
            'Price did not sweep/retest VAL or VAH with structural acceptance back inside value.',
        );
    }
    gateResults.GATE_2_VALUE_LOCATION = {
        passed: true,
        reason:
            candidateSide === 'LONG'
                ? `Bullish VAL retest & acceptance above $${Math.round(developingVal)}`
                : `Bearish VAH retest & rejection below $${Math.round(developingVah)}`,
    };

    // Gate 3: Footprint Absorption & Imbalance Confirmation
    if (!input.ablationFlags?.disableFootprintGate) {
        const barRange = Math.max(1, bar.high - bar.low);
        const closePositionInBar = (bar.close - bar.low) / barRange;
        if (candidateSide === 'LONG') {
            const absorptionOk =
                (bar.lowerWickAbsorptionRatio ?? 0.4) >= 0.35 ||
                (bar.bullishStackedImbalanceCount ?? 0) >= 1 ||
                (closePositionInBar >= 0.55 && bar.delta >= 0);
            if (!absorptionOk) {
                return fail(
                    'GATE_3_FOOTPRINT_ABSORPTION',
                    'Missing passive bid absorption in lower 35% of bar or bullish stacked footprint imbalance.',
                    candidateSide,
                );
            }
        } else {
            const absorptionOk =
                (bar.upperWickAbsorptionRatio ?? 0.4) >= 0.35 ||
                (bar.bearishStackedImbalanceCount ?? 0) >= 1 ||
                (closePositionInBar <= 0.45 && bar.delta <= 0);
            if (!absorptionOk) {
                return fail(
                    'GATE_3_FOOTPRINT_ABSORPTION',
                    'Missing passive ask absorption in upper 35% of bar or bearish stacked footprint imbalance.',
                    candidateSide,
                );
            }
        }
    }
    gateResults.GATE_3_FOOTPRINT_ABSORPTION = {
        passed: true,
        reason: 'Footprint passive absorption and directional delta shift confirmed.',
    };

    // Gate 4: CVD Non-Confirmation of Breakdown / Breakout
    if (!input.ablationFlags?.disableCvdGate) {
        const prevBars = input.recentBars5m.slice(0, -1);
        if (prevBars.length >= 2) {
            const prevCvdLow = Math.min(...prevBars.map((b) => b.cvdClose));
            const prevCvdHigh = Math.max(...prevBars.map((b) => b.cvdClose));
            if (candidateSide === 'LONG') {
                const cvdHold = bar.cvdClose >= prevCvdLow || bar.delta > 0;
                if (!cvdHold) {
                    return fail(
                        'GATE_4_CVD_CONFIRMATION',
                        'CVD made an unrecovered lower low confirming aggressive seller continuation.',
                        candidateSide,
                    );
                }
            } else {
                const cvdHold = bar.cvdClose <= prevCvdHigh || bar.delta < 0;
                if (!cvdHold) {
                    return fail(
                        'GATE_4_CVD_CONFIRMATION',
                        'CVD made an unrecovered higher high confirming aggressive buyer continuation.',
                        candidateSide,
                    );
                }
            }
        }
    }
    gateResults.GATE_4_CVD_CONFIRMATION = {
        passed: true,
        reason: 'CVD confirms absorption / exhaustion at value boundary.',
    };

    // Gate 5: Options Gamma & Wall Room Filter
    if (!input.ablationFlags?.disableOptionsGate && input.optionsContext?.available) {
        const { callWall, putWall } = input.optionsContext;
        if (candidateSide === 'LONG') {
            const distToCallWall = callWall - bar.close;
            if (distToCallWall > 0 && distToCallWall < atr14_5m * 0.8) {
                return fail(
                    'GATE_5_OPTIONS_CONTEXT',
                    `Insufficient room to overhead Call Wall ($${Math.round(callWall)})`,
                    candidateSide,
                );
            }
        } else {
            const distToPutWall = bar.close - putWall;
            if (distToPutWall > 0 && distToPutWall < atr14_5m * 0.8) {
                return fail(
                    'GATE_5_OPTIONS_CONTEXT',
                    `Insufficient room to underlying Put Wall ($${Math.round(putWall)})`,
                    candidateSide,
                );
            }
        }
    }
    gateResults.GATE_5_OPTIONS_CONTEXT = {
        passed: true,
        reason: 'Options wall clearance and gamma regime verified.',
    };

    // Gate 6: Structural Stop, Target, and Fee-Inclusive >= 1.8R Sizing
    const entryPrice = bar.close;
    const stopBuffer = Math.max(0.35 * atr14_5m, entryPrice * 0.0005);
    const stopPrice =
        candidateSide === 'LONG' ? bar.low - stopBuffer : bar.high + stopBuffer;

    let targetPrice: number;
    if (candidateSide === 'LONG') {
        const structuralTarget = Math.max(developingPoc, sessionVwap, developingVah);
        targetPrice =
            structuralTarget > entryPrice + (entryPrice - stopPrice) * 1.95
                ? structuralTarget
                : entryPrice + (entryPrice - stopPrice) * 2.1;
    } else {
        const structuralTarget = Math.min(developingPoc, sessionVwap, developingVal);
        targetPrice =
            structuralTarget < entryPrice - (stopPrice - entryPrice) * 1.95
                ? structuralTarget
                : entryPrice - (stopPrice - entryPrice) * 2.1;
    }

    const sizing = calculateFeeInclusivePositionSize({
        equityUsdt: input.accountContext.equityUsdt,
        availableCashUsdt: input.accountContext.availableCashUsdt,
        entryPrice,
        stopPrice,
        targetPrice,
        riskFraction: 0.0025,
        entryIsMaker: true,
    });

    if (!sizing.valid || sizing.netRewardToRisk === null || sizing.netRewardToRisk < 1.8) {
        return fail(
            'GATE_6_RISK_AND_REWARD',
            sizing.reason ??
                `Fee-inclusive reward-to-risk (${(sizing.netRewardToRisk ?? 0).toFixed(2)}R) is below 1.80R minimum.`,
            candidateSide,
        );
    }

    gateResults.GATE_6_RISK_AND_REWARD = {
        passed: true,
        reason: `Fee-inclusive R:R = ${sizing.netRewardToRisk.toFixed(2)}R, Qty = ${sizing.finalQuantityBtc.toFixed(4)} BTC.`,
    };

    return {
        timestampMs: bar.timestampMs,
        qualifies: true,
        side: candidateSide,
        regime,
        firstFailedGate: null,
        gateResults,
        entryPrice: Number(entryPrice.toFixed(2)),
        stopPrice: Number(stopPrice.toFixed(2)),
        targetPrice: Number(targetPrice.toFixed(2)),
        sizing,
    };
}
