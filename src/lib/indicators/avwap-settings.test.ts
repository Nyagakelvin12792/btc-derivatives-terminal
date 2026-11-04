import { describe, expect, it } from 'vitest';
import { createDemoMarketBars } from '../ui/market-fixtures';
import {
    DEFAULT_AVWAP_SETTINGS,
    getBarPriceBySource,
    loadPersistedAvwapSettings,
    savePersistedAvwapSettings,
    findRecentSwingHighIndex,
} from './avwap-settings';
import { buildAvwapPrefixSums, computeAvwapFromPrefixSums } from './avwap-prefix-sums';

describe('AVWAP Settings & Prefix Sums Extensions (UX19.1)', () => {
    const bars = createDemoMarketBars(68000, 100, 60);

    it('loads and saves AVWAP settings with schema validation', () => {
        const custom = {
            ...DEFAULT_AVWAP_SETTINGS,
            priceSource: 'CLOSE' as const,
            lineWidth: 3,
            lineColor: '#ff0055',
            band1: {
                enabled: true,
                multiplier: 1.5,
                color: '#ffffff',
                lineWidth: 2,
                lineStyle: 'SOLID' as const,
            },
        };
        savePersistedAvwapSettings(custom);
        const loaded = loadPersistedAvwapSettings();
        expect(loaded.priceSource).toBe('CLOSE');
        expect(loaded.lineWidth).toBe(3);
        expect(loaded.band1.multiplier).toBe(1.5);
    });

    it('correctly calculates prices according to priceSource inputs', () => {
        const bar = { open: 100, high: 110, low: 90, close: 105 };
        expect(getBarPriceBySource(bar, 'HLC3')).toBeCloseTo((110 + 90 + 105) / 3, 4);
        expect(getBarPriceBySource(bar, 'HL2')).toBeCloseTo((110 + 90) / 2, 4);
        expect(getBarPriceBySource(bar, 'OHLC4')).toBeCloseTo((100 + 110 + 90 + 105) / 4, 4);
        expect(getBarPriceBySource(bar, 'CLOSE')).toBe(105);
        expect(getBarPriceBySource(bar, 'OPEN')).toBe(100);
    });

    it('computes AVWAP using different price sources via prefix sums', () => {
        const tableHlc3 = buildAvwapPrefixSums(bars, 'HLC3');
        const tableClose = buildAvwapPrefixSums(bars, 'CLOSE');

        const bandsHlc3 = computeAvwapFromPrefixSums(tableHlc3, 20, bars);
        const bandsClose = computeAvwapFromPrefixSums(tableClose, 20, bars);

        expect(bandsHlc3.center.length).toBe(80);
        expect(bandsClose.center.length).toBe(80);
        expect(bandsHlc3.center[79].value).not.toBeNaN();
        expect(bandsClose.center[79].value).not.toBeNaN();
    });

    it('computes band multipliers and percentage modes accurately', () => {
        const table = buildAvwapPrefixSums(bars, 'HLC3');
        const bands1 = computeAvwapFromPrefixSums(table, 20, bars, 1.0, 'STD_DEV');
        const bands2 = computeAvwapFromPrefixSums(table, 20, bars, 2.0, 'STD_DEV');
        const bandsPct = computeAvwapFromPrefixSums(table, 20, bars, 1.0, 'PERCENTAGE');

        const lastCenter = bands1.center[79].value;
        const dev1 = bands1.upper[79].value - lastCenter;
        const dev2 = bands2.upper[79].value - lastCenter;

        expect(dev2).toBeCloseTo(dev1 * 2, 2);
        expect(bandsPct.upper[79].value).toBeCloseTo(lastCenter * 1.01, 2);
    });

    it('locates recent swing high accurately', () => {
        const highIdx = findRecentSwingHighIndex(bars, 50);
        expect(highIdx).toBeGreaterThanOrEqual(bars.length - 50);
        expect(highIdx).toBeLessThanOrEqual(bars.length - 5);
        expect(bars[highIdx].high).toBeGreaterThan(0);
    });
});
