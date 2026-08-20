'use client';

import React from 'react';
import {
    LayoutDashboard,
    TrendingUp,
    Activity,
    Compass,
    Mountain,
    Layers,
    Bell,
    Star,
    Filter,
    FileText,
    Settings,
    HelpCircle,
    Radio,
} from 'lucide-react';

interface SidebarProps {
    activeTab?: string;
    onSelectTab?: (tab: string) => void;
}

export default function Sidebar({ activeTab = 'SURFACE MAP', onSelectTab }: SidebarProps) {
    const navItems = [
        { name: 'DASHBOARD', icon: LayoutDashboard },
        { name: 'GEX ANALYSIS', icon: Activity },
        { name: 'VANNA', badge: 'V' },
        { name: 'CHARM', badge: 'C' },
        { name: 'SURFACE MAP', icon: Mountain, isPrimary: true },
        { name: 'OPEN INTEREST', icon: Layers },
        { name: 'ALERTS', icon: Bell, alertCount: 7 },
        { name: 'WATCHLIST', icon: Star },
        { name: 'SCREENER', icon: Filter },
        { name: 'REPORTS', icon: FileText },
        { name: 'SETTINGS', icon: Settings },
    ];

    return (
        <aside className="w-56 shrink-0 bg-[#080d16] border-r border-[#151f30] flex flex-col justify-between select-none py-3 text-xs">
            <div>
                {/* Brand / Logo */}
                <div className="px-4 pb-4 mb-2 border-b border-[#151f30] flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-md shadow-amber-500/20">
                        <span className="font-mono font-black text-black text-sm">₿</span>
                    </div>
                    <div>
                        <div className="font-bold tracking-wider text-white text-[12px] uppercase leading-tight font-mono">
                            BTC DERIVATIVES
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono tracking-wider font-semibold">
                            MECHANICS TERMINAL
                        </div>
                        <div className="text-[9px] text-zinc-400 font-mono">
                            v2.4.1 PRO
                        </div>
                    </div>
                </div>

                {/* Nav Links */}
                <nav className="space-y-0.5 px-2">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.name;
                        const Icon = item.icon;

                        return (
                            <button
                                key={item.name}
                                onClick={() => onSelectTab?.(item.name)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-mono text-[11px] font-semibold transition-all ${
                                    isActive
                                        ? 'bg-[#0f1d30] text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-950/40'
                                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#0c1422]'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    {Icon ? (
                                        <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-zinc-400'}`} />
                                    ) : item.badge ? (
                                        <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold border ${
                                            isActive
                                                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/60'
                                                : 'border-zinc-700 text-zinc-400 bg-zinc-900/60'
                                        }`}>
                                            {item.badge}
                                        </span>
                                    ) : null}
                                    <span className="tracking-wider">{item.name}</span>
                                </div>

                                {item.alertCount && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-rose-600/90 text-white font-mono text-[9px] font-bold">
                                        {item.alertCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Bottom Status Indicator */}
            <div className="px-3 pt-3 border-t border-[#151f30] space-y-2">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#0c1422] border border-[#1a273b]">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <div>
                            <div className="text-[10px] font-mono font-bold text-white tracking-wider uppercase">CONNECTED</div>
                            <div className="text-[9px] font-mono text-emerald-400">Realtime</div>
                        </div>
                    </div>
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                </div>

                <button className="w-full flex items-center gap-2 px-2 py-1 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono transition-colors">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>HELP CENTER</span>
                </button>
            </div>
        </aside>
    );
}
