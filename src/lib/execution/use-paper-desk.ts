'use client';

import { useEffect, useState } from 'react';
import type { BinanceLiquidityHeatmapFeed } from '../binance/use-liquidity-heatmap';
import type { PaperAccountSnapshotV1 } from './paper-ledger';
import { paperQuoteFromFrame, projectPaperDesk, readPaperDesk, updatePaperDesk, type ManualPaperPlan } from './paper-desk';

export function usePaperDesk(feed: BinanceLiquidityHeatmapFeed, entriesEnabled: boolean) {
    const [snapshot, setSnapshot] = useState<PaperAccountSnapshotV1 | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const frame = feed.sequence.state === 'LIVE' ? feed.frames.at(-1) : undefined;

    useEffect(() => {
        function recover() {
            try { setSnapshot(projectPaperDesk(readPaperDesk()).ledger.getSnapshot()); }
            catch { setSnapshot(null); setMessage('Paper account recovery requires review.'); }
        }
        recover();
        window.addEventListener('storage', recover);
        return () => window.removeEventListener('storage', recover);
    }, []);

    const hasOpenPosition = Boolean(snapshot?.openPosition);
    useEffect(() => {
        if (!frame || !hasOpenPosition) return;
        const quote = paperQuoteFromFrame(frame);
        if (!quote) return;
        let current = true;
        updatePaperDesk(quote).then(
            (next) => { if (current) setSnapshot(next); },
            () => { if (current) setMessage('Protective order remains pending. Paper account or quote requires review.'); },
        );
        return () => { current = false; };
    }, [frame, hasOpenPosition]);

    return {
        snapshot, message,
        canSubmit: entriesEnabled && Boolean(frame && snapshot && !snapshot.openPosition && !snapshot.weeklyLossLocked),
        async submit(plan: ManualPaperPlan) {
            const quote = entriesEnabled && paperQuoteFromFrame(frame);
            if (!quote) { setMessage('A fresh sequence-verified BTC/USDT quote is required.'); return; }
            try {
                setSnapshot(await updatePaperDesk(quote, plan));
                setMessage('Paper entry recorded at the verified ask.');
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Paper submission failed.');
            }
        },
    };
}

export type PaperDeskController = ReturnType<typeof usePaperDesk>;
