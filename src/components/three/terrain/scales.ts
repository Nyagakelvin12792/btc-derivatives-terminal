const NICE_STEPS = [1, 1.25, 1.5, 2, 2.5, 5, 10] as const;

export interface SymmetricAxisScale {
    bound: number;
    tickStep: number;
    ticks: number[];
}

export function niceCeil(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.floor(Math.log10(value));
    const magnitude = 10 ** exponent;
    const normalized = value / magnitude;
    const step = NICE_STEPS.find((candidate) => normalized <= candidate) ?? 10;
    return step * magnitude;
}

export function createSymmetricFinancialScale(robustAbsMax: number, targetTicks = 9): SymmetricAxisScale {
    const halfTickCount = Math.max(2, Math.floor((targetTicks - 1) / 2));
    const safeMax = Number.isFinite(robustAbsMax) && robustAbsMax > 0 ? robustAbsMax : 1;
    const tickStep = niceCeil(safeMax / halfTickCount);
    const bound = tickStep * halfTickCount;
    return {
        bound,
        tickStep,
        ticks: generateSymmetricTicks(bound, tickStep),
    };
}

export function generateSymmetricTicks(bound: number, tickStep: number): number[] {
    if (!Number.isFinite(bound) || !Number.isFinite(tickStep) || bound <= 0 || tickStep <= 0) return [0];
    const ticks: number[] = [];
    const stepsPerSide = Math.max(1, Math.round(bound / tickStep));
    for (let i = stepsPerSide; i >= -stepsPerSide; i--) {
        ticks.push(round(i * tickStep, 6));
    }
    return ticks;
}

export function clampForDisplay(value: number, bound: number): number {
    if (!Number.isFinite(value)) return 0;
    if (!Number.isFinite(bound) || bound <= 0) return value;
    return Math.max(-bound, Math.min(bound, value));
}

export function formatFinancialAxis(value: number): string {
    if (!Number.isFinite(value)) return 'N/A';
    if (Math.abs(value) < 0.000001) return '$0';
    const sign = value > 0 ? '+' : '-';
    const abs = Math.abs(value);
    const units = [
        { suffix: 'T', divisor: 1e12 },
        { suffix: 'B', divisor: 1e9 },
        { suffix: 'M', divisor: 1e6 },
        { suffix: 'K', divisor: 1e3 },
    ];
    const unit = units.find((candidate) => abs >= candidate.divisor);
    if (!unit) return `${sign}$${trimNumber(abs)}`;
    return `${sign}$${trimNumber(abs / unit.divisor)}${unit.suffix}`;
}

export function formatStrikeAxis(value: number): string {
    if (!Number.isFinite(value)) return 'N/A';
    if (Math.abs(value) >= 1000) return `$${trimNumber(value / 1000)}K`;
    return `$${trimNumber(value)}`;
}

function trimNumber(value: number): string {
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
