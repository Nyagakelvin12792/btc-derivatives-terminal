import type { TerrainSurfaceCell } from '@/lib/terrain/types';
import type { MetricConfig } from './metric';

export interface RenderSample {
    strike: number;
    dte: number;
    value: number;
    sourceCell: TerrainSurfaceCell;
}

export interface RenderGrid {
    samples: RenderSample[][];
    strikeSamples: number[];
    dteSamples: number[];
}

export function buildInterpolatedRenderGrid(
    surfaceGrid: readonly TerrainSurfaceCell[][],
    metric: MetricConfig,
    strikeSampleCount: number,
    dteSampleCount: number
): RenderGrid {
    const rows = surfaceGrid.length;
    const columns = surfaceGrid[0]?.length ?? 0;
    if (rows === 0 || columns === 0) {
        return { samples: [], strikeSamples: [], dteSamples: [] };
    }

    const strikeAxis = surfaceGrid[0].map((cell) => cell.strike);
    const dteAxis = surfaceGrid.map((row) => row[0]?.dte ?? 0);
    const strikeSamples = sampleDomain(strikeAxis, Math.max(2, strikeSampleCount));
    const dteSamples = sampleDomain(dteAxis, Math.max(2, dteSampleCount));

    return {
        strikeSamples,
        dteSamples,
        samples: dteSamples.map((dte) => strikeSamples.map((strike) => {
            const value = interpolateCellValue(surfaceGrid, strikeAxis, dteAxis, strike, dte, metric);
            return {
                strike,
                dte,
                value,
                sourceCell: nearestCell(surfaceGrid, strikeAxis, dteAxis, strike, dte),
            };
        })),
    };
}

export function interpolateCellValue(
    surfaceGrid: readonly TerrainSurfaceCell[][],
    strikeAxis: readonly number[],
    dteAxis: readonly number[],
    strike: number,
    dte: number,
    metric: MetricConfig
): number {
    const x = bracketAxis(strikeAxis, strike);
    const z = bracketAxis(dteAxis, dte);
    const q11 = metric.value(surfaceGrid[z.lower]?.[x.lower] ?? surfaceGrid[0][0]);
    const q21 = metric.value(surfaceGrid[z.lower]?.[x.upper] ?? surfaceGrid[0][0]);
    const q12 = metric.value(surfaceGrid[z.upper]?.[x.lower] ?? surfaceGrid[0][0]);
    const q22 = metric.value(surfaceGrid[z.upper]?.[x.upper] ?? surfaceGrid[0][0]);
    const top = q11 + (q21 - q11) * x.weight;
    const bottom = q12 + (q22 - q12) * x.weight;
    return top + (bottom - top) * z.weight;
}

export function nearestCell(
    surfaceGrid: readonly TerrainSurfaceCell[][],
    strikeAxis: readonly number[],
    dteAxis: readonly number[],
    strike: number,
    dte: number
): TerrainSurfaceCell {
    const strikeIndex = nearestIndex(strikeAxis, strike);
    const dteIndex = nearestIndex(dteAxis, dte);
    return surfaceGrid[dteIndex]?.[strikeIndex] ?? surfaceGrid[0][0];
}

function sampleDomain(axis: readonly number[], count: number): number[] {
    if (axis.length === 0) return [];
    if (axis.length === 1) return [axis[0]];
    const min = axis[0];
    const max = axis[axis.length - 1];
    return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function bracketAxis(axis: readonly number[], value: number): { lower: number; upper: number; weight: number } {
    if (axis.length <= 1) return { lower: 0, upper: 0, weight: 0 };
    if (value <= axis[0]) return { lower: 0, upper: 0, weight: 0 };
    const lastIndex = axis.length - 1;
    if (value >= axis[lastIndex]) return { lower: lastIndex, upper: lastIndex, weight: 0 };

    for (let i = 0; i < lastIndex; i++) {
        const lowerValue = axis[i];
        const upperValue = axis[i + 1];
        if (value >= lowerValue && value <= upperValue) {
            return {
                lower: i,
                upper: i + 1,
                weight: (value - lowerValue) / (upperValue - lowerValue),
            };
        }
    }

    return { lower: lastIndex, upper: lastIndex, weight: 0 };
}

function nearestIndex(axis: readonly number[], value: number): number {
    if (axis.length === 0) return 0;
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < axis.length; i++) {
        const distance = Math.abs(axis[i] - value);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }
    return bestIndex;
}
