'use client';

import React from 'react';
import type { LiquidityLevel } from '../../lib/binance/analytics';
import type { BinanceMarketFeed } from '../../lib/binance/use-market-feed';
import { cn } from '../../lib/ui/cn';

export interface LiquidityPanelProps {
    marketFeed: BinanceMarketFeed;
    levels: LiquidityLevel[];
    dataMode?: 'LIVE' | 'DEMO' | 'DEGRADED';
}

export function formatCompactUsd(value: number): string {
    if (!Number.isFinite(value)) return '—';
    const absolute = Math.abs(value);
    const sign = value < 0 ? '−' : '';
    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(2)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
    return `${sign}${absolute.toFixed(0)}`;
}

export default function LiquidityPanel({ marketFeed, levels, dataMode = 'LIVE' }: LiquidityPanelProps) {
    const book = marketFeed.book;

    if (!book) {
        return (
            <div
                className="flex h-full min-h-0 flex-col items-center justify-center gap-1 px-3 py-2 text-center text-[10px] text-zinc-500"
                data-testid="liquidity-panel-empty"
            >
                <span className="font-semibold text-zinc-400">
                    {dataMode === 'DEMO'
                        ? 'Observed order-book liquidity is unavailable in demo mode'
                        : 'Waiting for validated Binance liquidity depth…'}
                </span>
                <span className="font-mono text-[9px] text-zinc-600">
                    Source: Binance Spot top-20 book · no synthetic depth is substituted
                </span>
            </div>
        );
    }

    const imbalancePct = (book.imbalance * 100).toFixed(1);
    const freshnessLabel = marketFeed.latencyMs !== null
        ? `${marketFeed.latencyMs} ms`
        : marketFeed.state === 'LIVE'
            ? 'realtime'
            : marketFeed.state.toLowerCase();

    return (
        <div
            className="flex h-full min-h-0 flex-col overflow-hidden text-[9px] md:grid md:grid-cols-[minmax(216px,0.78fr)_minmax(0,1.22fr)] md:divide-x md:divide-[#263346]"
            data-testid="liquidity-panel"
        >
            <div
                className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-[#1c2838] p-2 sm:grid-cols-4 md:grid-cols-2 md:content-start md:overflow-y-auto md:border-b-0"
                data-testid="liquidity-summary-cards"
            >
                <div className="min-w-0 rounded border border-[#263346] bg-[#090f18]/80 px-2 py-1.5">
                    <div className="truncate text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Spread</div>
                    <div className="mt-0.5 truncate font-mono text-xs font-semibold tabular-nums text-zinc-100">
                        {book.spread.toFixed(2)}
                    </div>
                    <div className="truncate font-mono text-[8px] tabular-nums text-zinc-500">
                        {book.spreadBps.toFixed(2)} bps
                    </div>
                </div>

                <div className="min-w-0 rounded border border-[#263346] bg-[#090f18]/80 px-2 py-1.5">
                    <div className="truncate text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Imbalance</div>
                    <div
                        className={cn(
                            'mt-0.5 truncate font-mono text-xs font-semibold tabular-nums',
                            book.imbalance >= 0 ? 'text-emerald-300' : 'text-rose-300',
                        )}
                    >
                        {book.imbalance >= 0 ? `+${imbalancePct}%` : `${imbalancePct}%`}
                    </div>
                    <div className="truncate text-[8px] text-zinc-500">
                        top 20 · {freshnessLabel}
                    </div>
                </div>

                <div className="min-w-0 rounded border border-[#263346] bg-[#090f18]/80 px-2 py-1.5">
                    <div className="truncate text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Bid depth</div>
                    <div className="mt-0.5 truncate font-mono text-xs font-semibold tabular-nums text-emerald-300">
                        ${formatCompactUsd(book.bidDepthUsd)}
                    </div>
                    <div className="truncate font-mono text-[8px] tabular-nums text-zinc-500">
                        {book.bids.length} lvls · {book.bestBid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="min-w-0 rounded border border-[#263346] bg-[#090f18]/80 px-2 py-1.5">
                    <div className="truncate text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Ask depth</div>
                    <div className="mt-0.5 truncate font-mono text-xs font-semibold tabular-nums text-rose-300">
                        ${formatCompactUsd(book.askDepthUsd)}
                    </div>
                    <div className="truncate font-mono text-[8px] tabular-nums text-zinc-500">
                        {book.asks.length} lvls · {book.bestAsk.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 py-1.5">
                <div className="mb-1 flex shrink-0 items-center justify-between gap-2 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                    <span className="truncate">Largest observed depth levels</span>
                    <span className="shrink-0 font-mono">Price · Notional</span>
                </div>

                <div
                    className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
                    data-testid="liquidity-depth-list"
                    role="list"
                    aria-label="Observed liquidity depth levels"
                >
                    {levels.map((level) => {
                        const isBid = level.side === 'BID';
                        const barWidthPct = Math.max(4, Math.min(100, level.share * 100));
                        return (
                            <div
                                key={`${level.side}-${level.price}`}
                                role="listitem"
                                data-testid="liquidity-level-row"
                                data-side={level.side}
                                className="grid grid-cols-[54px_minmax(0,1fr)_68px] items-center gap-2 py-0.5"
                            >
                                <span
                                    className={cn(
                                        'inline-flex h-4 items-center justify-center gap-0.5 rounded-sm px-1 font-mono text-[8px] font-bold tracking-tight',
                                        isBid
                                            ? 'border border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                                            : 'border border-dashed border-rose-400/45 bg-rose-400/10 text-rose-300',
                                    )}
                                >
                                    <span aria-hidden="true">{isBid ? '▲' : '▼'}</span>
                                    <span>{level.side}</span>
                                </span>

                                <div className="relative flex h-4 min-w-0 items-center overflow-hidden rounded-sm bg-[#111a25] px-1.5">
                                    <span
                                        className={cn(
                                            ' -inset-y-0 absolute inset-y-0',
                                            isBid ? 'left-0 bg-emerald-400/30' : 'right-0 bg-rose-400/30',
                                        )}
                                        style={{ width: `${barWidthPct}%` }}
                                    />
                                    <span className="relative truncate font-mono text-[8px] tabular-nums text-zinc-100">
                                        {level.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="relative ml-auto hidden pl-2 font-mono text-[8px] tabular-nums text-zinc-400 sm:inline">
                                        {level.quantity.toFixed(3)} BTC
                                    </span>
                                </div>

                                <span
                                    className="shrink-0 text-right font-mono text-[9px] font-semibold tabular-nums text-zinc-200"
                                    data-testid="liquidity-level-notional"
                                >
                                    ${formatCompactUsd(level.notionalUsd)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
