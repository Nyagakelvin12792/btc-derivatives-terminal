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
import type { BinanceLiquidityHeatmapFeed } from '../../lib/binance/use-liquidity-heatmap';
import { ORDERFLOW_SCHEMA_VERSION, type SetupAssessmentV1 } from '../../lib/orderflow/contracts';
import { createCaptureCoverageV1 } from '../../lib/orderflow/provenance';

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
    liquidityFeed: BinanceLiquidityHeatmapFeed;
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
    liquidityFeed,
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
        inspectorTab,
        setInspectorTab,
        dataMode,
        chartLayers,
    } = useTerminalStore();

    const timestamp = new Date(data.timestamp).toLocaleString(undefined, { hour12: false });
    const parsedTimestamp = Date.parse(data.timestamp);
    const asOf = Number.isSafeInteger(parsedTimestamp) && parsedTimestamp >= 0 ? parsedTimestamp : 0;
    const orderflowMode = dataMode === 'DEMO' ? 'REPLAY' : 'LIVE';
    const unavailableCoverage = createCaptureCoverageV1({
        dataMode: orderflowMode,
        source: dataMode === 'DEMO' ? 'UX16_FIXTURE' : 'ORDERFLOW_DERIVED',
        venue: 'NOT_APPLICABLE',
        symbol: 'BTCUSDT',
        capturedAt: asOf,
        eventTime: asOf,
        coverageStart: null,
        coverageEnd: null,
        sequenceState: 'OFFLINE',
        gapCount: 0,
        precision: 'STRUCTURAL',
        approximation: 'NONE',
        quality: 'UNAVAILABLE',
    });
    const setupAssessment: SetupAssessmentV1 = {
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        state: 'INSUFFICIENT_DATA',
        asOf,
        symbol: 'BTCUSDT',
        contextTimeframes: ['4h', '1h'],
        triggerTimeframe: '5m',
        zone: null,
        trigger: null,
        invalidation: null,
        mandatoryGates: {
            dataIntegrity: 'MISSING',
            location: 'MISSING',
            aggression: 'MISSING',
            response: 'MISSING',
            confirmation: 'MISSING',
            invalidation: 'MISSING',
            riskCompatibility: 'MISSING',
        },
        enhancers: {
            persistentLiquidity: 'UNAVAILABLE',
            optionsStructure: 'UNAVAILABLE',
        },
        evidenceIds: [],
        conflictIds: [],
        grade: 'NONE',
        dataQuality: unavailableCoverage,
        deterministicVersion: 'ux16.0-shell-only',
    };
    const activeOverlayCount = Object.values(chartLayers).filter(Boolean).length;

    return (
        <aside
            className="flex h-full flex-col overflow-hidden border-l border-[#18212C] bg-[#0C1118] font-sans text-[#D8DEE8]"
            data-testid="decision-dock"
        >
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#18212C] bg-[#070A0F] px-2">
                <span className="font-mono text-[9px] font-bold text-[#8390A0]">DECISION DOCK · {workspaceMode}</span>
                <button type="button" onClick={onClose} aria-label="Close options metrics" className="rounded p-1 text-[#8390A0] hover:bg-white/5 hover:text-[#D8DEE8] md:hidden"><X className="size-3.5" /></button>
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
                                    decisionState="INSUFFICIENT_DATA"
                                    decisionReason="UX16.0 provides structural context only. Setup classification is not enabled."
                                    dataFreshnessMs={dataMode === 'DEMO' ? null : marketFeed.latencyMs}
                                    activeOverlayCount={activeOverlayCount}
                                />
                            )}
                            {workspaceMode === 'FLOW' && (
                                <FlowMode
                                    liquidityStatus={dataMode === 'DEMO' ? 'OFFLINE' : liquidityFeed.paused ? 'PAUSED' : liquidityFeed.sequence.state}
                                    retainedFrames={dataMode === 'DEMO' ? 0 : liquidityFeed.frames.length}
                                    footprintStatus="NOT_CONNECTED"
                                    cvdStatus="UNAVAILABLE"
                                    currentCvdUsd={null}
                                    events={[]}
                                    dataMode={orderflowMode}
                                />
                            )}
                            {workspaceMode === 'SETUP' && (
                                <SetupMode assessment={setupAssessment} evidence={[]} />
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
                                    ['CVD / Tape Delta', 'UNAVAILABLE (UX16.1 capture required)'],
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
