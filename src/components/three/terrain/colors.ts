import * as THREE from 'three';
import type { TerrainMetric } from './metric';

export interface MetricPalette {
    negative: string;
    zero: string;
    positive: string;
}

export const METRIC_PALETTES: Record<Exclude<TerrainMetric, 'combined'>, MetricPalette> = {
    gex: {
        negative: '#ef4444',
        zero: '#111827',
        positive: '#22c55e',
    },
    vanna: {
        negative: '#4f46e5',
        zero: '#111827',
        positive: '#ec4899',
    },
    charm: {
        negative: '#c2410c',
        zero: '#111827',
        positive: '#f59e0b',
    },
};

export function colorForMetricValue(metric: Exclude<TerrainMetric, 'combined'>, value: number, bound: number): THREE.Color {
    const palette = METRIC_PALETTES[metric];
    const zero = new THREE.Color(palette.zero);
    const positive = new THREE.Color(palette.positive);
    const negative = new THREE.Color(palette.negative);
    if (!Number.isFinite(value) || !Number.isFinite(bound) || bound <= 0) return zero;
    const normalized = Math.max(-1, Math.min(1, value / bound));
    if (Math.abs(normalized) < 0.025) return zero;
    return normalized > 0
        ? zero.clone().lerp(positive, Math.sqrt(normalized))
        : zero.clone().lerp(negative, Math.sqrt(Math.abs(normalized)));
}
