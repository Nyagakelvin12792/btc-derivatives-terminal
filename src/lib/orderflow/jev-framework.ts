/**
 * Jev by TypeSafe AI Decision Framework (UX19.6)
 *
 * Implements the 5-layer quantitative decision architecture:
 * Layer 1: BTC Market Data (Price, volume, L2 book, options)
 * Layer 2: Deterministic Analytics Engine (Volume Profile, VWAP, CVD, Footprint, Gamma)
 * Layer 3: Jev Decision Layer (Regime classification, confluence scoring, setup classification)
 * Layer 4: Rule Validation & Risk Controls (Data-quality gates, invalidation, risk limits, no-trade conditions)
 * Layer 5: Trade Scenario Panel (Bullish, bearish, neutral, A/AA/AAA classification, collapsible advisory panel)
 *
 * Supported Operational Modes:
 * - DISABLED: AI turned off completely; pure deterministic terminal.
 * - SHADOW: Evaluates in background for telemetry/benchmarking; silent in UI.
 * - ADVISORY: Displays non-blocking, collapsible advisory commentary and setup classifications.
 * - EVALUATED: Rigorous backtesting and forward-testing logging to measure edge over baseline.
 */

import { z } from 'zod';

export const JevOperationalModeSchema = z.enum([
    'DISABLED',
    'SHADOW',
    'ADVISORY',
    'EVALUATED',
]);
export type JevOperationalMode = z.infer<typeof JevOperationalModeSchema>;

export const JevMarketRegimeSchema = z.enum([
    'TRENDING_UP',
    'TRENDING_DOWN',
    'RANGE_BOUND',
    'VOLATILITY_EXPANSION',
    'COMPRESSION',
]);
export type JevMarketRegime = z.infer<typeof JevMarketRegimeSchema>;

export const JevSetupGradeSchema = z.enum(['AAA', 'AA', 'A', 'NONE']);
export type JevSetupGrade = z.infer<typeof JevSetupGradeSchema>;

export const JevStanceSchema = z.enum(['AGREE', 'CAUTION', 'DISAGREE', 'ABSTAIN']);
export type JevStance = z.infer<typeof JevStanceSchema>;

export interface DeterministicMarketState {
    currentPrice: number;
    vwapPrice: number;
    avwapPrice?: number;
    vpPoc: number;
    vpVah: number;
    vpVal: number;
    netDelta: number;
    cvdSlope: 'RISING' | 'FALLING' | 'FLAT';
    gammaRegime: 'LONG_GAMMA_MEAN_REVERTING' | 'SHORT_GAMMA_EXPANSION';
    gammaFlip?: number;
    callWall: number;
    putWall: number;
    dataQualityOk: boolean;
    spreadBps: number;
}

export interface JevAdvisoryOutput {
    mode: JevOperationalMode;
    timestamp: number;
    regime: JevMarketRegime;
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    setupGrade: JevSetupGrade;
    confluenceCount: number;
    confluences: string[];
    stance: JevStance;
    confidenceScore: number; // 0.0 to 1.0
    invalidationPrice: number;
    triggerPrice: number;
    targetPrice: number;
    advisorySummary: string;
    tradeScenario: {
        setupName: string;
        recommendedRiskR: number;
        conditionsMet: string[];
        cautions: string[];
        noTradeReason?: string;
    };
    gatePassed: boolean;
}

export const JEV_MODE_STORAGE_KEY = 'btc-terminal-jev-mode-v1';

export function loadPersistedJevMode(): JevOperationalMode {
    if (typeof window === 'undefined' || !window.localStorage) return 'ADVISORY';
    try {
        const raw = window.localStorage.getItem(JEV_MODE_STORAGE_KEY);
        if (!raw) return 'ADVISORY';
        return JevOperationalModeSchema.parse(raw);
    } catch {
        return 'ADVISORY';
    }
}

export function savePersistedJevMode(mode: JevOperationalMode): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        window.localStorage.setItem(JEV_MODE_STORAGE_KEY, mode);
    } catch {
        // storage disabled
    }
}

/**
 * Deterministic Decision Engine feeding the Jev Advisory Framework.
 * Grounded 100% in factual BTC market data, mathematically verifying confluences.
 */
export function evaluateJevDecision(
    market: DeterministicMarketState,
    mode: JevOperationalMode = 'ADVISORY'
): JevAdvisoryOutput {
    const now = Date.now();

    if (mode === 'DISABLED') {
        return {
            mode: 'DISABLED',
            timestamp: now,
            regime: 'RANGE_BOUND',
            bias: 'NEUTRAL',
            setupGrade: 'NONE',
            confluenceCount: 0,
            confluences: [],
            stance: 'ABSTAIN',
            confidenceScore: 0,
            invalidationPrice: 0,
            triggerPrice: 0,
            targetPrice: 0,
            advisorySummary: 'Jev AI decision framework is disabled by user.',
            tradeScenario: {
                setupName: 'DISABLED',
                recommendedRiskR: 0,
                conditionsMet: [],
                cautions: [],
                noTradeReason: 'AI Advisory layer turned off.',
            },
            gatePassed: false,
        };
    }

    // 1. Data-Quality Gates
    if (!market.dataQualityOk || market.spreadBps > 15) {
        return {
            mode,
            timestamp: now,
            regime: 'COMPRESSION',
            bias: 'NEUTRAL',
            setupGrade: 'NONE',
            confluenceCount: 0,
            confluences: [],
            stance: 'ABSTAIN',
            confidenceScore: 0.1,
            invalidationPrice: 0,
            triggerPrice: 0,
            targetPrice: 0,
            advisorySummary: 'Data quality gate tripped (spread > 15 bps or stale feed). Abstaining.',
            tradeScenario: {
                setupName: 'NO TRADE - DATA GATE',
                recommendedRiskR: 0,
                conditionsMet: [],
                cautions: ['Stale market feed or high spread detected.'],
                noTradeReason: 'Data feed quality below institutional threshold.',
            },
            gatePassed: false,
        };
    }

    // 2. Regime Classification
    let regime: JevMarketRegime = 'RANGE_BOUND';
    const isAboveVwap = market.currentPrice > market.vwapPrice;
    const isAbovePoc = market.currentPrice > market.vpPoc;
    const isInsideVa = market.currentPrice >= market.vpVal && market.currentPrice <= market.vpVah;

    if (market.gammaRegime === 'SHORT_GAMMA_EXPANSION') {
        regime = isAboveVwap ? 'TRENDING_UP' : 'TRENDING_DOWN';
    } else if (isInsideVa) {
        regime = 'RANGE_BOUND';
    } else if (market.currentPrice > market.vpVah) {
        regime = 'VOLATILITY_EXPANSION';
    } else {
        regime = 'COMPRESSION';
    }

    // 3. Confluence Evaluation
    const confluences: string[] = [];
    const cautions: string[] = [];

    // Confluence 1: Value Area positioning
    if (isAbovePoc && market.currentPrice >= market.vpVal) {
        confluences.push('Price accepted above Volume Profile POC ($' + Math.round(market.vpPoc) + ')');
    } else if (!isAbovePoc && market.currentPrice <= market.vpVah) {
        confluences.push('Price rejected below Volume Profile POC ($' + Math.round(market.vpPoc) + ')');
    }

    // Confluence 2: VWAP / AVWAP alignment
    if (isAboveVwap) {
        confluences.push('Bullish VWAP posture (trading above center VWAP)');
    } else {
        confluences.push('Bearish VWAP posture (trading below center VWAP)');
    }

    // Confluence 3: Order flow / CVD delta
    if (market.cvdSlope === 'RISING' && market.netDelta > 0) {
        confluences.push('Aggressive taker buying volume (positive CVD expansion)');
    } else if (market.cvdSlope === 'FALLING' && market.netDelta < 0) {
        confluences.push('Aggressive taker selling pressure (negative CVD absorption)');
    } else {
        cautions.push('CVD delta divergence: price and aggressor volume lack directional consensus');
    }

    // Confluence 4: Options gamma regime
    if (market.gammaRegime === 'LONG_GAMMA_MEAN_REVERTING') {
        confluences.push('Long gamma environment: dealer hedging dampens volatility towards POC');
    } else {
        confluences.push('Short gamma regime: dealer hedging accelerates directional moves');
    }

    // Confluence 5: Proximity to key walls
    const distToCall = Math.abs(market.callWall - market.currentPrice);
    const distToPut = Math.abs(market.currentPrice - market.putWall);
    if (distToCall < distToPut && distToCall < market.currentPrice * 0.015) {
        cautions.push('Approaching major Call Wall ($' + Math.round(market.callWall) + ') - high overhead dealer resistance');
    } else if (distToPut < distToCall && distToPut < market.currentPrice * 0.015) {
        confluences.push('Strong structural support near Put Wall ($' + Math.round(market.putWall) + ')');
    }

    // 4. Bias & Stance Determination
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const bullishPoints = (isAboveVwap ? 1 : 0) + (isAbovePoc ? 1 : 0) + (market.cvdSlope === 'RISING' ? 1 : 0);
    const bearishPoints = (!isAboveVwap ? 1 : 0) + (!isAbovePoc ? 1 : 0) + (market.cvdSlope === 'FALLING' ? 1 : 0);

    if (bullishPoints >= 2 && bullishPoints > bearishPoints) {
        bias = 'BULLISH';
    } else if (bearishPoints >= 2 && bearishPoints > bullishPoints) {
        bias = 'BEARISH';
    }

    // Setup Grade
    const count = confluences.length;
    let setupGrade: JevSetupGrade = 'A';
    if (count >= 4 && cautions.length === 0) {
        setupGrade = 'AAA';
    } else if (count >= 3) {
        setupGrade = 'AA';
    } else if (count < 2) {
        setupGrade = 'NONE';
    }

    const confidenceScore = Math.min(0.95, Math.max(0.2, 0.4 + count * 0.12 - cautions.length * 0.1));
    const stance: JevStance = setupGrade === 'AAA' ? 'AGREE' : setupGrade === 'NONE' ? 'DISAGREE' : cautions.length > 0 ? 'CAUTION' : 'AGREE';

    // Levels
    const invalidationPrice = bias === 'BULLISH' ? Math.min(market.vpVal, market.vwapPrice * 0.995) : Math.max(market.vpVah, market.vwapPrice * 1.005);
    const triggerPrice = market.currentPrice;
    const targetPrice = bias === 'BULLISH' ? market.callWall : market.putWall;

    const setupName = bias === 'BULLISH'
        ? (isInsideVa ? 'Value Area Mean-Reversion Long' : 'Volume Expansion Breakout Long')
        : (isInsideVa ? 'Value Area Mean-Reversion Short' : 'Breakdown Extension Short');

    const advisorySummary = `${bias} bias (${setupGrade} setup). ${confluences.slice(0, 2).join('; ')}.` + (cautions.length > 0 ? ` Caution: ${cautions[0]}` : '');

    return {
        mode,
        timestamp: now,
        regime,
        bias,
        setupGrade,
        confluenceCount: count,
        confluences,
        stance,
        confidenceScore: Number(confidenceScore.toFixed(2)),
        invalidationPrice: Math.round(invalidationPrice),
        triggerPrice: Math.round(triggerPrice),
        targetPrice: Math.round(targetPrice),
        advisorySummary,
        tradeScenario: {
            setupName,
            recommendedRiskR: setupGrade === 'AAA' ? 2.5 : setupGrade === 'AA' ? 1.5 : 1.0,
            conditionsMet: confluences,
            cautions,
        },
        gatePassed: true,
    };
}
