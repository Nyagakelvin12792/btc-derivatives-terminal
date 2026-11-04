import type { LineData, UTCTimestamp } from 'lightweight-charts';
import type { DemoAvwapBands, DemoMarketBar } from '../ui/market-fixtures';
import { getBarPriceBySource, type AvwapPriceSource } from './avwap-settings';

export interface AvwapPrefixSums {
    cumV: Float64Array;
    cumPV: Float64Array;
    cumP2V: Float64Array;
    times: UTCTimestamp[];
    length: number;
    priceSource: AvwapPriceSource;
}

/**
 * Precomputes analytical prefix sums for price and volume in O(N).
 * Enables computing AVWAP and standard deviation bands from ANY anchor index in O(1) per bar.
 */
export function buildAvwapPrefixSums(
    bars: readonly DemoMarketBar[],
    priceSource: AvwapPriceSource = 'HLC3'
): AvwapPrefixSums {
    const len = bars.length;
    const cumV = new Float64Array(len);
    const cumPV = new Float64Array(len);
    const cumP2V = new Float64Array(len);
    const times: UTCTimestamp[] = new Array(len);

    let runningV = 0;
    let runningPV = 0;
    let runningP2V = 0;

    for (let i = 0; i < len; i++) {
        const bar = bars[i];
        const price = getBarPriceBySource(bar, priceSource);
        const v = bar.volume;

        runningV += v;
        runningPV += price * v;
        runningP2V += price * price * v;

        cumV[i] = runningV;
        cumPV[i] = runningPV;
        cumP2V[i] = runningP2V;
        times[i] = bar.time;
    }

    return { cumV, cumPV, cumP2V, times, length: len, priceSource };
}

/**
 * Computes center AVWAP and standard deviation or percentage bands in O(N - anchorIndex)
 * using the precomputed prefix sums table with zero inner-loop re-multiplications.
 */
export function computeAvwapFromPrefixSums(
    prefixSums: AvwapPrefixSums,
    anchorIndex: number,
    bars?: readonly DemoMarketBar[],
    bandMultiplier = 1.0,
    bandMode: 'STD_DEV' | 'PERCENTAGE' = 'STD_DEV'
): DemoAvwapBands {
    const len = prefixSums.length;
    if (len === 0) {
        return { center: [], upper: [], lower: [] };
    }

    const safeAnchor = Math.max(0, Math.min(len - 1, anchorIndex));
    const count = len - safeAnchor;

    const center: LineData<UTCTimestamp>[] = new Array(count);
    const upper: LineData<UTCTimestamp>[] = new Array(count);
    const lower: LineData<UTCTimestamp>[] = new Array(count);

    const baseV = safeAnchor > 0 ? prefixSums.cumV[safeAnchor - 1] : 0;
    const basePV = safeAnchor > 0 ? prefixSums.cumPV[safeAnchor - 1] : 0;
    const baseP2V = safeAnchor > 0 ? prefixSums.cumP2V[safeAnchor - 1] : 0;

    let outIdx = 0;
    for (let i = safeAnchor; i < len; i++) {
        const t = prefixSums.times[i];
        const v = prefixSums.cumV[i] - baseV;
        const pv = prefixSums.cumPV[i] - basePV;
        const p2v = prefixSums.cumP2V[i] - baseP2V;

        if (v <= 0) {
            const fallbackPrice = bars ? getBarPriceBySource(bars[i], prefixSums.priceSource) : 0;
            center[outIdx] = { time: t, value: fallbackPrice };
            upper[outIdx] = { time: t, value: fallbackPrice };
            lower[outIdx] = { time: t, value: fallbackPrice };
        } else {
            const mean = pv / v;
            let deviation: number;
            if (bandMode === 'PERCENTAGE') {
                deviation = mean * (bandMultiplier / 100);
            } else {
                const variance = Math.max(0, p2v / v - mean * mean);
                deviation = Math.sqrt(variance) * bandMultiplier;
            }

            center[outIdx] = { time: t, value: mean };
            upper[outIdx] = { time: t, value: mean + deviation };
            lower[outIdx] = { time: t, value: mean - deviation };
        }
        outIdx++;
    }

    return { center, upper, lower };
}
