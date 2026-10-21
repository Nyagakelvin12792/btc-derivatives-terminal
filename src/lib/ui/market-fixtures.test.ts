import { describe, expect, it } from 'vitest';
import {
    createDemoAvwap,
    createDemoCvd,
    createDemoMarketBars,
    createDemoVolumeProfile,
} from './market-fixtures';

describe('market UI demo fixtures', () => {
    it('creates ordered, internally valid candles', () => {
        const bars = createDemoMarketBars(68_000, 64);

        expect(bars).toHaveLength(64);
        expect(Number(bars[0].time)).toBeLessThan(Number(bars[63].time));
        bars.forEach((bar) => {
            expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
            expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
            expect(bar.volume).toBeGreaterThan(0);
        });
    });

    it('starts AVWAP at the requested anchor and never emits invalid values', () => {
        const bars = createDemoMarketBars(68_000, 40);
        const avwap = createDemoAvwap(bars, 12);

        expect(avwap).toHaveLength(28);
        expect(avwap[0].time).toBe(bars[12].time);
        expect(avwap.every((point) => Number.isFinite(point.value))).toBe(true);
    });

    it('produces cumulative CVD candles with matching timestamps', () => {
        const bars = createDemoMarketBars(68_000, 32);
        const cvd = createDemoCvd(bars);

        expect(cvd).toHaveLength(bars.length);
        expect(cvd.map((bar) => bar.time)).toEqual(bars.map((bar) => bar.time));
        expect(cvd.every((bar) => bar.high >= Math.max(bar.open, bar.close))).toBe(true);
    });

    it('keeps volume profile rows inside the selected price range', () => {
        const bars = createDemoMarketBars(68_000, 80);
        const selected = bars.slice(20, 51);
        const profile = createDemoVolumeProfile(bars, 20, 50, 12);
        const low = Math.min(...selected.map((bar) => bar.low));
        const high = Math.max(...selected.map((bar) => bar.high));

        expect(profile).toHaveLength(12);
        expect(profile.every((row) => row.price >= low && row.price <= high)).toBe(true);
        expect(profile.every((row) => row.buyShare >= 0 && row.buyShare <= 1)).toBe(true);
    });
});
