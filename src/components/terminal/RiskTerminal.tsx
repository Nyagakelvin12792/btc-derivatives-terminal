'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
    AlertTriangle,
    BarChart2,
    BookOpen,
    Calculator,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Download,
    History,
    Info,
    Pin,
    Plus,
    RotateCcw,
    ShieldAlert,
    Target,
    Trash2,
    TrendingDown,
    TrendingUp,
    X,
} from 'lucide-react';
import {
    calculatePositionRisk,
    type PositionAccountRules,
    type PositionCostRules,
    type PositionRiskErrorCode,
    type PositionRiskResult,
    type PositionRiskWarningCode,
} from '../../lib/quant/position-risk';
import {
    computePortfolioAnalytics,
    createManagedTradeFromDrawing,
    exportTradesToCsv,
    loadManagedTrades,
    saveManagedTrades,
    type ManagedTrade,
    type SetupQualityGrade,
    type StopLossMode,
    type TakeProfitTarget,
    validateTakeProfitAllocations,
} from '../../lib/risk/trade-manager';
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
const RISK_SETTINGS_EVENT = 'btc-terminal-risk-settings-change';
let cachedRiskSettingsRaw: string | null | undefined;
let cachedRiskSettings: PositionRiskSettings = DEFAULT_RISK_SETTINGS;

export function sanitizeRiskSettings(raw: unknown): PositionRiskSettings {
    if (!raw || typeof raw !== 'object') {
        return DEFAULT_RISK_SETTINGS;
    }
    const candidate = raw as Partial<PositionRiskSettings>;

    const equityUsd = typeof candidate.equityUsd === 'number' && Number.isFinite(candidate.equityUsd) && candidate.equityUsd > 0
        ? candidate.equityUsd
        : DEFAULT_RISK_SETTINGS.equityUsd;

    const riskMode = candidate.riskMode === 'amount' || candidate.riskMode === 'percent'
        ? candidate.riskMode
        : DEFAULT_RISK_SETTINGS.riskMode;

    const riskValue = typeof candidate.riskValue === 'number' && Number.isFinite(candidate.riskValue) && candidate.riskValue > 0
        ? (riskMode === 'percent' ? Math.min(100, candidate.riskValue) : candidate.riskValue)
        : DEFAULT_RISK_SETTINGS.riskValue;

    const leverage = typeof candidate.leverage === 'number' && Number.isFinite(candidate.leverage) && candidate.leverage > 0
        ? Math.min(100, Math.max(1, candidate.leverage))
        : DEFAULT_RISK_SETTINGS.leverage;

    const dailyLossLimitUsd = typeof candidate.dailyLossLimitUsd === 'number' && Number.isFinite(candidate.dailyLossLimitUsd) && candidate.dailyLossLimitUsd >= 0
        ? candidate.dailyLossLimitUsd
        : (candidate.dailyLossLimitUsd === undefined ? DEFAULT_RISK_SETTINGS.dailyLossLimitUsd : undefined);

    const realizedPnlTodayUsd = typeof candidate.realizedPnlTodayUsd === 'number' && Number.isFinite(candidate.realizedPnlTodayUsd)
        ? candidate.realizedPnlTodayUsd
        : DEFAULT_RISK_SETTINGS.realizedPnlTodayUsd;

    const maxDrawdownUsd = typeof candidate.maxDrawdownUsd === 'number' && Number.isFinite(candidate.maxDrawdownUsd) && candidate.maxDrawdownUsd >= 0
        ? candidate.maxDrawdownUsd
        : (candidate.maxDrawdownUsd === undefined ? DEFAULT_RISK_SETTINGS.maxDrawdownUsd : undefined);

    const currentDrawdownUsd = typeof candidate.currentDrawdownUsd === 'number' && Number.isFinite(candidate.currentDrawdownUsd) && candidate.currentDrawdownUsd >= 0
        ? candidate.currentDrawdownUsd
        : DEFAULT_RISK_SETTINGS.currentDrawdownUsd;

    const pointValueUsdPerPriceUnit = typeof candidate.pointValueUsdPerPriceUnit === 'number' && Number.isFinite(candidate.pointValueUsdPerPriceUnit) && candidate.pointValueUsdPerPriceUnit > 0
        ? candidate.pointValueUsdPerPriceUnit
        : DEFAULT_RISK_SETTINGS.pointValueUsdPerPriceUnit;

    const lotSize = typeof candidate.lotSize === 'number' && Number.isFinite(candidate.lotSize) && candidate.lotSize > 0
        ? candidate.lotSize
        : DEFAULT_RISK_SETTINGS.lotSize;

    const quantityStep = typeof candidate.quantityStep === 'number' && Number.isFinite(candidate.quantityStep) && candidate.quantityStep > 0
        ? candidate.quantityStep
        : DEFAULT_RISK_SETTINGS.quantityStep;

    const minimumQuantity = typeof candidate.minimumQuantity === 'number' && Number.isFinite(candidate.minimumQuantity) && candidate.minimumQuantity > 0
        ? candidate.minimumQuantity
        : DEFAULT_RISK_SETTINGS.minimumQuantity;

    const maximumQuantity = typeof candidate.maximumQuantity === 'number' && Number.isFinite(candidate.maximumQuantity) && candidate.maximumQuantity > 0
        ? candidate.maximumQuantity
        : DEFAULT_RISK_SETTINGS.maximumQuantity;

    const entryFeeRate = typeof candidate.entryFeeRate === 'number' && Number.isFinite(candidate.entryFeeRate) && candidate.entryFeeRate >= 0
        ? candidate.entryFeeRate
        : DEFAULT_RISK_SETTINGS.entryFeeRate;

    const exitFeeRate = typeof candidate.exitFeeRate === 'number' && Number.isFinite(candidate.exitFeeRate) && candidate.exitFeeRate >= 0
        ? candidate.exitFeeRate
        : DEFAULT_RISK_SETTINGS.exitFeeRate;

    const slippageBpsPerSide = typeof candidate.slippageBpsPerSide === 'number' && Number.isFinite(candidate.slippageBpsPerSide) && candidate.slippageBpsPerSide >= 0
        ? candidate.slippageBpsPerSide
        : DEFAULT_RISK_SETTINGS.slippageBpsPerSide;

    return {
        equityUsd,
        riskMode,
        riskValue,
        leverage,
        dailyLossLimitUsd,
        realizedPnlTodayUsd,
        maxDrawdownUsd,
        currentDrawdownUsd,
        pointValueUsdPerPriceUnit,
        lotSize,
        quantityStep,
        minimumQuantity,
        maximumQuantity,
        entryFeeRate,
        exitFeeRate,
        slippageBpsPerSide,
    };
}

export function readPersistedRiskSettings(): PositionRiskSettings {
    if (typeof window === 'undefined') return DEFAULT_RISK_SETTINGS;
    try {
        const raw = window.localStorage.getItem(RISK_STORAGE_KEY);
        if (raw === cachedRiskSettingsRaw) return cachedRiskSettings;
        cachedRiskSettingsRaw = raw;
        cachedRiskSettings = raw ? sanitizeRiskSettings(JSON.parse(raw)) : DEFAULT_RISK_SETTINGS;
        return cachedRiskSettings;
    } catch {
        cachedRiskSettingsRaw = null;
        cachedRiskSettings = DEFAULT_RISK_SETTINGS;
        return DEFAULT_RISK_SETTINGS;
    }
}

export function writePersistedRiskSettings(settings: PositionRiskSettings): void {
    if (typeof window === 'undefined') return;
    try {
        const sanitized = sanitizeRiskSettings(settings);
        const serialized = JSON.stringify(sanitized);
        window.localStorage.setItem(RISK_STORAGE_KEY, serialized);
        cachedRiskSettingsRaw = serialized;
        cachedRiskSettings = sanitized;
        window.dispatchEvent(new Event(RISK_SETTINGS_EVENT));
    } catch {
        // ignore quota/private mode errors
    }
}

export function subscribePersistedRiskSettings(onStoreChange: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const handleStorage = (event: StorageEvent) => {
        if (event.key === RISK_STORAGE_KEY) onStoreChange();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(RISK_SETTINGS_EVENT, onStoreChange);
    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(RISK_SETTINGS_EVENT, onStoreChange);
    };
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

type RiskTerminalTab = 'POSITION' | 'RISK' | 'HISTORY' | 'ANALYTICS';

interface RiskTerminalProps {
    selectedDrawing: DrawingObject | null;
    onUpdatePositionPrices?: (prices: { entry: number; stop: number; target: number }) => void;
    onSelectDrawingType?: (type: PositionDrawingType) => void;
    riskSettings?: PositionRiskSettings;
    onSettingsChange?: (settings: PositionRiskSettings) => void;
}

export default function RiskTerminal({
    selectedDrawing,
    onUpdatePositionPrices,
    onSelectDrawingType,
    riskSettings: controlledSettings,
    onSettingsChange,
}: RiskTerminalProps) {
    const persistedSettings = useSyncExternalStore(
        subscribePersistedRiskSettings,
        readPersistedRiskSettings,
        () => DEFAULT_RISK_SETTINGS,
    );
    const [activeTab, setActiveTab] = useState<RiskTerminalTab>('POSITION');
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Persistent pinned drawing so clicking blank chart canvas never wipes out the user's active trade setup
    const [pinnedDrawing, setPinnedDrawing] = useState<DrawingObject | null>(null);
    const [managedTrades, setManagedTrades] = useState<ManagedTrade[]>(() => loadManagedTrades());
    const [stopRule, setStopRule] = useState<StopLossMode>('BREAK_EVEN_ON_TP1');
    const [setupGrade, setSetupGrade] = useState<SetupQualityGrade>('AA');
    const [journalNote, setJournalNote] = useState('');
    const [tp1SharePct, setTp1SharePct] = useState(50);

    useEffect(() => {
        if (selectedDrawing && (selectedDrawing.type === 'long-position' || selectedDrawing.type === 'short-position')) {
            setPinnedDrawing(selectedDrawing);
        }
    }, [selectedDrawing]);

    useEffect(() => {
        saveManagedTrades(managedTrades);
    }, [managedTrades]);

    const settings = controlledSettings ?? persistedSettings;

    function handleSettingsChange<K extends keyof PositionRiskSettings>(key: K, value: PositionRiskSettings[K]) {
        const next = { ...settings, [key]: value };
        if (onSettingsChange) {
            onSettingsChange(next);
        } else {
            writePersistedRiskSettings(next);
        }
    }

    function handleResetDefaults() {
        if (onSettingsChange) {
            onSettingsChange(DEFAULT_RISK_SETTINGS);
        } else {
            writePersistedRiskSettings(DEFAULT_RISK_SETTINGS);
        }
    }

    // Active position object: either live-selected on chart or retained via pinnedDrawing
    const effectiveDrawing = (selectedDrawing && (selectedDrawing.type === 'long-position' || selectedDrawing.type === 'short-position'))
        ? selectedDrawing
        : pinnedDrawing;
    const isPinnedFallback = !selectedDrawing && Boolean(pinnedDrawing);
    const isPosition = Boolean(effectiveDrawing && (effectiveDrawing.type === 'long-position' || effectiveDrawing.type === 'short-position'));
    const riskResult = isPosition ? evaluatePositionRiskForDrawing(effectiveDrawing, settings) : null;
    const isLong = effectiveDrawing?.type === 'long-position';

    const handlePriceEdit = (nextPrices: { entry: number; stop: number; target: number }) => {
        if (effectiveDrawing && effectiveDrawing.position) {
            setPinnedDrawing({
                ...effectiveDrawing,
                position: nextPrices,
            });
        }
        onUpdatePositionPrices?.(nextPrices);
    };

    const handleLogTradeToJournal = (simulatedOutcome?: 'WIN_TP2' | 'PARTIAL_TP1_BE' | 'LOSS_STOP') => {
        if (!effectiveDrawing || !effectiveDrawing.position) return;
        const startSec = effectiveDrawing.points[0]?.time ?? Math.floor(Date.now() / 1000);
        const endSec = effectiveDrawing.points[1]?.time ?? startSec + 3600 * 6;
        const created = createManagedTradeFromDrawing({
            drawingId: effectiveDrawing.id,
            direction: effectiveDrawing.type === 'long-position' ? 'LONG' : 'SHORT',
            entryPrice: effectiveDrawing.position.entry,
            stopPrice: effectiveDrawing.position.stop,
            targetPrice: effectiveDrawing.position.target,
            startTime: Math.min(startSec, endSec),
            endTime: Math.max(startSec, endSec),
            timeframe: '1h',
            accountBalanceUsd: settings.equityUsd,
            riskPercent: settings.riskMode === 'percent' ? settings.riskValue : (settings.riskValue / settings.equityUsd) * 100,
        });

        // Apply custom TP1 / TP2 split & journal metadata
        const safeTp1 = Math.max(10, Math.min(90, tp1SharePct));
        const customAllocations: TakeProfitTarget[] = created.takeProfits.map((tp, idx) => ({
            ...tp,
            allocationPct: idx === 0 ? safeTp1 : 100 - safeTp1,
        }));

        let finalTrade: ManagedTrade = {
            ...created,
            stopMode: stopRule,
            takeProfits: validateTakeProfitAllocations(customAllocations).valid ? customAllocations : created.takeProfits,
            journal: {
                ...created.journal,
                qualityGrade: setupGrade,
                entryRationale: journalNote.trim(),
            },
        };

        const rrFull = riskResult?.metrics?.rewardToRisk ?? 2.0;
        const expectedProfitFull = riskResult?.metrics?.profitAtTargetUsd ?? created.initialRiskUsd * rrFull;

        if (simulatedOutcome === 'WIN_TP2') {
            finalTrade = {
                ...finalTrade,
                status: 'CLOSED',
                closedAt: Math.floor(Date.now() / 1000),
                realizedPnlUsd: Number(expectedProfitFull.toFixed(2)),
                remainingAllocationPct: 0,
                takeProfits: finalTrade.takeProfits.map((tp) => ({
                    ...tp,
                    filled: true,
                    filledAtTime: Math.floor(Date.now() / 1000),
                })),
            };
        } else if (simulatedOutcome === 'PARTIAL_TP1_BE') {
            const tp1R = 1.0 * (safeTp1 / 100);
            finalTrade = {
                ...finalTrade,
                status: 'CLOSED',
                closedAt: Math.floor(Date.now() / 1000),
                realizedPnlUsd: Number((created.initialRiskUsd * tp1R).toFixed(2)),
                remainingAllocationPct: 0,
                currentStopPrice: created.entryPrice,
                takeProfits: finalTrade.takeProfits.map((tp, idx) =>
                    idx === 0 ? { ...tp, filled: true, filledAtTime: Math.floor(Date.now() / 1000) } : tp,
                ),
            };
        } else if (simulatedOutcome === 'LOSS_STOP') {
            finalTrade = {
                ...finalTrade,
                status: 'STOPPED_OUT',
                closedAt: Math.floor(Date.now() / 1000),
                realizedPnlUsd: -created.initialRiskUsd,
                remainingAllocationPct: 0,
            };
        }

        setManagedTrades((prev) => [finalTrade, ...prev]);
        setJournalNote('');
    };

    const handleExportCsv = () => {
        const csv = exportTradesToCsv(managedTrades);
        if (typeof window === 'undefined') return;
        try {
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `btc-terminal-trades-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            // fallback in test environments
        }
    };

    const analytics = computePortfolioAnalytics(managedTrades);

    return (
        <div className="flex flex-col gap-2.5 p-3 text-zinc-100" data-testid="risk-terminal">
            {/* Header Banner - Strict Requirement: NO LIVE EXECUTION must remain prominent */}
            <div className="flex items-center justify-between rounded-md border border-rose-400/35 bg-rose-400/[0.08] px-3 py-2 text-rose-200">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 shrink-0 text-rose-400" />
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-wider">NO LIVE EXECUTION</div>
                        <div className="text-[9px] text-rose-300/80">Deterministic position-planning &amp; paper journal only. No order routing.</div>
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

            {/* 4-Tab Navigation Bar (UX17.8) */}
            <div
                className="grid grid-cols-4 gap-1 rounded border border-[#18212C] bg-[#070A0F] p-0.5 font-mono"
                role="tablist"
                aria-label="Risk Terminal Navigation"
                data-testid="risk-terminal-tabs"
            >
                {([
                    { id: 'POSITION', label: 'POSITION', icon: Target },
                    { id: 'RISK', label: 'RISK', icon: Calculator },
                    { id: 'HISTORY', label: `JOURNAL (${managedTrades.length})`, icon: BookOpen },
                    { id: 'ANALYTICS', label: 'ANALYTICS', icon: BarChart2 },
                ] as const).map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            data-testid={`risk-tab-${tab.id.toLowerCase()}`}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                'flex items-center justify-center gap-1 rounded py-1.5 text-[8.5px] font-bold tracking-wider transition-colors',
                                active
                                    ? 'bg-[#39A9F5]/20 text-[#39A9F5] ring-1 ring-[#39A9F5]/40'
                                    : 'text-[#8390A0] hover:text-[#D8DEE8]',
                            )}
                        >
                            <Icon className="size-2.5" />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {activeTab === 'POSITION' && (
                <>
                    {/* Selected or Pinned Position Object Sync */}
                    {isPosition && effectiveDrawing?.position ? (
                        <div className="rounded-md border border-[#2b3c50] bg-[#09111c] p-2.5" data-testid="risk-active-position-card">
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
                                    {isPinnedFallback && (
                                        <span
                                            data-testid="risk-pinned-badge"
                                            className="inline-flex items-center gap-0.5 rounded border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-sky-300"
                                            title="Position remains pinned when clicking blank chart canvas"
                                        >
                                            <Pin className="size-2.5" />PINNED
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
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
                                    {isPinnedFallback && (
                                        <button
                                            type="button"
                                            data-testid="risk-unpin-position"
                                            title="Clear pinned position"
                                            onClick={() => setPinnedDrawing(null)}
                                            className="rounded p-0.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                                        >
                                            <X className="size-3" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[8px] uppercase tracking-wider text-zinc-400">Entry</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={effectiveDrawing.position.entry}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            if (Number.isFinite(val) && effectiveDrawing.position) {
                                                handlePriceEdit({ ...effectiveDrawing.position, entry: val });
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
                                        value={effectiveDrawing.position.stop}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            if (Number.isFinite(val) && effectiveDrawing.position) {
                                                handlePriceEdit({ ...effectiveDrawing.position, stop: val });
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
                                        value={effectiveDrawing.position.target}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            if (Number.isFinite(val) && effectiveDrawing.position) {
                                                handlePriceEdit({ ...effectiveDrawing.position, target: val });
                                            }
                                        }}
                                        className="mt-0.5 w-full rounded border border-[#263548] bg-[#070c14] px-1.5 py-1 font-mono text-[10px] text-emerald-300 outline-none focus:border-emerald-400/50"
                                        data-testid="risk-input-target"
                                        aria-label="Target price"
                                    />
                                </div>
                            </div>

                            {/* Quick Paper Trade / Journal Logging Strip */}
                            {riskResult && riskResult.status === 'ready' && (
                                <div className="mt-2.5 border-t border-[#1c293a] pt-2">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-1">
                                            <span className="font-mono text-[8px] text-zinc-400">GRADE</span>
                                            {(['A', 'AA', 'AAA'] as const).map((g) => (
                                                <button
                                                    key={g}
                                                    type="button"
                                                    onClick={() => setSetupGrade(g)}
                                                    className={cn(
                                                        'rounded px-1.5 py-0.5 font-mono text-[8px] font-bold',
                                                        setupGrade === g
                                                            ? 'bg-[#E6B450]/20 text-[#E6B450] ring-1 ring-[#E6B450]/40'
                                                            : 'bg-[#070c14] text-zinc-400 hover:text-zinc-200',
                                                    )}
                                                >
                                                    {g}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            data-testid="risk-log-trade-button"
                                            onClick={() => handleLogTradeToJournal()}
                                            className="flex items-center gap-1 rounded border border-[#39A9F5]/40 bg-[#39A9F5]/15 px-2 py-1 font-mono text-[8.5px] font-bold text-[#39A9F5] hover:bg-[#39A9F5]/25"
                                        >
                                            <Plus className="size-2.5" />
                                            Log Setup to Journal
                                        </button>
                                    </div>
                                </div>
                            )}
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
                        <div
                            className="rounded-md border border-[#2b3c50] bg-[#09111c] p-3"
                            data-testid="risk-metrics-card"
                            data-terminal-quantity={riskResult.metrics.quantity.toFixed(riskResult.metrics.quantityPrecision)}
                            data-terminal-loss={riskResult.metrics.lossAtStopUsd.toFixed(2)}
                            data-terminal-profit={riskResult.metrics.profitAtTargetUsd.toFixed(2)}
                            data-terminal-rr={riskResult.metrics.rewardToRisk.toFixed(2)}
                            data-terminal-notional={riskResult.metrics.notionalUsd.toFixed(2)}
                        >
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
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Account &amp; Risk Parameters</span>
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
                                <span>Risk Guards &amp; Instrument Rules</span>
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
                </>
            )}

            {activeTab === 'RISK' && (
                <div className="space-y-2.5" data-testid="risk-multi-tp-panel">
                    <div className="rounded-md border border-[#233142] bg-[#080d15] p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#D8DEE8]">Multi-Target &amp; Break-Even Rules</span>
                            <span className="font-mono text-[8.5px] text-[#2CC7A0]">100% ALLOCATED</span>
                        </div>
                        <div className="space-y-2 text-[9px]">
                            <label className="block">
                                <span className="mb-1 flex justify-between text-zinc-400">
                                    <span>TP1 Allocation (at 1.0R) vs TP2 (Final Target)</span>
                                    <span className="font-mono font-bold text-cyan-300">{tp1SharePct}% / {100 - tp1SharePct}%</span>
                                </span>
                                <input
                                    type="range"
                                    min={10}
                                    max={90}
                                    step={5}
                                    value={tp1SharePct}
                                    onChange={(e) => setTp1SharePct(Number(e.target.value))}
                                    className="w-full accent-cyan-400"
                                    data-testid="risk-tp1-allocation-slider"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                    <div className="text-[8px] font-bold text-emerald-400">TP1 · {tp1SharePct}% SIZE</div>
                                    <div className="mt-0.5 font-mono text-[10px] text-zinc-200">
                                        {effectiveDrawing?.position
                                            ? formatPrice(
                                                effectiveDrawing.type === 'long-position'
                                                    ? effectiveDrawing.position.entry + Math.abs(effectiveDrawing.position.entry - effectiveDrawing.position.stop)
                                                    : effectiveDrawing.position.entry - Math.abs(effectiveDrawing.position.stop - effectiveDrawing.position.entry),
                                            )
                                            : '1.0R Target'}
                                    </div>
                                </div>
                                <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                    <div className="text-[8px] font-bold text-emerald-300">TP2 · {100 - tp1SharePct}% SIZE</div>
                                    <div className="mt-0.5 font-mono text-[10px] text-zinc-200">
                                        {effectiveDrawing?.position ? formatPrice(effectiveDrawing.position.target) : 'Final Target'}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-1">
                                <span className="text-[8.5px] font-semibold text-zinc-400">Stop Management Rule</span>
                                <div className="mt-1 grid grid-cols-3 gap-1">
                                    {([
                                        { id: 'STATIC', label: 'Fixed Stop' },
                                        { id: 'BREAK_EVEN_ON_TP1', label: 'BE on TP1' },
                                        { id: 'TRAILING_DOLLAR', label: 'Trail Structure' },
                                    ] as const).map((rule) => (
                                        <button
                                            key={rule.id}
                                            type="button"
                                            onClick={() => setStopRule(rule.id)}
                                            className={cn(
                                                'rounded border px-1.5 py-1.5 font-mono text-[8px] font-bold transition-colors',
                                                stopRule === rule.id
                                                    ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300'
                                                    : 'border-[#1e2a3a] bg-[#060a10] text-zinc-400 hover:text-zinc-200',
                                            )}
                                        >
                                            {rule.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Portfolio Exposure Summary */}
                    <div className="rounded-md border border-[#233142] bg-[#080d15] p-3">
                        <div className="mb-2 font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#D8DEE8]">
                            Portfolio Risk Exposure
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono text-[9px]">
                            <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                <div className="text-[8px] text-zinc-400">ACTIVE TRADES</div>
                                <div className="mt-0.5 text-sm font-bold text-[#39A9F5]">{analytics.openTrades}</div>
                            </div>
                            <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                <div className="text-[8px] text-zinc-400">TOTAL NET PNL</div>
                                <div className="mt-0.5 text-sm font-bold text-amber-300">{formatUsd(analytics.totalNetPnlUsd)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'HISTORY' && (
                <div className="space-y-2.5" data-testid="risk-history-panel">
                    <div className="rounded-md border border-[#233142] bg-[#080d15] p-2.5">
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-[9.5px] font-bold uppercase text-[#D8DEE8]">Paper Trade &amp; Journal Log</span>
                            <button
                                type="button"
                                data-testid="risk-export-csv"
                                onClick={handleExportCsv}
                                className="flex items-center gap-1 rounded border border-[#18212C] bg-[#0C1118] px-2 py-1 font-mono text-[8px] font-bold text-[#8390A0] hover:text-[#D8DEE8]"
                            >
                                <Download className="size-2.5" />
                                Export CSV
                            </button>
                        </div>

                        {isPosition && (
                            <div className="mt-2 space-y-1.5 border-t border-[#1c293a] pt-2">
                                <input
                                    type="text"
                                    value={journalNote}
                                    onChange={(e) => setJournalNote(e.target.value)}
                                    placeholder="Setup thesis (e.g., Sweep of VAL + Footprint absorption)…"
                                    className="w-full rounded border border-[#263548] bg-[#070c14] px-2 py-1 font-sans text-[9.5px] text-zinc-200 outline-none focus:border-cyan-400/50"
                                    data-testid="risk-journal-note-input"
                                />
                                <div className="grid grid-cols-3 gap-1">
                                    <button
                                        type="button"
                                        data-testid="risk-sim-win-tp2"
                                        onClick={() => handleLogTradeToJournal('WIN_TP2')}
                                        className="rounded border border-emerald-400/35 bg-emerald-500/10 px-1.5 py-1 font-mono text-[8px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                                    >
                                        + Log Full TP2 Win
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="risk-sim-tp1-be"
                                        onClick={() => handleLogTradeToJournal('PARTIAL_TP1_BE')}
                                        className="rounded border border-sky-400/35 bg-sky-500/10 px-1.5 py-1 font-mono text-[8px] font-bold text-sky-300 hover:bg-sky-500/20"
                                    >
                                        + Log TP1 + BE
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="risk-sim-loss"
                                        onClick={() => handleLogTradeToJournal('LOSS_STOP')}
                                        className="rounded border border-rose-400/35 bg-rose-500/10 px-1.5 py-1 font-mono text-[8px] font-bold text-rose-300 hover:bg-rose-500/20"
                                    >
                                        + Log Stop Loss
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {managedTrades.length === 0 ? (
                        <div className="rounded border border-dashed border-[#2b3c50] bg-[#09111c]/50 p-4 text-center text-[9.5px] text-zinc-400">
                            No paper trades logged yet. Create a Long/Short position and click &ldquo;Log Setup to Journal&rdquo;.
                        </div>
                    ) : (
                        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-0.5">
                            {managedTrades.map((trade) => {
                                const realizedR = trade.initialRiskUsd > 0 ? trade.realizedPnlUsd / trade.initialRiskUsd : 0;
                                const finalTpPrice = trade.takeProfits.at(-1)?.price ?? trade.entryPrice;
                                return (
                                    <div
                                        key={trade.id}
                                        data-testid={`journal-trade-${trade.id}`}
                                        className="rounded border border-[#1e2a3a] bg-[#070B12] p-2 font-mono text-[8.5px]"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <span className={cn('font-bold uppercase', trade.direction === 'LONG' ? 'text-emerald-300' : 'text-rose-300')}>
                                                    {trade.direction}
                                                </span>
                                                <span className="rounded bg-[#18212C] px-1 py-0.5 text-[7.5px] text-[#E6B450]">
                                                    {trade.journal.qualityGrade}
                                                </span>
                                                <span className="text-zinc-400">{trade.status}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className={cn('font-bold', realizedR > 0 ? 'text-emerald-300' : realizedR < 0 ? 'text-rose-300' : 'text-zinc-300')}>
                                                    {realizedR >= 0 ? '+' : ''}{realizedR.toFixed(2)}R ({formatUsd(trade.realizedPnlUsd)})
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label="Delete trade record"
                                                    onClick={() => setManagedTrades((prev) => prev.filter((item) => item.id !== trade.id))}
                                                    className="text-zinc-500 hover:text-rose-300"
                                                >
                                                    <Trash2 className="size-2.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between text-[8px] text-zinc-400">
                                            <span>E: {formatPrice(trade.entryPrice)} · S: {formatPrice(trade.initialStopPrice)} · T: {formatPrice(finalTpPrice)}</span>
                                            <span>Qty: {trade.positionSizeBtc.toFixed(3)}</span>
                                        </div>
                                        {trade.journal.entryRationale && (
                                            <div className="mt-1 truncate font-sans text-[8.5px] text-zinc-300">{trade.journal.entryRationale}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'ANALYTICS' && (
                <div className="space-y-2.5" data-testid="risk-analytics-panel">
                    <div className="rounded-md border border-[#233142] bg-[#080d15] p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#D8DEE8]">Performance Analytics</span>
                            <span className="font-mono text-[8.5px] text-zinc-400">{analytics.completedTrades} CLOSED</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 font-mono text-[9px]">
                            <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                <span className="text-[8px] text-zinc-400">WIN RATE</span>
                                <div className="mt-0.5 text-sm font-bold text-emerald-300" data-testid="analytics-win-rate">
                                    {analytics.winRatePct.toFixed(1)}%
                                </div>
                                <span className="text-[7.5px] text-zinc-500">{analytics.winCount}W / {analytics.lossCount}L</span>
                            </div>
                            <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                <span className="text-[8px] text-zinc-400">PROFIT FACTOR</span>
                                <div className="mt-0.5 text-sm font-bold text-cyan-300" data-testid="analytics-profit-factor">
                                    {analytics.profitFactor > 0 ? analytics.profitFactor.toFixed(2) : '—'}
                                </div>
                                <span className="text-[7.5px] text-zinc-500">Gross W / Gross L</span>
                            </div>
                            <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                <span className="text-[8px] text-zinc-400">EXPECTANCY (R)</span>
                                <div className={cn('mt-0.5 text-sm font-bold', analytics.expectancyR >= 0 ? 'text-emerald-300' : 'text-rose-300')} data-testid="analytics-expectancy-r">
                                    {analytics.expectancyR >= 0 ? '+' : ''}{analytics.expectancyR.toFixed(2)}R
                                </div>
                                <span className="text-[7.5px] text-zinc-500">{formatUsd(analytics.expectancyUsd)} / trade</span>
                            </div>
                            <div className="rounded border border-[#1e2a3a] bg-[#060a10] p-2">
                                <span className="text-[8px] text-zinc-400">MAX DRAWDOWN (R)</span>
                                <div className="mt-0.5 text-sm font-bold text-rose-300" data-testid="analytics-max-dd-r">
                                    {analytics.maxDrawdownR.toFixed(2)}R
                                </div>
                                <span className="text-[7.5px] text-zinc-500">Avg: {analytics.averageR >= 0 ? '+' : ''}{analytics.averageR.toFixed(2)}R</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
