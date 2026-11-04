'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Cpu, Radio, ShieldAlert } from 'lucide-react';

export interface TerminalChartLoaderProps {
    feedState?: string;
    isOffline?: boolean;
    onOpenDemo?: () => void;
    title?: string;
}

const TELEMETRY_MESSAGES = [
    'CONNECTING TO BINANCE SPOT L2 PIPELINE...',
    'SYNCHRONIZING DERIBIT DTE VOLATILITY SURFACES...',
    'CALIBRATING INTRABAR EXECUTION FOOTPRINT LADDERS...',
    'MAPPING TOKYO, LONDON & NEW YORK SESSION ZONES...',
    'DERIVING TRUE-FLOW CVD ACCUMULATION CURVES...',
];

export default function TerminalChartLoader({
    feedState = 'INITIALIZING',
    isOffline = false,
    onOpenDemo,
    title = 'CALIBRATING BTC TERMINAL WORKSPACE',
}: TerminalChartLoaderProps) {
    const [msgIndex, setMsgIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMsgIndex((prev) => (prev + 1) % TELEMETRY_MESSAGES.length);
        }, 1800);
        return () => clearInterval(interval);
    }, []);

    return (
        <div
            data-testid="terminal-chart-loader"
            className="relative flex size-full min-h-[380px] flex-col items-center justify-center overflow-hidden bg-[#070B11] select-none"
        >
            {/* Background Oscilloscope Grid */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, #38bdf8 1px, transparent 1px),
                        linear-gradient(to bottom, #38bdf8 1px, transparent 1px)
                    `,
                    backgroundSize: '36px 36px',
                }}
            />

            {/* Subtle Center Radial Glow */}
            <div className="pointer-events-none absolute size-96 rounded-full bg-cyan-500/10 blur-[100px]" />

            {/* Centerpiece: Cybernetic Radar & Glowing ₿ Emblem */}
            <div className="relative mb-6 flex size-36 items-center justify-center">
                {/* Outer Ring */}
                <div className="absolute inset-0 rounded-full border border-cyan-500/20 shadow-[0_0_25px_rgba(56,189,248,0.15)]" />

                {/* Rotating Scanner Beam */}
                <div
                    className="absolute inset-0 animate-spin rounded-full border-t border-r border-cyan-400/80"
                    style={{ animationDuration: '3s', animationTimingFunction: 'linear' }}
                />

                {/* Middle Pulse Ring */}
                <div className="absolute inset-3 animate-ping rounded-full border border-emerald-400/20 opacity-40 duration-1000" />
                <div className="absolute inset-4 rounded-full border border-dashed border-cyan-400/30" />

                {/* Core Crosshairs */}
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-cyan-500/25" />
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-cyan-500/25" />

                {/* Center ₿ Monogram */}
                <div className="relative z-10 flex size-14 items-center justify-center rounded-full border border-cyan-300/40 bg-[#09131F]/90 shadow-[0_0_20px_rgba(39,211,170,0.35)] backdrop-blur">
                    <span className="font-mono text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-[#27D3AA] to-emerald-400 drop-shadow-[0_0_8px_rgba(39,211,170,0.6)]">
                        ₿
                    </span>
                </div>
            </div>

            {/* Terminal Calibration HUD Card */}
            <div className="relative z-10 max-w-md rounded-lg border border-[#1C2C3F] bg-[#0A121E]/95 p-5 text-center shadow-2xl backdrop-blur-md">
                <div className="mb-2 flex items-center justify-center gap-2">
                    <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-cyan-500" />
                    </span>
                    <span className="font-mono text-[10px] font-bold tracking-wider text-cyan-300 uppercase">
                        {title}
                    </span>
                    <span className="rounded bg-cyan-950/70 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-cyan-400 border border-cyan-800/50">
                        {feedState}
                    </span>
                </div>

                {/* Telemetry Status Ticker */}
                <div className="h-6 overflow-hidden">
                    <p className="font-mono text-xs font-medium text-[#93A4B8] transition-all duration-300 ease-in-out">
                        {TELEMETRY_MESSAGES[msgIndex]}
                    </p>
                </div>

                {/* High-tech Micro Progress Bar */}
                <div className="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-[#131F2E]">
                    <div
                        className="h-full w-2/5 animate-[shimmer_1.6s_infinite] rounded-full bg-gradient-to-r from-cyan-500 via-[#27D3AA] to-cyan-400"
                        style={{
                            animation: 'indeterminate 2s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite',
                        }}
                    />
                </div>

                {/* Telemetry Metrics Row */}
                <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-[#162335] pt-3 text-[10px] text-[#6A7B91]">
                    <div className="flex items-center justify-center gap-1 font-mono">
                        <Activity className="size-3 text-cyan-400" />
                        <span>AGG: 10K</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 font-mono">
                        <Radio className="size-3 text-emerald-400" />
                        <span>WS: READY</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 font-mono">
                        <Cpu className="size-3 text-[#A855F7]" />
                        <span>L2: ACTIVE</span>
                    </div>
                </div>

                {/* Offline Fallback Action */}
                {isOffline && onOpenDemo && (
                    <div className="mt-4 pt-2">
                        <button
                            type="button"
                            onClick={onOpenDemo}
                            className="inline-flex items-center gap-2 rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25"
                        >
                            <ShieldAlert className="size-3.5" />
                            <span>LAUNCH DEMO WORKSPACE</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
