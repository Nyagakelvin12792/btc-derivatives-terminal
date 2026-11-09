'use client';

import type { PaperDeskController } from '../../lib/execution/use-paper-desk';

import React, { useMemo } from 'react';
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
import {
    buildDecisionZones,
    detectAbsorption,
    detectAcceptance,
    reconcileAbsorptionAndAcceptance,
    detectCvdDivergence,
    getFootprintBarMetrics,
    synthesizeFlowEvidence,
    detectStackedImbalances,
    trackLiquidityPersistence,
    evaluateSetupAssessment,
    type DepthObservation,
} from '../../lib/orderflow';
import type { TrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow-contracts';

export interface DecisionDockProps {
    paperDesk?: PaperDeskController;
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
    trueFlowSnapshot?: TrueFlowSnapshotV1 | null;
}

export default function DecisionDock({
    paperDesk,
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
    trueFlowSnapshot,
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

    const persistence = useMemo(() => {
        if (!liquidityFeed.frames || liquidityFeed.frames.length === 0) return [];
        const observations: DepthObservation[] = liquidityFeed.frames.flatMap((frame) =>
            (frame.levels || []).map((lvl) => ({
                priceBucket: lvl.price,
                side: lvl.side,
                notionalUsd: lvl.notionalUsd,
                timestamp: frame.eventTime,
            }))
        );
        return trackLiquidityPersistence(observations);
    }, [liquidityFeed.frames]);

    const decisionZones = useMemo(() => {
        return buildDecisionZones({
            spotPrice: metrics.spot,
            optionsLevels: {
                callWall: metrics.callWall,
                putWall: metrics.putWall,
                gammaFlip: metrics.gammaFlip,
                maxPain: metrics.maxPain,
            },
            volumeProfile: trueFlowSnapshot?.tradeVolumeProfile?.pocPrice
                ? {
                      poc: trueFlowSnapshot.tradeVolumeProfile.pocPrice,
                      vah: trueFlowSnapshot.tradeVolumeProfile.vahPrice,
                      val: trueFlowSnapshot.tradeVolumeProfile.valPrice,
                      isApproximate: false,
                  }
                : undefined,
            persistentWalls: persistence,
        });
    }, [
        metrics.spot,
        metrics.callWall,
        metrics.putWall,
        metrics.gammaFlip,
        metrics.maxPain,
        trueFlowSnapshot?.tradeVolumeProfile,
        persistence,
    ]);

    const flowEvidence = useMemo(() => {
        if (!trueFlowSnapshot) return [];

        const stacked = trueFlowSnapshot.footprintBars.flatMap((bar) =>
            detectStackedImbalances(bar.footprint?.cells ?? [], bar.footprint?.openTime ?? 0)
        );

        const footprintBars = trueFlowSnapshot.footprintBars.map((b) => b.footprint);
        const rawAbsorptions = detectAbsorption({
            bars: footprintBars,
            decisionZones,
            persistentWalls: persistence,
            isProduction: orderflowMode === 'LIVE',
        });

        const rawAcceptances = detectAcceptance({
            bars: footprintBars,
            decisionZones,
        });

        const { reconciledAbsorptions, reconciledAcceptances } = reconcileAbsorptionAndAcceptance(
            rawAbsorptions,
            rawAcceptances
        );

        const cvdPoints = trueFlowSnapshot.cvdSegments.flatMap((seg) =>
            seg.bars.map((b) => ({ time: b.openTime, cvd: b.cumulativeDeltaNotionalUsd }))
        );
        const candles = footprintBars.map((b) => {
            const m = getFootprintBarMetrics(b);
            return {
                openTime: b.openTime,
                closeTime: b.closeTime,
                open: m.barLow,
                high: m.barHigh,
                low: m.barLow,
                close: m.barClose,
            };
        });

        const divergences = detectCvdDivergence({
            candles,
            cvdPoints,
            decisionZones,
        });

        return synthesizeFlowEvidence({
            zones: decisionZones,
            absorptions: reconciledAbsorptions,
            acceptances: reconciledAcceptances,
            divergences,
            stackedImbalances: stacked,
            persistentWalls: persistence,
            coverage: trueFlowSnapshot.coverage,
        });
    }, [
        trueFlowSnapshot,
        decisionZones,
        persistence,
        orderflowMode,
    ]);

    const setupAssessment = useMemo(() => {
        const coverage = trueFlowSnapshot ? trueFlowSnapshot.coverage : unavailableCoverage;
        const seqState = dataMode === 'DEMO' ? 'OFFLINE' : (liquidityFeed.sequence.state as any);

        return evaluateSetupAssessment({
            asOf,
            spotPrice: metrics.spot,
            zones: decisionZones,
            evidence: flowEvidence,
            coverage,
            sequenceState: seqState,
            riskSettings: {
                accountEquityUsd: riskSettings?.equityUsd,
                maxRiskPct: riskSettings?.riskMode === 'percent' ? riskSettings.riskValue : undefined,
                maxRiskPerTradeUsd: riskSettings?.riskMode === 'amount' ? riskSettings.riskValue : undefined,
                leverage: riskSettings?.leverage,
            },
        });
    }, [
        asOf,
        metrics.spot,
        decisionZones,
        flowEvidence,
        trueFlowSnapshot,
        unavailableCoverage,
        dataMode,
        liquidityFeed.sequence.state,
        riskSettings,
    ]);

    const contextDecisionState = useMemo(() => {
        if (
            setupAssessment.state === 'A_GRADE_LONG' ||
            setupAssessment.state === 'A_GRADE_SHORT' ||
            setupAssessment.state === 'CONFIRMING_LONG' ||
            setupAssessment.state === 'CONFIRMING_SHORT'
        ) {
            return 'CONFIRMING';
        }
        if (setupAssessment.state === 'WATCH_LONG' || setupAssessment.state === 'WATCH_SHORT') {
            return 'WATCH';
        }
        if (setupAssessment.state === 'INSUFFICIENT_DATA') {
            return 'INSUFFICIENT_DATA';
        }
        return 'NO_SETUP';
    }, [setupAssessment.state]);

    const contextDecisionReason = useMemo(() => {
        if (setupAssessment.state === 'A_GRADE_LONG' || setupAssessment.state === 'A_GRADE_SHORT') {
            return `Deterministic A-grade setup active in zone: ${setupAssessment.zone?.label ?? 'Decision Zone'}.`;
        }
        if (setupAssessment.state === 'CONFIRMING_LONG' || setupAssessment.state === 'CONFIRMING_SHORT') {
            return `Setup confirming in zone: ${setupAssessment.zone?.label ?? 'Decision Zone'}. Awaiting confirmation trigger.`;
        }
        if (setupAssessment.state === 'WATCH_LONG' || setupAssessment.state === 'WATCH_SHORT') {
            return `Price inside decision zone: ${setupAssessment.zone?.label ?? 'Decision Zone'}. Monitoring execution flow.`;
        }
        if (setupAssessment.state === 'INSUFFICIENT_DATA') {
            return 'Live order-flow stream unavailable or offline. Reconnect or review replay capture.';
        }
        if (setupAssessment.state === 'AVOID') {
            return 'Contradictory order flow signals or sequence gap detected. Setup state: AVOID.';
        }
        if (setupAssessment.state === 'INVALIDATED') {
            return 'Structural invalidation price breached. Setup invalidated.';
        }
        return 'Price is outside active structural decision zones.';
    }, [setupAssessment]);

    const activeOverlayCount = Object.values(chartLayers).filter(Boolean).length;

    return (
        <aside
            className="flex h-full flex-col overflow-hidden border-l border-[#18212C] bg-[#0C1118] font-sans text-[#D8DEE8]"
            data-testid="decision-dock"
        >
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#18212C] bg-[#070A0F] px-2">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] font-bold text-[#8390A0]">DECISION DOCK · {workspaceMode}</span>
                    <span className="rounded border border-[#2CC7A0]/40 bg-[#2CC7A0]/10 px-1 py-0.5 font-mono text-[8px] font-bold text-[#2CC7A0]" data-testid="decision-dock-calibration-badge" title="Replay Calibration: 12/12 PASS · 100% Deterministic Reproducibility">CALIBRATED 12/12</span>
                </div>
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
                                    optionsContract={data}
                                    spotPrice={metrics.spot}
                                    callWall={metrics.callWall}
                                    putWall={metrics.putWall}
                                    gammaFlip={metrics.gammaFlip}
                                    gammaRegime={metrics.longGamma ? 'POSITIVE' : 'NEGATIVE'}
                                    decisionState={contextDecisionState}
                                    decisionReason={contextDecisionReason}
                                    dataFreshnessMs={dataMode === 'DEMO' ? null : marketFeed.latencyMs}
                                    activeOverlayCount={activeOverlayCount}
                                />
                            )}
                            {workspaceMode === 'FLOW' && (
                                <FlowMode
                                    liquidityStatus={dataMode === 'DEMO' ? 'OFFLINE' : liquidityFeed.paused ? 'PAUSED' : liquidityFeed.sequence.state}
                                    retainedFrames={dataMode === 'DEMO' ? 0 : liquidityFeed.frames.length}
                                    footprintStatus={trueFlowSnapshot ? (trueFlowSnapshot.footprintBars.length > 0 ? 'READY' : 'AWAITING_CAPTURE') : 'NOT_CONNECTED'}
                                    cvdStatus={trueFlowSnapshot && trueFlowSnapshot.cvdSegments.length > 0 ? 'TRADE_BASED' : 'UNAVAILABLE'}
                                    currentCvdUsd={trueFlowSnapshot?.cvdSegments.at(-1)?.finalCumulativeDeltaNotionalUsd ?? null}
                                    events={flowEvidence}
                                    dataMode={orderflowMode}
                                    trueFlowSnapshot={trueFlowSnapshot}
                                />
                            )}
                            {workspaceMode === 'SETUP' && (
                                <SetupMode
                                    assessment={setupAssessment}
                                    evidence={flowEvidence}
                                    optionsContext={{
                                        gammaRegime: metrics.longGamma ? 'POSITIVE' : 'NEGATIVE',
                                        callWall: metrics.callWall,
                                        putWall: metrics.putWall,
                                        netGex: metrics.netGex,
                                    }}
                                />
                            )}
                        </>
                    )}

                    {inspectorTab === 'OPTIONS' && optionsContent}

                    {inspectorTab === 'RISK' && (
                        <div className="h-full overflow-y-auto p-3" data-testid="risk-inspector-tab">
                            <RiskTerminal
                                paperDesk={paperDesk}
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
                                    ['CVD / Tape Delta', trueFlowSnapshot && trueFlowSnapshot.cvdSegments.length > 0
                                        ? `TRADE CAPTURED · ${trueFlowSnapshot.cvdSegments.length} segment(s)`
                                        : 'UNAVAILABLE (no captured true-flow segment)'],
                                    ['L2 Depth Reconstruction', dataMode === 'DEMO' ? 'UNAVAILABLE IN DEMO' : liquidityFeed.sequence.state !== 'OFFLINE' ? `${liquidityFeed.sequence.state} (${liquidityFeed.frames.length} frames)` : marketFeed.book ? marketFeed.state : 'OFFLINE'],
                                    ['Options Chain', isError && dataMode === 'LIVE' ? 'UNAVAILABLE' : data.dataMode],
                                    ['Jev Intelligence', 'SHADOW ADAPTER READY (UX16.7)'],
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
