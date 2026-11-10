'use client';

import React, { useState } from 'react';
import {
    Activity,
    BarChart2,
    Clock,
    Compass,
    Layers,
    PenTool,
    RotateCcw,
    ShieldAlert,
    Sliders,
    X,
} from 'lucide-react';
import type {
    ChartSplitLayoutMode,
    FootprintPresetId,
    OverlayDensityMode,
    PriceScaleFitMode,
    WorkspacePresetId,
} from '../../lib/ui/design-tokens';
import { BUILTIN_WORKSPACE_PRESETS } from '../../lib/workspace/presets';
import { FOOTPRINT_PRESETS } from '../../lib/chart-coordination/coordinator';

export type ToolsCategory =
    | 'MARKET_PROFILE'
    | 'ORDER_FLOW'
    | 'OPTIONS'
    | 'LIQUIDITY'
    | 'MARKET_STRUCTURE'
    | 'SESSIONS'
    | 'DRAWINGS'
    | 'TRADE_MANAGEMENT';

export interface ToolsDrawerProps {
    open: boolean;
    onClose: () => void;
    // Workspace & Density
    activeWorkspacePreset: WorkspacePresetId;
    onApplyWorkspacePreset: (presetId: WorkspacePresetId) => void;
    overlayDensity: OverlayDensityMode;
    onChangeOverlayDensity: (density: OverlayDensityMode) => void;
    splitLayoutMode: ChartSplitLayoutMode;
    experimentalFootprint: boolean;
    onExperimentalFootprintChange: (enabled: boolean) => void;
    onChangeSplitLayoutMode: (mode: ChartSplitLayoutMode) => void;
    priceScaleFit: PriceScaleFitMode;
    onChangePriceScaleFit: (fit: PriceScaleFitMode) => void;
    // Market Profile (Volume Profile)
    showVolumeProfile: boolean;
    onToggleVolumeProfile: () => void;
    vpPreset: 'DAILY' | 'WEEKLY' | 'PREV_SESSION' | 'FREE';
    onSelectVpPreset: (preset: 'DAILY' | 'WEEKLY' | 'PREV_SESSION' | 'FREE') => void;
    vpSide: 'LEFT' | 'RIGHT';
    onToggleVpSide: () => void;
    vpOpacityPct: number;
    onChangeVpOpacityPct: (pct: number) => void;
    onStartTwoClickFreeVp: () => void;
    isSelectingFreeVpRange: boolean;
    // Order Flow (Footprint & CVD)
    footprintPreset: FootprintPresetId;
    onSelectFootprintPreset: (preset: FootprintPresetId) => void;
    showLowerStudy: boolean;
    onToggleLowerStudy: () => void;
    // Options Analytics
    showGammaRegime: boolean;
    onToggleGammaRegime: () => void;
    showOptionWalls: boolean;
    onToggleOptionWalls: () => void;
    // Liquidity Heatmap
    showLiquidityHeatmap: boolean;
    onToggleLiquidityHeatmap: () => void;
    liquidityDensityMode: 'FOCUSED' | 'FULL';
    onToggleLiquidityDensityMode: () => void;
    liquidityOpacityPct: number;
    onChangeLiquidityOpacityPct: (pct: number) => void;
    // Market Structure (AVWAP)
    showAvwap: boolean;
    onToggleAvwap: () => void;
    // Sessions
    showTradingSessions: boolean;
    onToggleTradingSessions: () => void;
    showSessionHighLowLines: boolean;
    onToggleSessionHighLowLines: () => void;
    showSessionOpeningRange: boolean;
    onToggleSessionOpeningRange: () => void;
    // Drawings & Trade Management
    onSelectDrawingTool: (tool: string) => void;
    onClearDrawings: () => void;
    onResetAllDefaults: () => void;
}

const CATEGORIES: Array<{ id: ToolsCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'MARKET_PROFILE', label: 'Market Profile', icon: BarChart2 },
    { id: 'ORDER_FLOW', label: 'Order Flow', icon: Activity },
    { id: 'OPTIONS', label: 'Options Analytics', icon: Layers },
    { id: 'LIQUIDITY', label: 'Liquidity', icon: Sliders },
    { id: 'MARKET_STRUCTURE', label: 'Market Structure', icon: Compass },
    { id: 'SESSIONS', label: 'Sessions', icon: Clock },
    { id: 'DRAWINGS', label: 'Drawing Tools', icon: PenTool },
    { id: 'TRADE_MANAGEMENT', label: 'Trade Management', icon: ShieldAlert },
];

export default function ToolsDrawer({
    open,
    onClose,
    activeWorkspacePreset,
    onApplyWorkspacePreset,
    overlayDensity,
    onChangeOverlayDensity,
    splitLayoutMode,
    experimentalFootprint,
    onExperimentalFootprintChange,
    onChangeSplitLayoutMode,
    priceScaleFit,
    onChangePriceScaleFit,
    showVolumeProfile,
    onToggleVolumeProfile,
    vpPreset,
    onSelectVpPreset,
    vpSide,
    onToggleVpSide,
    vpOpacityPct,
    onChangeVpOpacityPct,
    onStartTwoClickFreeVp,
    isSelectingFreeVpRange,
    footprintPreset,
    onSelectFootprintPreset,
    showLowerStudy,
    onToggleLowerStudy,
    showGammaRegime,
    onToggleGammaRegime,
    showOptionWalls,
    onToggleOptionWalls,
    showLiquidityHeatmap,
    onToggleLiquidityHeatmap,
    liquidityDensityMode,
    onToggleLiquidityDensityMode,
    liquidityOpacityPct,
    onChangeLiquidityOpacityPct,
    showAvwap,
    onToggleAvwap,
    showTradingSessions,
    onToggleTradingSessions,
    showSessionHighLowLines,
    onToggleSessionHighLowLines,
    showSessionOpeningRange,
    onToggleSessionOpeningRange,
    onSelectDrawingTool,
    onClearDrawings,
    onResetAllDefaults,
}: ToolsDrawerProps) {
    const [activeCategory, setActiveCategory] = useState<ToolsCategory>('MARKET_PROFILE');
    const [searchQuery, setSearchQuery] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    if (!open) return null;

    const filteredCategories = CATEGORIES.filter((cat) =>
        cat.label.toLowerCase().includes(searchQuery.trim().toLowerCase()),
    );

    return (
        <div
            className="absolute left-9 top-9 z-40 flex w-[480px] max-w-[calc(100vw-3rem)] flex-col rounded border border-[#18212C] bg-[#0C1118]/98 text-[#D8DEE8] shadow-2xl backdrop-blur-md"
            data-testid="collapsible-tools-drawer"
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#18212C] px-3 py-2">
                <div className="flex items-center gap-2">
                    <Sliders className="size-3.5 text-[#39A9F5]" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#D8DEE8]">
                        INSTITUTIONAL TOOLS &amp; OVERLAYS
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onResetAllDefaults}
                        className="flex items-center gap-1 rounded border border-[#18212C] bg-[#070A0F] px-2 py-0.5 font-mono text-[9px] text-[#8390A0] hover:border-[#39A9F5]/40 hover:text-[#D8DEE8]"
                        title="Reset all overlays and layout to institutional defaults"
                        data-testid="tools-reset-defaults"
                    >
                        <RotateCcw className="size-2.5" />
                        <span>Reset</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-[#8390A0] hover:bg-[#18212C] hover:text-[#D8DEE8]"
                        aria-label="Close tools drawer"
                        data-testid="close-tools-drawer"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            </div>

            {/* Global Workspace Presets & Density Strip */}
            <div className="border-b border-[#18212C] bg-[#070A0F]/70 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        <span className="font-mono text-[8px] uppercase text-[#5C697A]">DENSITY:</span>
                        {(['MINIMAL', 'STANDARD', 'DETAILED'] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onChangeOverlayDensity(mode)}
                                className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-bold transition-colors ${
                                    overlayDensity === mode
                                        ? 'bg-[#39A9F5]/20 text-[#39A9F5] border border-[#39A9F5]/40'
                                        : 'text-[#8390A0] hover:text-[#D8DEE8]'
                                }`}
                                data-testid={`density-mode-${mode.toLowerCase()}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1">
                        <span className="font-mono text-[8px] uppercase text-[#5C697A]">SCALE:</span>
                        <button
                            type="button"
                            onClick={() =>
                                onChangePriceScaleFit(priceScaleFit === 'CANDLE_FIT' ? 'INCLUDE_WALLS' : 'CANDLE_FIT')
                            }
                            className={`rounded border px-1.5 py-0.5 font-mono text-[8px] font-bold ${
                                priceScaleFit === 'CANDLE_FIT'
                                    ? 'border-[#2CC7A0]/40 bg-[#2CC7A0]/15 text-[#2CC7A0]'
                                    : 'border-[#18212C] bg-[#0C1118] text-[#8390A0]'
                            }`}
                            data-testid="toggle-price-scale-fit"
                        >
                            {priceScaleFit === 'CANDLE_FIT' ? 'CANDLE FIT' : 'INCLUDE WALLS'}
                        </button>
                    </div>
                </div>

                {/* 6 Workspace Presets */}
                <div className="mt-2 flex flex-wrap gap-1">
                    {Object.values(BUILTIN_WORKSPACE_PRESETS).map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => onApplyWorkspacePreset(preset.id as WorkspacePresetId)}
                            className={`rounded border px-2 py-0.5 font-mono text-[8px] font-bold transition-colors ${
                                activeWorkspacePreset === preset.id
                                    ? 'border-[#39A9F5]/50 bg-[#39A9F5]/20 text-[#D8DEE8]'
                                    : 'border-[#18212C] bg-[#0C1118] text-[#8390A0] hover:text-[#D8DEE8]'
                            }`}
                            title={preset.description}
                            data-testid={`workspace-preset-${preset.id.toLowerCase()}`}
                        >
                            {preset.shortLabel}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search & 2-Column Body */}
            <div className="flex min-h-[270px]">
                {/* Left Category Rail */}
                <div className="w-[155px] shrink-0 border-r border-[#18212C] bg-[#070A0F]/40 p-1.5">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter categories…"
                        className="mb-1.5 w-full rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 font-mono text-[9px] text-[#D8DEE8] placeholder-[#5C697A] focus:border-[#39A9F5] focus:outline-none"
                        data-testid="tools-category-search"
                    />
                    <div className="space-y-0.5">
                        {filteredCategories.map((cat) => {
                            const Icon = cat.icon;
                            const isSelected = activeCategory === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setActiveCategory(cat.id)}
                                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[9px] font-semibold transition-colors ${
                                        isSelected
                                            ? 'bg-[#18212C] text-[#39A9F5]'
                                            : 'text-[#8390A0] hover:bg-[#101722] hover:text-[#D8DEE8]'
                                    }`}
                                    data-testid={`tools-cat-${cat.id.toLowerCase()}`}
                                >
                                    <Icon className="size-3 shrink-0" />
                                    <span className="truncate">{cat.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right Progressive Disclosure Panel */}
                <div className="flex-1 space-y-3 p-3 font-mono text-[10px]">
                    {activeCategory === 'MARKET_PROFILE' && (
                        <div className="space-y-2.5" data-testid="tools-section-market-profile">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-[#D8DEE8]">Volume &amp; Market Profile</span>
                                <button
                                    type="button"
                                    onClick={onToggleVolumeProfile}
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                        showVolumeProfile
                                            ? 'bg-[#2CC7A0]/20 text-[#2CC7A0] border border-[#2CC7A0]/40'
                                            : 'bg-[#18212C] text-[#8390A0]'
                                    }`}
                                    data-testid="tools-toggle-vp"
                                >
                                    {showVolumeProfile ? 'VISIBLE' : 'HIDDEN'}
                                </button>
                            </div>

                            <div className="space-y-1">
                                <span className="text-[8px] uppercase text-[#5C697A]">Profile Scope Preset</span>
                                <div className="grid grid-cols-4 gap-1">
                                    {(
                                        [
                                            { id: 'DAILY', label: 'DAILY' },
                                            { id: 'WEEKLY', label: 'WEEKLY' },
                                            { id: 'PREV_SESSION', label: 'PREV' },
                                            { id: 'FREE', label: 'FREE' },
                                        ] as const
                                    ).map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => onSelectVpPreset(p.id)}
                                            className={`rounded border py-1 text-[9px] font-bold ${
                                                vpPreset === p.id
                                                    ? 'border-[#39A9F5]/50 bg-[#39A9F5]/20 text-[#39A9F5]'
                                                    : 'border-[#18212C] bg-[#070A0F] text-[#8390A0]'
                                            }`}
                                            data-testid={`tools-vp-preset-${p.id.toLowerCase()}`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {vpPreset === 'FREE' && (
                                <div className="rounded border border-[#18212C] bg-[#070A0F] p-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-[#8390A0]">Interactive 2-Click Range</span>
                                        <button
                                            type="button"
                                            onClick={onStartTwoClickFreeVp}
                                            className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                                isSelectingFreeVpRange
                                                    ? 'bg-[#E5A83B]/20 text-[#E5A83B] border border-[#E5A83B]/40'
                                                    : 'bg-[#39A9F5]/20 text-[#39A9F5]'
                                            }`}
                                            data-testid="tools-vp-two-click-range"
                                        >
                                            {isSelectingFreeVpRange ? 'CLICK START & END BAR…' : 'PICK RANGE ON CHART'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-1">
                                <span className="text-[9px] text-[#8390A0]">Placement Side</span>
                                <button
                                    type="button"
                                    onClick={onToggleVpSide}
                                    className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-0.5 text-[9px] text-[#D8DEE8]"
                                >
                                    {vpSide}
                                </button>
                            </div>

                            {showAdvanced && (
                                <div className="space-y-1 border-t border-[#18212C] pt-2">
                                    <div className="flex justify-between text-[9px] text-[#8390A0]">
                                        <span>Histogram Opacity</span>
                                        <span>{vpOpacityPct}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={15}
                                        max={85}
                                        value={vpOpacityPct}
                                        onChange={(e) => onChangeVpOpacityPct(Number(e.target.value))}
                                        className="w-full accent-[#39A9F5]"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {activeCategory === 'ORDER_FLOW' && (
                        <div className="space-y-2.5" data-testid="tools-section-order-flow">
                            <span className="font-bold text-[#D8DEE8]">Order Flow Studies</span>
                            <label className="flex items-center gap-2 text-[10px] text-[#D8DEE8]">
                                <input type="checkbox" checked={experimentalFootprint}
                                    onChange={(event) => onExperimentalFootprintChange(event.target.checked)} />
                                Experimental Footprint
                            </label>
                            <p className="text-[9px] text-[#8390A0]">Optional price-level view. Delta, CVD and the trade tape work with this off.</p>
                            {experimentalFootprint && <>
                            <div className="space-y-1">
                                <span className="text-[8px] uppercase text-[#5C697A]">Split-Screen Workspace Mode</span>
                                <div className="grid grid-cols-1 gap-1">
                                    {(
                                        [
                                            { id: 'MODE_A_CANDLE_ONLY', label: 'Mode A · Candlestick Only' },
                                            { id: 'MODE_B_CANDLE_AND_FOOTPRINT', label: 'Mode B · Candlestick + Footprint' },
                                            {
                                                id: 'MODE_C_DUAL_SYNC_CVD',
                                                label: 'Mode C · Footprint + Candle + Dual Sync CVD',
                                            },
                                        ] as const
                                    ).map((m) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => onChangeSplitLayoutMode(m.id)}
                                            className={`rounded border px-2 py-1 text-left text-[9px] font-bold ${
                                                splitLayoutMode === m.id
                                                    ? 'border-[#39A9F5]/50 bg-[#39A9F5]/20 text-[#39A9F5]'
                                                    : 'border-[#18212C] bg-[#070A0F] text-[#8390A0]'
                                            }`}
                                            data-testid={`split-layout-${m.id.toLowerCase()}`}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1 pt-1">
                                <span className="text-[8px] uppercase text-[#5C697A]">Footprint Analytical Preset</span>
                                <div className="grid grid-cols-2 gap-1">
                                    {Object.values(FOOTPRINT_PRESETS).map((fp) => (
                                        <button
                                            key={fp.id}
                                            type="button"
                                            onClick={() => onSelectFootprintPreset(fp.id)}
                                            className={`rounded border px-2 py-1 text-left text-[9px] font-semibold ${
                                                footprintPreset === fp.id
                                                    ? 'border-[#2CC7A0]/50 bg-[#2CC7A0]/15 text-[#2CC7A0]'
                                                    : 'border-[#18212C] bg-[#070A0F] text-[#8390A0]'
                                            }`}
                                            title={fp.description}
                                            data-testid={`footprint-preset-${fp.id.toLowerCase()}`}
                                        >
                                            {fp.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            </>}
                            <div className="flex items-center justify-between pt-1">
                                <span className="text-[9px] text-[#8390A0]">Lower CVD / Delta Pane</span>
                                <button
                                    type="button"
                                    onClick={onToggleLowerStudy}
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                        showLowerStudy
                                            ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                            : 'bg-[#18212C] text-[#8390A0]'
                                    }`}
                                >
                                    {showLowerStudy ? 'ENABLED' : 'COLLAPSED'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeCategory === 'OPTIONS' && (
                        <div className="space-y-2.5" data-testid="tools-section-options">
                            <span className="font-bold text-[#D8DEE8]">Deribit Options &amp; Gamma Levels</span>
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-[#8390A0]">Call / Put Walls &amp; Gamma Flip</span>
                                <button
                                    type="button"
                                    onClick={onToggleOptionWalls}
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                        showOptionWalls ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]' : 'bg-[#18212C] text-[#8390A0]'
                                    }`}
                                    data-testid="tools-toggle-walls"
                                >
                                    {showOptionWalls ? 'VISIBLE' : 'HIDDEN'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-[#8390A0]">Gamma Regime Background Shading</span>
                                <button
                                    type="button"
                                    onClick={onToggleGammaRegime}
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                        showGammaRegime ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]' : 'bg-[#18212C] text-[#8390A0]'
                                    }`}
                                    data-testid="tools-toggle-gamma-regime"
                                >
                                    {showGammaRegime ? 'VISIBLE' : 'HIDDEN'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeCategory === 'LIQUIDITY' && (
                        <div className="space-y-2.5" data-testid="tools-section-liquidity">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-[#D8DEE8]">L2 Order-Book Liquidity Heatmap</span>
                                <button
                                    type="button"
                                    onClick={onToggleLiquidityHeatmap}
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                        showLiquidityHeatmap
                                            ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                            : 'bg-[#18212C] text-[#8390A0]'
                                    }`}
                                    data-testid="tools-toggle-heatmap"
                                >
                                    {showLiquidityHeatmap ? 'VISIBLE' : 'HIDDEN'}
                                </button>
                            </div>
                            <p className="text-[8px] leading-relaxed text-[#5C697A]">
                                Visualizes timestamped resting L2 limit order depth (distinct from executed Footprint trade volume).
                            </p>
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-[#8390A0]">Depth Filter Mode</span>
                                <button
                                    type="button"
                                    onClick={onToggleLiquidityDensityMode}
                                    className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-0.5 text-[9px] text-[#39A9F5]"
                                >
                                    {liquidityDensityMode}
                                </button>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-[#8390A0]">
                                    <span>Intensity Opacity</span>
                                    <span>{liquidityOpacityPct}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={15}
                                    max={90}
                                    value={liquidityOpacityPct}
                                    onChange={(e) => onChangeLiquidityOpacityPct(Number(e.target.value))}
                                    className="w-full accent-[#39A9F5]"
                                />
                            </div>
                        </div>
                    )}

                    {activeCategory === 'MARKET_STRUCTURE' && (
                        <div className="space-y-2.5" data-testid="tools-section-market-structure">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-[#D8DEE8]">Anchored VWAP &amp; Structural Levels</span>
                                <button
                                    type="button"
                                    onClick={onToggleAvwap}
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                        showAvwap ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]' : 'bg-[#18212C] text-[#8390A0]'
                                    }`}
                                    data-testid="tools-toggle-avwap"
                                >
                                    {showAvwap ? 'VISIBLE' : 'HIDDEN'}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    onSelectDrawingTool('anchored_vwap');
                                    onClose();
                                }}
                                className="w-full rounded border border-[#39A9F5]/40 bg-[#39A9F5]/15 py-1 text-[9px] font-bold text-[#39A9F5]"
                            >
                                + Place New Anchored VWAP on Chart
                            </button>
                        </div>
                    )}

                    {activeCategory === 'SESSIONS' && (
                        <div className="space-y-2.5" data-testid="tools-section-sessions">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-[#D8DEE8]">Trading Sessions (AS / LON / NY)</span>
                                <button
                                    type="button"
                                    onClick={onToggleTradingSessions}
                                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                        showTradingSessions
                                            ? 'bg-[#2CC7A0]/20 text-[#2CC7A0]'
                                            : 'bg-[#18212C] text-[#8390A0]'
                                    }`}
                                    data-testid="tools-toggle-sessions"
                                >
                                    {showTradingSessions ? 'VISIBLE' : 'HIDDEN'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-[#8390A0]">Session High / Low Reference Lines</span>
                                <button
                                    type="button"
                                    onClick={onToggleSessionHighLowLines}
                                    className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-0.5 text-[9px] text-[#8390A0]"
                                    data-testid="tools-toggle-session-hl"
                                >
                                    {showSessionHighLowLines ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-[#8390A0]">30m Opening Range Shading</span>
                                <button
                                    type="button"
                                    onClick={onToggleSessionOpeningRange}
                                    className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-0.5 text-[9px] text-[#8390A0]"
                                    data-testid="tools-toggle-session-or"
                                >
                                    {showSessionOpeningRange ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeCategory === 'DRAWINGS' && (
                        <div className="space-y-2" data-testid="tools-section-drawings">
                            <span className="font-bold text-[#D8DEE8]">Vector &amp; Tactical Drawing Tools</span>
                            <div className="grid grid-cols-2 gap-1">
                                {[
                                    { id: 'long_position', label: 'Long Position' },
                                    { id: 'short_position', label: 'Short Position' },
                                    { id: 'horizontal_ray', label: 'Horizontal Level' },
                                    { id: 'trend_line', label: 'Trendline' },
                                    { id: 'rectangle', label: 'Liquidity Zone' },
                                    { id: 'fib_retracement', label: 'Fib Retracement' },
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                            onSelectDrawingTool(t.id);
                                            onClose();
                                        }}
                                        className="rounded border border-[#18212C] bg-[#070A0F] px-2 py-1 text-left text-[9px] text-[#D8DEE8] hover:border-[#39A9F5]/40"
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={onClearDrawings}
                                className="mt-2 w-full rounded border border-[#F06152]/40 bg-[#F06152]/10 py-1 text-[9px] font-bold text-[#F06152]"
                            >
                                Clear All Drawings
                            </button>
                        </div>
                    )}

                    {activeCategory === 'TRADE_MANAGEMENT' && (
                        <div className="space-y-2.5" data-testid="tools-section-trade-management">
                            <span className="font-bold text-[#D8DEE8]">Persistent Risk &amp; Paper Execution</span>
                            <p className="text-[8px] leading-relaxed text-[#8390A0]">
                                Position drawings extend into future candle space and stay pinned in the 4-Tab Risk Terminal even when clicking blank chart canvas.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSelectDrawingTool('long_position');
                                        onClose();
                                    }}
                                    className="rounded border border-[#2CC7A0]/40 bg-[#2CC7A0]/15 py-1.5 text-[9px] font-bold text-[#2CC7A0]"
                                >
                                    + Draw Long Setup
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSelectDrawingTool('short_position');
                                        onClose();
                                    }}
                                    className="rounded border border-[#F06152]/40 bg-[#F06152]/15 py-1.5 text-[9px] font-bold text-[#F06152]"
                                >
                                    + Draw Short Setup
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Progressive Disclosure Footer */}
                    <div className="flex items-center justify-between border-t border-[#18212C] pt-2">
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((prev) => !prev)}
                            className="font-mono text-[8px] text-[#39A9F5] hover:underline"
                            data-testid="tools-toggle-advanced"
                        >
                            {showAdvanced ? 'Hide Advanced Parameters' : 'Show Advanced Parameters'}
                        </button>
                        <span className="font-mono text-[8px] text-[#5C697A]">NO LIVE EXECUTION</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
