import { describe, expect, it } from 'vitest';
import {
    createDemoAvwap,
    createDemoAvwapBands,
    createDemoCvd,
    createDemoMarketBars,
    createDemoVolumeProfile,
    calculateVolumeProfileLevels,
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

    it('creates ordered AVWAP deviation bands from the anchor', () => {
        const bars = createDemoMarketBars(68_000, 40);
        const bands = createDemoAvwapBands(bars, 12);

        expect(bands.center).toHaveLength(28);
        bands.center.forEach((point, index) => {
            expect(bands.upper[index].value).toBeGreaterThanOrEqual(point.value);
            expect(bands.lower[index].value).toBeLessThanOrEqual(point.value);
        });
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
        expect(profile.every((row) => row.upShare >= 0 && row.upShare <= 1)).toBe(true);
        expect(profile.reduce((sum, row) => sum + row.volume, 0)).toBeCloseTo(selected.reduce((sum, bar) => sum + bar.volume, 0), 6);
        expect(profile.filter((row) => row.volume > 0).length).toBeGreaterThan(3);
        const levels = calculateVolumeProfileLevels(profile);
        expect(levels).not.toBeNull();
        expect(levels!.val).toBeLessThanOrEqual(levels!.poc);
        expect(levels!.vah).toBeGreaterThanOrEqual(levels!.poc);
    });

    it('classifies profile volume by TradingView-style up/down candle direction', () => {
        const bars = [
            { time: 1, open: 100, high: 104, low: 98, close: 103, volume: 60 },
            { time: 2, open: 103, high: 105, low: 99, close: 101, volume: 40 },
        ] as Parameters<typeof createDemoVolumeProfile>[0];
        const profile = createDemoVolumeProfile(bars, 0, 1, 8);

        expect(profile.reduce((sum, row) => sum + row.upVolume, 0)).toBeCloseTo(60, 8);
        expect(profile.reduce((sum, row) => sum + row.downVolume, 0)).toBeCloseTo(40, 8);
        expect(profile.reduce((sum, row) => sum + row.delta, 0)).toBeCloseTo(20, 8);
    });

    it('uses the official value-area tie break toward the row above the POC', () => {
        const row = (price: number, volume: number) => ({
            price, low: price - 0.5, high: price + 0.5, volume,
            upVolume: volume, downVolume: 0, delta: volume, upShare: 1,
        });
        const levels = calculateVolumeProfileLevels([row(99, 20), row(100, 50), row(101, 20), row(102, 10)], 0.7);

        expect(levels).toEqual({ poc: 100, val: 100, vah: 101 });
    });
});
