'use client';

import React from 'react';
import { X, Crosshair } from 'lucide-react';
import type { AggregatedFootprintBar } from '../../lib/chart-coordination/coordinator';

export interface FootprintCandleInspectorProps {
    bar: AggregatedFootprintBar | null;
    onClose: () => void;
}

export default function FootprintCandleInspector({ bar, onClose }: FootprintCandleInspectorProps) {
    if (!bar) return null;

    const maxBinVol = Math.max(0.0001, ...bar.bins.map((b) => b.totalVolume));
    const dateLabel = new Date(bar.time * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const isBull = bar.close >= bar.open;

    return (
        <div
            className="absolute right-16 top-10 z-30 flex w-[310px] max-h-[82%] flex-col rounded border border-[#18212C] bg-[#0C1118]/98 font-mono text-[10px] text-[#D8DEE8] shadow-2xl backdrop-blur-md"
            data-testid="footprint-candle-inspector"
        >
            <div className="flex items-center justify-between border-b border-[#18212C] px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                    <Crosshair className="size-3 text-[#39A9F5]" />
                    <span className="font-bold text-[#D8DEE8]">CANDLE ORDER-FLOW INSPECTOR</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded p-0.5 text-[#8390A0] hover:bg-[#18212C] hover:text-[#D8DEE8]"
                    data-testid="close-footprint-inspector"
                >
                    <X className="size-3" />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 border-b border-[#18212C] bg-[#070A0F]/60 px-2.5 py-1.5 text-[9px]">
                <div>
                    <span className="text-[#5C697A]">TIME: </span>
                    <span className="text-[#D8DEE8]">{dateLabel}</span>
                </div>
                <div className="text-right">
                    <span className="rounded border border-[#18212C] bg-[#101722] px-1 py-0.5 text-[8px] text-[#39A9F5]">
                        {bar.provenance}
                    </span>
                </div>
                <div>
                    <span className="text-[#5C697A]">O/C: </span>
                    <span className={isBull ? 'text-[#2CC7A0]' : 'text-[#F06152]'}>
                        {bar.open.toFixed(0)} → {bar.close.toFixed(0)}
                    </span>
                </div>
                <div className="text-right">
                    <span className="text-[#5C697A]">Δ / Δ%: </span>
                    <span className={bar.barDelta >= 0 ? 'font-bold text-[#2CC7A0]' : 'font-bold text-[#F06152]'}>
                        {bar.barDelta >= 0 ? '+' : ''}
                        {bar.barDelta.toFixed(1)} ({bar.deltaPercent >= 0 ? '+' : ''}
                        {bar.deltaPercent.toFixed(1)}%)
                    </span>
                </div>
                <div>
                    <span className="text-[#5C697A]">cPOC: </span>
                    <span className="font-bold text-[#F59E0B]">${bar.pocPrice.toLocaleString()}</span>
                </div>
                <div className="text-right">
                    <span className="text-[#5C697A]">cVA: </span>
                    <span className="text-[#38BDF8]">
                        ${bar.valPrice.toLocaleString()}–${bar.vahPrice.toLocaleString()}
                    </span>
                </div>
            </div>

            {(bar.absorptionCandidate || bar.exhaustionCandidate || bar.stackedImbalances.length > 0) && (
                <div className="flex flex-wrap gap-1 border-b border-[#18212C] px-2.5 py-1">
                    {bar.absorptionCandidate && (
                        <span className="rounded bg-[#F59E0B]/20 px-1.5 py-0.5 text-[8px] font-bold text-[#F59E0B]">
                            {bar.absorptionCandidate}
                        </span>
                    )}
                    {bar.exhaustionCandidate && (
                        <span className="rounded bg-[#A855F7]/20 px-1.5 py-0.5 text-[8px] font-bold text-[#C084FC]">
                            {bar.exhaustionCandidate}
                        </span>
                    )}
                    {bar.stackedImbalances.map((z, idx) => (
                        <span
                            key={idx}
                            className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${
                                z.side === 'BUY'
                                    ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                    : 'bg-[#F06152]/20 text-[#F06152]'
                            }`}
                        >
                            STACKED {z.side} ({z.levelCount}x @ ${z.lowPrice})
                        </span>
                    ))}
                </div>
            )}

            {/* Price-Level Bid x Ask Ladder */}
            <div className="grid grid-cols-4 border-b border-[#18212C] bg-[#101722] px-2.5 py-1 text-[8px] font-bold text-[#5C697A]">
                <span>PRICE (${bar.bucketStep})</span>
                <span className="text-right text-[#F06152]">BID (SELL)</span>
                <span className="text-right text-[#2CC7A0]">ASK (BUY)</span>
                <span className="text-right">LEVEL Δ</span>
            </div>

            <div className="max-h-[260px] overflow-y-auto divide-y divide-[#18212C]/50">
                {bar.bins.map((bin) => {
                    const volRatio = Math.min(1, bin.totalVolume / maxBinVol);
                    return (
                        <div
                            key={bin.price}
                            className={`relative grid grid-cols-4 items-center px-2.5 py-0.5 text-[9px] tabular-nums ${
                                bin.isPoc
                                    ? 'bg-[#F59E0B]/15 ring-1 ring-inset ring-[#F59E0B]/60'
                                    : bin.inValueArea
                                      ? 'bg-[#38BDF8]/5'
                                      : ''
                            }`}
                        >
                            <div
                                className="pointer-events-none absolute inset-y-0 left-0 bg-[#39A9F5]/10"
                                style={{ width: `${Math.round(volRatio * 100)}%` }}
                            />
                            <span className={`relative z-10 ${bin.isPoc ? 'font-bold text-[#F59E0B]' : 'text-[#8390A0]'}`}>
                                {bin.price.toLocaleString()}
                            </span>
                            <span
                                className={`relative z-10 text-right ${
                                    bin.bidImbalance ? 'font-extrabold text-[#F06152] underline' : 'text-[#D8DEE8]'
                                }`}
                            >
                                {bin.sellVolume.toFixed(1)}
                            </span>
                            <span
                                className={`relative z-10 text-right ${
                                    bin.askImbalance ? 'font-extrabold text-[#2CC7A0] underline' : 'text-[#D8DEE8]'
                                }`}
                            >
                                {bin.buyVolume.toFixed(1)}
                            </span>
                            <span
                                className={`relative z-10 text-right font-semibold ${
                                    bin.delta >= 0 ? 'text-[#2CC7A0]' : 'text-[#F06152]'
                                }`}
                            >
                                {bin.delta >= 0 ? '+' : ''}
                                {bin.delta.toFixed(1)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
