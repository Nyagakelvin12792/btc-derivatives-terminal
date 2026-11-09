'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Layers, Shield } from 'lucide-react';
import Ux20ProjectControlDashboard from '../../../components/dashboard/Ux20ProjectControlDashboard';

export default function Ux20ProjectControlPage() {
    return (
        <div className="min-h-screen bg-[#070A0F] text-[#D8DEE8]">
            <header className="border-b border-[#18212C] bg-[#0C1118]/90 backdrop-blur px-4 py-2.5">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            className="flex items-center gap-1.5 rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1 font-mono text-[9px] font-bold text-[#8390A0] transition-colors hover:border-[#39A9F5]/40 hover:text-[#D8DEE8]"
                            data-testid="ux20-back-to-terminal-link"
                        >
                            <ArrowLeft className="size-3" />
                            <span>TERMINAL</span>
                        </Link>
                        <Link
                            href="/project-control"
                            className="flex items-center gap-1.5 rounded border border-[#18212C] bg-[#070A0F] px-2.5 py-1 font-mono text-[9px] font-bold text-[#8390A0] transition-colors hover:border-[#39A9F5]/40 hover:text-[#D8DEE8]"
                            data-testid="ux20-all-milestones-link"
                        >
                            <Layers className="size-3" />
                            <span>ALL INITIATIVES (UX16–UX20)</span>
                        </Link>
                        <span className="text-[#364150]">|</span>
                        <div className="flex items-center gap-2">
                            <Shield className="size-4 text-[#39A9F5]" />
                            <h1 className="font-mono text-xs font-black tracking-wider text-[#D8DEE8]">
                                UX20 · BTC TERMINAL MASTER PLAN IMPLEMENTATION CONTROL
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[8px] text-[#5C697A]">
                        <span>LIVE CHECKPOINT SYNC</span>
                        <span>·</span>
                        <span className="rounded bg-[#18212C] px-1.5 py-0.5 text-[#2CC7A0]">$0 INCREMENTAL SPEND</span>
                        <span>·</span>
                        <span className="rounded bg-[#18212C] px-1.5 py-0.5 text-[#39A9F5]">100% PAPER / NO LIVE EXECUTION</span>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl p-4 sm:p-6">
                <Ux20ProjectControlDashboard />
            </main>
        </div>
    );
}
