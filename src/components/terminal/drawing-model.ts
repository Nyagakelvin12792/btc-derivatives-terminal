import type { ChartTool } from './types';

/**
 * Pure drawing model for the Market Structure chart.
 *
 * Every drawing is persisted with semantic time (UTC seconds) and price
 * anchors only. Pixel coordinates are derived on demand through a
 * `ChartProjector`, so drawings stay attached through pan, zoom, resize,
 * timeframe changes, history loading, and lower-pane collapse/expand.
 */

export type DrawingType = Exclude<ChartTool, 'cursor'>;
export type PositionDrawingType = 'long-position' | 'short-position';
export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
    time: number;
    price: number;
}

export interface FibonacciLevelSetting {
    value: number;
    enabled: boolean;
    color: string;
}

export interface FibonacciSettings {
    levels: FibonacciLevelSetting[];
    opacity: number;
    lineStyle: DrawingLineStyle;
    showLabels: boolean;
    showPrices: boolean;
    reverse: boolean;
    extendLeft: boolean;
    extendRight: boolean;
}

export interface PositionPrices {
    entry: number;
    stop: number;
    target: number;
}

export interface DrawingObject {
    id: string;
    type: DrawingType;
    points: DrawingPoint[];
    locked: boolean;
    hidden: boolean;
    fibonacci?: FibonacciSettings;
    position?: PositionPrices;
}

export const PREVIEW_DRAWING_ID = 'drawing-preview';
export const DEFAULT_FIBONACCI_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const FIBONACCI_EXTENSION_RATIOS = [1.272, 1.618] as const;
export const POSITION_DEFAULT_STOP_PERCENT = 1;
export const POSITION_DEFAULT_TARGET_PERCENT = 2;
export const POSITION_DEFAULT_EXTENT_BARS = 24;
export const HISTORY_LIMIT = 100;

const FIB_COLORS: Record<string, string> = {
    '0': '#9aa7b8',
    '0.236': '#ef6277',
    '0.382': '#f2a43a',
    '0.5': '#4fd1a5',
    '0.618': '#31c5a0',
    '0.786': '#49c1ff',
    '1': '#9aa7b8',
    '1.272': '#b58cff',
    '1.618': '#f07ad8',
};

export function fibonacciColor(value: number): string {
    return FIB_COLORS[String(value)] ?? '#8ddcff';
}

export function createDefaultFibonacciSettings(): FibonacciSettings {
    return {
        levels: [
            ...DEFAULT_FIBONACCI_RATIOS.map((value) => ({ value, enabled: true, color: fibonacciColor(value) })),
            ...FIBONACCI_EXTENSION_RATIOS.map((value) => ({ value, enabled: false, color: fibonacciColor(value) })),
        ],
        opacity: 0.85,
        lineStyle: 'solid',
        showLabels: true,
        showPrices: true,
        reverse: false,
        extendLeft: false,
        extendRight: false,
    };
}

export function isPositionType(type: DrawingType): type is PositionDrawingType {
    return type === 'long-position' || type === 'short-position';
}

export function positionSide(type: PositionDrawingType): 'long' | 'short' {
    return type === 'long-position' ? 'long' : 'short';
}

export function isOneClickTool(tool: DrawingType): boolean {
    return tool === 'horizontal' || tool === 'vertical' || tool === 'text' || isPositionType(tool);
}

export function drawingLabel(type: DrawingType): string {
    switch (type) {
        case 'trendline': return 'Trend line';
        case 'horizontal': return 'Horizontal line';
        case 'vertical': return 'Vertical line';
        case 'rectangle': return 'Rectangle';
        case 'fibonacci': return 'Fibonacci retracement';
        case 'long-position': return 'Long position';
        case 'short-position': return 'Short position';
        case 'text': return 'Text note';
    }
}

/**
 * Creates a Long/Short planning object with default distances.
 * The default geometry is always valid for its side; later edits are never
 * silently re-ordered, so invalid geometry is surfaced by the risk engine.
 */
export function createPositionDrawing(
    id: string,
    type: PositionDrawingType,
    entryPoint: DrawingPoint,
    rightTime: number,
): DrawingObject {
    const entry = entryPoint.price;
    const stopOffset = entry * (POSITION_DEFAULT_STOP_PERCENT / 100);
    const targetOffset = entry * (POSITION_DEFAULT_TARGET_PERCENT / 100);
    const long = type === 'long-position';
    return {
        id,
        type,
        points: [
            { time: entryPoint.time, price: entry },
            { time: Math.max(rightTime, entryPoint.time + 1), price: entry },
        ],
        locked: false,
        hidden: false,
        position: {
            entry,
            stop: long ? entry - stopOffset : entry + stopOffset,
            target: long ? entry + targetOffset : entry - targetOffset,
        },
    };
}

export function createDrawing(id: string, type: DrawingType, points: DrawingPoint[]): DrawingObject {
    return {
        id,
        type,
        points: points.map((point) => ({ ...point })),
        locked: false,
        hidden: false,
        ...(type === 'fibonacci' ? { fibonacci: createDefaultFibonacciSettings() } : {}),
    };
}

export function cloneDrawing(drawing: DrawingObject): DrawingObject {
    return {
        ...drawing,
        points: drawing.points.map((point) => ({ ...point })),
        ...(drawing.fibonacci ? { fibonacci: { ...drawing.fibonacci, levels: drawing.fibonacci.levels.map((level) => ({ ...level })) } } : {}),
        ...(drawing.position ? { position: { ...drawing.position } } : {}),
    };
}

export interface FibonacciLevelPrice {
    value: number;
    price: number;
    color: string;
}

/**
 * Linear Fibonacci levels between two anchors. Level `0` sits on the second
 * anchor and level `1` on the first anchor; `reverse` swaps that orientation.
 */
export function fibonacciLevelPrices(points: DrawingPoint[], settings: FibonacciSettings): FibonacciLevelPrice[] {
    const [first, second = first] = points;
    if (!first) return [];
    const start = settings.reverse ? second.price : first.price;
    const end = settings.reverse ? first.price : second.price;
    return settings.levels
        .filter((level) => level.enabled && Number.isFinite(level.value))
        .map((level) => ({ value: level.value, price: end + (start - end) * level.value, color: level.color }))
        .sort((left, right) => left.value - right.value);
}

export function parseFibonacciLevels(text: string): number[] | null {
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return null;
    const values = parts.map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < -10 || value > 10)) return null;
    return Array.from(new Set(values)).sort((left, right) => left - right);
}

/* ----------------------------------------------------------------------- */
/* Projection                                                              */
/* ----------------------------------------------------------------------- */

export interface ChartProjector {
    timeToX: (time: number) => number | null;
    priceToY: (price: number) => number | null;
    width: number;
    height: number;
}

/**
 * Maps a UTC time to a fractional logical bar index. Times inside the loaded
 * series are interpolated; times outside are extrapolated with the bar
 * interval so anchors survive timeframe changes and history loading.
 */
export function timeToLogicalIndex(barTimes: readonly number[], time: number, fallbackIntervalSeconds: number): number | null {
    if (!barTimes.length || !Number.isFinite(time)) return null;
    const lastIndex = barTimes.length - 1;
    const interval = barTimes.length > 1
        ? Math.max(1, (barTimes[lastIndex] - barTimes[0]) / lastIndex)
        : Math.max(1, fallbackIntervalSeconds);
    if (time <= barTimes[0]) return (time - barTimes[0]) / interval;
    if (time >= barTimes[lastIndex]) return lastIndex + (time - barTimes[lastIndex]) / interval;
    let low = 0;
    let high = lastIndex;
    while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (barTimes[middle] <= time) low = middle;
        else high = middle;
    }
    const span = barTimes[high] - barTimes[low];
    return span > 0 ? low + (time - barTimes[low]) / span : low;
}

export interface ProjectedPoint {
    x: number;
    y: number;
}

export interface DrawingView {
    drawing: DrawingObject;
    preview: boolean;
    points: ProjectedPoint[];
    fibonacci?: {
        leftX: number;
        rightX: number;
        levels: Array<FibonacciLevelPrice & { y: number }>;
    };
    position?: {
        leftX: number;
        rightX: number;
        entryY: number;
        stopY: number;
        targetY: number;
    };
}

export function projectDrawing(drawing: DrawingObject, projector: ChartProjector, preview = false): DrawingView | null {
    const points: ProjectedPoint[] = [];
    for (const point of drawing.points) {
        const y = projector.priceToY(point.price);
        const x = drawing.type === 'horizontal' ? 0 : projector.timeToX(point.time);
        if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        points.push({ x, y });
    }
    if (!points.length) return null;
    const view: DrawingView = { drawing, preview, points };

    if (drawing.type === 'fibonacci' && drawing.fibonacci) {
        const settings = drawing.fibonacci;
        const xs = points.map((point) => point.x);
        const levels = fibonacciLevelPrices(drawing.points, settings).flatMap((level) => {
            const y = projector.priceToY(level.price);
            return y === null || !Number.isFinite(y) ? [] : [{ ...level, y }];
        });
        view.fibonacci = {
            leftX: settings.extendLeft ? 0 : Math.min(...xs),
            rightX: settings.extendRight ? projector.width : Math.max(...xs),
            levels,
        };
    }

    if (isPositionType(drawing.type) && drawing.position) {
        const entryY = projector.priceToY(drawing.position.entry);
        const stopY = projector.priceToY(drawing.position.stop);
        const targetY = projector.priceToY(drawing.position.target);
        if (entryY === null || stopY === null || targetY === null) return null;
        if (![entryY, stopY, targetY].every(Number.isFinite)) return null;
        const xs = points.map((point) => point.x);
        view.position = { leftX: Math.min(...xs), rightX: Math.max(...xs), entryY, stopY, targetY };
    }
    return view;
}

/* ----------------------------------------------------------------------- */
/* Drag / edit operations                                                  */
/* ----------------------------------------------------------------------- */

export type PositionLine = 'entry' | 'stop' | 'target';

export type DrawingDragTarget =
    | { kind: 'body' }
    | { kind: 'anchor'; pointIndex: number }
    | { kind: 'position-line'; line: PositionLine }
    | { kind: 'position-extent' };

export function dragTargetMode(target: DrawingDragTarget): 'moving' | 'resizing' {
    return target.kind === 'body' ? 'moving' : 'resizing';
}

export interface DragDelta {
    current: DrawingPoint;
    priceDelta: number;
    /** Shifts a stored anchor time by the dragged number of bars. */
    shiftTime: (time: number) => number;
}

/**
 * Applies a drag gesture to the original (pre-drag) drawing. Locked
 * drawings are returned unchanged. Position lines move independently and are
 * never re-ordered, so crossing lines produces an explicit invalid state.
 */
export function applyDrawingDrag(original: DrawingObject, target: DrawingDragTarget, delta: DragDelta): DrawingObject {
    if (original.locked) return original;
    const next = cloneDrawing(original);
    if (target.kind === 'body') {
        next.points = original.points.map((point) => ({ time: delta.shiftTime(point.time), price: point.price + delta.priceDelta }));
        if (original.position) {
            next.position = {
                entry: original.position.entry + delta.priceDelta,
                stop: original.position.stop + delta.priceDelta,
                target: original.position.target + delta.priceDelta,
            };
        }
        return next;
    }
    if (target.kind === 'anchor') {
        next.points = original.points.map((point, index) => index === target.pointIndex ? { ...delta.current } : { ...point });
        return next;
    }
    if (target.kind === 'position-line' && original.position) {
        const price = delta.current.price;
        next.position = { ...original.position, [target.line]: price };
        if (target.line === 'entry') next.points = original.points.map((point) => ({ ...point, price }));
        return next;
    }
    if (target.kind === 'position-extent' && original.points.length >= 2) {
        next.points = [{ ...original.points[0] }, { ...original.points[1], time: delta.current.time }];
        return next;
    }
    return next;
}

export function nudgeDrawing(drawing: DrawingObject, priceDelta: number, shiftTime: (time: number) => number): DrawingObject {
    return applyDrawingDrag(drawing, { kind: 'body' }, { current: drawing.points[0], priceDelta, shiftTime });
}

export function drawingsEqual(left: readonly DrawingObject[], right: readonly DrawingObject[]): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

/* ----------------------------------------------------------------------- */
/* History                                                                 */
/* ----------------------------------------------------------------------- */

export interface DrawingHistory {
    past: DrawingObject[][];
    future: DrawingObject[][];
}

export const EMPTY_HISTORY: DrawingHistory = { past: [], future: [] };

export function pushHistory(history: DrawingHistory, snapshot: DrawingObject[]): DrawingHistory {
    return { past: [...history.past, snapshot].slice(-HISTORY_LIMIT), future: [] };
}

export function undoHistory(history: DrawingHistory, current: DrawingObject[]): { history: DrawingHistory; drawings: DrawingObject[] } | null {
    const previous = history.past.at(-1);
    if (!previous) return null;
    return {
        history: { past: history.past.slice(0, -1), future: [current, ...history.future].slice(0, HISTORY_LIMIT) },
        drawings: previous,
    };
}

export function redoHistory(history: DrawingHistory, current: DrawingObject[]): { history: DrawingHistory; drawings: DrawingObject[] } | null {
    const next = history.future[0];
    if (!next) return null;
    return {
        history: { past: [...history.past, current].slice(-HISTORY_LIMIT), future: history.future.slice(1) },
        drawings: next,
    };
}

/* ----------------------------------------------------------------------- */
/* Interaction state                                                       */
/* ----------------------------------------------------------------------- */

export type DrawingInteractionState =
    | 'idle'
    | 'armed'
    | 'creating'
    | 'selected'
    | 'moving'
    | 'resizing'
    | 'locked'
    | 'hidden';

export function deriveInteractionState(input: {
    activeTool: ChartTool;
    hasDraft: boolean;
    dragMode: 'moving' | 'resizing' | null;
    selected: DrawingObject | null;
}): DrawingInteractionState {
    if (input.hasDraft) return 'creating';
    if (input.activeTool !== 'cursor') return 'armed';
    if (input.dragMode) return input.dragMode;
    if (!input.selected) return 'idle';
    if (input.selected.hidden) return 'hidden';
    if (input.selected.locked) return 'locked';
    return 'selected';
}

/* ----------------------------------------------------------------------- */
/* Persistence                                                             */
/* ----------------------------------------------------------------------- */

const DRAWING_TYPES: readonly DrawingType[] = [
    'trendline', 'horizontal', 'vertical', 'rectangle', 'fibonacci', 'long-position', 'short-position', 'text',
];

function isFinitePoint(value: unknown): value is DrawingPoint {
    if (!value || typeof value !== 'object') return false;
    const point = value as Record<string, unknown>;
    return typeof point.time === 'number' && Number.isFinite(point.time) && typeof point.price === 'number' && Number.isFinite(point.price);
}

/** Drops malformed persisted drawings instead of rendering partial objects. */
export function sanitizePersistedDrawings(value: unknown): DrawingObject[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate): DrawingObject[] => {
        if (!candidate || typeof candidate !== 'object') return [];
        const raw = candidate as Record<string, unknown>;
        if (typeof raw.id !== 'string' || !DRAWING_TYPES.includes(raw.type as DrawingType)) return [];
        if (!Array.isArray(raw.points) || !raw.points.length || !raw.points.every(isFinitePoint)) return [];
        const type = raw.type as DrawingType;
        const drawing: DrawingObject = {
            id: raw.id,
            type,
            points: (raw.points as DrawingPoint[]).map((point) => ({ time: point.time, price: point.price })),
            locked: raw.locked === true,
            hidden: raw.hidden === true,
        };
        if (type === 'fibonacci') {
            const defaults = createDefaultFibonacciSettings();
            const settings = raw.fibonacci as Partial<FibonacciSettings> | undefined;
            const levels = Array.isArray(settings?.levels)
                ? settings.levels.filter((level) => level && typeof level.value === 'number' && Number.isFinite(level.value))
                    .map((level) => ({ value: level.value, enabled: level.enabled !== false, color: typeof level.color === 'string' ? level.color : fibonacciColor(level.value) }))
                : defaults.levels;
            drawing.fibonacci = { ...defaults, ...settings, levels: levels.length ? levels : defaults.levels };
        }
        if (isPositionType(type)) {
            const position = raw.position as Partial<PositionPrices> | undefined;
            if (!position || ![position.entry, position.stop, position.target].every((price) => typeof price === 'number' && Number.isFinite(price))) return [];
            if (drawing.points.length < 2) return [];
            drawing.position = { entry: position.entry as number, stop: position.stop as number, target: position.target as number };
        }
        return [drawing];
    });
}
