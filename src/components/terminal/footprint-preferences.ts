import type { TrueFlowInterval } from '../../lib/orderflow/true-flow-contracts';
import type { ChartSplitLayoutMode, FootprintPresetId } from '../../lib/ui/design-tokens';
import type { FootprintDisplayMode, FootprintStat } from './footprint-workspace-renderer';

export const FOOTPRINT_INTERVALS: Record<TrueFlowInterval, number> = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400,
};

export const FOOTPRINT_MODES = {
    BID_ASK: 'Bid × Ask', DELTA: 'Delta', VOLUME: 'Volume',
    DELTA_PROFILE: 'Delta Profile', VOLUME_PROFILE: 'Volume Profile', HEATMAP: 'Volume Heatmap',
} satisfies Record<FootprintDisplayMode, string>;

export const FOOTPRINT_PRESET_MODES: Record<FootprintPresetId, FootprintDisplayMode> = {
    CLEAN_FOOTPRINT: 'VOLUME_PROFILE',
    BID_ASK: 'BID_ASK',
    DELTA_IMBALANCE: 'DELTA_PROFILE',
    VOLUME_POC: 'VOLUME_PROFILE',
    ABSORPTION_ANALYSIS: 'HEATMAP',
    DETAILED_RESEARCH: 'BID_ASK',
};

export function isFootprintDisplayMode(value: unknown): value is FootprintDisplayMode {
    return typeof value === 'string' && Object.hasOwn(FOOTPRINT_MODES, value);
}

export const FOOTPRINT_STATS: readonly FootprintStat[] = [
    'ASK', 'BID', 'DELTA', 'DELTA_PCT', 'VOLUME', 'TRADES', 'POC', 'MAX_DELTA', 'MIN_DELTA', 'CVD',
];

export const DEFAULT_FOOTPRINT_LAYOUT: ChartSplitLayoutMode = 'MODE_C_DUAL_SYNC_CVD';

export function readFootprintPreference(key: string): unknown {
    try {
        return JSON.parse(window.localStorage.getItem(`btc-terminal.footprint.${key}`) ?? 'null') as unknown;
    } catch {
        return null;
    }
}

export function writeFootprintPreference(key: string, value: unknown) {
    try {
        window.localStorage.setItem(`btc-terminal.footprint.${key}`, JSON.stringify(value));
    } catch {
        // The workspace still functions with storage disabled.
    }
}

export function isFootprintInterval(value: unknown): value is TrueFlowInterval {
    return typeof value === 'string' && Object.hasOwn(FOOTPRINT_INTERVALS, value);
}

export function isFootprintLayout(value: unknown): value is ChartSplitLayoutMode {
    return value === 'MODE_A_CANDLE_ONLY' || value === 'MODE_B_CANDLE_AND_FOOTPRINT' || value === 'MODE_C_DUAL_SYNC_CVD';
}
