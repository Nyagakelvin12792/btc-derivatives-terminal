'use client';

import React, { useState } from 'react';
import {
    AlertTriangle,
    Calculator,
    ChevronDown,
    ChevronUp,
    Info,
    RotateCcw,
    ShieldAlert,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import {
    calculatePositionRisk,
    type PositionAccountRules,
    type PositionCostRules,
    type PositionRiskErrorCode,
    type PositionRiskResult,
    type PositionRiskWarningCode,
} from '../../lib/quant/position-risk';
import { cn } from '../../lib/ui/cn';
import type { DrawingObject, PositionDrawingType } from './drawing-model';

export interface PositionRiskSettings {
    equityUsd: number;
    riskMode: 'amount' | 'percent';
    riskValue: number;
    leverage: number;
    dailyLossLimitUsd?: number;
    realizedPnlTodayUsd?: number;
    maxDrawdownUsd?: number;
    currentDrawdownUsd?: number;
    pointValueUsdPerPriceUnit: number;
    lotSize: number;
    quantityStep: number;
    minimumQuantity?: number;
    maximumQuantity?: number;
    entryFeeRate: number; // e.g. 0.0004 for 0.04%
    exitFeeRate: number; // e.g. 0.0004 for 0.04%
    slippageBpsPerSide: number; // e.g. 2 for 2 bps
}

export const DEFAULT_RISK_SETTINGS: PositionRiskSettings = {
    equityUsd: 100_000,
    riskMode: 'percent',
    riskValue: 1, // 1%
    leverage: 10,
    dailyLossLimitUsd: 5_000,
    realizedPnlTodayUsd: 0,
    maxDrawdownUsd: 10_000,
    currentDrawdownUsd: 0,
    pointValueUsdPerPriceUnit: 1,
    lotSize: 1,
    quantityStep: 0.001,
    minimumQuantity: 0.001,
    maximumQuantity: 50,
    entryFeeRate: 0.0004,
    exitFeeRate: 0.0004,
    slippageBpsPerSide: 2,
};

export const RISK_STORAGE_KEY = 'btc-terminal-risk-settings-v1';

export function readPersistedRiskSettings(): PositionRiskSettings {
    if (typeof window === 'undefined') return DEFAULT_RISK_SETTINGS;
    try {
        const raw = window.localStorage.getItem(RISK_STORAGE_KEY);
        if (!raw) return DEFAULT_RISK_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<PositionRiskSettings>;
        return {
            ...DEFAULT_RISK_SETTINGS,
            ...parsed,
        };
    } catch {
        return DEFAULT_RISK_SETTINGS;
    }
}

export function writePersistedRiskSettings(settings: PositionRiskSettings): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // ignore quota/private mode errors
    }
}

export function evaluatePositionRiskForDrawing(
    drawing: DrawingObject | null | undefined,
    settings: PositionRiskSettings,
): PositionRiskResult | null {
    if (!drawing || !drawing.position) return null;
    if (drawing.type !== 'long-position' && drawing.type !== 'short-position') return null;

    const side = drawing.type === 'long-position' ? 'long' : 'short';
    const account: PositionAccountRules = {
        equityUsd: settings.equityUsd,
        risk: settings.riskMode === 'percent'
            ? { mode: 'percent', value: settings.riskValue }
            : { mode: 'amount', value: settings.riskValue },
        leverage: settings.leverage,
        dailyLossLimitUsd: settings.dailyLossLimitUsd,
        realizedPnlTodayUsd: settings.realizedPnlTodayUsd,
        maxDrawdownUsd: settings.maxDrawdownUsd,
        currentDrawdownUsd: settings.currentDrawdownUsd,
    };
    const costs: PositionCostRules = {
        entryFeeRate: settings.entryFeeRate,
        exitFeeRate: settings.exitFeeRate,
        slippageBpsPerSide: settings.slippageBpsPerSide,
    };

    return calculatePositionRisk({
        side,
        account,
        instrument: {
            entryPrice: drawing.position.entry,
            stopPrice: drawing.position.stop,
            targetPrice: drawing.position.target,
            pointValueUsdPerPriceUnit: settings.pointValueUsdPerPriceUnit,
            lotSize: settings.lotSize,
            quantityStep: settings.quantityStep,
            minimumQuantity: settings.minimumQuantity,
            maximumQuantity: settings.maximumQuantity,
        },
        costs,
    });
}

function formatUsd(val: number | null | undefined): string {
    if (val === null || val === undefined || !Number.isFinite(val)) return '—';
    const sign = val < 0 ? '−' : '';
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPrice(val: number): string {
    return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export function humanReadableError(code: PositionRiskErrorCode): string {
    switch (code) {
        case 'INVALID_LONG_GEOMETRY': return 'Invalid Long geometry: Stop must be below Entry, and Target must be above Entry.';
        case 'INVALID_SHORT_GEOMETRY': return 'Invalid Short geometry: Stop must be above Entry, and Target must be below Entry.';
        case 'DAILY_LOSS_LIMIT_EXHAUSTED': return 'Daily loss budget is completely exhausted. Sizing is blocked.';
        case 'MAX_DRAWDOWN_EXHAUSTED': return 'Maximum drawdown limit reached. Sizing is blocked.';
        case 'QUANTITY_BELOW_MINIMUM': return 'Calculated position size is smaller than the minimum permitted lot/quantity.';
        case 'NON_POSITIVE_REWARD_AFTER_COSTS': return 'Target profit after estimated fees and slippage is zero or negative.';
        case 'INVALID_ACCOUNT_EQUITY': return 'Account equity must be a positive finite number.';
        case 'INVALID_RISK_REQUEST': return 'Risk parameter is invalid or exceeds 100%.';
        case 'INVALID_LEVERAGE': return 'Leverage must be greater than zero and within bounds.';
        case 'INVALID_QUANTITY_BOUNDS': return 'Minimum quantity exceeds maximum quantity.';
        default: return `Calculation error: ${code}`;
    }
}

export function humanReadableWarning(code: PositionRiskWarningCode): string {
    switch (code) {
        case 'REQUESTED_RISK_EXCEEDS_EQUITY': return 'Requested risk amount exceeds total account equity.';
        case 'RISK_CAPPED_BY_DAILY_LOSS_LIMIT': return 'Position risk capped by remaining daily loss limit.';
        case 'RISK_CAPPED_BY_MAX_DRAWDOWN': return 'Position risk capped by remaining maximum drawdown budget.';
        case 'QUANTITY_CAPPED_BY_LEVERAGE': return 'Position size is limited by maximum permitted leverage.';
        case 'QUANTITY_CAPPED_BY_MAXIMUM': return 'Position size is capped by maximum allowable instrument quantity.';
        default: return code;
    }
}

interface RiskTerminalProps {
    selectedDrawing: DrawingObject | null;
    onUpdatePositionPrices?: (prices: { entry: number; stop: number; target: number }) => void;
    onSelectDrawingType?: (type: PositionDrawingType) => void;
}

export default function RiskTerminal({
    selectedDrawing,
    onUpdatePositionPrices,
    onSelectDrawingType,
}: RiskTerminalProps) {
    const [settings, setSettings] = useState<PositionRiskSettings>(readPersistedRiskSettings);
    const [showAdvanced, setShowAdvanced] = useState(false);

    function handleSettingsChange<K extends keyof PositionRiskSettings>(key: K, value: PositionRiskSettings[K]) {
        setSettings((prev) => {
            const next = { ...prev, [key]: value };
            writePersistedRiskSettings(next);
            return next;
        });
    }

    function handleResetDefaults() {
        setSettings(DEFAULT_RISK_SETTINGS);
        writePersistedRiskSettings(DEFAULT_RISK_SETTINGS);
    }

    const isPosition = selectedDrawing && (selectedDrawing.type === 'long-position' || selectedDrawing.type === 'short-position');
    const riskResult = isPosition ? evaluatePositionRiskForDrawing(selectedDrawing, settings) : null;
    const isLong = selectedDrawing?.type === 'long-position';

    return (
        <div className="flex flex-col gap-3 p-3 text-zinc-100" data-testid="risk-terminal">
            {/* Header Banner - Strict Requirement: NO LIVE EXECUTION must remain prominent */}
            <div className="flex items-center justify-between rounded-md border border-rose-400/35 bg-rose-400/[0.08] px-3 py-2 text-rose-200">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 shrink-0 text-rose-400" />
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-wider">NO LIVE EXECUTION</div>
                        <div className="text-[9px] text-rose-300/80">Deterministic position-planning terminal only. No order routing.</div>
                    </div>
                </div>
                <button
                    type="button"
                    title="Reset risk parameters to defaults"
                    onClick={handleResetDefaults}
                    className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                >
                    <RotateCcw className="size-3" />
                </button>
            </div>

            {/* Selected Position Object Sync */}
            {isPosition && selectedDrawing.position ? (
                <div className="rounded-md border border-[#2b3c50] bg-[#09111c] p-2.5">
                    <div className="flex items-center justify-between border-b border-[#1c293a] pb-2">
                        <div className="flex items-center gap-1.5">
                            {isLong ? (
                                <TrendingUp className="size-3.5 text-emerald-400" />
                            ) : (
                                <TrendingDown className="size-3.5 text-rose-400" />
                            )}
                            <span className={cn('text-[10px] font-bold uppercase', isLong ? 'text-emerald-300' : 'text-rose-300')}>
                                {isLong ? 'Long Position Object' : 'Short Position Object'}
                            </span>
                        </div>
                        {riskResult && (
                            <span
                                data-testid="risk-status-badge"
                                className={cn(
                                    'rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider',
                                    riskResult.status === 'ready' && 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
                                    riskResult.status === 'blocked' && 'border border-amber-400/40 bg-amber-500/10 text-amber-300',
                                    riskResult.status === 'invalid' && 'border border-rose-400/40 bg-rose-500/10 text-rose-300',
                                )}
                            >
                                {riskResult.status}
                            </span>
                        )}
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[8px] uppercase tracking-wider text-zinc-400">Entry</label>
                            <input
                                type="number"
                                step="0.5"
                                value={selectedDrawing.position.entry}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    if (Number.isFinite(val) && onUpdatePositionPrices && selectedDrawing.position) {
                                        onUpdatePositionPrices({ ...selectedDrawing.position, entry: val });
                                    }
                                }}
                                className="mt-0.5 w-full rounded border border-[#263548] bg-[#070c14] px-1.5 py-1 font-mono text-[10px] text-zinc-100 outline-none focus:border-cyan-400/50"
                                data-testid="risk-input-entry"
                                aria-label="Entry price"
                            />
                        </div>
                        <div>
                            <label className="text-[8px] uppercase tracking-wider text-rose-400">Stop</label>
                            <input
                                type="number"
                                step="0.5"
                                value={selectedDrawing.position.stop}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    if (Number.isFinite(val) && onUpdatePositionPrices && selectedDrawing.position) {
                                        onUpdatePositionPrices({ ...selectedDrawing.position, stop: val });
                                    }
                                }}
                                className="mt-0.5 w-full rounded border border-[#263548] bg-[#070c14] px-1.5 py-1 font-mono text-[10px] text-rose-300 outline-none focus:border-rose-400/50"
                                data-testid="risk-input-stop"
                                aria-label="Stop price"
                            />
                        </div>
                        <div>
                            <label className="text-[8px] uppercase tracking-wider text-emerald-400">Target</label>
                            <input
                                type="number"
                                step="0.5"
                                value={selectedDrawing.position.target}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    if (Number.isFinite(val) && onUpdatePositionPrices && selectedDrawing.position) {
                                        onUpdatePositionPrices({ ...selectedDrawing.position, target: val });
                                    }
                                }}
                                className="mt-0.5 w-full rounded border border-[#263548] bg-[#070c14] px-1.5 py-1 font-mono text-[10px] text-emerald-300 outline-none focus:border-emerald-400/50"
                                data-testid="risk-input-target"
                                aria-label="Target price"
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[#2b3c50] bg-[#09111c]/60 p-4 text-center">
                    <Info className="size-5 text-sky-400" />
                    <div className="text-[10px] font-semibold text-zinc-300">No Position Object Selected</div>
                    <p className="max-w-xs text-[9px] leading-relaxed text-zinc-400">
                        Select a Long or Short position drawing on the chart to synchronize its price levels, or create a new one below:
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onSelectDrawingType?.('long-position')}
                            className="flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                            data-testid="risk-arm-long-button"
                        >
                            <TrendingUp className="size-3" />
                            Create Long
                        </button>
                        <button
                            type="button"
                            onClick={() => onSelectDrawingType?.('short-position')}
                            className="flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-[9px] font-bold text-rose-300 hover:bg-rose-500/20"
                            data-testid="risk-arm-short-button"
                        >
                            <TrendingDown className="size-3" />
                            Create Short
                        </button>
                    </div>
                </div>
            )}

            {/* Error and Warning Banners */}
            {riskResult && riskResult.errors.length > 0 && (
                <div className="flex flex-col gap-1 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[9px] text-rose-300" data-testid="risk-errors-container">
                    <div className="flex items-center gap-1 font-bold text-rose-200">
                        <AlertTriangle className="size-3 text-rose-400" />
                        <span>Sizing Blocked / Invalid</span>
                    </div>
                    {riskResult.errors.map((err) => (
                        <div key={err} className="leading-snug" data-testid={`risk-error-${err}`}>
                            • {humanReadableError(err)}
                        </div>
                    ))}
                </div>
            )}

            {riskResult && riskResult.warnings.length > 0 && (
                <div className="flex flex-col gap-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[9px] text-amber-300" data-testid="risk-warnings-container">
                    <div className="flex items-center gap-1 font-bold text-amber-200">
                        <AlertTriangle className="size-3 text-amber-400" />
                        <span>Planning Notice</span>
                    </div>
                    {riskResult.warnings.map((warn) => (
                        <div key={warn} className="leading-snug" data-testid={`risk-warning-${warn}`}>
                            • {humanReadableWarning(warn)}
                        </div>
                    ))}
                </div>
            )}

            {/* Deterministic Sizing Results (When Ready) */}
            {riskResult && riskResult.status === 'ready' && riskResult.metrics && riskResult.budget && (
                <div className="rounded-md border border-[#2b3c50] bg-[#09111c] p-3" data-testid="risk-metrics-card">
                    <div className="mb-2 flex items-center justify-between border-b border-[#1c293a] pb-1.5">
                        <span className="text-[10px] font-bold text-zinc-300">Position Sizing Output</span>
                        <span className="text-[8px] font-semibold text-zinc-400">
                            Limited by: <span className="font-mono text-cyan-300">{riskResult.metrics.limitedBy}</span>
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                            <span className="text-zinc-400">Final Quantity</span>
                            <div className="mt-0.5 font-mono text-base font-bold text-cyan-200" data-testid="risk-metric-quantity">
                                {riskResult.metrics.quantity.toFixed(riskResult.metrics.quantityPrecision)}
                            </div>
                            <span className="text-[8px] text-zinc-400">Notional: {formatUsd(riskResult.metrics.notionalUsd)}</span>
                        </div>
                        <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                            <span className="text-zinc-400">Reward / Risk</span>
                            <div className="mt-0.5 font-mono text-base font-bold text-emerald-300" data-testid="risk-metric-rrr">
                                1 : {riskResult.metrics.rewardToRisk.toFixed(2)}
                            </div>
                            <span className="text-[8px] text-zinc-400">Margin: {formatUsd(riskResult.metrics.marginRequiredUsd)}</span>
                        </div>

                        <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                            <span className="text-rose-400">Estimated Loss at Stop</span>
                            <div className="mt-0.5 font-mono text-xs font-bold text-rose-300" data-testid="risk-metric-loss">
                                {formatUsd(riskResult.metrics.lossAtStopUsd)}
                            </div>
                            <span className="text-[8px] text-zinc-400">
                                {riskResult.metrics.stopDistancePercent.toFixed(2)}% ({formatPrice(riskResult.metrics.stopDistance)})
                            </span>
                        </div>
                        <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                            <span className="text-emerald-400">Estimated Profit at Target</span>
                            <div className="mt-0.5 font-mono text-xs font-bold text-emerald-300" data-testid="risk-metric-profit">
                                {formatUsd(riskResult.metrics.profitAtTargetUsd)}
                            </div>
                            <span className="text-[8px] text-zinc-400">
                                {riskResult.metrics.targetDistancePercent.toFixed(2)}% ({formatPrice(riskResult.metrics.targetDistance)})
                            </span>
                        </div>
                    </div>

                    <div className="mt-2.5 rounded bg-[#060a10] p-2 text-[8px] text-zinc-400">
                        <div className="flex justify-between">
                            <span>Effective Risk Budget:</span>
                            <span className="font-mono text-zinc-200">{formatUsd(riskResult.budget.effectiveUsd)}</span>
                        </div>
                        {riskResult.quantityCaps && (
                            <div className="mt-1 flex justify-between">
                                <span>Risk Cap / Leverage Cap:</span>
                                <span className="font-mono text-zinc-200">
                                    {riskResult.quantityCaps.risk.toFixed(3)} / {riskResult.quantityCaps.leverage.toFixed(3)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Account & Sizing Parameters */}
            <div className="rounded-md border border-[#233142] bg-[#080d15] p-3">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Account & Risk Parameters</span>
                    <Calculator className="size-3.5 text-zinc-500" />
                </div>

                <div className="space-y-2 text-[9px]">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-zinc-400">Account Equity (USD)</label>
                            <input
                                type="number"
                                min="1"
                                value={settings.equityUsd}
                                onChange={(e) => handleSettingsChange('equityUsd', Math.max(1, Number(e.target.value) || 1))}
                                className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-2 py-1 font-mono text-zinc-100 outline-none focus:border-cyan-400"
                                data-testid="risk-input-equity"
                                aria-label="Account equity in USD"
                            />
                        </div>
                        <div>
                            <label className="text-zinc-400">Leverage (x)</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={settings.leverage}
                                onChange={(e) => handleSettingsChange('leverage', Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                                className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-2 py-1 font-mono text-zinc-100 outline-none focus:border-cyan-400"
                                data-testid="risk-input-leverage"
                                aria-label="Leverage multiplier"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-[1fr_80px] gap-2">
                        <div>
                            <label className="text-zinc-400">
                                Risk Request ({settings.riskMode === 'percent' ? '% of Equity' : 'USD'})
                            </label>
                            <input
                                type="number"
                                step={settings.riskMode === 'percent' ? '0.1' : '50'}
                                min="0.01"
                                value={settings.riskValue}
                                onChange={(e) => handleSettingsChange('riskValue', Math.max(0, Number(e.target.value) || 0))}
                                className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-2 py-1 font-mono text-zinc-100 outline-none focus:border-cyan-400"
                                data-testid="risk-input-risk-value"
                                aria-label="Risk budget value"
                            />
                        </div>
                        <div>
                            <label className="text-zinc-400">Mode</label>
                            <select
                                value={settings.riskMode}
                                onChange={(e) => handleSettingsChange('riskMode', e.target.value as 'amount' | 'percent')}
                                className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-1.5 py-1 text-zinc-200 outline-none focus:border-cyan-400"
                                data-testid="risk-select-risk-mode"
                                aria-label="Risk calculation mode"
                            >
                                <option value="percent">% Equity</option>
                                <option value="amount">Fixed USD</option>
                            </select>
                        </div>
                    </div>

                    {/* Advanced Controls Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowAdvanced((prev) => !prev)}
                        className="flex w-full items-center justify-between pt-1 text-[8px] font-semibold text-zinc-400 hover:text-zinc-200"
                    >
                        <span>Risk Guards & Instrument Rules</span>
                        {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>

                    {showAdvanced && (
                        <div className="space-y-2 border-t border-[#1c293a] pt-2 text-[8px]">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-zinc-400">Daily Loss Limit (USD)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={settings.dailyLossLimitUsd ?? ''}
                                        onChange={(e) => handleSettingsChange('dailyLossLimitUsd', e.target.value ? Number(e.target.value) : undefined)}
                                        className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-2 py-0.5 font-mono text-zinc-100 outline-none"
                                        data-testid="risk-input-daily-limit"
                                        aria-label="Daily loss limit in USD"
                                    />
                                </div>
                                <div>
                                    <label className="text-zinc-400">Realized PnL Today (USD)</label>
                                    <input
                                        type="number"
                                        value={settings.realizedPnlTodayUsd ?? 0}
                                        onChange={(e) => handleSettingsChange('realizedPnlTodayUsd', Number(e.target.value) || 0)}
                                        className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-2 py-0.5 font-mono text-zinc-100 outline-none"
                                        data-testid="risk-input-realized-pnl"
                                        aria-label="Realized PnL today in USD"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-zinc-400">Max Drawdown Limit (USD)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={settings.maxDrawdownUsd ?? ''}
                                        onChange={(e) => handleSettingsChange('maxDrawdownUsd', e.target.value ? Number(e.target.value) : undefined)}
                                        className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-2 py-0.5 font-mono text-zinc-100 outline-none"
                                        data-testid="risk-input-drawdown-limit"
                                        aria-label="Max drawdown limit in USD"
                                    />
                                </div>
                                <div>
                                    <label className="text-zinc-400">Current Drawdown (USD)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={settings.currentDrawdownUsd ?? 0}
                                        onChange={(e) => handleSettingsChange('currentDrawdownUsd', Math.max(0, Number(e.target.value) || 0))}
                                        className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-2 py-0.5 font-mono text-zinc-100 outline-none"
                                        data-testid="risk-input-current-drawdown"
                                        aria-label="Current drawdown in USD"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-zinc-400">Fee Rate (0.0004 = 4bps)</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        min="0"
                                        value={settings.entryFeeRate}
                                        onChange={(e) => handleSettingsChange('entryFeeRate', Math.max(0, Number(e.target.value) || 0))}
                                        className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-1.5 py-0.5 font-mono text-zinc-100 outline-none"
                                        aria-label="Fee rate"
                                    />
                                </div>
                                <div>
                                    <label className="text-zinc-400">Slippage (bps / side)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={settings.slippageBpsPerSide}
                                        onChange={(e) => handleSettingsChange('slippageBpsPerSide', Math.max(0, Number(e.target.value) || 0))}
                                        className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-1.5 py-0.5 font-mono text-zinc-100 outline-none"
                                        aria-label="Slippage in basis points per side"
                                    />
                                </div>
                                <div>
                                    <label className="text-zinc-400">Qty Step</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0.000001"
                                        value={settings.quantityStep}
                                        onChange={(e) => handleSettingsChange('quantityStep', Math.max(0.000001, Number(e.target.value) || 0.001))}
                                        className="mt-0.5 w-full rounded border border-[#2b3c50] bg-[#0a111a] px-1.5 py-0.5 font-mono text-zinc-100 outline-none"
                                        aria-label="Quantity step size"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
