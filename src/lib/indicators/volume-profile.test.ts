import { describe, expect, it } from 'vitest';
import type { UTCTimestamp } from 'lightweight-charts';
import {
    calculateBarApproximatedVolumeProfile,
    calculateCapturedTradeVolumeProfile,
    calculateVolumeProfileLevels,
    type VolumeProfileRow,
} from './volume-profile';
import { buildAvwapPrefixSums, computeAvwapFromPrefixSums } from './avwap-prefix-sums';
import { calculateGreeks, calculateNetGEX } from '../quant/engine';

describe('UX20.3-MATH-02 Volume Profile, AVWAP Zero-Volume, and Options Exposure Goldens', () => {
    it('applies deterministic lower-price tie-breaking for POC and 70% Value Area', () => {
        const rows: VolumeProfileRow[] = [
            { low: 69900, high: 70000, price: 69950, volume: 100, upVolume: 60, downVolume: 40, delta: 20, upShare: 0.6, provenance: 'CAPTURED_EXACT' },
            { low: 70000, high: 70100, price: 70050, volume: 250, upVolume: 150, downVolume: 100, delta: 50, upShare: 0.6, provenance: 'CAPTURED_EXACT' },
            { low: 70100, high: 70200, price: 70150, volume: 250, upVolume: 120, downVolume: 130, delta: -10, upShare: 0.48, provenance: 'CAPTURED_EXACT' },
            { low: 70200, high: 70300, price: 70250, volume: 100, upVolume: 40, downVolume: 60, delta: -20, upShare: 0.4, provenance: 'CAPTURED_EXACT' },
        ];

        const levels = calculateVolumeProfileLevels(rows, 0.7);
        expect(levels).not.toBeNull();
        // Rows 1 and 2 tie at 250 BTC; lower-price tie-break selects row 1 (70050)
        expect(levels!.poc).toBe(70050);
        expect(levels!.provenance).toBe('CAPTURED_EXACT');
        expect(levels!.val).toBeLessThanOrEqual(levels!.poc);
        expect(levels!.vah).toBeGreaterThanOrEqual(levels!.poc);
    });

    it('tags bar-derived Volume Profile as BAR_APPROXIMATED and trade-derived as CAPTURED_EXACT', () => {
        const barRows = calculateBarApproximatedVolumeProfile(
            [
                { time: 1_700_000_000 as UTCTimestamp, open: 70000, high: 70100, low: 69900, close: 70050, volume: 100, takerBuyVolume: 65 },
            ],
            0,
            0,
            4,
        );
        expect(barRows).toHaveLength(4);
        expect(barRows.every((r) => r.provenance === 'BAR_APPROXIMATED')).toBe(true);
        const totalVol = barRows.reduce((acc, r) => acc + r.volume, 0);
        expect(totalVol).toBeCloseTo(100, 6);

        const tradeRows = calculateCapturedTradeVolumeProfile(
            [
                { price: 70010, size: 2.5, side: 'buy' },
                { price: 70080, size: 1.5, side: 'sell' },
            ],
            4,
        );
        expect(tradeRows.every((r) => r.provenance === 'CAPTURED_EXACT')).toBe(true);
        expect(tradeRows.reduce((acc, r) => acc + r.volume, 0)).toBeCloseTo(4.0, 6);
    });

    it('handles zero-volume AVWAP anchor prefix without NaN or division-by-zero', () => {
        const bars = [
            { time: 1_700_000_000 as UTCTimestamp, open: 70000, high: 70000, low: 70000, close: 70000, volume: 0 },
            { time: 1_700_000_060 as UTCTimestamp, open: 70100, high: 70200, low: 70000, close: 70100, volume: 50 },
        ];
        const prefix = buildAvwapPrefixSums(bars, 'HLC3');
        const bands = computeAvwapFromPrefixSums(prefix, 0, bars, 1.0, 'STD_DEV');

        expect(bands.center).toHaveLength(2);
        expect(Number.isFinite(bands.center[0].value)).toBe(true);
        expect(bands.center[0].value).toBe(70000);
        expect(bands.center[1].value).toBeCloseTo(70100, 4);
    });

    it('computes Black-Scholes Greeks and signed Net GEX within golden tolerance', () => {
        const spot = 70000;
        const strike = 70000;
        const tte = 30 / 365;
        const iv = 0.6;
        const rate = 0.04;

        const callGreeks = calculateGreeks(spot, strike, tte, iv, rate, 'call');
        const putGreeks = calculateGreeks(spot, strike, tte, iv, rate, 'put');

        // Put-Call delta parity: Call Delta - Put Delta === 1.0
        expect(callGreeks.delta - putGreeks.delta).toBeCloseTo(1.0, 6);
        expect(callGreeks.gamma).toBeGreaterThan(0);
        expect(callGreeks.gamma).toBeCloseTo(putGreeks.gamma, 8);

        const callGex = calculateNetGEX(callGreeks.gamma, 100, spot, 'call');
        const putGex = calculateNetGEX(putGreeks.gamma, 100, spot, 'put');
        expect(callGex).toBeGreaterThan(0);
        expect(putGex).toBeLessThan(0);
        expect(callGex + putGex).toBeCloseTo(0, 6);
    });
});
