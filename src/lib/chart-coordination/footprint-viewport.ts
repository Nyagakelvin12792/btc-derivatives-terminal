export interface FootprintTimeRange {
    from: number;
    to: number;
}

export interface FootprintPriceRange {
    min: number;
    max: number;
}

const DAY_SECONDS = 86_400;
const TIME_TICK_STEPS = [
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600, 7_200,
    14_400, 21_600, 43_200, DAY_SECONDS, 2 * DAY_SECONDS, 7 * DAY_SECONDS,
    14 * DAY_SECONDS, 28 * DAY_SECONDS,
];

function validTimeRange({ from, to }: FootprintTimeRange): boolean {
    return Number.isFinite(from) && Number.isFinite(to - from) && to > from;
}

function validPriceRange({ min, max }: FootprintPriceRange): boolean {
    return Number.isFinite(min) && Number.isFinite(max - min) && max > min;
}

function positiveOr(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** UTC seconds, including the full interval of the most recent candle. */
export function fitFootprintTime(
    times: readonly number[],
    interval: number,
    count = times.length,
): FootprintTimeRange {
    const duration = positiveOr(interval, 1);
    if (times.length === 0) return { from: 0, to: duration };
    const fittedCount = Math.min(times.length, Math.max(1, Math.floor(positiveOr(count, times.length))));
    return { from: times[times.length - fittedCount], to: times[times.length - 1] + duration };
}

/** Retains the requested span when panning, shrinking it only at data and zoom limits. */
export function clampFootprintTime(
    range: FootprintTimeRange,
    times: readonly number[],
    interval: number,
): FootprintTimeRange {
    if (times.length === 0) return validTimeRange(range) ? range : fitFootprintTime(times, interval);
    const bounds = fitFootprintTime(times, interval);
    if (!validTimeRange(range)) return bounds;
    const width = Math.min(bounds.to - bounds.from, Math.max(positiveOr(interval, 1), range.to - range.from));
    const from = Math.min(bounds.to - width, Math.max(bounds.from, range.from));
    return { from, to: from + width };
}

export function panFootprintTime(
    range: FootprintTimeRange,
    deltaSeconds: number,
    times: readonly number[],
    interval: number,
): FootprintTimeRange {
    const delta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    return clampFootprintTime({ from: range.from + delta, to: range.to + delta }, times, interval);
}

/** Factors below one zoom in. The cursor's data coordinate stays fixed unless data bounds intervene. */
export function zoomFootprintTime(
    range: FootprintTimeRange,
    factor: number,
    anchorSeconds: number,
    times: readonly number[],
    interval: number,
): FootprintTimeRange {
    const source = validTimeRange(range) ? range : fitFootprintTime(times, interval);
    const minimumSpan = positiveOr(interval, 1);
    const currentSpan = source.to - source.from;
    const bounds = times.length > 0 ? fitFootprintTime(times, interval) : null;
    const maxSpan = bounds ? bounds.to - bounds.from : Infinity;
    const span = Math.min(maxSpan, Math.max(minimumSpan, currentSpan * positiveOr(factor, 1)));
    const fraction = anchorFraction(source.from, source.to, anchorSeconds);
    const from = source.from + (currentSpan - span) * fraction;
    return clampFootprintTime({ from, to: from + span }, times, interval);
}

function anchorFraction(min: number, max: number, value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
}

function findBoundary(times: readonly number[], target: number, includeEqual: boolean): number {
    let start = 0;
    let end = times.length;
    while (start < end) {
        const middle = Math.floor((start + end) / 2);
        if (times[middle] < target || (includeEqual && times[middle] === target)) start = middle + 1;
        else end = middle;
    }
    return start;
}

/** A half-open index slice. A candle crossing either visible edge stays in the slice. */
export function visibleFootprintIndices(
    times: readonly number[],
    range: FootprintTimeRange,
    interval: number,
): { start: number; end: number } {
    if (!validTimeRange(range)) return { start: 0, end: 0 };
    return {
        start: findBoundary(times, range.from - positiveOr(interval, 1), true),
        end: findBoundary(times, range.to, false),
    };
}

/** Resolve a linked timestamp to the containing candle without jumping across a data gap. */
export function findFootprintCandleIndex(times: readonly number[], time: number, interval: number): number {
    if (!Number.isFinite(time)) return -1;
    const index = findBoundary(times, time, true) - 1;
    return index >= 0 && time < times[index] + positiveOr(interval, 1) ? index : -1;
}

export function footprintTimeTicks(range: FootprintTimeRange, maxTicks: number): number[] {
    if (!validTimeRange(range)) return [];
    const count = Math.max(1, Math.floor(positiveOr(maxTicks, 1)));
    const requiredStep = (range.to - range.from) / count;
    const step = TIME_TICK_STEPS.find((value) => value >= requiredStep)
        ?? Math.ceil(requiredStep / (7 * DAY_SECONDS)) * 7 * DAY_SECONDS;
    // Weeks begin Monday UTC. Intraday and daily intervals are anchored at UTC midnight.
    const anchor = step >= 7 * DAY_SECONDS ? 4 * DAY_SECONDS : 0;
    const first = Math.ceil((range.from - anchor) / step);
    const ticks: number[] = [];
    for (let offset = 0; offset < count; offset += 1) {
        const tick = anchor + (first + offset) * step;
        if (tick >= range.to) break;
        ticks.push(tick);
    }
    return ticks;
}

export function formatFootprintTimeTick(time: number, range: FootprintTimeRange): string {
    const date = new Date(time * 1_000);
    if (!Number.isFinite(date.getTime())) return '';
    const iso = date.toISOString();
    if (range.to - range.from >= 7 * DAY_SECONDS) return iso.slice(5, 10);
    if (time % DAY_SECONDS === 0) return iso.slice(5, 10);
    return iso.slice(11, range.to - range.from < 600 ? 19 : 16);
}

/** Fit only visible candle geometry. Independent scaling excludes external market overlays. */
export function fitFootprintPrice(
    candles: readonly { low: number; high: number }[],
    minimumSpan = 1,
): FootprintPriceRange {
    let low = Infinity;
    let high = -Infinity;
    for (const candle of candles) {
        if (!Number.isFinite(candle.low) || !Number.isFinite(candle.high) || candle.high < candle.low) continue;
        low = Math.min(low, candle.low);
        high = Math.max(high, candle.high);
    }
    if (!Number.isFinite(high - low)) return { min: 0, max: 100 };
    const span = Math.max(positiveOr(minimumSpan, 1), (high - low) * 1.16);
    const min = low - (span - (high - low)) / 2;
    return { min, max: min + span };
}

export function panFootprintPrice(range: FootprintPriceRange, delta: number): FootprintPriceRange {
    if (!validPriceRange(range) || !Number.isFinite(delta)) return range;
    const panned = { min: range.min + delta, max: range.max + delta };
    return validPriceRange(panned) ? panned : range;
}

export function zoomFootprintPrice(
    range: FootprintPriceRange,
    factor: number,
    anchor: number,
    minimumSpan = 0.01,
): FootprintPriceRange {
    if (!validPriceRange(range)) return range;
    const currentSpan = range.max - range.min;
    const span = Math.max(positiveOr(minimumSpan, 0.01), currentSpan * positiveOr(factor, 1));
    const min = range.min + (currentSpan - span) * anchorFraction(range.min, range.max, anchor);
    const zoomed = { min, max: min + span };
    return validPriceRange(zoomed) ? zoomed : range;
}

/** Decimal-friendly adaptive ticks, with optional alignment to an instrument's minimum increment. */
export function footprintPriceTicks(range: FootprintPriceRange, maxTicks: number, tickSize?: number): number[] {
    if (!validPriceRange(range)) return [];
    const count = Math.max(1, Math.floor(positiveOr(maxTicks, 1)));
    const increment = positiveOr(tickSize ?? 0, 1);
    const rawStep = (range.max - range.min) / Math.max(1, count - 1) / increment;
    if (!Number.isFinite(rawStep) || rawStep <= 0) return [];
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const multiplier = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rawStep * (1 - 1e-10)) ?? 10;
    const step = tickSize && tickSize > 0
        ? Math.ceil(multiplier * magnitude) * increment
        : multiplier * magnitude;
    if (!Number.isFinite(step) || step <= 0) return [];
    const first = Math.ceil(range.min / step - 1e-9);
    const ticks: number[] = [];
    for (let offset = 0; offset < count; offset += 1) {
        const tick = (first + offset) * step;
        if (tick > range.max + step * 1e-9) break;
        ticks.push(Number(tick.toPrecision(15)));
    }
    return ticks;
}
