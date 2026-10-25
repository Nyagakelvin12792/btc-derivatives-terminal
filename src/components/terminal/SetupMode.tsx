'use client';

import React, { useState } from 'react';
import { AlertTriangle, Award, Ban, Bot, CheckCircle2, ChevronDown, ChevronRight, Shield, Target, XCircle, Zap } from 'lucide-react';
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

    return (
        <div className={cn('space-y-2.5 p-3 font-sans text-[#D8DEE8]', className)} data-testid="setup-mode-container">
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-state-container">
                <div className="flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]"><span>SETUP STATE MACHINE</span><span>DETERMINISTIC</span></div>
                <div className="mt-2 flex items-baseline justify-between"><div className="font-mono text-xl font-black">{assessment.state}</div><div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#E6B450]"><Shield className="size-3.5" />GRADE: {assessment.grade}</div></div>
                <p className="mt-1 text-[9px] text-[#8390A0]">Evaluation only · NO LIVE EXECUTION · {assessment.deterministicVersion}</p>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-zone-container">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-[#8390A0]"><Target className="size-3 text-[#39A9F5]" />DECISION ZONE</div>
                {assessment.zone ? <div className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[10px]"><div>{assessment.zone.label}</div><div className="mt-1 text-[#39A9F5]">{price(assessment.zone.low)} — {price(assessment.zone.high)}</div></div> : <p className="mt-2 text-[9px] text-[#8390A0]">Not available until deterministic zone inputs are complete.</p>}
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-trigger-container">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-[#8390A0]"><Zap className="size-3 text-[#39A9F5]" />CONFIRMATION TRIGGER</div>
                <p className="mt-2 text-[9px] text-[#8390A0]">{assessment.trigger?.description ?? 'Not available.'} {assessment.trigger ? price(assessment.trigger.price) : ''}</p>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-invalidation-container">
                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-[#8390A0]"><Ban className="size-3 text-[#E06379]" />STRUCTURAL INVALIDATION</div>
                <p className="mt-2 text-[9px] text-[#8390A0]">{assessment.invalidation?.description ?? 'Not available.'} {assessment.invalidation ? price(assessment.invalidation.price) : ''}</p>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-grade-container">
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]"><span className="flex items-center gap-1.5"><Award className="size-3 text-[#E6B450]" />MANDATORY GATES</span><span>{gates.filter(([, state]) => state === 'PASS').length}/{gates.length} PASS</span></div>
                <div className="space-y-1">{gates.map(([name, state]) => <div key={name} className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] px-2 py-1.5 text-[9px]"><span className="flex items-center gap-1.5">{state === 'PASS' ? <CheckCircle2 className="size-3 text-[#2CC7A0]" /> : state === 'FAIL' ? <XCircle className="size-3 text-[#E06379]" /> : <AlertTriangle className="size-3 text-[#E6B450]" />}{name}</span><span className="font-mono font-bold">{state}</span></div>)}</div>
            </div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-evidence-container"><div className="font-mono text-[9px] font-bold text-[#8390A0]">ALIGNED EVIDENCE ({aligned.length})</div>{aligned.length === 0 ? <p className="mt-2 text-[9px] text-[#8390A0]">No accepted evidence.</p> : aligned.map((item) => <div key={item.id} className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]">{item.kind} · {item.confidence}</div>)}</div>
            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-conflicts-container"><div className="font-mono text-[9px] font-bold text-[#8390A0]">CONFLICTS ({conflicts.length})</div>{conflicts.length === 0 ? <p className="mt-2 text-[9px] text-[#8390A0]">No accepted conflict evidence.</p> : conflicts.map((item) => <div key={item.id} className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]">{item.kind} · {item.confidence}</div>)}</div>

            <div className="rounded border border-[#18212C] bg-[#0C1118] p-3" data-testid="setup-jev-shadow-container">
                <button type="button" onClick={() => setJevExpanded((open) => !open)} className="flex w-full items-center justify-between font-mono text-[9px] font-bold text-[#8390A0]"><span className="flex items-center gap-1.5"><Bot className="size-3 text-[#39A9F5]" />JEV SHADOW EXPLANATION</span><span className="flex items-center gap-1.5">SHADOW DISABLED {jevExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</span></button>
                {jevExpanded && <p className="mt-2 border-t border-[#18212C] pt-2 text-[9px] leading-relaxed text-[#8390A0]">Jev integration is scheduled for UX16.7. It cannot alter deterministic states, gates, levels, or risk.</p>}
            </div>
        </div>
    );
}
