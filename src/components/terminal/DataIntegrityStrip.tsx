'use client';

import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Database, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, Radio } from 'lucide-react';
import { cn } from '../../lib/ui/cn';
import {
    type DataIntegrityDomain,
    type DataIntegrityStatus,
    getDataIntegrityBadgeClasses,
    getDataIntegrityDotClasses,
} from './terminal-theme';

export interface DataIntegrityStripProps {
    domains?: DataIntegrityDomain[];
    className?: string;
}

export const DEFAULT_INTEGRITY_DOMAINS: DataIntegrityDomain[] = [
    {
        key: 'candles',
        label: 'CANDLES',
        status: 'ready',
        venue: 'BINANCE_SPOT',
        precision: 'Kline 1m/5m/1h/4h',
        freshnessMs: 24,
        gapCount: 0,
        details: 'Exchange kline feed. Up to 10,000 bars retained per supported interval.',
    },
    {
        key: 'options',
        label: 'OPTIONS',
        status: 'ready',
        venue: 'DERIBIT_OPTIONS',
        precision: 'Full chain Greeks & GEX',
        freshnessMs: 450,
        gapCount: 0,
        details: 'Deribit public options chain. Key GEX, Call/Put walls, Gamma Flip, and ATM IV.',
    },
    {
        key: 'depth',
        label: 'L2 DEPTH',
        status: 'ready',
        venue: 'BINANCE_SPOT',
        precision: 'MBP L2 Diff + Snapshot',
        freshnessMs: 38,
        gapCount: 0,
        details: 'Sequence-validated diff-depth reconstruction. Session-local depth frames in Web Worker.',
    },
    {
        key: 'tape',
        label: 'TAPE CVD',
        status: 'partial',
        venue: 'BINANCE_SPOT',
        precision: 'Trade-based aggregates',
        freshnessMs: 50,
        gapCount: 0,
        details: 'Trade-based CVD accumulated within active capture session. Session boundaries preserved.',
    },
    {
        key: 'intelligence',
        label: 'JEV',
        status: 'shadow',
        venue: 'LOCAL_SHADOW',
        precision: 'Deterministic packet only',
        freshnessMs: null,
        gapCount: 0,
        details: 'Jev Shadow mode. AI explains versioned deterministic packets; cannot alter states or trade gates.',
    },
];

function statusIcon(status: DataIntegrityStatus) {
    switch (status) {
        case 'ready':
            return <CheckCircle2 className="size-3 text-[#2CC7A0]" />;
        case 'partial':
        case 'stale':
            return <AlertTriangle className="size-3 text-[#E6B450]" />;
        case 'error':
            return <ShieldAlert className="size-3 text-[#E06379]" />;
        case 'loading':
            return <RefreshCw className="size-3 animate-spin text-[#8390A0]" />;
        case 'replay':
            return <Radio className="size-3 text-[#39A9F5]" />;
        case 'shadow':
            return <Database className="size-3 text-[#39A9F5]" />;
        default:
            return <Database className="size-3 text-[#5C697A]" />;
    }
}

export default function DataIntegrityStrip({
    domains = DEFAULT_INTEGRITY_DOMAINS,
    className,
}: DataIntegrityStripProps) {
    return (
        <div
            className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 overflow-x-auto border-t border-[#18212C] bg-[#070A0F] px-2.5 text-[9px] font-mono text-[#8390A0]',
                className,
            )}
            role="region"
            aria-label="Data integrity and provenance strip"
            data-testid="data-integrity-strip"
        >
            <div className="flex shrink-0 items-center gap-1.5 pr-2 font-sans font-bold text-[#D8DEE8]">
                <Database className="size-3 text-[#39A9F5]" />
                <span className="hidden sm:inline">INTEGRITY</span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
                {domains.map((domain) => {
                    const badgeClasses = getDataIntegrityBadgeClasses(domain.status);
                    const dotClass = getDataIntegrityDotClasses(domain.status);
                    const freshnessLabel = domain.freshnessMs !== null && domain.freshnessMs !== undefined
                        ? `${domain.freshnessMs}ms`
                        : domain.status === 'shadow'
                            ? 'SHADOW'
                            : '—';

                    return (
                        <Popover.Root key={domain.key}>
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    data-testid={`data-integrity-${domain.key}`}
                                    data-status={domain.status}
                                    className={cn(
                                        'flex h-5 shrink-0 items-center gap-1.5 rounded border px-2 text-[9px] font-semibold transition-colors duration-150 hover:border-[#263445]',
                                        badgeClasses,
                                    )}
                                    title={`${domain.label}: ${domain.status.toUpperCase()} (${domain.venue})`}
                                >
                                    <span className={cn('size-1.5 rounded-full', dotClass)} />
                                    <span className="font-sans text-[#D8DEE8]">{domain.label}</span>
                                    <span className="uppercase">{domain.status}</span>
                                    <span className="opacity-50">·</span>
                                    <span className="text-[#8390A0]">{freshnessLabel}</span>
                                </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Content
                                    side="top"
                                    sideOffset={6}
                                    className="z-50 w-72 rounded border border-[#18212C] bg-[#0C1118] p-3 text-[10px] text-[#D8DEE8] shadow-2xl focus:outline-none"
                                >
                                    <div className="flex items-center justify-between border-b border-[#18212C] pb-2 font-mono">
                                        <div className="flex items-center gap-1.5 font-bold">
                                            {statusIcon(domain.status)}
                                            <span>{domain.label}</span>
                                        </div>
                                        <span className={cn('rounded px-1.5 py-0.5 text-[8px] font-bold uppercase', badgeClasses)}>
                                            {domain.status}
                                        </span>
                                    </div>
                                    <div className="mt-2 space-y-1.5 font-mono text-[9px]">
                                        <div className="flex justify-between">
                                            <span className="text-[#8390A0]">Venue:</span>
                                            <span className="text-[#D8DEE8]">{domain.venue}</span>
                                        </div>
                                        {domain.precision && (
                                            <div className="flex justify-between">
                                                <span className="text-[#8390A0]">Precision:</span>
                                                <span className="text-[#D8DEE8]">{domain.precision}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-[#8390A0]">Freshness:</span>
                                            <span className="text-[#D8DEE8]">{freshnessLabel}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8390A0]">Capture gaps:</span>
                                            <span className="text-[#D8DEE8]">{domain.gapCount ?? 0}</span>
                                        </div>
                                    </div>
                                    {domain.details && (
                                        <p className="mt-2.5 border-t border-[#18212C] pt-2 font-sans text-[9px] leading-relaxed text-[#8390A0]">
                                            {domain.details}
                                        </p>
                                    )}
                                    <Popover.Arrow className="fill-[#18212C]" />
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
                    );
                })}
            </div>
        </div>
    );
}
