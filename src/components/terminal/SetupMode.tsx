'use client';

import React, { useState } from 'react';
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Target,
    Zap,
    Ban,
    Award,
    Bot,
    ChevronDown,
    ChevronRight,
    Shield,
} from 'lucide-react';
import { cn } from '../../lib/ui/cn';

export interface SetupGateItem {
    name: string;
    status: 'PASS' | 'FAIL' | 'MISSING';
    detail: string;
}

export interface SetupModeProps {
    state?: 'NO_SETUP' | 'WATCH_LONG' | 'WATCH_SHORT' | 'CONFIRMING_LONG' | 'CONFIRMING_SHORT' | 'A_GRADE_LONG' | 'A_GRADE_SHORT' | 'INVALIDATED' | 'AVOID' | 'INSUFFICIENT_DATA';
    grade?: 'A' | 'B' | 'WATCH' | 'NONE';
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
    zone?: { low: number; high: number; label: string };
    trigger?: { description: string; price: number | null };
    invalidation?: { description: string; price: number | null };
    evidence?: Array<{ id: string; label: string; strength: string; source: string }>;
    conflicts?: Array<{ id: string; label: string; impact: string }>;
    gates?: SetupGateItem[];
    className?: string;
}

const DEFAULT_GATES: SetupGateItem[] = [
    { name: 'Data integrity', status: 'PASS', detail: 'Sequence valid, feed fresh, 0 unresolved gaps' },
    { name: 'Location in zone', status: 'PASS', detail: 'Price inside Put Wall / Val confluence band' },
    { name: 'Microstructure aggression', status: 'PASS', detail: 'Stacked sell imbalance observed at support extreme' },
    { name: 'Response efficiency', status: 'PASS', detail: 'Probable absorption confirmed by passive bid replenishment' },
    { name: 'Confirmation event', status: 'MISSING', detail: 'Awaiting 5m candle close reclaim above $68,450' },
    { name: 'Defined invalidation', status: 'PASS', detail: 'Fixed invalidation at $68,220 below swing low' },
    { name: 'Risk compatibility', status: 'PASS', detail: 'Planned position risk within configured capital limits' },
];

export default function SetupMode({
    state = 'WATCH_LONG',
    grade = 'WATCH',
    direction = 'LONG',
    zone = { low: 68_350, high: 68_450, label: 'Put Wall & Value Area Low Confluence' },
    trigger = { description: 'Reclaim and 5m close above upper zone edge', price: 68_450 },
    invalidation = { description: 'Sustained candle break below structural low', price: 68_220 },
    evidence = [
        { id: 'ev-1', label: 'Aggressive selling absorbed by resting bid liquidity', strength: '92nd pct', source: 'SPOT L2 + TAPE' },
        { id: 'ev-2', label: 'Confluence with Put Wall and 1H Value Area Low', strength: 'High', source: 'DERIBIT + TRADE VP' },
        { id: 'ev-3', label: 'Bullish CVD divergence on local swing low', strength: 'Confirmed', source: 'TAPE CVD' },
    ],
    conflicts = [
        { id: 'cf-1', label: '4H trend structure remains corrective', impact: 'Prevents A-Grade promotion' },
    ],
    gates = DEFAULT_GATES,
    className,
}: SetupModeProps) {
    const [jevExpanded, setJevExpanded] = useState(false);

    return (
        <div
            className={cn('space-y-2.5 p-3 font-sans text-[#D8DEE8]', className)}
            data-testid="setup-mode-container"
        >
            {/* Container 1: Setup State */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3 shadow-sm"
                data-testid="setup-state-container"
            >
                <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <span>SETUP STATE MACHINE</span>
                    <span className="rounded border border-[#39A9F5]/30 bg-[#39A9F5]/10 px-1.5 py-0.5 text-[#39A9F5]">
                        DETERMINISTIC
                    </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                    <div className="font-mono text-xl font-black text-[#D8DEE8] tracking-tight">
                        {state}
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#E6B450]">
                        <Shield className="size-3.5" />
                        <span>GRADE: {grade}</span>
                    </div>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[9px] font-mono text-[#8390A0]">
                    <span>Direction: <strong className="text-[#2CC7A0]">{direction}</strong></span>
                    <span>·</span>
                    <span>Evaluation only · NO LIVE EXECUTION</span>
                </div>
            </div>

            {/* Container 2: Decision Zone */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="setup-zone-container"
            >
                <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <Target className="size-3 text-[#39A9F5]" />
                        <span>ACTIVE DECISION ZONE</span>
                    </div>
                    <span className="text-[8px] text-[#2CC7A0]">TESTING</span>
                </div>
                <div className="mt-2 rounded border border-[#18212C] bg-[#070A0F] p-2.5 font-mono">
                    <div className="text-[10px] font-bold text-[#D8DEE8]">{zone.label}</div>
                    <div className="mt-1 flex items-center justify-between text-xs font-bold text-[#39A9F5]">
                        <span>${zone.low.toLocaleString()}</span>
                        <span className="text-[9px] text-[#8390A0]">to</span>
                        <span>${zone.high.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Container 3: Trigger */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="setup-trigger-container"
            >
                <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <Zap className="size-3 text-[#2CC7A0]" />
                        <span>CONFIRMATION TRIGGER</span>
                    </div>
                    {trigger.price && (
                        <span className="font-mono text-xs font-bold text-[#2CC7A0]">
                            ${trigger.price.toLocaleString()}
                        </span>
                    )}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#8390A0]">
                    {trigger.description}
                </p>
            </div>

            {/* Container 4: Invalidation */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="setup-invalidation-container"
            >
                <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <Ban className="size-3 text-[#E06379]" />
                        <span>STRUCTURAL INVALIDATION</span>
                    </div>
                    {invalidation.price && (
                        <span className="font-mono text-xs font-bold text-[#E06379]">
                            ${invalidation.price.toLocaleString()}
                        </span>
                    )}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#8390A0]">
                    {invalidation.description}
                </p>
            </div>

            {/* Container 5: Deterministic Grade & Mandatory Gates */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="setup-grade-container"
            >
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <div className="flex items-center gap-1.5">
                        <Award className="size-3 text-[#E6B450]" />
                        <span>MANDATORY GATES ({gates.filter((g) => g.status === 'PASS').length}/{gates.length})</span>
                    </div>
                    <span className="font-mono text-[9px] font-bold text-[#E6B450]">GRADE: {grade}</span>
                </div>
                <div className="space-y-1">
                    {gates.map((gate) => (
                        <div
                            key={gate.name}
                            className="flex items-center justify-between rounded border border-[#18212C] bg-[#070A0F] px-2 py-1.5 text-[9px]"
                        >
                            <div className="flex items-center gap-1.5 min-w-0">
                                {gate.status === 'PASS' && <CheckCircle2 className="size-3 shrink-0 text-[#2CC7A0]" />}
                                {gate.status === 'FAIL' && <XCircle className="size-3 shrink-0 text-[#E06379]" />}
                                {gate.status === 'MISSING' && <AlertTriangle className="size-3 shrink-0 text-[#E6B450]" />}
                                <span className="truncate text-[#D8DEE8]">{gate.name}</span>
                            </div>
                            <span className={cn(
                                'font-mono text-[8px] font-bold',
                                gate.status === 'PASS' ? 'text-[#2CC7A0]' : gate.status === 'FAIL' ? 'text-[#E06379]' : 'text-[#E6B450]',
                            )}>
                                {gate.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Container 6: Evidence List */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="setup-evidence-container"
            >
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <span>ALIGNED EVIDENCE ({evidence.length})</span>
                    <span className="text-[8px] text-[#2CC7A0]">POSITIVE</span>
                </div>
                <div className="space-y-1.5">
                    {evidence.map((item) => (
                        <div key={item.id} className="rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]">
                            <div className="flex items-center justify-between font-mono text-[8px] text-[#8390A0]">
                                <span>{item.source}</span>
                                <span className="font-bold text-[#39A9F5]">{item.strength}</span>
                            </div>
                            <p className="mt-1 text-pretty text-[#D8DEE8]">{item.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Container 7: Conflicts List */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="setup-conflicts-container"
            >
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    <span>CONFLICTS &amp; RISKS ({conflicts.length})</span>
                    <span className="text-[8px] text-[#E06379]">UNRESOLVED</span>
                </div>
                <div className="space-y-1.5">
                    {conflicts.map((item) => (
                        <div key={item.id} className="rounded border border-[#18212C] bg-[#070A0F] p-2 text-[9px]">
                            <div className="font-mono text-[8px] text-[#E06379]">{item.impact}</div>
                            <p className="mt-1 text-pretty text-[#D8DEE8]">{item.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Container 8: Collapsed/Disabled Jev Shadow */}
            <div
                className="rounded border border-[#18212C] bg-[#0C1118] p-3"
                data-testid="setup-jev-shadow-container"
            >
                <button
                    type="button"
                    onClick={() => setJevExpanded((open) => !open)}
                    className="flex w-full items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]"
                >
                    <div className="flex items-center gap-1.5">
                        <Bot className="size-3 text-[#39A9F5]" />
                        <span>JEV SHADOW EXPLANATION</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="rounded border border-[#18212C] bg-[#070A0F] px-1.5 py-0.5 text-[8px] text-[#8390A0]">
                            SHADOW DISABLED
                        </span>
                        {jevExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    </div>
                </button>
                {jevExpanded && (
                    <div className="mt-2.5 space-y-1.5 border-t border-[#18212C] pt-2 text-[9px] text-[#8390A0]">
                        <p className="leading-relaxed">
                            Jev operates strictly in Shadow mode. It explains versioned deterministic feature packets and cannot alter gates, trigger prices, invalidation levels, or position risk.
                        </p>
                        <div className="rounded border border-[#18212C] bg-[#070A0F] p-2 font-mono text-[8px]">
                            Status: <span className="text-[#8390A0]">Adapter standby (UX16.7 milestone)</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
