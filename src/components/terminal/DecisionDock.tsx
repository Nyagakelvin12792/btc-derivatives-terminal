'use client';

import React from 'react';
import { X, Activity } from 'lucide-react';
import { cn } from '../../lib/ui/cn';
import { useTerminalStore } from '../../lib/dashboard/store';
import ContextMode from './ContextMode';
import FlowMode from './FlowMode';
import SetupMode from './SetupMode';
import RiskTerminal, { type PositionRiskSettings } from './RiskTerminal';
import type { DrawingObject, PositionDrawingType, PositionPrices } from './drawing-model';
import type { TerrainDataContractV2 } from '../../lib/terrain/types';
import type { BinanceMarketFeed } from '../../lib/binance/use-market-feed';

export interface DecisionDockProps {
    metrics: {
        spot: number;
        callWall: number;
        putWall: number;
        gammaFlip: number;
        maxPain: number;
        netGex: number;
        callOi: number;
        putOi: number;
        longGamma: boolean;
        contractsCount?: number;
        putCallRatio?: number;
        atmIv?: number;
    };
    data: TerrainDataContractV2;
    marketFeed: BinanceMarketFeed;
    isError: boolean;
    onClose: () => void;
    selectedDrawing: DrawingObject | null;
    onUpdatePositionPrices: (prices: PositionPrices) => void;
    onSelectDrawingType: (type: PositionDrawingType) => void;
    riskSettings: PositionRiskSettings;
    onSettingsChange: (settings: PositionRiskSettings) => void;
    optionsContent: React.ReactNode;
}

export default function DecisionDock({
    metrics,
    data,
    marketFeed,
    isError,
    onClose,
    selectedDrawing,
    onUpdatePositionPrices,
    onSelectDrawingType,
    riskSettings,
    onSettingsChange,
    optionsContent,
}: DecisionDockProps) {
    const {
        workspaceMode,
        setWorkspaceMode,
        inspectorTab,
        setInspectorTab,
        dataMode,
    } = useTerminalStore();

    const timestamp = new Date(data.timestamp).toLocaleString(undefined, { hour12: false });

    return (
        <aside
            className="flex h-full flex-col overflow-hidden border-l border-[#18212C] bg-[#0C1118] font-sans text-[#D8DEE8]"
            data-testid="decision-dock"
        >
            {/* Top Workspace Mode Selector: Context | Flow | Setup */}
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#18212C] bg-[#070A0F] px-2">
                <div
                    className="grid grid-cols-3 gap-1 rounded bg-[#0C1118] p-0.5"
                    role="tablist"
                    aria-label="Workspace modes"
                    data-testid="workspace-mode-selector"
                >
                    {(['CONTEXT', 'FLOW', 'SETUP'] as const).map((mode) => {
                        const active = workspaceMode === mode;
                        return (
                            <button
                                key={mode}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                data-testid={`workspace-mode-${mode.toLowerCase()}`}
                                onClick={() => {
                                    setWorkspaceMode(mode);
                                    setInspectorTab('DECISION');
                                }}
                                className={cn(
                                    'h-7 px-2.5 text-[9px] font-mono font-bold tracking-wider rounded transition-colors duration-150',
                                    active
                                        ? 'bg-[#18212C] text-[#39A9F5] shadow-sm'
                                        : 'text-[#8390A0] hover:text-[#D8DEE8]',
                                )}
                            >
                                {mode}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close options metrics"
                        className="rounded p-1 text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8] md:hidden"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            </div>

            {/* Mode-Specific Body or Tab Inspector */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {/* Secondary navigation for existing detailed tools: DECISION (Mode default) | OPTIONS | RISK | DATA */}
                <div
                    className="flex h-8 shrink-0 items-center border-b border-[#18212C] bg-[#070A0F] px-2 text-[9px] font-mono"
                    role="tablist"
                    aria-label="Inspector tabs"
                >
                    {(['DECISION', 'OPTIONS', 'RISK', 'DATA'] as const).map((tab) => {
                        const active = inspectorTab === tab;
                        return (
                            <button
                                key={tab}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setInspectorTab(tab)}
                                className={cn(
                                    'h-full px-2 font-bold transition-colors border-b-2',
                                    active
                                        ? 'border-[#39A9F5] text-[#D8DEE8]'
                                        : 'border-transparent text-[#8390A0] hover:text-[#D8DEE8]',
                                )}
                            >
                                {tab}
                            </button>
                        );
                    })}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {inspectorTab === 'DECISION' && (
                        <>
                            {workspaceMode === 'CONTEXT' && (
                                <ContextMode
                                    spotPrice={metrics.spot}
                                    callWall={metrics.callWall}
                                    putWall={metrics.putWall}
                                    gammaFlip={metrics.gammaFlip}
                                    gammaRegime={metrics.longGamma ? 'POSITIVE' : 'NEGATIVE'}
                                    avwapPrice={metrics.spot * 0.985}
                                    volumeProfilePoc={metrics.spot * 1.002}
                                    volumeProfileVah={metrics.spot * 1.025}
                                    volumeProfileVal={metrics.spot * 0.978}
                                    dataFreshnessMs={marketFeed.latencyMs ?? 28}
                                />
                            )}
                            {workspaceMode === 'FLOW' && (
                                <FlowMode
                                    retainedFrames={1_800}
                                    currentCvdUsd={metrics.netGex > 0 ? 12_400_000 : -8_500_000}
                                />
                            )}
                            {workspaceMode === 'SETUP' && (
                                <SetupMode
                                    zone={{
                                        low: Math.round(metrics.putWall),
                                        high: Math.round(metrics.gammaFlip),
                                        label: 'Primary Put Wall & Gamma Flip Transition Zone',
                                    }}
                                    trigger={{
                                        description: 'Reclaim and 5m close above Gamma Flip level',
                                        price: Math.round(metrics.gammaFlip),
                                    }}
                                    invalidation={{
                                        description: 'Sustained 5m close below Primary Put Wall',
                                        price: Math.round(metrics.putWall),
                                    }}
                                />
                            )}
                        </>
                    )}

                    {inspectorTab === 'OPTIONS' && optionsContent}

                    {inspectorTab === 'RISK' && (
                        <div className="h-full overflow-y-auto p-3" data-testid="risk-inspector-tab">
                            <RiskTerminal
                                selectedDrawing={selectedDrawing}
                                onUpdatePositionPrices={onUpdatePositionPrices}
                                onSelectDrawingType={onSelectDrawingType}
                                riskSettings={riskSettings}
                                onSettingsChange={onSettingsChange}
                            />
                            <div className="mt-4 space-y-2 border-t border-[#18212C] pt-3 text-[9px] font-mono">
                                <div className="text-[10px] font-semibold text-[#8390A0]">Structural Options Context</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                                        <div className="text-[#8390A0]">Dist to Call Wall</div>
                                        <div className="mt-0.5 font-bold text-[#D8DEE8]">
                                            {(((metrics.callWall - metrics.spot) / metrics.spot) * 100).toFixed(2)}%
                                        </div>
                                    </div>
                                    <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                                        <div className="text-[#8390A0]">Dist to Put Wall</div>
                                        <div className="mt-0.5 font-bold text-[#D8DEE8]">
                                            {(((metrics.spot - metrics.putWall) / metrics.spot) * 100).toFixed(2)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {inspectorTab === 'DATA' && (
                        <div className="space-y-3 p-3">
                            <div className="flex items-center gap-2 font-mono text-[10px] font-bold text-[#D8DEE8]">
                                <Activity className="size-3.5 text-[#39A9F5]" />
                                DATA INTEGRITY &amp; PROVENANCE
                            </div>
                            <div className="divide-y divide-[#18212C] font-mono text-[9px]">
                                {[
                                    ['Workspace Mode', workspaceMode],
                                    ['Data Feed Mode', dataMode],
                                    ['Timestamp', timestamp],
                                    ['Spot Price Candles', dataMode === 'DEMO' ? 'DEMO FIXTURE' : marketFeed.state],
                                    ['CVD / Tape Delta', dataMode === 'DEMO' ? 'SHADOW DEMO' : marketFeed.state],
                                    ['L2 Depth Reconstruction', dataMode === 'DEMO' ? 'UNAVAILABLE IN DEMO' : marketFeed.book ? marketFeed.state : 'OFFLINE'],
                                    ['Options Chain', isError && dataMode === 'LIVE' ? 'UNAVAILABLE' : data.dataMode],
                                    ['Jev Intelligence', 'SHADOW STANDBY (UX16.7)'],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex items-start justify-between gap-3 py-2">
                                        <span className="text-[#8390A0]">{label}</span>
                                        <span className="break-all text-right font-bold text-[#D8DEE8]">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
