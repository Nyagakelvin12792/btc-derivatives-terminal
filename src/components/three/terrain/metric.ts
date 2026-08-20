import type { TerrainDataContractV2, TerrainScale, TerrainSurfaceCell } from '@/lib/terrain/types';

export type TerrainMetric = 'gex' | 'vanna' | 'charm' | 'combined';

export interface MetricConfig {
    id: TerrainMetric;
    label: string;
    title: string;
    unit: string;
    scale: (data: TerrainDataContractV2) => TerrainScale;
    value: (cell: TerrainSurfaceCell) => number;
    intensity: (cell: TerrainSurfaceCell) => number;
    negativeLabel: string;
    positiveLabel: string;
    zeroLabel: string;
}

export const METRIC_CONFIGS: Record<Exclude<TerrainMetric, 'combined'>, MetricConfig> = {
    gex: {
        id: 'gex',
        label: 'GEX',
        title: 'GEX Exposure Surface',
        unit: 'USD hedge-notional change per 1% BTC move',
        scale: (data) => data.scales.gex,
        value: (cell) => cell.gexExposure,
        intensity: (cell) => cell.gexIntensity,
        negativeLabel: 'Negative GEX',
        positiveLabel: 'Positive GEX',
        zeroLabel: 'Zero gamma plane',
    },
    vanna: {
        id: 'vanna',
        label: 'VANNA',
        title: 'Vanna Exposure Surface',
        unit: 'USD hedge-notional change per 1 volatility-point IV move',
        scale: (data) => data.scales.vanna,
        value: (cell) => cell.vannaExposure,
        intensity: (cell) => cell.vannaIntensity,
        negativeLabel: 'Negative Vanna',
        positiveLabel: 'Positive Vanna',
        zeroLabel: 'Zero vanna plane',
    },
    charm: {
        id: 'charm',
        label: 'CHARM',
        title: 'Charm Exposure Surface',
        unit: 'USD hedge-notional delta drift per calendar day',
        scale: (data) => data.scales.charm,
        value: (cell) => cell.charmExposure,
        intensity: (cell) => cell.charmIntensity,
        negativeLabel: 'Negative Charm',
        positiveLabel: 'Positive Charm',
        zeroLabel: 'Zero charm plane',
    },
};

export function getMetricConfig(metric: TerrainMetric): MetricConfig {
    return metric === 'combined' ? METRIC_CONFIGS.gex : METRIC_CONFIGS[metric];
}
