'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { DemoMarketBar } from '../../lib/ui/market-fixtures';
import type { TrueFlowInterval, TrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow-contracts';
import { buildFootprintWorkspace, resolveFootprintDisplayStep } from '../../lib/orderflow/footprint-workspace';
import {
    clampFootprintTime, findFootprintCandleIndex, fitFootprintPrice, fitFootprintTime,
    panFootprintPrice, panFootprintTime, visibleFootprintIndices, zoomFootprintPrice, zoomFootprintTime,
    type FootprintPriceRange, type FootprintTimeRange,
} from '../../lib/chart-coordination/footprint-viewport';
import { FOOTPRINT_INTERVALS, FOOTPRINT_MODES, FOOTPRINT_STATS, readFootprintPreference, writeFootprintPreference } from './footprint-preferences';
import { createFootprintLayout, renderFootprintCursor, renderFootprintWorkspace, type FootprintDisplayMode, type FootprintRenderBar, type FootprintStat } from './footprint-workspace-renderer';
import FootprintCandleInspector from './FootprintCandleInspector';

const control = 'min-h-7 rounded border border-[#263544] bg-[#101822] px-1.5 text-xs text-slate-200 hover:border-sky-600 focus-visible:outline focus-visible:outline-sky-400 disabled:opacity-40';
const EMPTY_ROWS: readonly FootprintStat[] = [];
const NO_CURSOR = { time: null, price: null };
const groupingChoices = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

interface Preferences {
    mode: FootprintDisplayMode;
    linked: boolean;
    grouping: number;
    ratio: number;
    minVolume: number;
    rows: FootprintStat[];
    statsHeight: number;
    cvd: boolean;
    precision: number;
    showImbalances: boolean;
    levels: number[];
}

const defaultPreferences: Preferences = {
    mode: 'BID_ASK', linked: false, grouping: 0, ratio: 3, minVolume: 5000,
    rows: [...FOOTPRINT_STATS], statsHeight: 125, cvd: false, precision: 0, showImbalances: true, levels: [],
};

function readPreferences(): Preferences {
    const saved = readFootprintPreference('display') as Partial<Preferences> | null;
    if (!saved || typeof saved !== 'object') return defaultPreferences;
    const rows = Array.isArray(saved.rows)
        ? [...new Set(saved.rows.filter((row) => FOOTPRINT_STATS.includes(row)))]
        : defaultPreferences.rows;
    return {
        mode: typeof saved.mode === 'string' && Object.hasOwn(FOOTPRINT_MODES, saved.mode) ? saved.mode : 'BID_ASK',
        linked: saved.linked === true,
        grouping: typeof saved.grouping === 'number' && groupingChoices.includes(saved.grouping) ? saved.grouping : 0,
        ratio: typeof saved.ratio === 'number' && saved.ratio >= 1 && saved.ratio <= 20 ? saved.ratio : 3,
        minVolume: typeof saved.minVolume === 'number' && saved.minVolume >= 0 && saved.minVolume <= 1000000 ? saved.minVolume : 5000,
        rows,
        statsHeight: typeof saved.statsHeight === 'number' && saved.statsHeight >= 75 && saved.statsHeight <= 230 ? saved.statsHeight : 125,
        cvd: saved.cvd === true,
        showImbalances: saved.showImbalances !== false,
        precision: saved.precision === 1 || saved.precision === 2 ? saved.precision : 0,
        levels: Array.isArray(saved.levels) ? saved.levels.filter((price) => Number.isFinite(price) && price > 0).slice(0, 20) : [],
    };
}

export interface LeftFootprintExecutionPaneProps {
    bars: DemoMarketBar[];
    timeframeSeconds: number;
    interval?: TrueFlowInterval | null;
    displayMode?: FootprintDisplayMode;
    onDisplayModeChange?: (mode: FootprintDisplayMode) => void;
    onIntervalChange?: (interval: TrueFlowInterval | null) => void;
    trueFlowSnapshot?: TrueFlowSnapshotV1 | null;
    linkedRange?: FootprintTimeRange | null;
    hoveredPrice?: number | null;
    hoveredTime?: number | null;
    linkedSelectionTime?: number | null;
    onSelectTime?: (time: number) => void;
    onHoverCrosshair?: (point: { price: number | null; time: number | null }) => void;
    onTimeRangeChange?: (range: FootprintTimeRange) => void;
    onClosePane?: () => void;
    showStudies?: boolean;
    replayActive?: boolean;
    replayCursorMs?: number;
    dataMode?: 'LIVE' | 'DEMO' | 'DEGRADED';
    historyState?: 'loading' | 'error' | null;
    asOfMs?: number | null;
    onExportTape?: () => void;
}

type Drag = {
    x: number; y: number; kind: 'plot' | 'price' | 'time' | 'level'; moved: boolean; levelIndex: number;
    time: FootprintTimeRange; price: FootprintPriceRange;
};

export default function LeftFootprintExecutionPane({
    bars, timeframeSeconds, interval = null, displayMode, onDisplayModeChange, onIntervalChange, trueFlowSnapshot, linkedRange,
    hoveredPrice, hoveredTime, linkedSelectionTime, onSelectTime, onHoverCrosshair, onTimeRangeChange, onClosePane,
    showStudies = true, replayActive = false, replayCursorMs, dataMode = 'LIVE', historyState, asOfMs, onExportTape,
}: LeftFootprintExecutionPaneProps) {
    const host = useRef<HTMLDivElement>(null);
    const chartCanvas = useRef<HTMLCanvasElement>(null);
    const cursorCanvas = useRef<HTMLCanvasElement>(null);
    const drag = useRef<Drag | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [settings, setSettings] = useState(defaultPreferences);
    const [showSettings, setShowSettings] = useState(false);
    const [timeOverride, setTimeOverride] = useState<FootprintTimeRange | null>(null);
    const [priceOverride, setPriceOverride] = useState<FootprintPriceRange | null>(null);
    const [selection, setSelection] = useState<number | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [drawLevel, setDrawLevel] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
    const levelDraft = useRef<number | null>(null);
    const localCursor = useRef<typeof NO_CURSOR | { time: number | null; price: number | null } | null>(null);
    const cursorFrame = useRef(0);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setSettings(readPreferences()));
        return () => cancelAnimationFrame(frame);
    }, []);

    const activeMode = displayMode ?? settings.mode;

    function changeSettings(patch: Partial<Preferences>) {
        if (patch.mode) onDisplayModeChange?.(patch.mode);
        const next = { ...settings, ...patch };
        setSettings(next);
        writeFootprintPreference('display', next);
    }

    useEffect(() => {
        if (!host.current) return;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize({ width: Math.floor(width), height: Math.floor(height) });
        });
        observer.observe(host.current);
        return () => observer.disconnect();
    }, []);

    const sourceBucket = trueFlowSnapshot?.priceBucket ?? 1;
    const roughStep = useMemo(() => {
        const recent = bars.slice(-20);
        return recent.length ? recent.reduce((sum, bar) => sum + bar.high - bar.low, 0) / (recent.length * 14) : 25;
    }, [bars]);
    const targetStep = settings.grouping || groupingChoices.find((step) => step >= roughStep) || groupingChoices.at(-1)!;
    const displayStep = resolveFootprintDisplayStep(sourceBucket, targetStep);
    const asOfBucket = asOfMs == null ? 0 : Math.floor(asOfMs / (timeframeSeconds * 1000)) * timeframeSeconds * 1000;
    const captureAsOf = replayCursorMs ?? Math.max(asOfBucket, trueFlowSnapshot?.coverage.capturedAt ?? 0, trueFlowSnapshot?.coverage.coverageEnd ?? 0);

    const renderBars = useMemo<FootprintRenderBar[]>(() => {
        const byTime = new Map<number, FootprintRenderBar>();
        for (const bar of bars) byTime.set(Number(bar.time), { ...bar, time: Number(bar.time) });
        if (trueFlowSnapshot && (replayCursorMs !== undefined || !replayActive && dataMode === 'LIVE')) {
            const captured = buildFootprintWorkspace(trueFlowSnapshot, displayStep, captureAsOf, {
                ratioThreshold: settings.ratio, minDominantNotionalUsd: settings.minVolume,
            });
            for (const footprint of captured) {
                const time = footprint.openTime / 1000;
                const priceBar = byTime.get(time);
                const { open, high, low, close } = footprint;
                if (priceBar) {
                    byTime.set(time, footprint.developing && close !== null && high !== null && low !== null
                        ? { ...priceBar, high: Math.max(high, priceBar.high), low: Math.min(low, priceBar.low), close, footprint }
                        : { ...priceBar, footprint });
                } else if (open !== null && high !== null && low !== null && close !== null) {
                    byTime.set(time, { time, open, high, low, close, footprint });
                }
            }
        }
        return [...byTime.values()].sort((a, b) => a.time - b.time);
    }, [bars, trueFlowSnapshot, replayActive, replayCursorMs, dataMode, displayStep, captureAsOf, settings.ratio, settings.minVolume]);

    const times = useMemo(() => renderBars.map((bar) => bar.time), [renderBars]);
    const linkedSelectionIndex = settings.linked && linkedSelectionTime != null
        ? findFootprintCandleIndex(times, linkedSelectionTime, timeframeSeconds) : -1;
    const selectedColumn = linkedSelectionIndex >= 0 ? times[linkedSelectionIndex] : selection;
    const tradeCandles = useMemo(() => renderBars.filter((bar) => bar.footprint).length, [renderBars]);
    const timeRange = useMemo(() => {
        if (settings.linked && linkedRange && linkedRange.to > linkedRange.from) return linkedRange;
        if (timeOverride) return clampFootprintTime(timeOverride, times, timeframeSeconds);
        return fitFootprintTime(times, timeframeSeconds, 10);
    }, [linkedRange, settings.linked, timeOverride, timeframeSeconds, times]);
    const visible = useMemo(() => visibleFootprintIndices(times, timeRange, timeframeSeconds), [timeRange, timeframeSeconds, times]);
    const autoPrice = useMemo(() => fitFootprintPrice(renderBars.slice(visible.start, visible.end), displayStep * 4),
        [renderBars, visible, displayStep]);
    const priceRange = priceOverride ?? autoPrice;
    const viewport = useMemo(() => ({ ...timeRange, minPrice: priceRange.min, maxPrice: priceRange.max }), [priceRange, timeRange]);
    const statsRows = showStudies ? settings.rows : EMPTY_ROWS;
    const statsHeight = Math.min(settings.statsHeight, Math.floor(size.height * 0.43));
    const cvdHeight = showStudies && settings.cvd ? Math.min(78, Math.floor(size.height * 0.22)) : 0;
    const layout = useMemo(() => createFootprintLayout({ ...size, viewport, timeframeSeconds, statsRows, statsHeight, cvdHeight }),
        [size, viewport, timeframeSeconds, statsRows, statsHeight, cvdHeight]);

    useEffect(() => {
        if (!chartCanvas.current || !size.width || !size.height) return;
        const frame = requestAnimationFrame(() => {
            if (!chartCanvas.current) return;
            renderFootprintWorkspace(chartCanvas.current, {
                ...size, viewport, bars: renderBars, mode: activeMode, statsRows, statsHeight, cvdHeight,
                selectedTime: selectedColumn, timeframeSeconds, pricePrecision: settings.precision, showImbalances: settings.showImbalances,
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [size, viewport, renderBars, activeMode, settings.precision, settings.showImbalances, statsRows, statsHeight, cvdHeight, selectedColumn, timeframeSeconds]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (!cursorCanvas.current || !size.width || !size.height) return;
            const linkedIndex = settings.linked && hoveredTime != null
                ? findFootprintCandleIndex(times, hoveredTime, timeframeSeconds) : -1;
            const linkedCursor = linkedIndex < 0 ? NO_CURSOR : {
                time: times[linkedIndex] + timeframeSeconds / 2, price: hoveredPrice ?? null,
            };
            renderFootprintCursor(cursorCanvas.current, { ...size, layout, cursor: localCursor.current ?? linkedCursor, levels: settings.levels });
        });
        return () => cancelAnimationFrame(frame);
    }, [hoveredPrice, hoveredTime, layout, settings.levels, settings.linked, size, timeframeSeconds, times]);

    useEffect(() => () => cancelAnimationFrame(cursorFrame.current), []);

    function applyTime(next: FootprintTimeRange) {
        setTimeOverride(next);
        if (settings.linked) onTimeRangeChange?.(next);
    }

    function zoomTime(factor: number, anchor = (timeRange.from + timeRange.to) / 2) {
        applyTime(zoomFootprintTime(timeRange, factor, anchor, times, timeframeSeconds));
    }

    useEffect(() => {
        const surface = host.current;
        if (!surface) return;
        const wheel = (event: WheelEvent) => {
            if (!times.length) return;
            event.preventDefault();
            const box = surface.getBoundingClientRect();
            const x = event.clientX - box.left;
            const y = event.clientY - box.top;
            const deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
            const factor = Math.exp(Math.max(-0.55, Math.min(0.55, deltaY * 0.0025)));
            if (x >= layout.plotRight || event.altKey) {
                setPriceOverride(zoomFootprintPrice(priceRange, factor, layout.priceForY(y), displayStep));
                return;
            }
            const next = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)
                ? panFootprintTime(timeRange, (event.deltaX || deltaY) * (timeRange.to - timeRange.from) / Math.max(1, layout.plotRight - layout.plotLeft), times, timeframeSeconds)
                : zoomFootprintTime(timeRange, factor, layout.timeForX(x), times, timeframeSeconds);
            setTimeOverride(next);
            if (settings.linked) onTimeRangeChange?.(next);
        };
        surface.addEventListener('wheel', wheel, { passive: false });
        return () => surface.removeEventListener('wheel', wheel);
    }, [displayStep, layout, onTimeRangeChange, priceRange, settings.linked, size.height, timeRange, timeframeSeconds, times]);

    function pointerPosition(event: ReactMouseEvent<HTMLDivElement>) {
        const box = event.currentTarget.getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function showCursor(x: number, y: number) {
        const index = x >= layout.plotLeft && x < layout.plotRight
            ? findFootprintCandleIndex(times, layout.timeForX(x), timeframeSeconds) : -1;
        const price = y >= layout.plotTop && y <= layout.plotBottom ? layout.priceForY(y) : null;
        const time = index >= 0 ? times[index] + timeframeSeconds / 2 : null;
        localCursor.current = { time, price };
        cancelAnimationFrame(cursorFrame.current);
        cursorFrame.current = requestAnimationFrame(() => {
            if (cursorCanvas.current) renderFootprintCursor(cursorCanvas.current, { ...size, layout, cursor: { time, price }, levels: settings.levels });
            if (settings.linked) onHoverCrosshair?.({ time: index >= 0 ? layout.timeForX(x) : null, price });
        });
    }

    function alignedPrice(y: number) {
        return Math.round(layout.priceForY(y) / sourceBucket) * sourceBucket;
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const { x, y } = pointerPosition(event);
        const start = drag.current;
        if (!start) { showCursor(x, y); return; }
        const dx = x - start.x;
        const dy = y - start.y;
        if (Math.abs(dx) + Math.abs(dy) < 4 && !start.moved) return;
        start.moved = true;
        if (start.kind === 'level') {
            levelDraft.current = Math.max(sourceBucket, alignedPrice(y));
            if (cursorCanvas.current) {
                const levels = settings.levels.map((price, index) => index === start.levelIndex ? levelDraft.current! : price);
                renderFootprintCursor(cursorCanvas.current, { ...size, layout, cursor: NO_CURSOR, levels });
            }
        } else if (start.kind === 'price') {
            const center = (start.price.min + start.price.max) / 2;
            setPriceOverride(zoomFootprintPrice(start.price, Math.exp(Math.max(-3, Math.min(3, dy / 150))), center, displayStep));
        } else if (start.kind === 'time') {
            applyTime(zoomFootprintTime(start.time, Math.exp(Math.max(-3, Math.min(3, dx / 150))), start.time.to, times, timeframeSeconds));
        } else {
            applyTime(panFootprintTime(start.time, -dx * (start.time.to - start.time.from) / Math.max(1, layout.plotRight - layout.plotLeft), times, timeframeSeconds));
            if (Math.abs(dy) >= 4) setPriceOverride(panFootprintPrice(start.price, dy * (start.price.max - start.price.min) / Math.max(1, layout.plotBottom - layout.plotTop)));
        }
    }

    function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
        const start = drag.current;
        drag.current = null;
        if (!start) return;
        if (start.kind === 'level') {
            setSelectedLevel(start.levelIndex);
            if (levelDraft.current !== null) {
                const price = levelDraft.current;
                changeSettings({ levels: settings.levels.map((level, index) => index === start.levelIndex ? price : level) });
            }
            levelDraft.current = null;
            return;
        }
        if (start.moved || start.kind !== 'plot') return;
        const { x, y } = pointerPosition(event);
        if (drawLevel && y < layout.plotBottom) {
            const price = alignedPrice(y);
            if (price > 0) changeSettings({ levels: [...settings.levels, price].slice(-20) });
            setDrawLevel(false);
            return;
        }
        const index = findFootprintCandleIndex(times, layout.timeForX(x), timeframeSeconds);
        if (index >= 0) {
            setSelectedLevel(null);
            setSelection(times[index]);
            if (settings.linked) onSelectTime?.(layout.timeForX(x));
            setInspectorOpen(true);
            showCursor(x, y);
        }
    }

    const selected = selection === null ? null : renderBars[findFootprintCandleIndex(times, selection, timeframeSeconds)] ?? null;
    const coverageTimes = renderBars.find((bar) => bar.footprint)?.footprint;
    const lastCoverage = renderBars.findLast((bar) => bar.footprint)?.footprint;
    const fit = () => { setPriceOverride(null); applyTime(fitFootprintTime(times, timeframeSeconds)); };
    const latest = () => { setPriceOverride(null); setTimeOverride(null); if (settings.linked) onTimeRangeChange?.(fitFootprintTime(times, timeframeSeconds, 10)); };

    return (
        <section data-testid="left-footprint-execution-pane" aria-label="Footprint chart" className="relative flex h-full min-h-0 flex-col bg-[#080d14]">
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[#263544] p-1.5">
                <select aria-label="Footprint mode" data-testid="exec-mode" className={control} value={activeMode} onChange={(event) => changeSettings({ mode: event.target.value as FootprintDisplayMode })}>
                    {Object.entries(FOOTPRINT_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select aria-label="Footprint timeframe" data-testid="exec-timeframe" className={control} disabled={replayActive && replayCursorMs === undefined} value={replayActive && replayCursorMs === undefined ? 'FOLLOW' : interval ?? 'FOLLOW'}
                    onChange={(event) => onIntervalChange?.(event.target.value === 'FOLLOW' ? null : event.target.value as TrueFlowInterval)}>
                    <option value="FOLLOW">Follow chart</option>
                    {Object.keys(FOOTPRINT_INTERVALS).map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
                </select>
                <button type="button" data-testid="exec-zoom-in" className={control} aria-label="Zoom in Footprint" onClick={() => zoomTime(0.78)}>+</button>
                <button type="button" data-testid="exec-zoom-out" className={control} aria-label="Zoom out Footprint" onClick={() => zoomTime(1.28)}>−</button>
                <button type="button" data-testid="exec-sync-toggle" className={control} aria-pressed={settings.linked} onClick={() => {
                    setTimeOverride(clampFootprintTime(timeRange, times, timeframeSeconds));
                    changeSettings({ linked: !settings.linked });
                    if (settings.linked) onHoverCrosshair?.(NO_CURSOR);
                }}>{settings.linked ? 'Linked' : 'Link'}</button>
                <button type="button" className={control} aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>Settings</button>
                <button type="button" className={control} aria-label="Hide Footprint" onClick={onClosePane}>×</button>
            </div>
            <div data-testid="footprint-coverage" className="shrink-0 border-b border-slate-800 px-2 py-1 text-[10px] leading-tight text-slate-400">
                {replayCursorMs !== undefined ? 'Recorded BTCUSDT Spot tape · values shown as of the replay cursor.'
                    : replayActive ? 'Historical Preview · OHLC only. Load a tape for trade replay.'
                    : dataMode === 'DEMO' ? 'Demo OHLC · No captured trades.'
                    : tradeCandles ? `Binance BTCUSDT Spot · ${tradeCandles} captured candle${tradeCandles === 1 ? '' : 's'} · ${displayStep.toLocaleString()} USDT grouping`
                    : 'Binance BTCUSDT Spot · No captured trades. Blank cells indicate unavailable trade data.'}
                {historyState === 'loading' ? ' · Loading OHLC' : historyState === 'error' ? ' · OHLC history unavailable' : ''}
            </div>
            {showSettings && <div className="absolute right-1 top-10 z-50 grid max-h-[85%] w-[min(310px,98%)] gap-2 overflow-auto rounded border border-slate-700 bg-[#101822] p-2 text-xs text-slate-200 shadow-xl">
                <div className="flex flex-wrap gap-1">
                    <button type="button" data-testid="exec-fit" className={control} onClick={fit}>Fit data</button>
                    <button type="button" data-testid="exec-latest" className={control} onClick={latest}>Latest / reset</button>
                    <button type="button" className={control} onClick={() => setPriceOverride(null)}>Auto price</button>
                    {onExportTape && <button type="button" className={control} onClick={onExportTape}>Save captured tape</button>}
                    <button type="button" className={control} aria-pressed={drawLevel} onClick={() => { setDrawLevel(!drawLevel); setShowSettings(false); }}>Draw price level</button>
                    {settings.levels.length > 0 && <button type="button" className={control} onClick={() => {
                        changeSettings({ levels: settings.levels.filter((_, index) => index !== (selectedLevel ?? settings.levels.length - 1)) });
                        setSelectedLevel(null);
                    }}>{selectedLevel === null ? 'Remove last level' : 'Remove selected level'}</button>}
                </div>
                <div className="flex flex-wrap items-center gap-1" aria-label="Footprint presets">
                    <span className="text-slate-400">Presets</span>
                    <button type="button" className={control} onClick={() => changeSettings({ mode: 'BID_ASK', showImbalances: true })}>Bid × Ask</button>
                    <button type="button" className={control} onClick={() => changeSettings({ mode: 'DELTA_PROFILE', showImbalances: true })}>Delta analysis</button>
                    <button type="button" className={control} onClick={() => changeSettings({ mode: 'VOLUME_PROFILE', showImbalances: false })}>Volume analysis</button>
                </div>
                <label><input type="checkbox" checked={settings.showImbalances} onChange={(event) => changeSettings({ showImbalances: event.target.checked })} /> Highlight imbalances</label>
                <div className="grid grid-cols-2 gap-2">
                    <label>Price grouping
                        <select className={`${control} w-full`} value={settings.grouping} onChange={(event) => changeSettings({ grouping: Number(event.target.value) })}>
                            <option value={0}>Auto</option>{groupingChoices.map((step) => <option key={step} value={step}>{step} USDT</option>)}
                        </select>
                    </label>
                    <label>Price decimals
                        <select className={`${control} w-full`} value={settings.precision} onChange={(event) => changeSettings({ precision: Number(event.target.value) })}>
                            {[0, 1, 2].map((value) => <option key={value}>{value}</option>)}
                        </select>
                    </label>
                    <label>Imbalance ratio
                        <input className={`${control} w-full`} type="number" min={1} max={20} step={0.5} value={settings.ratio}
                            onChange={(event) => changeSettings({ ratio: Math.max(1, Math.min(20, Number(event.target.value))) })} />
                    </label>
                    <label>Min. imbalance USDT
                        <input className={`${control} w-full`} type="number" min={0} max={1000000} step={100} value={settings.minVolume}
                            onChange={(event) => changeSettings({ minVolume: Math.max(0, Math.min(1000000, Number(event.target.value))) })} />
                    </label>
                </div>
                {showStudies && <details>
                    <summary className="cursor-pointer">Delta statistics and CVD</summary>
                    <label className="mt-2 block"><input type="checkbox" checked={settings.cvd} onChange={(event) => changeSettings({ cvd: event.target.checked })} /> Captured CVD</label>
                    <label className="mt-2 block">Table height
                        <input aria-label="Statistics table height" className="ml-2 align-middle" type="range" min={75} max={230} value={settings.statsHeight}
                            onChange={(event) => changeSettings({ statsHeight: Number(event.target.value) })} />
                    </label>
                    <div className="mt-2 flex gap-1">
                        <button type="button" className={control} onClick={() => changeSettings({ rows: [] })}>Collapse</button>
                        <button type="button" className={control} onClick={() => changeSettings({ rows: [...FOOTPRINT_STATS] })}>Reset rows</button>
                    </div>
                    <div className="mt-1 grid gap-1">{[...settings.rows, ...FOOTPRINT_STATS.filter((row) => !settings.rows.includes(row))].map((row, index) => (
                        <div key={row} className="flex items-center justify-between gap-2">
                            <label><input type="checkbox" checked={settings.rows.includes(row)} onChange={(event) => changeSettings({ rows: event.target.checked ? [...settings.rows, row] : settings.rows.filter((id) => id !== row) })} /> {row.replaceAll('_', ' ')}</label>
                            {index > 0 && index < settings.rows.length && <button type="button" className={control} aria-label={`Move ${row} up`} onClick={() => {
                                const rows = [...settings.rows];
                                [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
                                changeSettings({ rows });
                            }}>↑</button>}
                        </div>
                    ))}</div>
                </details>}
                {coverageTimes?.coverageStart != null && lastCoverage?.coverageEnd != null && <p className="text-slate-400">
                    Observed range {new Date(coverageTimes.coverageStart).toISOString()} to {new Date(lastCoverage.coverageEnd).toISOString()}. Individual candles may have gaps.
                </p>}
                <p className="text-slate-400">Wheel zooms around the cursor. Drag the plot to pan. Drag either axis to scale. Click a candle for exact values.</p>
            </div>}
            <div ref={host} data-testid="footprint-chart-surface" className={`relative min-h-0 flex-1 touch-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sky-400 ${drawLevel ? 'cursor-crosshair' : ''}`}
                tabIndex={0} role="region" aria-label="Footprint plot. Use arrows to pan, plus or minus to zoom, Home to fit, End for latest."
                data-time-from={timeRange.from} data-time-to={timeRange.to} data-price-min={priceRange.min} data-price-max={priceRange.max}
                data-trade-candles={tradeCandles} data-stats-rows={statsRows.length}
                onPointerDown={(event) => {
                    if (event.button !== 0 || !times.length) return;
                    const { x, y } = pointerPosition(event);
                    if (x < layout.plotLeft) return;
                    const levelIndex = !drawLevel && x < layout.plotRight && y < layout.plotBottom
                        ? settings.levels.findIndex((price) => Math.abs(layout.yForPrice(price) - y) < 6) : -1;
                    const kind = levelIndex >= 0 ? 'level'
                        : x >= layout.plotRight ? 'price' : y >= layout.plotBottom && y < layout.axisBottom ? 'time' : 'plot';
                    drag.current = { x, y, kind, levelIndex, moved: false, time: timeRange, price: priceRange };
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={handlePointerMove} onPointerUp={finishPointer}
                onPointerCancel={() => { drag.current = null; levelDraft.current = null; }}
                onPointerLeave={() => {
                    localCursor.current = null;
                    cancelAnimationFrame(cursorFrame.current);
                    if (cursorCanvas.current) renderFootprintCursor(cursorCanvas.current, { ...size, layout, cursor: NO_CURSOR, levels: settings.levels });
                    if (settings.linked) onHoverCrosshair?.(NO_CURSOR);
                }}
                onDoubleClick={(event) => {
                    const { x, y } = pointerPosition(event);
                    if (x >= layout.plotRight) setPriceOverride(null);
                    else if (y >= layout.plotBottom && y < layout.axisBottom) latest();
                }}
                onKeyDown={(event) => {
                    if (event.key === '+' || event.key === '=') zoomTime(0.78);
                    else if (event.key === '-') zoomTime(1.28);
                    else if (event.key === 'Home') fit();
                    else if (event.key === 'End') latest();
                    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') applyTime(panFootprintTime(timeRange, timeframeSeconds * (event.key === 'ArrowLeft' ? -1 : 1), times, timeframeSeconds));
                    else if (event.key === 'Delete' && selectedLevel !== null) {
                        changeSettings({ levels: settings.levels.filter((_, index) => index !== selectedLevel) });
                        setSelectedLevel(null);
                    }
                    else if (event.key === 'Enter' && visible.end > visible.start) {
                        setSelection(times[visible.end - 1]);
                        if (settings.linked) onSelectTime?.(times[visible.end - 1]);
                        setInspectorOpen(true);
                    }
                    else return;
                    event.preventDefault();
                }}>
                <canvas ref={chartCanvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
                <canvas ref={cursorCanvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
            </div>
            <FootprintCandleInspector key={selection} bar={inspectorOpen ? selected : null}
                recordedSource={replayCursorMs !== undefined ? trueFlowSnapshot?.coverage.source : undefined} onClose={() => setInspectorOpen(false)} />
        </section>
    );
}
