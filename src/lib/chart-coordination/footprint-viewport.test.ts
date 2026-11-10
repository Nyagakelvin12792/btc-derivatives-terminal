import { describe, expect, it } from 'vitest';
import {
    clampFootprintTime,
    findFootprintCandleIndex,
    fitFootprintPrice,
    fitFootprintTime,
    footprintPriceTicks,
    footprintTimeTicks,
    formatFootprintTimeTick,
    panFootprintPrice,
    panFootprintTime,
    visibleFootprintIndices,
    zoomFootprintPrice,
    zoomFootprintTime,
} from './footprint-viewport';

const HOUR = 3_600;
const times = Array.from({ length: 12 }, (_, index) => index * HOUR);

describe('independent Footprint time viewport', () => {
    it('fits all loaded candles or a recent subset including the last candle width', () => {
        expect(fitFootprintTime(times, HOUR)).toEqual({ from: 0, to: 12 * HOUR });
        expect(fitFootprintTime(times, HOUR, 4)).toEqual({ from: 8 * HOUR, to: 12 * HOUR });
        expect(fitFootprintTime([], HOUR)).toEqual({ from: 0, to: HOUR });
        expect(fitFootprintTime([4 * HOUR], HOUR)).toEqual({ from: 4 * HOUR, to: 5 * HOUR });
    });

    it('changes visible candles when dragging while holding the span at data bounds', () => {
        const range = fitFootprintTime(times, HOUR, 4);
        const historical = panFootprintTime(range, -2 * HOUR, times, HOUR);
        expect(historical).toEqual({ from: 6 * HOUR, to: 10 * HOUR });
        expect(visibleFootprintIndices(times, historical, HOUR)).toEqual({ start: 6, end: 10 });
        expect(panFootprintTime(historical, 100 * HOUR, times, HOUR)).toEqual(range);
        expect(panFootprintTime(historical, -100 * HOUR, times, HOUR)).toEqual({ from: 0, to: 4 * HOUR });
    });

    it('zooms around the cursor and clamps zoom in to one candle', () => {
        const range = { from: 2 * HOUR, to: 10 * HOUR };
        const anchor = 4 * HOUR;
        const zoomed = zoomFootprintTime(range, 0.5, anchor, times, HOUR);
        expect(zoomed).toEqual({ from: 3 * HOUR, to: 7 * HOUR });
        expect((anchor - zoomed.from) / (zoomed.to - zoomed.from)).toBe(0.25);
        const closest = zoomFootprintTime(zoomed, 0.001, anchor, times, HOUR);
        expect(closest.to - closest.from).toBe(HOUR);
        expect(zoomFootprintTime(zoomed, 100, anchor, times, HOUR)).toEqual(fitFootprintTime(times, HOUR));
        expect(clampFootprintTime({ from: Number.NaN, to: 10 }, times, HOUR)).toEqual(fitFootprintTime(times, HOUR));
    });

    it('keeps partial edge candles, respects exact boundaries, and preserves missing intervals', () => {
        const withGap = [0, HOUR, 3 * HOUR, 4 * HOUR];
        expect(visibleFootprintIndices(withGap, { from: HOUR / 2, to: 3 * HOUR }, HOUR)).toEqual({ start: 0, end: 2 });
        expect(visibleFootprintIndices(withGap, { from: 2 * HOUR, to: 3 * HOUR }, HOUR)).toEqual({ start: 2, end: 2 });
        expect(visibleFootprintIndices(withGap, { from: 3 * HOUR, to: 3.5 * HOUR }, HOUR)).toEqual({ start: 2, end: 3 });
    });

    it('maps canonical timestamps to H1 and H4 intervals without projecting into gaps', () => {
        const h4Times = [0, 4 * HOUR, 8 * HOUR];
        const anchor = 7 * HOUR;
        expect(findFootprintCandleIndex(times, anchor, HOUR)).toBe(7);
        expect(findFootprintCandleIndex(h4Times, anchor, 4 * HOUR)).toBe(1);
        expect(findFootprintCandleIndex(h4Times, 8 * HOUR, 4 * HOUR)).toBe(2);
        expect(findFootprintCandleIndex(h4Times, 12 * HOUR, 4 * HOUR)).toBe(-1);
        expect(findFootprintCandleIndex([0, 8 * HOUR], anchor, 4 * HOUR)).toBe(-1);
    });

    it('keeps sparse ranges cheap on a large timeline', () => {
        const loaded = Array.from({ length: 100_000 }, (_, index) => index * HOUR);
        const range = fitFootprintTime(loaded, HOUR, 12);
        expect(visibleFootprintIndices(loaded, range, HOUR)).toEqual({ start: 99_988, end: 100_000 });
        expect(findFootprintCandleIndex(loaded, range.to - 1, HOUR)).toBe(99_999);
    });

    it('updates UTC axis tick spacing and formatting after zoom and pan', () => {
        const start = Date.UTC(2026, 10, 10) / 1_000;
        const full = { from: start, to: start + 24 * HOUR };
        const detail = { from: start + 12 * HOUR, to: start + 15 * HOUR };
        const wideTicks = footprintTimeTicks(full, 6);
        const closeTicks = footprintTimeTicks(detail, 6);
        expect(wideTicks[1] - wideTicks[0]).toBe(4 * HOUR);
        expect(closeTicks[1] - closeTicks[0]).toBe(HOUR / 2);
        expect(closeTicks.map((time) => formatFootprintTimeTick(time, detail))).toEqual([
            '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
        ]);
        expect(formatFootprintTimeTick(wideTicks[0], full)).toBe('11-10');
        expect(footprintTimeTicks({ from: start, to: start }, 6)).toEqual([]);
    });
});

describe('independent Footprint price viewport', () => {
    it('fits visible highs and lows with padding, including flat candles', () => {
        const fit = fitFootprintPrice([{ low: 99, high: 107 }, { low: 102, high: 109 }]);
        expect(fit.min).toBeCloseTo(98.2);
        expect(fit.max).toBeCloseTo(109.8);
        expect(fitFootprintPrice([{ low: 100, high: 100 }], 2)).toEqual({ min: 99, max: 101 });
    });

    it('pans and zooms vertical prices independently while preserving the price anchor', () => {
        const range = { min: 100, max: 200 };
        expect(panFootprintPrice(range, 20)).toEqual({ min: 120, max: 220 });
        const zoomed = zoomFootprintPrice(range, 0.5, 125);
        expect(zoomed).toEqual({ min: 112.5, max: 162.5 });
        expect((125 - zoomed.min) / (zoomed.max - zoomed.min)).toBe(0.25);
        expect(zoomFootprintPrice(range, 0.001, 150, 1)).toEqual({ min: 149.5, max: 150.5 });
    });

    it('chooses a readable number of adaptive ticks with sub-dollar and exchange-tick alignment', () => {
        expect(footprintPriceTicks({ min: 100, max: 200 }, 5)).toEqual([100, 125, 150, 175, 200]);
        expect(footprintPriceTicks({ min: 100, max: 100.1 }, 6, 0.01)).toEqual([
            100, 100.02, 100.04, 100.06, 100.08, 100.1,
        ]);
        expect(footprintPriceTicks({ min: 100, max: 100.2 }, 11, 0.01)).toHaveLength(11);
        const ticks = footprintPriceTicks({ min: 100.003, max: 100.026 }, 10, 0.005);
        expect(ticks).toEqual([100.005, 100.01, 100.015, 100.02, 100.025]);
    });
});
