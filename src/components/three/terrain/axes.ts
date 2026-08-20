export interface LinearMapper {
    min: number;
    max: number;
    size: number;
    toWorld: (value: number) => number;
    fromWorld: (world: number) => number;
    inRange: (value: number) => boolean;
}

export interface AxisTick {
    value: number;
    world: number;
}

const PREFERRED_DTE_TICKS = [1, 7, 14, 30, 60, 90, 180, 365, 730] as const;

export function createLinearMapper(values: readonly number[], size: number): LinearMapper {
    const finiteValues = values.filter(Number.isFinite);
    const min = finiteValues.length ? Math.min(...finiteValues) : 0;
    const max = finiteValues.length ? Math.max(...finiteValues) : min + 1;
    const safeMax = max === min ? min + 1 : max;
    return {
        min,
        max: safeMax,
        size,
        toWorld: (value: number) => {
            const ratio = (value - min) / (safeMax - min);
            return -size / 2 + ratio * size;
        },
        fromWorld: (world: number) => {
            const ratio = (world + size / 2) / size;
            return min + ratio * (safeMax - min);
        },
        inRange: (value: number) => value >= min && value <= safeMax,
    };
}

export function generateStrikeTicks(strikes: readonly number[], mapper: LinearMapper, targetCount = 8): AxisTick[] {
    const finite = sortedUnique(strikes);
    if (finite.length === 0) return [];
    if (finite.length <= targetCount) return finite.map((value) => ({ value, world: mapper.toWorld(value) }));
    const min = finite[0];
    const max = finite[finite.length - 1];
    const step = niceStrikeStep((max - min) / Math.max(1, targetCount - 1));
    const first = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let value = first; value <= max + step * 0.1; value += step) {
        if (value >= min && value <= max) ticks.push(value);
    }
    return thinTicks(ticks.length >= 4 ? ticks : sampleValues(finite, targetCount), targetCount)
        .map((value) => ({ value, world: mapper.toWorld(value) }));
}

export function generateDteTicks(dtes: readonly number[], mapper: LinearMapper, targetCount = 8): AxisTick[] {
    const finite = sortedUnique(dtes);
    if (finite.length === 0) return [];
    const preferred = PREFERRED_DTE_TICKS.filter((value) => value >= mapper.min && value <= mapper.max);
    const ticks = preferred.length >= 3 ? preferred : sampleValues(finite, targetCount);
    return thinTicks(ticks, targetCount).map((value) => ({ value, world: mapper.toWorld(value) }));
}

function sortedUnique(values: readonly number[]): number[] {
    return Array.from(new Set(values.filter(Number.isFinite))).sort((a, b) => a - b);
}

function sampleValues(values: readonly number[], targetCount: number): number[] {
    if (values.length <= targetCount) return [...values];
    const sampled: number[] = [];
    for (let i = 0; i < targetCount; i++) {
        const index = Math.round((i / (targetCount - 1)) * (values.length - 1));
        sampled.push(values[index]);
    }
    return Array.from(new Set(sampled));
}

function thinTicks(values: readonly number[], targetCount: number): number[] {
    if (values.length <= targetCount) return [...values];
    return sampleValues(values, targetCount);
}

function niceStrikeStep(rawStep: number): number {
    if (!Number.isFinite(rawStep) || rawStep <= 0) return 1000;
    const exponent = Math.floor(Math.log10(rawStep));
    const magnitude = 10 ** exponent;
    const normalized = rawStep / magnitude;
    const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return multiplier * magnitude;
}
