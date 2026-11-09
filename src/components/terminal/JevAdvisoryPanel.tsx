'use client';

import React, { useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Shield,
    Activity,
    AlertTriangle,
    CheckCircle2,
    Cpu,
    ExternalLink,
} from 'lucide-react';
import {
    evaluateJevDecision,
    loadPersistedJevMode,
    savePersistedJevMode,
    type DeterministicMarketState,
    type JevOperationalMode,
    type JevAdvisoryOutput,
} from '../../lib/orderflow/jev-framework';

interface JevAdvisoryPanelProps {
    marketState?: Partial<DeterministicMarketState>;
    className?: string;
}

export function JevAdvisoryPanel({ marketState, className = '' }: JevAdvisoryPanelProps) {
    const [mode, setMode] = useState<JevOperationalMode>(() => loadPersistedJevMode());
    const [isExpanded, setIsExpanded] = useState<boolean>(true);

    const decision: JevAdvisoryOutput = evaluateJevDecision(marketState, mode);

    const handleModeChange = (nextMode: JevOperationalMode) => {
        setMode(nextMode);
        savePersistedJevMode(nextMode);
    };

    return (
        <div
            className={`rounded-lg border border-[#233549] bg-[#09111c] text-zinc-300 shadow-md transition-all ${className}`}
            data-testid="jev-advisory-panel"
        >
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-[#1c2c3d] px-3 py-2">
                <div className="flex items-center gap-2">
                    <Cpu className="size-3.5 text-cyan-400" />
                    <span className="text-[10px] font-bold tracking-wide text-zinc-100">
                        JEV DECISION FRAMEWORK
                    </span>
                    <span className="rounded bg-cyan-950/60 px-1.5 py-0.5 text-[8.5px] font-semibold text-cyan-300 border border-cyan-800/40">
                        TypeSafe AI
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Operational Mode Selector */}
                    <div className="flex items-center rounded-md border border-[#233549] bg-[#060c14] p-0.5 text-[8.5px]">
                        {(['DISABLED', 'SHADOW', 'ADVISORY', 'EVALUATED'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => handleModeChange(m)}
                                className={`rounded px-1.5 py-0.5 font-mono font-medium transition-colors ${
                                    mode === m
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                                title={`Switch Jev operational mode to ${m}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsExpanded((prev) => !prev)}
                        className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                        title={isExpanded ? 'Collapse advisory panel' : 'Expand advisory panel'}
                    >
                        {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                </div>
            </div>

            {/* Quick Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0c1624] px-3 py-1.5 text-[9px]">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-400">Regime:</span>
                    <span className="font-mono font-semibold text-zinc-200">{decision.regime}</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-zinc-400">Stance:</span>
                    <span
                        className={`rounded px-1 py-0.5 font-bold ${
                            decision.stance === 'AGREE'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                : decision.stance === 'CAUTION'
                                ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                                : decision.stance === 'DISAGREE'
                                ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                                : 'bg-zinc-800 text-zinc-400'
                        }`}
                    >
                        {decision.stance}
                    </span>
                    {decision.setupGrade !== 'NONE' && (
                        <span className="rounded bg-sky-950/60 px-1 py-0.5 font-mono font-bold text-sky-300 border border-sky-800/40">
                            Grade {decision.setupGrade}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 font-mono text-[8.5px] text-zinc-400">
                    <span>Confidence: {(decision.confidenceScore * 100).toFixed(0)}%</span>
                </div>
            </div>

            {/* Collapsible Body */}
            {isExpanded && (
                <div className="space-y-2.5 p-3 text-[9.5px]">
                    {mode === 'DISABLED' ? (
                        <div className="rounded border border-[#1e2a38] bg-[#070d14] p-2 text-zinc-400">
                            Jev Decision Layer is disabled. Pure deterministic analytical indicators are displayed on chart.
                        </div>
                    ) : (
                        <>
                            {/* Summary & Thesis */}
                            <div className="rounded border border-[#233549] bg-[#0c1624]/90 p-2.5">
                                <div className="flex items-center justify-between font-semibold text-zinc-200 mb-1">
                                    <span>Setup: {decision.tradeScenario.setupName}</span>
                                    <span className="font-mono text-cyan-300">
                                        Target R: {decision.tradeScenario.recommendedRiskR}R
                                    </span>
                                </div>
                                <p className="text-zinc-300 leading-relaxed">{decision.advisorySummary}</p>
                            </div>

                            {/* Execution Parameters */}
                            <div className="grid grid-cols-3 gap-2 font-mono text-[9px]">
                                <div className="rounded border border-[#1c2c3d] bg-[#070e17] p-2">
                                    <div className="text-zinc-400 text-[8px] uppercase">Trigger / Spot</div>
                                    <div className="font-bold text-zinc-100">${decision.triggerPrice.toLocaleString()}</div>
                                </div>
                                <div className="rounded border border-[#1c2c3d] bg-[#070e17] p-2">
                                    <div className="text-rose-400/80 text-[8px] uppercase">Invalidation</div>
                                    <div className="font-bold text-rose-300">${decision.invalidationPrice.toLocaleString()}</div>
                                </div>
                                <div className="rounded border border-[#1c2c3d] bg-[#070e17] p-2">
                                    <div className="text-emerald-400/80 text-[8px] uppercase">Target (Wall)</div>
                                    <div className="font-bold text-emerald-300">${decision.targetPrice.toLocaleString()}</div>
                                </div>
                            </div>

                            {/* Confluences & Cautions */}
                            <div className="space-y-1">
                                <div className="text-[8.5px] font-bold uppercase tracking-wider text-zinc-400">
                                    Verified Market Confluences ({decision.confluenceCount})
                                </div>
                                {decision.confluences.map((c, i) => (
                                    <div key={i} className="flex items-start gap-1.5 text-zinc-300">
                                        <CheckCircle2 className="size-3 text-cyan-400 shrink-0 mt-0.5" />
                                        <span>{c}</span>
                                    </div>
                                ))}
                                {decision.tradeScenario.cautions.map((caution, i) => (
                                    <div key={i} className="flex items-start gap-1.5 text-amber-300">
                                        <AlertTriangle className="size-3 text-amber-400 shrink-0 mt-0.5" />
                                        <span>{caution}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Guardrail Disclaimer */}
                            <div className="border-t border-[#182635] pt-2 text-[8px] leading-3 text-zinc-400 flex items-center justify-between">
                                <span>Experimental advisory classification signal. Does not alter deterministic risk limits.</span>
                                <span className="font-mono text-zinc-400">TypeSafe AI v1</span>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
