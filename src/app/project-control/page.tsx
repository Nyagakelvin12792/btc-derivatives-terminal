'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import ProjectControlDashboard from '../../components/dashboard/ProjectControlDashboard';

export default function ProjectControlPage() {
    return (
        <div className="min-h-screen bg-[#070A0F] text-[#D8DEE8]">
            {/* Top Navigation Bar */}
            <header className="border-b border-[#18212C] bg-[#0C1118]/80 backdrop-blur px-4 py-2.5">
                <div className="mx-auto flex max-w-7xl items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            className="flex items-center gap-1.5 rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 font-mono text-[9px] font-bold text-[#8390A0] transition-colors hover:border-[#39A9F5]/40 hover:text-[#D8DEE8]"
                            data-testid="back-to-terminal-link"
                        >
                            <ArrowLeft className="size-3" />
                            <span>TERMINAL</span>
                        </Link>
                        <span className="text-[#364150]">|</span>
                        <div className="flex items-center gap-2">
                            <Shield className="size-4 text-[#39A9F5]" />
                            <h1 className="font-mono text-xs font-black tracking-wider text-[#D8DEE8]">
                                BTC DERIVATIVES MECHANICS · PROJECT CONTROL
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[8px] text-[#5C697A]">
                        <Link
                            href="/project-control/ux20"
                            className="rounded border border-[#39A9F5]/40 bg-[#39A9F5]/15 px-2 py-0.5 font-bold text-[#39A9F5] hover:bg-[#39A9F5]/25"
                            data-testid="open-ux20-dashboard-link"
                        >
                            UX20 MASTER PLAN DASHBOARD →
                        </Link>
                        <span>·</span>
                        <span>READ-ONLY OBSERVABILITY</span>
                        <span>·</span>
                        <span className="rounded bg-[#18212C] px-1.5 py-0.5 text-[#39A9F5]">NO LIVE EXECUTION</span>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="mx-auto max-w-7xl p-4 sm:p-6">
                <ProjectControlDashboard />
            </main>
        </div>
    );
}
