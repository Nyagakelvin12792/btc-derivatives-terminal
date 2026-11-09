'use client';

import React, { useMemo, useState } from 'react';
import { FlaskConical, Play, ShieldCheck, Lock, Eye } from 'lucide-react';
import {
    runChronologicalStrategyBacktest,
    type BacktestRunReportV1,
} from '../../lib/strategy/backtest-runner';
import { LocalRetestInputSchema } from '../../lib/strategy/local-retest-input';
import { evaluatePointInTimeNyValueRetest } from '../../lib/strategy/ny-value-retest-point-in-time';
import { computeFnva32Hex } from '../../lib/replay/replay-clock';
import { buildCandleEvidenceMarkers } from '../../lib/strategy/candle-evidence';
import { evaluateJevGraduationGates } from '../../lib/orderflow/jev-graduation';
import type { NyValueRetestBar5m } from '../../lib/strategy/ny-value-retest';
import { cn } from '../../lib/ui/cn';

function buildDefaultLabDataset(spotPrice = 69_800): NyValueRetestBar5m[] {
    const baseTs = Date.UTC(2026, 10, 10, 15, 0, 0); // 10:00 EST NY Decision Window
    const bars: NyValueRetestBar5m[] = [];
    for (let i = 0; i < 48; i++) {
        const isSetupBar = i % 6 === 3;
        const base = spotPrice + Math.sin(i / 4) * 180;
        const open = isSetupBar ? base - 210 : base;
        const low = isSetupBar ? base - 340 : base - 65;
        const high = isSetupBar ? base - 110 : base + 420;
        const close = isSetupBar ? base - 140 : base + 360;
        bars.push({
            timestampMs: baseTs + i * 5 * 60_000,
            open: Number(open.toFixed(1)),
            high: Number(high.toFixed(1)),
            low: Number(low.toFixed(1)),
            close: Number(close.toFixed(1)),
            volume: 165,
            buyVolume: 102,
            sellVolume: 63,
            delta: 39,
            cvdClose: 800 + i * 18,
            lowerWickAbsorptionRatio: 0.46,
            bullishStackedImbalanceCount: 2,
        });
    }
    return bars;
}

export interface StrategyLabPanelProps {
    spotPrice?: number;
    className?: string;
}

export default function StrategyLabPanel({
    spotPrice = 69_800,
    className,
}: StrategyLabPanelProps) {
    const [startingCapitalUsdt, setStartingCapitalUsdt] = useState<number>(10_000);
    const [showRejectedCandidates, setShowRejectedCandidates] = useState<boolean>(false);
    const [autoPaperOptIn, setAutoPaperOptIn] = useState<boolean>(false);
    const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
    const [localDecision, setLocalDecision] = useState<{
        datasetId: string; checksum: string; result: ReturnType<typeof evaluatePointInTimeNyValueRetest>;
    } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadingDecision, setLoadingDecision] = useState(false);
    const [backtestReport, setBacktestReport] = useState<BacktestRunReportV1 | null>(null);

    const dataset = useMemo(() => buildDefaultLabDataset(spotPrice), [spotPrice]);

    async function inspectLocalDecision(file: File) {
        setLoadingDecision(true);
        setLocalDecision(null);
        setLoadError(null);
        try {
            if (file.size > 5 * 1024 * 1024) throw new Error('Dataset file exceeds 5 MiB.');
            const raw = await file.text();
            const input = LocalRetestInputSchema.parse(JSON.parse(raw));
            setLocalDecision({ datasetId: input.datasetId, checksum: computeFnva32Hex(raw), result: evaluatePointInTimeNyValueRetest(input) });
        } catch {
            setLoadError('The local file did not match the BTC/USDT point-in-time dataset contract or exceeded 5 MiB.');
        } finally {
            setLoadingDecision(false);
        }
    }

    function runDiagnostic() {
        setSelectedMarkerId(null);
        setBacktestReport(runChronologicalStrategyBacktest({
            datasetId: 'synthetic-ohlc-diagnostic-v1',
            bars: dataset,
            startingCapitalUsdt,
            inSampleFraction: 0.35,
        }));
    }

    const evidenceMarkers = useMemo(
        () =>
            buildCandleEvidenceMarkers({
                journal: backtestReport?.oosJournal ?? [],
                rejectedCandidates: backtestReport?.rejectedCandidates ?? [],
                includeRejectedCandidates: showRejectedCandidates,
            }),
        [backtestReport?.oosJournal, backtestReport?.rejectedCandidates, showRejectedCandidates],
    );

    const jevGraduation = useMemo(
        () =>
            evaluateJevGraduationGates({
                deterministicStrategyResearchPassed: false,
                jevIncrementalEdgePassed: false,
                operationalHealthOk: true,
                weeklyLossLocked: backtestReport?.ledgerSnapshot.weeklyLossLocked ?? false,
                consecutiveLossesInSession: 0,
                userExplicitAutoPaperOptIn: autoPaperOptIn,
            }),
        [autoPaperOptIn, backtestReport?.ledgerSnapshot.weeklyLossLocked],
    );

    const selectedMarker =
        evidenceMarkers.find((m) => m.id === selectedMarkerId) ?? evidenceMarkers[0] ?? null;

    return (
        <div
            className={cn('rounded border border-[#18212C] bg-[#0C1118] p-3 font-sans text-[#D8DEE8]', className)}
            data-testid="strategy-lab-panel"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#39A9F5]">
                    <FlaskConical className="size-3.5" />
                    <span>STRATEGY LAB · SYNTHETIC OHLC DIAGNOSTIC</span>
                </div>
                <span
                    className="rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#E6B450]"
                    data-testid="strategy-lab-isolation-badge"
                    title="Backtest runs in an isolated BACKTEST_ACCOUNT and never mutates live PAPER_ACCOUNT"
                >
                    BACKTEST_ACCOUNT
                </span>
            </div>

            <div className="mt-2 space-y-1 rounded border border-[#18212C] p-2 text-[9px]">
                <label className="block font-bold" htmlFor="strategy-lab-local-data">Inspect a local point-in-time dataset</label>
                <input id="strategy-lab-local-data" type="file" accept=".json,application/json" disabled={loadingDecision}
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) void inspectLocalDecision(file);
                        event.currentTarget.value = '';
                    }} />
                <p>This browser reads the file locally. Results are single-decision evidence and are ineligible for graduation.</p>
                {loadingDecision && <p role="status">Evaluating local dataset</p>}
                {loadError && <p role="alert">{loadError}</p>}
                {localDecision && (
                    <details open>
                        <summary>{localDecision.result.status} · {localDecision.result.reason}</summary>
                        <pre className="overflow-x-auto">{JSON.stringify(localDecision, null, 2)}</pre>
                    </details>
                )}
            </div>

            {/* Controls Row */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[8px]">
                <div className="flex items-center gap-1.5">
                    <span className="text-[#8390A0]">CAPITAL (USDT):</span>
                    <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={startingCapitalUsdt}
                        onChange={(e) => setStartingCapitalUsdt(Math.max(1000, Number(e.target.value) || 10_000))}
                        className="w-20 rounded border border-[#263548] bg-[#0C1118] px-1.5 py-0.5 text-[8.5px] font-bold text-[#D8DEE8]"
                        data-testid="strategy-lab-capital-input"
                    />
                </div>
                <button
                    type="button"
                    onClick={runDiagnostic}
                    data-testid="strategy-lab-run-btn"
                    className="flex items-center gap-1 rounded border border-[#39A9F5]/40 bg-[#39A9F5]/15 px-2 py-1 font-bold text-[#39A9F5] hover:bg-[#39A9F5]/25"
                >
                    <Play className="size-2.5" />
                    Run synthetic diagnostic
                </button>
            </div>

            {!backtestReport ? <p className="mt-2 text-xs text-[#8390A0]">Historical data unavailable. The synthetic diagnostic is ineligible for graduation.</p> : <>
            {/* Primary OOS Summary */}
            <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[8.5px]">
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                    <span className="text-[7.5px] text-[#8390A0]">OOS TRADES</span>
                    <div className="mt-0.5 font-bold text-[#D8DEE8]" data-testid="strategy-lab-oos-trades">
                        {backtestReport.primaryOosSummary.tradeCount} / 100 REQ
                    </div>
                </div>
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                    <span className="text-[7.5px] text-[#8390A0]">NET EXPECTANCY</span>
                    <div
                        className={cn(
                            'mt-0.5 font-bold',
                            backtestReport.primaryOosSummary.expectancyR >= 0
                                ? 'text-[#2CC7A0]'
                                : 'text-[#E06379]',
                        )}
                        data-testid="strategy-lab-expectancy"
                    >
                        {backtestReport.primaryOosSummary.expectancyR >= 0 ? '+' : ''}
                        {backtestReport.primaryOosSummary.expectancyR.toFixed(2)}R
                    </div>
                </div>
                <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                    <span className="text-[7.5px] text-[#8390A0]">PROFIT FACTOR</span>
                    <div className="mt-0.5 font-bold text-[#39A9F5]" data-testid="strategy-lab-pf">
                        {backtestReport.primaryOosSummary.profitFactor.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Ablation Table */}
            <div className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[8px]">
                <div className="mb-1 font-bold text-[#8390A0]">ABLATION &amp; 2× FRICTION COMPARISON (§6.5)</div>
                <div className="space-y-1">
                    {backtestReport.ablationSummaries.map((ab) => (
                        <div
                            key={ab.ablationId}
                            className="flex items-center justify-between border-b border-[#141B24] pb-0.5 last:border-none"
                            data-testid={`ablation-row-${ab.ablationId.toLowerCase()}`}
                        >
                            <span className="truncate text-[#D8DEE8]">{ab.ablationId}</span>
                            <span className="text-[#8390A0]">
                                {ab.tradeCount}T · {ab.winRatePct.toFixed(0)}%W ·{' '}
                                <strong className={ab.expectancyR >= 0 ? 'text-[#2CC7A0]' : 'text-[#E06379]'}>
                                    {ab.expectancyR >= 0 ? '+' : ''}
                                    {ab.expectancyR.toFixed(2)}R
                                </strong>
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Candlestick Trade Evidence Inspector (§8.2 / UX20.6-EVIDENCE-06) */}
            <div className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[8px]">
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-bold text-[#8390A0]">
                        <Eye className="size-2.5 text-[#39A9F5]" />
                        CANDLESTICK EVIDENCE MARKERS ({evidenceMarkers.length})
                    </span>
                    <label className="flex cursor-pointer items-center gap-1 text-[7.5px] text-[#8390A0]">
                        <input
                            type="checkbox"
                            checked={showRejectedCandidates}
                            onChange={(e) => setShowRejectedCandidates(e.target.checked)}
                            data-testid="strategy-lab-toggle-rejected"
                        />
                        Show Rejected Setups
                    </label>
                </div>

                {evidenceMarkers.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {evidenceMarkers.slice(0, 8).map((marker) => (
                            <button
                                key={marker.id}
                                type="button"
                                onClick={() => setSelectedMarkerId(marker.id)}
                                data-testid={`evidence-marker-pill-${marker.id}`}
                                className={cn(
                                    'rounded border px-1.5 py-0.5 text-[7.5px] font-bold',
                                    selectedMarker?.id === marker.id
                                        ? 'border-[#39A9F5] bg-[#39A9F5]/20 text-[#39A9F5]'
                                        : marker.kind === 'REJECTED_CANDIDATE'
                                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                          : 'border-[#18212C] bg-[#0C1118] text-[#D8DEE8]',
                                )}
                            >
                                {marker.label}
                            </button>
                        ))}
                    </div>
                )}

                {selectedMarker && (
                    <div
                        className="mt-1.5 rounded border border-[#18212C] bg-[#0C1118] p-1.5 text-[8px] text-[#D8DEE8]"
                        data-testid="strategy-lab-marker-inspector"
                    >
                        {selectedMarker.tooltip}
                    </div>
                )}
            </div>

            {/* Jev Graduation & Auto-Paper Eligibility Gate (§6.5 / UX20.6-JEV-04) */}
            <div
                className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[8px]"
                data-testid="strategy-lab-jev-graduation-card"
            >
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-bold text-[#D8DEE8]">
                        {jevGraduation.autoPaperEligible ? (
                            <ShieldCheck className="size-3 text-[#2CC7A0]" />
                        ) : (
                            <Lock className="size-3 text-[#E6B450]" />
                        )}
                        JEV AUTO-PAPER GATE
                    </span>
                    <span
                        className={cn(
                            'rounded px-1.5 py-0.5 text-[7.5px] font-bold',
                            jevGraduation.autoPaperEligible
                                ? 'bg-[#2CC7A0]/15 text-[#2CC7A0]'
                                : 'bg-[#E6B450]/15 text-[#E6B450]',
                        )}
                        data-testid="jev-auto-paper-gate-badge"
                    >
                        {jevGraduation.autoPaperEligible ? 'ELIGIBLE' : 'LOCKED OFF'}
                    </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[7.5px] text-[#8390A0]">
                    <span>Active Tier: {jevGraduation.activeTier}</span>
                    <label className="flex items-center gap-1">
                        <input
                            type="checkbox"
                            checked={autoPaperOptIn}
                            onChange={(e) => setAutoPaperOptIn(e.target.checked)}
                            disabled={!jevGraduation.researchGatePassed}
                            data-testid="jev-auto-paper-opt-in-checkbox"
                        />
                        Auto-Paper Opt-In
                    </label>
                </div>
                {jevGraduation.blockingReasons.length > 0 && (
                    <div className="mt-1 text-[7.5px] text-amber-300/90">
                        • {jevGraduation.blockingReasons[0]}
                    </div>
                )}
            </div>
            </>}
        </div>
    );
}
