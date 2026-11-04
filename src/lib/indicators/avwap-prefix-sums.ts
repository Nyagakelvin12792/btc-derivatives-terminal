import type { LineData, UTCTimestamp } from 'lightweight-charts';
import type { DemoAvwapBands, DemoMarketBar } from '../ui/market-fixtures';

export interface AvwapPrefixSums {
    cumV: Float64Array;
    cumPV: Float64Array;
    cumP2V: Float64Array;
    times: UTCTimestamp[];
    length: number;
}

/**
 * Precomputes analytical prefix sums for typical price and volume in O(N).
 * Enables computing AVWAP and standard deviation bands from ANY anchor index in O(1) per bar.
 */
export function buildAvwapPrefixSums(bars: readonly DemoMarketBar[]): AvwapPrefixSums {
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
        const typical = (bar.high + bar.low + bar.close) / 3;
        const v = bar.volume;

        runningV += v;
        runningPV += typical * v;
        runningP2V += typical * typical * v;

        cumV[i] = runningV;
        cumPV[i] = runningPV;
        cumP2V[i] = runningP2V;
        times[i] = bar.time;
    }

    return { cumV, cumPV, cumP2V, times, length: len };
}

/**
 * Computes center AVWAP, +1σ upper band, and -1σ lower band in O(N - anchorIndex)
 * using the precomputed prefix sums table with zero inner-loop re-multiplications.
 */
export function computeAvwapFromPrefixSums(
    prefixSums: AvwapPrefixSums,
    anchorIndex: number,
    bars?: readonly DemoMarketBar[]
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
            const fallbackPrice = bars ? (bars[i].high + bars[i].low + bars[i].close) / 3 : 0;
            center[outIdx] = { time: t, value: fallbackPrice };
            upper[outIdx] = { time: t, value: fallbackPrice };
            lower[outIdx] = { time: t, value: fallbackPrice };
        } else {
            const mean = pv / v;
            const variance = Math.max(0, p2v / v - mean * mean);
            const deviation = Math.sqrt(variance);

            center[outIdx] = { time: t, value: mean };
            upper[outIdx] = { time: t, value: mean + deviation };
            lower[outIdx] = { time: t, value: mean - deviation };
        }
        outIdx++;
    }

    return { center, upper, lower };
}
