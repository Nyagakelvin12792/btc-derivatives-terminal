'use client';

import * as Popover from '@radix-ui/react-popover';
import { AlertTriangle, CheckCircle2, Database, Radio, RefreshCw, ShieldAlert } from 'lucide-react';
import type { DataIntegritySourceV1, DataIntegrityStatus } from '../../lib/orderflow/contracts';
import { cn } from '../../lib/ui/cn';
import { getDataIntegrityBadgeClasses, getDataIntegrityDotClasses } from './terminal-theme';

export interface DataIntegrityStripProps {
    domains: DataIntegritySourceV1[];
    className?: string;
}

function statusIcon(status: DataIntegrityStatus) {
    switch (status) {
        case 'READY':
            return <CheckCircle2 className="size-3 text-[#2CC7A0]" />;
        case 'PARTIAL':
        case 'STALE':
            return <AlertTriangle className="size-3 text-[#E6B450]" />;
        case 'ERROR':
            return <ShieldAlert className="size-3 text-[#E06379]" />;
        case 'LOADING':
            return <RefreshCw className="size-3 text-[#8390A0]" />;
        case 'REPLAY':
            return <Radio className="size-3 text-[#39A9F5]" />;
        default:
            return <Database className="size-3 text-[#5C697A]" />;
    }
}

export default function DataIntegrityStrip({ domains, className }: DataIntegrityStripProps) {
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
                    const freshnessLabel = domain.coverage.quality === 'UNAVAILABLE'
                        ? '—'
                        : `${domain.coverage.freshnessMs}ms`;

                    return (
                        <Popover.Root key={domain.key}>
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    data-testid={`data-integrity-${domain.key.toLowerCase()}`}
                                    data-status={domain.status.toLowerCase()}
                                    aria-label={`${domain.label} status: ${domain.status}`}
                                    className={cn(
                                        'flex h-5 shrink-0 items-center gap-1.5 rounded border px-2 text-[9px] font-semibold transition-colors duration-150 hover:border-[#263445]',
                                        badgeClasses,
                                    )}
                                    title={`${domain.label}: ${domain.status} (${domain.coverage.venue})`}
                                >
                                    <span className={cn('size-1.5 rounded-full', dotClass)} />
                                    <span className="font-sans text-[#D8DEE8]">{domain.label}</span>
                                    <span>{domain.status}</span>
                                    <span className="opacity-50">·</span>
                                    <span className="text-[#8390A0]">{freshnessLabel}</span>
                                </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Content
                                    role="dialog"
                                    aria-label={`${domain.label} integrity provenance`}
                                    data-testid={`data-integrity-popover-${domain.key.toLowerCase()}`}
                                    side="top"
                                    sideOffset={6}
                                    className="z-50 w-72 rounded border border-[#18212C] bg-[#0C1118] p-3 text-[10px] text-[#D8DEE8] shadow-2xl focus:outline-none"
                                >
                                    <div className="flex items-center justify-between border-b border-[#18212C] pb-2 font-mono">
                                        <div className="flex items-center gap-1.5 font-bold">
                                            {statusIcon(domain.status)}
                                            <span>{domain.label}</span>
                                        </div>
                                        <span className={cn('rounded px-1.5 py-0.5 text-[8px] font-bold', badgeClasses)}>
                                            {domain.status}
                                        </span>
                                    </div>
                                    <div className="mt-2 space-y-1.5 font-mono text-[9px]">
                                        {[
                                            ['Mode', domain.coverage.dataMode],
                                            ['Source', domain.coverage.source],
                                            ['Venue', domain.coverage.venue],
                                            ['Precision', domain.coverage.precision],
                                            ['Approximation', domain.coverage.approximation],
                                            ['Freshness', freshnessLabel],
                                            ['Capture gaps', String(domain.coverage.gapCount)],
                                            ['Quality', domain.coverage.quality],
                                        ].map(([label, value]) => (
                                            <div key={label} className="flex justify-between gap-3">
                                                <span className="text-[#8390A0]">{label}:</span>
                                                <span className="text-right text-[#D8DEE8]">{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {domain.detail && (
                                        <p
                                            className="mt-2.5 border-t border-[#18212C] pt-2 font-sans text-[9px] leading-relaxed text-[#8390A0]"
                                            data-testid={`data-integrity-detail-${domain.key.toLowerCase()}`}
                                        >
                                            {domain.detail}
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
