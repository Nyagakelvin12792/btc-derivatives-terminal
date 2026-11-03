'use client';

import React, { useState } from 'react';
import {
    AlertTriangle,
    Award,
    Ban,
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Layers,
    Shield,
    SlidersHorizontal,
    Target,
    XCircle,
    Zap,
} from 'lucide-react';
import type { MarketEvidenceV1, SetupAssessmentV1 } from '../../lib/orderflow/contracts';
import { cn } from '../../lib/ui/cn';

export interface SetupModeProps {
    assessment: SetupAssessmentV1;
    evidence: MarketEvidenceV1[];
    className?: string;
}

function price(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `$${Math.round(value).toLocaleString()}`;
}

export default function SetupMode({ assessment, evidence, className }: SetupModeProps) {
    const [jevExpanded, setJevExpanded] = useState(false);
    const aligned = evidence.filter((item) => assessment.evidenceIds.includes(item.id));
    const conflicts = evidence.filter((item) => assessment.conflictIds.includes(item.id));
    const gates = Object.entries(assessment.mandatoryGates);
    const enhancers = Object.entries(assessment.enhancers);

    // Calculate planned risk metrics if zone and invalidation are defined
    const riskDistance =
        assessment.zone && assessment.invalidation?.price
            ? Math.abs(assessment.zone.low - assessment.invalidation.price)
            : null;
    const riskPct =
        riskDistance && assessment.zone
            ? ((riskDistance / assessment.zone.low) * 100).toFixed(2)
            : null;

    return (
        <div className={cn('space-y-2.5 p-3 font-sans text-[#D8DEE8]', className)} data-testid="setup-mode-container">
            {/* 1. Setup State Machine Header */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-state-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span>SETUP STATE MACHINE</span>
                    <span className="rounded bg-[#141B24] px-1.5 py-0.5 text-[#39A9F5]">DETERMINISTIC</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                    <div className="font-mono text-xl font-black text-[#D8DEE8]" data-testid="setup-state-value">
                        {assessment.state}
                    </div>
                    <div
                        className={cn(
                            'flex items-center gap-1.5 font-mono text-xs font-bold',
                            assessment.grade === 'A'
                                ? 'text-[#2CC7A0]'
                                : assessment.grade === 'B'
                                  ? 'text-[#39A9F5]'
                                  : assessment.grade === 'WATCH'
                                    ? 'text-[#E6B450]'
                                    : 'text-[#8390A0]'
                        )}
                        data-testid="setup-grade-value"
                    >
                        <Shield className="size-3.5" />
                        GRADE: {assessment.grade}
                    </div>
                </div>
                <p className="mt-1 text-[9px] text-[#8390A0]">
                    Evaluation only · NO LIVE EXECUTION · {assessment.deterministicVersion}
                </p>
            </div>

            {/* 2. Decision Zone (Where) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-zone-container">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-[#8390A0]">
                    <Target className="size-3 text-[#39A9F5]" />
                    DECISION ZONE (WHERE)
                </div>
                {assessment.zone ? (
                    <div className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[10px]">
                        <div className="font-semibold text-[#D8DEE8]">{assessment.zone.label}</div>
                        <div className="mt-1 text-[#39A9F5]">
                            {price(assessment.zone.low)} — {price(assessment.zone.high)}
                        </div>
                    </div>
                ) : (
                    <p className="mt-2 text-[9px] text-[#8390A0]">
                        Price is outside active structural zones. No decision zone active.
                    </p>
                )}
            </div>

            {/* 3. Confirmation Trigger (When/What) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-trigger-container">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-[#8390A0]">
                    <Zap className="size-3 text-[#39A9F5]" />
                    CONFIRMATION TRIGGER (CONFIRMATION)
                </div>
                {assessment.trigger ? (
                    <div className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[10px]">
                        <div className="text-[#D8DEE8]">{assessment.trigger.description}</div>
                        {assessment.trigger.price !== null && (
                            <div className="mt-1 font-bold text-[#2CC7A0]">
                                Trigger: {price(assessment.trigger.price)}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="mt-2 text-[9px] text-[#8390A0]">
                        Confirmation trigger unavailable until setup reaches confirming state.
                    </p>
                )}
            </div>

            {/* 4. Structural Invalidation (Risk Boundary) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-invalidation-container">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-[#8390A0]">
                    <Ban className="size-3 text-[#E06379]" />
                    STRUCTURAL INVALIDATION (INVALIDATION)
                </div>
                {assessment.invalidation ? (
                    <div className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[10px]">
                        <div className="text-[#D8DEE8]">{assessment.invalidation.description}</div>
                        {assessment.invalidation.price !== null && (
                            <div className="mt-1 font-bold text-[#E06379]">
                                Invalidation Price: {price(assessment.invalidation.price)}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="mt-2 text-[9px] text-[#8390A0]">
                        Structural invalidation level is not defined outside active decision zones.
                    </p>
                )}
            </div>

            {/* 5. Planned Risk Compatibility */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-risk-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5">
                        <SlidersHorizontal className="size-3 text-[#39A9F5]" />
                        PLANNED RISK BOUNDARIES
                    </span>
                    <span
                        className={cn(
                            'font-bold',
                            assessment.mandatoryGates.riskCompatibility === 'PASS'
                                ? 'text-[#2CC7A0]'
                                : assessment.mandatoryGates.riskCompatibility === 'FAIL'
                                  ? 'text-[#E06379]'
                                  : 'text-[#8390A0]'
                        )}
                    >
                        {assessment.mandatoryGates.riskCompatibility}
                    </span>
                </div>
                {riskDistance !== null && riskPct !== null ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] font-mono">
                        <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                            <div className="text-[#8390A0]">Structural Risk</div>
                            <div className="mt-0.5 font-bold text-[#D8DEE8]">${Math.round(riskDistance)}</div>
                        </div>
                        <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                            <div className="text-[#8390A0]">Distance to Stop</div>
                            <div className="mt-0.5 font-bold text-[#D8DEE8]">{riskPct}%</div>
                        </div>
                    </div>
                ) : (
                    <p className="mt-2 text-[9px] text-[#8390A0]">
                        Planned risk metrics require an active zone and structural invalidation.
                    </p>
                )}
            </div>

            {/* 6. Mandatory Gates (Checklist) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-grade-container">
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5">
                        <Award className="size-3 text-[#E6B450]" />
                        MANDATORY GATES
                    </span>
                    <span>
                        {gates.filter(([, state]) => state === 'PASS').length}/{gates.length} PASS
                    </span>
                </div>
                <div className="space-y-1">
                    {gates.map(([name, state]) => (
                        <div
                            key={name}
                            className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] px-2 py-1.5 text-[9px]"
                            data-testid={`gate-row-${name}`}
                        >
                            <span className="flex items-center gap-1.5">
                                {state === 'PASS' ? (
                                    <CheckCircle2 className="size-3 text-[#2CC7A0]" />
                                ) : state === 'FAIL' ? (
                                    <XCircle className="size-3 text-[#E06379]" />
                                ) : (
                                    <AlertTriangle className="size-3 text-[#E6B450]" />
                                )}
                                {name}
                            </span>
                            <span
                                className={cn(
                                    'font-mono font-bold',
                                    state === 'PASS'
                                        ? 'text-[#2CC7A0]'
                                        : state === 'FAIL'
                                          ? 'text-[#E06379]'
                                          : 'text-[#E6B450]'
                                )}
                            >
                                {state}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 7. Enhancers (Alignment Matrix) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-enhancers-container">
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]">
                    <span className="flex items-center gap-1.5">
                        <Layers className="size-3 text-[#39A9F5]" />
                        ENHANCERS MATRIX
                    </span>
                    <span>
                        {enhancers.filter(([, state]) => state === 'ALIGNED').length}/{enhancers.length} ALIGNED
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    {enhancers.map(([name, state]) => (
                        <div
                            key={name}
                            className="rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]"
                            data-testid={`enhancer-row-${name}`}
                        >
                            <div className="text-[#8390A0]">{name}</div>
                            <div
                                className={cn(
                                    'mt-1 font-mono font-bold text-[10px]',
                                    state === 'ALIGNED'
                                        ? 'text-[#2CC7A0]'
                                        : state === 'CONFLICTING'
                                          ? 'text-[#E06379]'
                                          : 'text-[#8390A0]'
                                )}
                            >
                                {state}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 8. Aligned Evidence */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-evidence-container">
                <div className="font-mono text-[9px] font-bold text-[#8390A0]">
                    ALIGNED EVIDENCE ({aligned.length})
                </div>
                {aligned.length === 0 ? (
                    <p className="mt-2 text-[9px] text-[#8390A0]">No accepted evidence in setup direction.</p>
                ) : (
                    <div className="mt-2 space-y-1">
                        {aligned.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]"
                            >
                                <span className="font-mono text-[#D8DEE8]">{item.kind}</span>
                                <span className="font-mono text-[#39A9F5]">{item.confidence}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 9. Conflicting Evidence (Never Hidden!) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-conflicts-container">
                <div className="font-mono text-[9px] font-bold text-[#8390A0]">
                    CONFLICTING EVIDENCE ({conflicts.length})
                </div>
                {conflicts.length === 0 ? (
                    <p className="mt-2 text-[9px] text-[#8390A0]">No contradictory order flow evidence.</p>
                ) : (
                    <div className="mt-2 space-y-1">
                        {conflicts.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]"
                            >
                                <span className="font-mono text-[#E06379]">{item.kind}</span>
                                <span className="font-mono text-[#8390A0]">{item.confidence}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 10. Jev Shadow Explanation (Optional / Collapsed) */}
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-jev-shadow-container">
                <button
                    type="button"
                    onClick={() => setJevExpanded((open) => !open)}
                    className="flex w-full items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]"
                >
                    <span className="flex items-center gap-1.5">
                        <Bot className="size-3 text-[#39A9F5]" />
                        JEV SHADOW EXPLANATION
                    </span>
                    <span className="flex items-center gap-1.5">
                        SHADOW DISABLED {jevExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    </span>
                </button>
                {jevExpanded && (
                    <p className="mt-2 border-t border-[#18212C] pt-2 text-[9px] leading-relaxed text-[#8390A0]">
                        Jev integration is scheduled for UX16.7. It cannot alter deterministic states, gates, levels, or risk.
                    </p>
                )}
            </div>
        </div>
    );
}
