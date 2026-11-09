import type { PaperJournalEntryV1 } from '../execution/paper-ledger';
import type { BacktestRejectedCandidateV1 } from './backtest-runner';

export type CandleEvidenceMarkerKind = 'ENTRY_LONG' | 'ENTRY_SHORT' | 'EXIT_PROFIT' | 'EXIT_STOP' | 'EXIT_TIME' | 'REJECTED_CANDIDATE';

export interface CandleTradeEvidenceMarkerV1 {
    id: string;
    tradeId?: string;
    timestampMs: number;
    timeSeconds: number;
    price: number;
    kind: CandleEvidenceMarkerKind;
    label: string;
    tooltip: string;
    rMultipleNet?: number;
    netPnlUsdt?: number;
    failedGate?: string;
    stopPrice?: number;
    targetPrice?: number;
    exitPrice?: number;
}

/**
 * Projects closed backtest/paper journal entries and optionally rejected candidate setups
 * into deterministic candlestick chart evidence markers (Master Plan §8.2 / UX20.6-EVIDENCE-06).
 * Default clutter rule: Rejected candidate markers are hidden unless `includeRejectedCandidates` is true.
 */
export function buildCandleEvidenceMarkers(params: {
    journal: readonly PaperJournalEntryV1[];
    rejectedCandidates?: readonly BacktestRejectedCandidateV1[];
    includeRejectedCandidates?: boolean;
}): CandleTradeEvidenceMarkerV1[] {
    const markers: CandleTradeEvidenceMarkerV1[] = [];

    for (const entry of params.journal) {
        const entryKind: CandleEvidenceMarkerKind =
            entry.side === 'LONG' ? 'ENTRY_LONG' : 'ENTRY_SHORT';
        markers.push({
            id: `ev-in-${entry.tradeId}`,
            tradeId: entry.tradeId,
            timestampMs: entry.openedAtMs,
            timeSeconds: Math.floor(entry.openedAtMs / 1000),
            price: entry.entryPrice,
            kind: entryKind,
            label: `${entry.side === 'LONG' ? '▲ L' : '▼ S'} @ $${Math.round(entry.entryPrice)}`,
            tooltip: `${entry.strategyId} (${entry.executionSource}) · Entry $${entry.entryPrice.toFixed(1)} · Stop $${entry.stopPrice.toFixed(1)} · Target $${entry.targetPrice.toFixed(1)}`,
            rMultipleNet: entry.rMultipleNet,
            netPnlUsdt: entry.netPnlUsdt,
            stopPrice: entry.stopPrice,
            targetPrice: entry.targetPrice,
            exitPrice: entry.exitPrice,
        });

        const exitKind: CandleEvidenceMarkerKind =
            entry.exitReason === 'TAKE_PROFIT'
                ? 'EXIT_PROFIT'
                : entry.exitReason === 'STOP_LOSS'
                  ? 'EXIT_STOP'
                  : 'EXIT_TIME';
        const rStr = `${entry.rMultipleNet >= 0 ? '+' : ''}${entry.rMultipleNet.toFixed(2)}R`;
        markers.push({
            id: `ev-out-${entry.tradeId}`,
            tradeId: entry.tradeId,
            timestampMs: entry.closedAtMs,
            timeSeconds: Math.floor(entry.closedAtMs / 1000),
            price: entry.exitPrice,
            kind: exitKind,
            label: `${rStr} (${entry.exitReason})`,
            tooltip: `Closed ${entry.tradeId} @ $${entry.exitPrice.toFixed(1)} · Net ${rStr} ($${entry.netPnlUsdt.toFixed(2)}) · Fees $${entry.feesPaidUsdt.toFixed(2)}`,
            rMultipleNet: entry.rMultipleNet,
            netPnlUsdt: entry.netPnlUsdt,
            stopPrice: entry.stopPrice,
            targetPrice: entry.targetPrice,
            exitPrice: entry.exitPrice,
        });
    }

    if (params.includeRejectedCandidates && params.rejectedCandidates) {
        for (const rej of params.rejectedCandidates) {
            markers.push({
                id: `ev-rej-${rej.timestampMs}`,
                timestampMs: rej.timestampMs,
                timeSeconds: Math.floor(rej.timestampMs / 1000),
                price: rej.price,
                kind: 'REJECTED_CANDIDATE',
                label: `✕ ${rej.firstFailedGate.replace('GATE_', 'G')}`,
                tooltip: `Rejected @ $${rej.price.toFixed(1)} · Failed ${rej.firstFailedGate}: ${rej.reason}`,
                failedGate: rej.firstFailedGate,
            });
        }
    }

    return markers.sort((a, b) => a.timestampMs - b.timestampMs);
}
