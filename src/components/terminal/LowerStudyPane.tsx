'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { CvdAnchor, LiquidityLevel } from '../../lib/binance/analytics';
import type { BinanceMarketFeed } from '../../lib/binance/use-market-feed';
import { cn } from '../../lib/ui/cn';
import LiquidityPanel, { formatCompactUsd } from './LiquidityPanel';
import type { OrderFlowStudy } from './LowerStudyDock';

export type CvdAnchorOption = 'AUTO' | CvdAnchor;

export const STUDY_PANE_MIN_HEIGHT = 156;
export const STUDY_PANE_MAX_HEIGHT = 380;
export const STUDY_PANE_DEFAULT_HEIGHT = 192;
export const STUDY_PANE_STORAGE_KEY = 'btc-terminal-study-pane-v1';

export function clampStudyPaneHeight(height: number, workspaceHeight?: number): number {
    if (!Number.isFinite(height)) return STUDY_PANE_DEFAULT_HEIGHT;
    const dynamicMax = workspaceHeight && Number.isFinite(workspaceHeight) && workspaceHeight > 360
        ? Math.max(STUDY_PANE_MIN_HEIGHT, Math.min(STUDY_PANE_MAX_HEIGHT, Math.floor(workspaceHeight - 280)))
        : STUDY_PANE_MAX_HEIGHT;
    return Math.round(Math.max(STUDY_PANE_MIN_HEIGHT, Math.min(dynamicMax, height)));
}

export function readPersistedStudyPaneHeight(workspaceHeight?: number): number {
    if (typeof window === 'undefined') return clampStudyPaneHeight(STUDY_PANE_DEFAULT_HEIGHT, workspaceHeight);
    try {
        const rawPane = window.localStorage.getItem(STUDY_PANE_STORAGE_KEY);
        if (rawPane) {
            const parsed = JSON.parse(rawPane) as { height?: unknown };
            if (typeof parsed.height === 'number' && Number.isFinite(parsed.height)) {
                return clampStudyPaneHeight(parsed.height, workspaceHeight);
            }
        }
        const rawUi = window.localStorage.getItem('btc-terminal-ui-v1');
        if (rawUi) {
            const parsedUi = JSON.parse(rawUi) as { state?: { studyPaneHeight?: unknown } };
            const candidate = parsedUi?.state?.studyPaneHeight;
            if (typeof candidate === 'number' && Number.isFinite(candidate)) {
                return clampStudyPaneHeight(candidate, workspaceHeight);
            }
        }
    } catch {
        // Ignore storage read errors and fall back to default height.
    }
    return clampStudyPaneHeight(STUDY_PANE_DEFAULT_HEIGHT, workspaceHeight);
}

export function writePersistedStudyPaneHeight(height: number): void {
    if (typeof window === 'undefined') return;
    const clamped = clampStudyPaneHeight(height);
    try {
        window.localStorage.setItem(STUDY_PANE_STORAGE_KEY, JSON.stringify({ height: clamped, version: 1 }));
        const rawUi = window.localStorage.getItem('btc-terminal-ui-v1');
        if (rawUi) {
            const parsedUi = JSON.parse(rawUi) as { state?: Record<string, unknown>; version?: number };
            if (parsedUi && typeof parsedUi === 'object') {
                parsedUi.state = { ...(parsedUi.state ?? {}), studyPaneHeight: clamped };
                window.localStorage.setItem('btc-terminal-ui-v1', JSON.stringify(parsedUi));
            }
        }
    } catch {
        // Ignore storage quota or serialization errors.
    }
}

export function BookPanel({
    marketFeed,
    dataMode = 'LIVE',
}: {
    marketFeed: BinanceMarketFeed;
    dataMode?: 'LIVE' | 'DEMO' | 'DEGRADED';
}) {
    const book = marketFeed.book;
    if (!book) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center px-3 text-center text-[10px] text-zinc-500">
                {dataMode === 'DEMO'
                    ? 'Order-book depth is unavailable in demo mode · no synthetic book is substituted'
                    : 'Waiting for validated Binance order-book depth…'}
            </div>
        );
    }
    const rows = Math.min(10, book.bids.length, book.asks.length);
    return (
        <div
            className="grid h-full min-h-0 grid-cols-2 divide-x divide-[#263346] overflow-y-auto font-mono text-[9px] tabular-nums"
            data-testid="book-panel"
        >
            <div className="min-h-0 overflow-y-auto p-2">
                <div className="mb-1 grid grid-cols-2 text-zinc-500">
                    <span>▲ Bid price</span>
                    <span className="text-right">BTC / USD</span>
                </div>
                {book.bids.slice(0, rows).map((level, index) => (
                    <div key={`bid-${level.price}`} className="relative grid grid-cols-2 gap-1 py-0.5">
                        <span
                            className="absolute inset-y-0 right-0 bg-emerald-400/10"
                            style={{ width: `${Math.min(100, (level.notionalUsd / Math.max(book.bidDepthUsd, 1)) * 500)}%` }}
                        />
                        <span className="relative truncate text-emerald-300">
                            {level.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="relative truncate text-right text-zinc-300">
                            {level.quantity.toFixed(index < 3 ? 5 : 4)} / ${formatCompactUsd(level.notionalUsd)}
                        </span>
                    </div>
                ))}
            </div>
            <div className="min-h-0 overflow-y-auto p-2">
                <div className="mb-1 grid grid-cols-2 text-zinc-500">
                    <span>▼ Ask price</span>
                    <span className="text-right">BTC / USD</span>
                </div>
                {book.asks.slice(0, rows).map((level, index) => (
                    <div key={`ask-${level.price}`} className="relative grid grid-cols-2 gap-1 py-0.5">
                        <span
                            className="absolute inset-y-0 left-0 bg-rose-400/10"
                            style={{ width: `${Math.min(100, (level.notionalUsd / Math.max(book.askDepthUsd, 1)) * 500)}%` }}
                        />
                        <span className="relative truncate text-rose-300">
                            {level.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="relative truncate text-right text-zinc-300">
                            {level.quantity.toFixed(index < 3 ? 5 : 4)} / ${formatCompactUsd(level.notionalUsd)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export interface LowerStudyPaneProps {
    orderFlowPaneRef: React.RefObject<HTMLDivElement | null>;
    cvdHostRef: React.RefObject<HTMLDivElement | null>;
    deltaHostRef: React.RefObject<HTMLDivElement | null>;
    activeStudy: OrderFlowStudy;
    dataMode: 'LIVE' | 'DEMO' | 'DEGRADED';
    marketFeed: BinanceMarketFeed;
    liquidityLevels: LiquidityLevel[];
    lastCvd: number;
    lastDelta: number;
    cvdAnchor: CvdAnchorOption;
    resolvedCvdAnchor: CvdAnchor;
    cvdResetMarkers: Array<{ time: number; x: number }>;
    paneHeight: number;
    maxPaneHeight: number;
    onCvdAnchorChange: (anchor: CvdAnchorOption) => void;
    onResizeHeight: (nextHeight: number) => void;
    onResetChartAndObjects: () => void;
}

export default function LowerStudyPane({
    orderFlowPaneRef,
    cvdHostRef,
    deltaHostRef,
    activeStudy,
    dataMode,
    marketFeed,
    liquidityLevels,
    lastCvd,
    lastDelta,
    cvdAnchor,
    resolvedCvdAnchor,
    cvdResetMarkers,
    paneHeight,
    maxPaneHeight,
    onCvdAnchorChange,
    onResizeHeight,
    onResetChartAndObjects,
}: LowerStudyPaneProps) {
    const clampedHeight = clampStudyPaneHeight(paneHeight);

    function beginResizeDrag(event: React.PointerEvent<HTMLDivElement>) {
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = clampedHeight;

        const handleMove = (moveEvent: PointerEvent) => {
            const deltaY = startY - moveEvent.clientY;
            onResizeHeight(startHeight + deltaY);
        };
        const handleUp = () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp, { once: true });
    }

    function handleResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            onResizeHeight(clampedHeight + 16);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            onResizeHeight(clampedHeight - 16);
        }
    }

    const studyTitle = activeStudy === 'CVD'
        ? 'Cumulative Volume Delta'
        : activeStudy === 'DELTA'
            ? 'Aggressor Volume Delta'
            : activeStudy === 'BOOK'
                ? 'BTCUSDT Order Book'
                : 'Observed Liquidity';

    const sourceDescription = dataMode === 'LIVE'
        ? activeStudy === 'BOOK' || activeStudy === 'LIQUIDITY'
            ? 'Binance Spot L2 · top 20 depth'
            : 'Binance aggressor volume · bar precision'
        : 'demo fixture';

    return (
        <div
            id="order-flow-study-pane"
            ref={orderFlowPaneRef}
            style={{ height: clampedHeight }}
            className="relative flex shrink-0 flex-col overflow-hidden border-t border-[#263346] bg-[#070b11]"
            data-testid="order-flow-pane"
            data-study={activeStudy}
            data-pane-height={clampedHeight}
            data-crosshair-sync="native"
        >
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize lower study pane"
                aria-valuemin={STUDY_PANE_MIN_HEIGHT}
                aria-valuemax={maxPaneHeight}
                aria-valuenow={clampedHeight}
                tabIndex={0}
                data-testid="study-pane-resize-handle"
                onPointerDown={beginResizeDrag}
                onKeyDown={handleResizeKeyDown}
                className="group flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center bg-[#0b121b] outline-none hover:bg-cyan-400/30 focus-visible:bg-cyan-400/50"
            >
                <span className="h-0.5 w-8 rounded-full bg-[#2a3b52] group-hover:bg-cyan-300" />
            </div>

            <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-[#182231] bg-[#090f18] px-2.5 text-[9px]">
                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <span className="truncate font-bold text-zinc-100">{studyTitle}</span>
                    {activeStudy === 'CVD' && (
                        <span
                            className={cn(
                                'shrink-0 font-mono text-xs font-semibold tabular-nums',
                                lastCvd >= 0 ? 'text-emerald-300' : 'text-rose-300',
                            )}
                        >
                            {formatCompactUsd(lastCvd)}
                        </span>
                    )}
                    {activeStudy === 'DELTA' && (
                        <span
                            className={cn(
                                'shrink-0 font-mono text-xs font-semibold tabular-nums',
                                lastDelta >= 0 ? 'text-emerald-300' : 'text-rose-300',
                            )}
                        >
                            {formatCompactUsd(lastDelta)}
                        </span>
                    )}
                    {activeStudy === 'CVD' && (
                        <label className="hidden shrink-0 items-center gap-1 rounded border border-[#223042] bg-[#070c13] px-1.5 py-0.5 text-zinc-500 sm:flex">
                            <span>Anchor</span>
                            <select
                                aria-label="CVD anchor period"
                                value={cvdAnchor}
                                onChange={(event) => onCvdAnchorChange(event.target.value as CvdAnchorOption)}
                                className="bg-transparent font-semibold text-zinc-300 outline-none"
                            >
                                <option value="AUTO">Auto ({resolvedCvdAnchor.replace('UTC_', '')})</option>
                                <option value="UTC_DAY">UTC day</option>
                                <option value="UTC_WEEK">UTC week</option>
                                <option value="UTC_MONTH">UTC month</option>
                                <option value="VISIBLE">Loaded history</option>
                            </select>
                        </label>
                    )}
                    <span className="hidden truncate text-zinc-500 lg:inline">
                        Source: {sourceDescription}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    <span
                        className={cn(
                            'rounded border px-1.5 py-0.5 font-semibold',
                            dataMode === 'LIVE' && marketFeed.state === 'LIVE'
                                ? 'border-emerald-400/35 text-emerald-300'
                                : 'border-sky-400/35 text-sky-300',
                        )}
                    >
                        {dataMode === 'LIVE' ? marketFeed.state : 'SHADOW DATA'}
                    </span>
                    <span className="rounded border border-emerald-400/35 px-1.5 py-0.5 text-emerald-300">
                        {dataMode === 'LIVE'
                            ? `${marketFeed.historyBarCount.toLocaleString()} / ${marketFeed.historyTarget.toLocaleString()} bars`
                            : 'Coverage 96%'}
                    </span>
                    <button
                        type="button"
                        aria-label="Reset chart view and objects"
                        onClick={onResetChartAndObjects}
                        className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                    >
                        <RotateCcw className="size-3.5" />
                    </button>
                </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                {activeStudy === 'CVD' && (
                    <>
                        <div
                            ref={cvdHostRef}
                            className="size-full"
                            role="img"
                            aria-label={`${dataMode === 'LIVE' ? 'Live' : 'Demo'} cumulative volume delta candles`}
                        />
                        {cvdResetMarkers.map((marker) => (
                            <div
                                key={marker.time}
                                className="pointer-events-none absolute inset-y-0 z-20 border-l border-dashed border-zinc-400/55"
                                style={{ left: marker.x }}
                            >
                                <span className="absolute left-1 top-2 whitespace-nowrap text-[8px] text-zinc-500">Reset</span>
                            </div>
                        ))}
                    </>
                )}
                {activeStudy === 'DELTA' && (
                    <div
                        ref={deltaHostRef}
                        className="size-full"
                        role="img"
                        aria-label={`${dataMode === 'LIVE' ? 'Live' : 'Demo'} aggressor volume delta histogram`}
                    />
                )}
                {activeStudy === 'BOOK' && <BookPanel marketFeed={marketFeed} dataMode={dataMode} />}
                {activeStudy === 'LIQUIDITY' && (
                    <LiquidityPanel marketFeed={marketFeed} levels={liquidityLevels} dataMode={dataMode} />
                )}
            </div>
        </div>
    );
}
