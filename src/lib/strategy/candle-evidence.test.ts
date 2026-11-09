import { describe, expect, it } from 'vitest';
import { buildCandleEvidenceMarkers } from './candle-evidence';
import type { PaperJournalEntryV1 } from '../execution/paper-ledger';

describe('UX20.6-EVIDENCE-06 Candlestick Trade & Rejected-Candidate Evidence Annotations', () => {
    const sampleJournal: PaperJournalEntryV1[] = [
        {
            tradeId: 'trd-1',
            accountScope: 'BACKTEST_ACCOUNT',
            strategyId: 'NY_VALUE_RETEST_V1',
            executionSource: 'STRATEGY_LAB',
            sessionTag: 'NEW_YORK',
            regimeTag: 'BALANCED_ROTATION',
            side: 'LONG',
            openedAtMs: 1_700_000_000_000,
            closedAtMs: 1_700_000_600_000,
            entryPrice: 70_000,
            exitPrice: 71_200,
            stopPrice: 69_500,
            targetPrice: 71_200,
            quantityBtc: 0.0444,
            grossPnlUsdt: 53.28,
            feesPaidUsdt: 1.25,
            netPnlUsdt: 52.03,
            initialRiskUsdt: 25,
            rMultipleNet: 2.08,
            maeUsdt: -4.2,
            mfeUsdt: 55.0,
            holdingDurationMs: 600_000,
            exitReason: 'TAKE_PROFIT',
            notes: 'Target filled',
        },
    ];

    it('hides rejected candidates by default and includes them when toggled on', () => {
        const defaultMarkers = buildCandleEvidenceMarkers({
            journal: sampleJournal,
            rejectedCandidates: [
                {
                    timestampMs: 1_700_000_300_000,
                    price: 70_100,
                    firstFailedGate: 'GATE_3_FOOTPRINT_ABSORPTION',
                    reason: 'Missing lower wick absorption',
                },
            ],
            includeRejectedCandidates: false,
        });
        expect(defaultMarkers).toHaveLength(2); // Entry + Exit only

        const withRejected = buildCandleEvidenceMarkers({
            journal: sampleJournal,
            rejectedCandidates: [
                {
                    timestampMs: 1_700_000_300_000,
                    price: 70_100,
                    firstFailedGate: 'GATE_3_FOOTPRINT_ABSORPTION',
                    reason: 'Missing lower wick absorption',
                },
            ],
            includeRejectedCandidates: true,
        });
        expect(withRejected).toHaveLength(3);
        expect(withRejected.some((m) => m.kind === 'REJECTED_CANDIDATE')).toBe(true);
    });
});
