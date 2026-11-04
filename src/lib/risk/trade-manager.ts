import { z } from 'zod';
import type { DemoMarketBar } from '../ui/market-fixtures';

export const ManagedTradeStatusSchema = z.enum([
    'DRAFT',
    'PENDING',
    'OPEN',
    'PARTIALLY_CLOSED',
    'CLOSED',
    'STOPPED_OUT',
    'CANCELLED',
]);
export type ManagedTradeStatus = z.infer<typeof ManagedTradeStatusSchema>;

export const TradeDirectionSchema = z.enum(['LONG', 'SHORT']);
export type TradeDirection = z.infer<typeof TradeDirectionSchema>;

export const SetupQualityGradeSchema = z.enum(['A', 'AA', 'AAA', 'UNGRADED']);
export type SetupQualityGrade = z.infer<typeof SetupQualityGradeSchema>;

export const StopLossModeSchema = z.enum([
    'STATIC',
    'BREAK_EVEN_ON_TP1',
    'TRAILING_DOLLAR',
]);
export type StopLossMode = z.infer<typeof StopLossModeSchema>;

export const TakeProfitTargetSchema = z.object({
    id: z.string(),
    label: z.string(),
    price: z.number().positive(),
    allocationPct: z.number().min(0).max(100),
    filled: z.boolean().default(false),
    filledAtTime: z.number().nullable().default(null),
    realizedPnlUsd: z.number().default(0),
});
export type TakeProfitTarget = z.infer<typeof TakeProfitTargetSchema>;

export const TradeLifecycleEventSchema = z.object({
    id: z.string(),
    timestamp: z.number(),
    type: z.enum([
        'CREATED',
        'ARMED_PENDING',
        'ENTRY_FILLED',
        'TP_FILLED',
        'STOP_MOVED_TO_BE',
        'STOP_ADJUSTED',
        'STOPPED_OUT',
        'CLOSED_MANUAL',
        'CANCELLED',
        'AMBIGUOUS_INTRABAR_WARNING',
    ]),
    message: z.string(),
    price: z.number().nullable(),
});
export type TradeLifecycleEvent = z.infer<typeof TradeLifecycleEventSchema>;

export const TradeJournalRecordSchema = z.object({
    setupScenario: z.string().default('Value Area Rejection'),
    sessionTag: z.enum(['ASIA', 'LONDON', 'NEW_YORK', 'OVERLAP', 'OUT_OF_SESSION']).default('NEW_YORK'),
    htfBias: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).default('NEUTRAL'),
    qualityGrade: SetupQualityGradeSchema.default('A'),
    followedPlan: z.boolean().default(true),
    entryRationale: z.string().default(''),
    managementNotes: z.string().default(''),
    postTradeLesson: z.string().default(''),
});
export type TradeJournalRecord = z.infer<typeof TradeJournalRecordSchema>;

export const ManagedTradeSchema = z.object({
    id: z.string(),
    drawingId: z.string().nullable(),
    symbol: z.string().default('BTCUSDT'),
    timeframe: z.string().default('1h'),
    direction: TradeDirectionSchema,
    status: ManagedTradeStatusSchema,
    executionMode: z.enum(['PAPER_LIVE', 'HISTORICAL_REPLAY']).default('PAPER_LIVE'),
    createdAt: z.number(),
    openedAt: z.number().nullable().default(null),
    closedAt: z.number().nullable().default(null),
    startTime: z.number(),
    endTime: z.number(),
    entryPrice: z.number().positive(),
    initialStopPrice: z.number().positive(),
    currentStopPrice: z.number().positive(),
    stopMode: StopLossModeSchema.default('BREAK_EVEN_ON_TP1'),
    trailingDistanceUsd: z.number().nonnegative().default(250),
    accountBalanceUsd: z.number().positive().default(100_000),
    riskPercent: z.number().positive().default(1.0),
    initialRiskUsd: z.number().positive(),
    positionSizeBtc: z.number().positive(),
    remainingAllocationPct: z.number().min(0).max(100).default(100),
    takeProfits: z.array(TakeProfitTargetSchema).min(1).max(6),
    realizedPnlUsd: z.number().default(0),
    unrealizedPnlUsd: z.number().default(0),
    maeUsd: z.number().default(0),
    mfeUsd: z.number().default(0),
    hasAmbiguousIntrabarEvent: z.boolean().default(false),
    events: z.array(TradeLifecycleEventSchema).default([]),
    journal: TradeJournalRecordSchema,
});
export type ManagedTrade = z.infer<typeof ManagedTradeSchema>;

export interface PortfolioAnalyticsSummary {
    totalTrades: number;
    completedTrades: number;
    openTrades: number;
    winCount: number;
    lossCount: number;
    breakevenCount: number;
    winRatePct: number;
    profitFactor: number;
    totalNetPnlUsd: number;
    expectancyUsd: number;
    expectancyR: number;
    averageR: number;
    maxDrawdownUsd: number;
    maxDrawdownR: number;
    longWinRatePct: number;
    shortWinRatePct: number;
    tp1HitRatePct: number;
    tp2HitRatePct: number;
    smallSampleWarning: boolean;
}

export const MANAGED_TRADES_STORAGE_KEY = 'btc-terminal-managed-trades-v1' as const;

export function loadManagedTrades(storage?: Pick<Storage, 'getItem'> | null): ManagedTrade[] {
    const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!targetStorage) return [];
    try {
        const raw = targetStorage.getItem(MANAGED_TRADES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = z.array(ManagedTradeSchema).safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : [];
    } catch {
        return [];
    }
}

export function saveManagedTrades(
    trades: readonly ManagedTrade[],
    storage?: Pick<Storage, 'setItem'> | null,
): void {
    const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!targetStorage) return;
    try {
        targetStorage.setItem(MANAGED_TRADES_STORAGE_KEY, JSON.stringify(trades.slice(0, 200)));
    } catch {
        // ignore quota errors
    }
}

export function validateTakeProfitAllocations(targets: readonly TakeProfitTarget[]): {
    valid: boolean;
    totalPct: number;
    error: string | null;
} {
    const totalPct = Number(targets.reduce((acc, t) => acc + Math.max(0, t.allocationPct), 0).toFixed(2));
    if (totalPct > 100.01) {
        return {
            valid: false,
            totalPct,
            error: `Take-profit allocations sum to ${totalPct}% (must not exceed 100%).`,
        };
    }
    if (totalPct <= 0) {
        return {
            valid: false,
            totalPct,
            error: 'At least one Take-Profit target must have positive allocation.',
        };
    }
    return { valid: true, totalPct, error: null };
}

export function createManagedTradeFromDrawing(input: {
    id?: string;
    drawingId: string | null;
    direction: TradeDirection;
    entryPrice: number;
    stopPrice: number;
    targetPrice: number;
    startTime: number;
    endTime: number;
    timeframe?: string;
    accountBalanceUsd?: number;
    riskPercent?: number;
    executionMode?: 'PAPER_LIVE' | 'HISTORICAL_REPLAY';
}): ManagedTrade {
    const accountBalanceUsd = input.accountBalanceUsd ?? 100_000;
    const riskPercent = input.riskPercent ?? 1.0;
    const initialRiskUsd = Number(((accountBalanceUsd * riskPercent) / 100).toFixed(2));
    const stopDistance = Math.max(1, Math.abs(input.entryPrice - input.stopPrice));
    const positionSizeBtc = Number((initialRiskUsd / stopDistance).toFixed(6));

    const tp1Distance = Math.abs(input.targetPrice - input.entryPrice);
    const sign = input.direction === 'LONG' ? 1 : -1;
    const tp1Price = Number((input.entryPrice + sign * tp1Distance * 0.6).toFixed(1));
    const tp2Price = Number(input.targetPrice.toFixed(1));

    const now = Date.now();
    return ManagedTradeSchema.parse({
        id: input.id ?? `trd-${now}-${Math.random().toString(36).slice(2, 6)}`,
        drawingId: input.drawingId,
        symbol: 'BTCUSDT',
        timeframe: input.timeframe ?? '1h',
        direction: input.direction,
        status: 'DRAFT',
        executionMode: input.executionMode ?? 'PAPER_LIVE',
        createdAt: now,
        openedAt: null,
        closedAt: null,
        startTime: input.startTime,
        endTime: input.endTime,
        entryPrice: input.entryPrice,
        initialStopPrice: input.stopPrice,
        currentStopPrice: input.stopPrice,
        stopMode: 'BREAK_EVEN_ON_TP1',
        trailingDistanceUsd: Math.round(stopDistance),
        accountBalanceUsd,
        riskPercent,
        initialRiskUsd,
        positionSizeBtc,
        remainingAllocationPct: 100,
        takeProfits: [
            {
                id: 'tp-1',
                label: 'TP1',
                price: tp1Price > 0 ? tp1Price : input.targetPrice,
                allocationPct: 50,
                filled: false,
                filledAtTime: null,
                realizedPnlUsd: 0,
            },
            {
                id: 'tp-2',
                label: 'TP2',
                price: tp2Price,
                allocationPct: 50,
                filled: false,
                filledAtTime: null,
                realizedPnlUsd: 0,
            },
        ],
        realizedPnlUsd: 0,
        unrealizedPnlUsd: 0,
        maeUsd: 0,
        mfeUsd: 0,
        hasAmbiguousIntrabarEvent: false,
        events: [
            {
                id: `evt-${now}`,
                timestamp: now,
                type: 'CREATED',
                message: `Created ${input.direction} setup @ $${input.entryPrice.toLocaleString()}`,
                price: input.entryPrice,
            },
        ],
        journal: {
            setupScenario: 'Value Area Rejection',
            sessionTag: 'NEW_YORK',
            htfBias: input.direction === 'LONG' ? 'BULLISH' : 'BEARISH',
            qualityGrade: 'A',
            followedPlan: true,
            entryRationale: '',
            managementNotes: '',
            postTradeLesson: '',
        },
    });
}

export function computeTradeMetricsSnapshot(trade: ManagedTrade, currentMarketPrice: number): {
    unrealizedPnlUsd: number;
    totalNetPnlUsd: number;
    realizedR: number;
    totalR: number;
    weightedTargetRR: number;
} {
    const sign = trade.direction === 'LONG' ? 1 : -1;
    const isActive = trade.status === 'OPEN' || trade.status === 'PARTIALLY_CLOSED';
    const remainingQty = trade.positionSizeBtc * (trade.remainingAllocationPct / 100);
    const unrealizedPnlUsd = isActive
        ? Number(((currentMarketPrice - trade.entryPrice) * sign * remainingQty).toFixed(2))
        : 0;
    const totalNetPnlUsd = Number((trade.realizedPnlUsd + unrealizedPnlUsd).toFixed(2));
    const realizedR = trade.initialRiskUsd > 0 ? Number((trade.realizedPnlUsd / trade.initialRiskUsd).toFixed(2)) : 0;
    const totalR = trade.initialRiskUsd > 0 ? Number((totalNetPnlUsd / trade.initialRiskUsd).toFixed(2)) : 0;

    const initialStopDist = Math.max(1, Math.abs(trade.entryPrice - trade.initialStopPrice));
    const weightedTargetRR = Number(
        trade.takeProfits
            .reduce((acc, tp) => {
                const tpDist = Math.abs(tp.price - trade.entryPrice);
                const rr = tpDist / initialStopDist;
                return acc + rr * (tp.allocationPct / 100);
            }, 0)
            .toFixed(2),
    );

    return {
        unrealizedPnlUsd,
        totalNetPnlUsd,
        realizedR,
        totalR,
        weightedTargetRR,
    };
}

/**
 * Evaluates a single OHLC bar against a ManagedTrade in either Live Paper Trading or Historical Replay mode.
 * Explicitly flags AMBIGUOUS_INTRABAR_WARNING when both Stop Loss and a Take-Profit target lie inside [bar.low, bar.high].
 */
export function evaluateTradeOnBar(trade: ManagedTrade, bar: DemoMarketBar): ManagedTrade {
    if (
        trade.status === 'CLOSED' ||
        trade.status === 'STOPPED_OUT' ||
        trade.status === 'CANCELLED' ||
        trade.status === 'DRAFT'
    ) {
        return trade;
    }

    const barTime = Number(bar.time);
    if (barTime < trade.startTime) {
        return trade;
    }

    let next: ManagedTrade = {
        ...trade,
        takeProfits: trade.takeProfits.map((tp) => ({ ...tp })),
        events: [...trade.events],
    };

    const sign = next.direction === 'LONG' ? 1 : -1;

    // 1. Check PENDING entry activation
    if (next.status === 'PENDING') {
        if (barTime > next.endTime) {
            next.status = 'CANCELLED';
            next.closedAt = barTime;
            next.events.push({
                id: `evt-exp-${barTime}`,
                timestamp: barTime,
                type: 'CANCELLED',
                message: 'Pending entry window expired without fill.',
                price: bar.close,
            });
            return next;
        }
        const entryTouched = bar.low <= next.entryPrice && bar.high >= next.entryPrice;
        if (entryTouched) {
            next.status = 'OPEN';
            next.openedAt = barTime;
            next.events.push({
                id: `evt-open-${barTime}`,
                timestamp: barTime,
                type: 'ENTRY_FILLED',
                message: `Entry filled @ $${next.entryPrice.toLocaleString()}`,
                price: next.entryPrice,
            });
        } else {
            return next;
        }
    }

    // 2. Trade is OPEN or PARTIALLY_CLOSED: update MAE / MFE
    const remQty = next.positionSizeBtc * (next.remainingAllocationPct / 100);
    const favorableExtreme = next.direction === 'LONG' ? bar.high : bar.low;
    const adverseExtreme = next.direction === 'LONG' ? bar.low : bar.high;
    const barMfe = (favorableExtreme - next.entryPrice) * sign * remQty;
    const barMae = (adverseExtreme - next.entryPrice) * sign * remQty;
    next.mfeUsd = Number(Math.max(next.mfeUsd, barMfe).toFixed(2));
    next.maeUsd = Number(Math.min(next.maeUsd, barMae).toFixed(2));

    // Check if Stop Loss is touched on this bar
    const stopTouched =
        next.direction === 'LONG' ? bar.low <= next.currentStopPrice : bar.high >= next.currentStopPrice;

    // Check which unfilled TPs are touched on this bar
    const touchedTps = next.takeProfits.filter(
        (tp) =>
            !tp.filled &&
            tp.allocationPct > 0 &&
            (next.direction === 'LONG' ? bar.high >= tp.price : bar.low <= tp.price),
    );

    // Intrabar Ambiguity Detection: BOTH Stop and TP touched in the same OHLC bar
    if (stopTouched && touchedTps.length > 0) {
        next.hasAmbiguousIntrabarEvent = true;
        next.events.push({
            id: `evt-ambig-${barTime}`,
            timestamp: barTime,
            type: 'AMBIGUOUS_INTRABAR_WARNING',
            message: `Ambiguous intrabar touch: both Stop ($${next.currentStopPrice.toLocaleString()}) and ${touchedTps[0].label} ($${touchedTps[0].price.toLocaleString()}) were inside bar range [$${bar.low.toLocaleString()} – $${bar.high.toLocaleString()}]. Applied conservative Stop-First resolution.`,
            price: next.currentStopPrice,
        });
    }

    if (stopTouched) {
        const stopPnl = Number(((next.currentStopPrice - next.entryPrice) * sign * remQty).toFixed(2));
        next.realizedPnlUsd = Number((next.realizedPnlUsd + stopPnl).toFixed(2));
        next.remainingAllocationPct = 0;
        next.unrealizedPnlUsd = 0;
        next.status = 'STOPPED_OUT';
        next.closedAt = barTime;
        next.events.push({
            id: `evt-stop-${barTime}`,
            timestamp: barTime,
            type: 'STOPPED_OUT',
            message: `Stopped out @ $${next.currentStopPrice.toLocaleString()} (${stopPnl >= 0 ? '+' : ''}$${stopPnl.toFixed(2)})`,
            price: next.currentStopPrice,
        });
        return next;
    }

    // Process touched Take-Profits in order of proximity to entry
    const sortedTps = [...touchedTps].sort((a, b) =>
        next.direction === 'LONG' ? a.price - b.price : b.price - a.price,
    );

    for (const tp of sortedTps) {
        if (next.remainingAllocationPct <= 0) break;
        const targetRef = next.takeProfits.find((t) => t.id === tp.id);
        if (!targetRef || targetRef.filled) continue;

        const fillPct = Math.min(next.remainingAllocationPct, targetRef.allocationPct);
        const fillQty = next.positionSizeBtc * (fillPct / 100);
        const tpPnl = Number(((targetRef.price - next.entryPrice) * sign * fillQty).toFixed(2));

        targetRef.filled = true;
        targetRef.filledAtTime = barTime;
        targetRef.realizedPnlUsd = tpPnl;

        next.realizedPnlUsd = Number((next.realizedPnlUsd + tpPnl).toFixed(2));
        next.remainingAllocationPct = Number(Math.max(0, next.remainingAllocationPct - fillPct).toFixed(2));

        next.events.push({
            id: `evt-${targetRef.id}-${barTime}`,
            timestamp: barTime,
            type: 'TP_FILLED',
            message: `${targetRef.label} filled (${fillPct}%) @ $${targetRef.price.toLocaleString()} (+$${tpPnl.toFixed(2)})`,
            price: targetRef.price,
        });

        // Break-even rule after TP1
        if (
            next.stopMode === 'BREAK_EVEN_ON_TP1' &&
            next.remainingAllocationPct > 0 &&
            next.currentStopPrice !== next.entryPrice
        ) {
            next.currentStopPrice = next.entryPrice;
            next.events.push({
                id: `evt-be-${barTime}`,
                timestamp: barTime,
                type: 'STOP_MOVED_TO_BE',
                message: `Stop automatically moved to Break-Even ($${next.entryPrice.toLocaleString()}) after ${targetRef.label}.`,
                price: next.entryPrice,
            });
        }
    }

    // Trailing Stop update if active
    if (next.stopMode === 'TRAILING_DOLLAR' && next.remainingAllocationPct > 0 && next.trailingDistanceUsd > 0) {
        if (next.direction === 'LONG') {
            const candidateStop = Number((bar.high - next.trailingDistanceUsd).toFixed(1));
            if (candidateStop > next.currentStopPrice) {
                next.currentStopPrice = candidateStop;
            }
        } else {
            const candidateStop = Number((bar.low + next.trailingDistanceUsd).toFixed(1));
            if (candidateStop < next.currentStopPrice) {
                next.currentStopPrice = candidateStop;
            }
        }
    }

    if (next.remainingAllocationPct <= 0.01) {
        next.remainingAllocationPct = 0;
        next.unrealizedPnlUsd = 0;
        next.status = 'CLOSED';
        next.closedAt = barTime;
    } else if (next.takeProfits.some((t) => t.filled)) {
        next.status = 'PARTIALLY_CLOSED';
        const finalRemQty = next.positionSizeBtc * (next.remainingAllocationPct / 100);
        next.unrealizedPnlUsd = Number(((bar.close - next.entryPrice) * sign * finalRemQty).toFixed(2));
    } else {
        const finalRemQty = next.positionSizeBtc * (next.remainingAllocationPct / 100);
        next.unrealizedPnlUsd = Number(((bar.close - next.entryPrice) * sign * finalRemQty).toFixed(2));
    }

    return next;
}

export function computePortfolioAnalytics(trades: readonly ManagedTrade[]): PortfolioAnalyticsSummary {
    const completed = trades.filter((t) => t.status === 'CLOSED' || t.status === 'STOPPED_OUT');
    const open = trades.filter((t) => t.status === 'OPEN' || t.status === 'PARTIALLY_CLOSED' || t.status === 'PENDING');

    let grossProfit = 0;
    let grossLoss = 0;
    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let sumR = 0;

    let peakPnl = 0;
    let runningPnl = 0;
    let maxDrawdownUsd = 0;

    let peakR = 0;
    let runningR = 0;
    let maxDrawdownR = 0;

    for (const t of completed) {
        const pnl = t.realizedPnlUsd;
        const r = t.initialRiskUsd > 0 ? pnl / t.initialRiskUsd : 0;
        sumR += r;
        runningPnl += pnl;
        runningR += r;

        if (runningPnl > peakPnl) peakPnl = runningPnl;
        if (peakPnl - runningPnl > maxDrawdownUsd) maxDrawdownUsd = peakPnl - runningPnl;

        if (runningR > peakR) peakR = runningR;
        if (peakR - runningR > maxDrawdownR) maxDrawdownR = peakR - runningR;

        if (pnl > 5) {
            winCount += 1;
            grossProfit += pnl;
        } else if (pnl < -5) {
            lossCount += 1;
            grossLoss += Math.abs(pnl);
        } else {
            breakevenCount += 1;
        }
    }

    const n = completed.length;
    const winRatePct = n > 0 ? Number(((winCount / n) * 100).toFixed(1)) : 0;
    const profitFactor =
        grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0;
    const totalNetPnlUsd = Number((grossProfit - grossLoss).toFixed(2));
    const expectancyUsd = n > 0 ? Number((totalNetPnlUsd / n).toFixed(2)) : 0;
    const averageR = n > 0 ? Number((sumR / n).toFixed(2)) : 0;

    const longs = completed.filter((t) => t.direction === 'LONG');
    const shorts = completed.filter((t) => t.direction === 'SHORT');
    const longWins = longs.filter((t) => t.realizedPnlUsd > 5).length;
    const shortWins = shorts.filter((t) => t.realizedPnlUsd > 5).length;

    const tp1Hits = completed.filter((t) => t.takeProfits[0]?.filled).length;
    const tp2Hits = completed.filter((t) => t.takeProfits[1]?.filled).length;

    return {
        totalTrades: trades.length,
        completedTrades: n,
        openTrades: open.length,
        winCount,
        lossCount,
        breakevenCount,
        winRatePct,
        profitFactor,
        totalNetPnlUsd,
        expectancyUsd,
        expectancyR: averageR,
        averageR,
        maxDrawdownUsd: Number(maxDrawdownUsd.toFixed(2)),
        maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
        longWinRatePct: longs.length > 0 ? Number(((longWins / longs.length) * 100).toFixed(1)) : 0,
        shortWinRatePct: shorts.length > 0 ? Number(((shortWins / shorts.length) * 100).toFixed(1)) : 0,
        tp1HitRatePct: n > 0 ? Number(((tp1Hits / n) * 100).toFixed(1)) : 0,
        tp2HitRatePct: n > 0 ? Number(((tp2Hits / n) * 100).toFixed(1)) : 0,
        smallSampleWarning: n < 20,
    };
}

export function exportTradesToCsv(trades: readonly ManagedTrade[]): string {
    const headers = [
        'TradeID',
        'Symbol',
        'Timeframe',
        'Direction',
        'Status',
        'EntryPrice',
        'InitialStop',
        'CurrentStop',
        'PositionSizeBTC',
        'InitialRiskUSD',
        'RealizedPnLUSD',
        'RMultiple',
        'Scenario',
        'Session',
        'Grade',
        'FollowedPlan',
        'EntryRationale',
    ];
    const rows = trades.map((t) => {
        const r = t.initialRiskUsd > 0 ? (t.realizedPnlUsd / t.initialRiskUsd).toFixed(2) : '0.00';
        const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
        return [
            t.id,
            t.symbol,
            t.timeframe,
            t.direction,
            t.status,
            t.entryPrice.toFixed(2),
            t.initialStopPrice.toFixed(2),
            t.currentStopPrice.toFixed(2),
            t.positionSizeBtc.toFixed(6),
            t.initialRiskUsd.toFixed(2),
            t.realizedPnlUsd.toFixed(2),
            r,
            escapeCsv(t.journal.setupScenario),
            t.journal.sessionTag,
            t.journal.qualityGrade,
            String(t.journal.followedPlan),
            escapeCsv(t.journal.entryRationale),
        ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}
