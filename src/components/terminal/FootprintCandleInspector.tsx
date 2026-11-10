'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import {
    DEFAULT_FOOTPRINT_STAT_ROWS, FOOTPRINT_STAT_LABELS, getFootprintStat,
    type FootprintRenderBar,
} from './footprint-workspace-renderer';

/** Keep measured precision while dropping arithmetic tails introduced by binary floating point. */
function formatObservedNumber(value: number): string {
    return Number(value.toPrecision(15)).toString();
}

export default function FootprintCandleInspector({ bar, recordedSource, onClose }: {
    bar: FootprintRenderBar | null;
    recordedSource?: string;
    onClose: () => void;
}) {
    const [copyStatus, setCopyStatus] = useState('');
    if (!bar) return null;

    const footprint = bar.footprint;
    const rows: Array<[string, string]> = [
        ['Open (USDT)', String(bar.open)], ['High (USDT)', String(bar.high)],
        ['Low (USDT)', String(bar.low)], ['Close (USDT)', String(bar.close)],
        ...(footprint ? DEFAULT_FOOTPRINT_STAT_ROWS.map((row): [string, string] => {
            const value = getFootprintStat(footprint, row);
            return [FOOTPRINT_STAT_LABELS[row], value === null ? 'Unavailable' : formatObservedNumber(value)];
        }) : []),
    ];
    if (footprint) rows.push(['Aggregate trade messages', String(footprint.aggregateTradeCount)]);
    const sortedCells = [...(footprint?.cells ?? [])].sort((a, b) => b.priceLow - a.priceLow);
    const largest = sortedCells.reduce<(typeof sortedCells)[number] | null>((top, cell) =>
        !top || cell.buyVolumeBtc + cell.sellVolumeBtc > top.buyVolumeBtc + top.sellVolumeBtc ? cell : top, null);
    const date = new Date(bar.time * 1000).toISOString();
    const exportRows = [
        ['Candle open (UTC)', date],
        ...rows,
        ...sortedCells.map((cell) => [`${cell.priceLow}–${cell.priceHigh} USDT`, formatObservedNumber(cell.sellVolumeBtc), formatObservedNumber(cell.buyVolumeBtc)]),
    ];

    return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55" />
            <Dialog.Content data-testid="footprint-candle-inspector" className="fixed right-2 top-12 z-[61] flex max-h-[85dvh] w-[min(95vw,520px)] flex-col gap-3 overflow-auto rounded-lg border border-slate-700 bg-[#101822] p-4 text-sm text-slate-200">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <Dialog.Title className="font-semibold">Footprint Candle Inspector</Dialog.Title>
                        <Dialog.Description className="mt-1 text-xs text-slate-400">{date}</Dialog.Description>
                    </div>
                    <Dialog.Close className="rounded border border-slate-700 px-2 py-1 text-xs">Close</Dialog.Close>
                </div>
                <p data-testid="footprint-inspector-source" className="rounded border border-slate-700 p-2 text-xs text-slate-300">
                    {footprint ? `${recordedSource ? `Recorded tape · ${recordedSource}` : 'Binance BTCUSDT Spot aggTrade'} · ${footprint.developing ? 'Developing · ' : ''}${footprint.coverageStatus}. Values describe captured executions.`
                        : 'OHLC only. Bid × Ask, POC, Delta and trade counts are unavailable.'}
                    {footprint?.coverageStart != null && footprint.coverageEnd != null && <span className="mt-1 block">
                        Observed {new Date(footprint.coverageStart).toISOString()} to {new Date(footprint.coverageEnd).toISOString()}
                    </span>}
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                    {rows.map(([name, value]) => <div key={name} className="flex justify-between gap-2 border-b border-slate-800 py-1">
                        <dt className="text-slate-400">{name}</dt><dd>{value}</dd>
                    </div>)}
                </dl>
                {footprint && <>
                    {largest && <p className="text-xs text-slate-300">Largest cluster {largest.priceLow}–{largest.priceHigh} USDT · {formatObservedNumber(largest.buyVolumeBtc + largest.sellVolumeBtc)} BTC</p>}
                    <p className="text-xs text-slate-300">Stacked imbalances {footprint.stackedImbalances.length}</p>
                    <details>
                        <summary className="cursor-pointer text-xs">Observed price levels ({sortedCells.length})</summary>
                        <div className="mt-2 max-h-56 overflow-auto">
                            <table className="w-full text-right text-xs tabular-nums">
                                <thead><tr><th>Price bin</th><th>Bid (BTC)</th><th>Ask (BTC)</th></tr></thead>
                                <tbody>{sortedCells.map((cell) => <tr key={cell.priceLow} className="border-b border-slate-800">
                                    <td>{cell.priceLow}–{cell.priceHigh}</td><td>{formatObservedNumber(cell.sellVolumeBtc)}</td><td>{formatObservedNumber(cell.buyVolumeBtc)}</td>
                                </tr>)}</tbody>
                            </table>
                        </div>
                    </details>
                </>}
                <div className="flex items-center gap-2">
                    <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(exportRows.map((row) => row.join('\t')).join('\n'));
                            setCopyStatus('Copied');
                        } catch {
                            setCopyStatus('Clipboard unavailable');
                        }
                    }}>Copy values</button>
                    <span role="status" className="text-xs text-slate-400">{copyStatus}</span>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>;
}
