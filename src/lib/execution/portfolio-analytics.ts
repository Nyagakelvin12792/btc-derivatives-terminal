import type { PaperAccountSnapshotV1, PaperJournalEntryV1 } from './paper-ledger';

export interface AttributionSliceV1 {
    key: string;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    winRatePct: number;
    netPnlUsdt: number;
    expectancyR: number;
    profitFactor: number;
    avgHoldMinutes: number;
}

export interface PortfolioAnalyticsReportV1 {
    accountSummary: {
        startingCapitalUsdt: number;
        currentEquityUsdt: number;
        cashBalanceUsdt: number;
        reservedCapitalUsdt: number;
        availableCashUsdt: number;
        realizedPnlUsdt: number;
        unrealizedPnlUsdt: number;
        totalReturnPct: number;
        peakEquityUsdt: number;
        maxDrawdownUsdt: number;
        maxDrawdownPct: number;
        weeklyLossPct: number;
        weeklyLossLocked: boolean;
    };
    performanceSummary: {
        totalTrades: number;
        winCount: number;
        lossCount: number;
        breakevenCount: number;
        winRatePct: number;
        profitFactor: number;
        expectancyUsdt: number;
        expectancyR: number;
        medianR: number;
        avgMaeUsdt: number;
        avgMfeUsdt: number;
        smallSampleWarning: boolean;
    };
    equityCurve: Array<{
        timestampMs: number;
        tradeId: string;
        equityUsdt: number;
        drawdownPct: number;
        cumulativeR: number;
    }>;
    attribution: {
        byStrategy: AttributionSliceV1[];
        byExecutionSource: AttributionSliceV1[];
        bySession: AttributionSliceV1[];
        byRegime: AttributionSliceV1[];
    };
}

function buildSlices(
    entries: readonly PaperJournalEntryV1[],
    selector: (entry: PaperJournalEntryV1) => string,
): AttributionSliceV1[] {
    const groups = new Map<string, PaperJournalEntryV1[]>();
    for (const entry of entries) {
        const key = selector(entry) || 'UNKNOWN';
        const list = groups.get(key) ?? [];
        list.push(entry);
        groups.set(key, list);
    }

    const result: AttributionSliceV1[] = [];
    for (const [key, list] of groups.entries()) {
        let wins = 0;
        let losses = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        let sumR = 0;
        let sumHoldMs = 0;

        for (const item of list) {
            sumR += item.rMultipleNet;
            sumHoldMs += item.holdingDurationMs;
            if (item.netPnlUsdt > 0.5) {
                wins += 1;
                grossProfit += item.netPnlUsdt;
            } else if (item.netPnlUsdt < -0.5) {
                losses += 1;
                grossLoss += Math.abs(item.netPnlUsdt);
            }
        }

        const n = list.length;
        const netPnlUsdt = Number((grossProfit - grossLoss).toFixed(2));
        const profitFactor =
            grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0;

        result.push({
            key,
            tradeCount: n,
            winCount: wins,
            lossCount: losses,
            winRatePct: n > 0 ? Number(((wins / n) * 100).toFixed(1)) : 0,
            netPnlUsdt,
            expectancyR: n > 0 ? Number((sumR / n).toFixed(3)) : 0,
            profitFactor,
            avgHoldMinutes: n > 0 ? Number((sumHoldMs / n / 60_000).toFixed(1)) : 0,
        });
    }

    return result.sort((a, b) => b.tradeCount - a.tradeCount);
}

/**
 * Computes institutional portfolio analytics and multi-dimensional attribution (§8.1 / UX20.4-PORTFOLIO-03).
 */
export function buildPortfolioAnalyticsReport(
    snapshot: PaperAccountSnapshotV1,
): PortfolioAnalyticsReportV1 {
    const journal = snapshot.journal;
    let wins = 0;
    let losses = 0;
    let breakevens = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let sumR = 0;
    let sumMae = 0;
    let sumMfe = 0;

    let runningEquity = snapshot.startingCapitalUsdt;
    let peakEquity = snapshot.startingCapitalUsdt;
    let maxDdUsdt = 0;
    let maxDdPct = 0;
    let runningR = 0;

    const equityCurve: PortfolioAnalyticsReportV1['equityCurve'] = [];
    const rValues: number[] = [];

    for (const entry of journal) {
        runningEquity = Number((runningEquity + entry.netPnlUsdt).toFixed(4));
        runningR = Number((runningR + entry.rMultipleNet).toFixed(4));
        rValues.push(entry.rMultipleNet);
        sumR += entry.rMultipleNet;
        sumMae += entry.maeUsdt;
        sumMfe += entry.mfeUsdt;

        if (runningEquity > peakEquity) {
            peakEquity = runningEquity;
        }
        const ddUsdt = Math.max(0, peakEquity - runningEquity);
        const ddPct = peakEquity > 0 ? (ddUsdt / peakEquity) * 100 : 0;
        if (ddUsdt > maxDdUsdt) maxDdUsdt = ddUsdt;
        if (ddPct > maxDdPct) maxDdPct = ddPct;

        equityCurve.push({
            timestampMs: entry.closedAtMs,
            tradeId: entry.tradeId,
            equityUsdt: Number(runningEquity.toFixed(2)),
            drawdownPct: Number(ddPct.toFixed(3)),
            cumulativeR: Number(runningR.toFixed(3)),
        });

        if (entry.netPnlUsdt > 0.5) {
            wins += 1;
            grossProfit += entry.netPnlUsdt;
        } else if (entry.netPnlUsdt < -0.5) {
            losses += 1;
            grossLoss += Math.abs(entry.netPnlUsdt);
        } else {
            breakevens += 1;
        }
    }

    const n = journal.length;
    const sortedR = [...rValues].sort((a, b) => a - b);
    const medianR =
        n === 0
            ? 0
            : n % 2 === 1
              ? sortedR[Math.floor(n / 2)]
              : (sortedR[n / 2 - 1] + sortedR[n / 2]) / 2;

    const netPnl = grossProfit - grossLoss;
    const totalReturnPct =
        snapshot.startingCapitalUsdt > 0
            ? ((snapshot.equityUsdt - snapshot.startingCapitalUsdt) / snapshot.startingCapitalUsdt) * 100
            : 0;

    return {
        accountSummary: {
            startingCapitalUsdt: snapshot.startingCapitalUsdt,
            currentEquityUsdt: snapshot.equityUsdt,
            cashBalanceUsdt: snapshot.cashBalanceUsdt,
            reservedCapitalUsdt: snapshot.reservedCapitalUsdt,
            availableCashUsdt: snapshot.availableCashUsdt,
            realizedPnlUsdt: snapshot.realizedPnlUsdt,
            unrealizedPnlUsdt: snapshot.unrealizedPnlUsdt,
            totalReturnPct: Number(totalReturnPct.toFixed(2)),
            peakEquityUsdt: Number(Math.max(peakEquity, snapshot.peakEquityUsdt).toFixed(2)),
            maxDrawdownUsdt: Number(Math.max(maxDdUsdt, snapshot.drawdownUsdt).toFixed(2)),
            maxDrawdownPct: Number(Math.max(maxDdPct, snapshot.drawdownPct).toFixed(2)),
            weeklyLossPct: snapshot.weeklyLossPct,
            weeklyLossLocked: snapshot.weeklyLossLocked,
        },
        performanceSummary: {
            totalTrades: n,
            winCount: wins,
            lossCount: losses,
            breakevenCount: breakevens,
            winRatePct: n > 0 ? Number(((wins / n) * 100).toFixed(1)) : 0,
            profitFactor:
                grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0,
            expectancyUsdt: n > 0 ? Number((netPnl / n).toFixed(2)) : 0,
            expectancyR: n > 0 ? Number((sumR / n).toFixed(3)) : 0,
            medianR: Number(medianR.toFixed(3)),
            avgMaeUsdt: n > 0 ? Number((sumMae / n).toFixed(2)) : 0,
            avgMfeUsdt: n > 0 ? Number((sumMfe / n).toFixed(2)) : 0,
            smallSampleWarning: n < 40,
        },
        equityCurve,
        attribution: {
            byStrategy: buildSlices(journal, (e) => e.strategyId),
            byExecutionSource: buildSlices(journal, (e) => e.executionSource),
            bySession: buildSlices(journal, (e) => e.sessionTag),
            byRegime: buildSlices(journal, (e) => e.regimeTag),
        },
    };
}
