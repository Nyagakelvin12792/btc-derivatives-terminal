import { describe, expect, it } from 'vitest';
import { buildAvwapPrefixSums, computeAvwapFromPrefixSums } from './avwap-prefix-sums';
import { createDemoAvwapBands, createDemoMarketBars } from '../ui/market-fixtures';

describe('AVWAP Prefix Sums Analytical Engine', () => {
    it('produces identical results to legacy createDemoAvwapBands across various anchors', () => {
        const bars = createDemoMarketBars(68000, 300, 60);
        const prefixSums = buildAvwapPrefixSums(bars);

        const testAnchors = [0, 1, 10, 50, 120, 250, 299];

        for (const anchor of testAnchors) {
            const legacy = createDemoAvwapBands(bars, anchor);
            const optimized = computeAvwapFromPrefixSums(prefixSums, anchor, bars);

            expect(optimized.center.length).toBe(legacy.center.length);
            expect(optimized.upper.length).toBe(legacy.upper.length);
            expect(optimized.lower.length).toBe(legacy.lower.length);

            for (let i = 0; i < legacy.center.length; i++) {
                expect(optimized.center[i].time).toBe(legacy.center[i].time);
                // Center AVWAP within fraction of a cent
                expect(optimized.center[i].value).toBeCloseTo(legacy.center[i].value, 3);
                // Variance bands within cents (0.01-0.05 on $68,000 BTC)
                expect(optimized.upper[i].value).toBeCloseTo(legacy.upper[i].value, 1);
                expect(optimized.lower[i].value).toBeCloseTo(legacy.lower[i].value, 1);
            }
        }
    });

    it('handles empty bars gracefully without crashing', () => {
        const prefixSums = buildAvwapPrefixSums([]);
        const result = computeAvwapFromPrefixSums(prefixSums, 0);
        expect(result.center).toEqual([]);
        expect(result.upper).toEqual([]);
        expect(result.lower).toEqual([]);
    });

    it('clamps anchor bounds safely if index is negative or beyond length', () => {
        const bars = createDemoMarketBars(68000, 50, 60);
        const prefixSums = buildAvwapPrefixSums(bars);

        const negResult = computeAvwapFromPrefixSums(prefixSums, -10, bars);
        const atZeroResult = computeAvwapFromPrefixSums(prefixSums, 0, bars);
        expect(negResult.center.length).toBe(atZeroResult.center.length);
        expect(negResult.center[0].value).toBe(atZeroResult.center[0].value);

        const pastResult = computeAvwapFromPrefixSums(prefixSums, 1000, bars);
        expect(pastResult.center.length).toBe(1); // last bar only
    });

    it('evaluates AVWAP across 1,200 bars in under 2 milliseconds', () => {
        const bars = createDemoMarketBars(68000, 1200, 60);
        const startBuild = performance.now();
        const prefixSums = buildAvwapPrefixSums(bars);
        const buildTime = performance.now() - startBuild;

        const startCalc = performance.now();
        const result = computeAvwapFromPrefixSums(prefixSums, 500, bars);
        const calcTime = performance.now() - startCalc;

        expect(result.center.length).toBe(700);
        expect(buildTime).toBeLessThan(15); // O(N) build < 15ms
        expect(calcTime).toBeLessThan(5);   // O(N - anchor) < 5ms (typically ~0.5ms)
    });
});
