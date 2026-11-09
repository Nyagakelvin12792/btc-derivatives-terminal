import { describe, expect, it } from 'vitest';
import { ReplayClockEngine, type ReplayDatasetV1 } from './replay-clock';

describe('ReplayClockEngine (UX20.3-CLOCK-01)', () => {
    const sampleDataset: ReplayDatasetV1 = {
        datasetId: 'btc-2026-11-01-session',
        symbol: 'BTCUSDT',
        startTimeMs: 1_700_000_000_000,
        endTimeMs: 1_700_000_300_000,
        candles: [
            { time: 1_700_000_000, open: 70000, high: 70100, low: 69950, close: 70050, volume: 120, buyVolume: 70, sellVolume: 50, delta: 20 },
            { time: 1_700_000_060, open: 70050, high: 70250, low: 70010, close: 70200, volume: 185, buyVolume: 110, sellVolume: 75, delta: 35 },
            { time: 1_700_000_120, open: 70200, high: 70300, low: 70100, close: 70150, volume: 95, buyVolume: 40, sellVolume: 55, delta: -15 },
        ],
        trades: [
            { id: 't1', timestamp: 1_700_000_010_000, price: 70020, size: 1.5, side: 'buy', isBlockTrade: false },
            { id: 't2', timestamp: 1_700_000_070_000, price: 70180, size: 2.2, side: 'buy', isBlockTrade: true },
            { id: 't3', timestamp: 1_700_000_130_000, price: 70150, size: 0.8, side: 'sell', isBlockTrade: false },
        ],
        bookSnapshots: [
            {
                timestampMs: 1_700_000_000_000,
                midPrice: 70000,
                spread: 1,
                totalBidDepth: 50,
                totalAskDepth: 45,
                imbalanceRatio: 0.05,
                bids: [],
                asks: [],
            },
            {
                timestampMs: 1_700_000_060_000,
                midPrice: 70200,
                spread: 1,
                totalBidDepth: 65,
                totalAskDepth: 40,
                imbalanceRatio: 0.23,
                bids: [],
                asks: [],
            },
        ],
    };

    it('prevents future candle, trade, and orderbook leakage past cursorTimeMs', () => {
        const clock = new ReplayClockEngine(sampleDataset, 1_700_000_060_000);
        const snap = clock.getSnapshot();

        expect(snap.visibleCandles).toHaveLength(2);
        expect(snap.visibleCandles[1].close).toBe(70200);
        // Trade t2 is at 1_700_000_070_000 (> cursorTimeMs), so only t1 is visible
        expect(snap.visibleTrades).toHaveLength(1);
        expect(snap.visibleTrades[0].id).toBe('t1');
        expect(snap.latestBookSnapshot?.midPrice).toBe(70200);
    });

    it('produces identical deterministic run hashes across repeated replay runs', () => {
        const clockA = new ReplayClockEngine(sampleDataset, 1_700_000_000_000);
        const clockB = new ReplayClockEngine(sampleDataset, 1_700_000_000_000);

        const snapA1 = clockA.stepNextCandle();
        const snapB1 = clockB.stepNextCandle();
        expect(snapA1.deterministicRunHash).toBe(snapB1.deterministicRunHash);

        const snapA2 = clockA.seek(1_700_000_120_000);
        const snapB2 = clockB.seek(1_700_000_120_000);
        expect(snapA2.deterministicRunHash).toBe(snapB2.deterministicRunHash);
        expect(snapA2.visibleCandles).toHaveLength(3);
    });
});

it('isolates inputs and output mutations, hashes content, and hides data until available', () => {
    const trade = { timestamp: 1_000, availableAtMs: 2_000, price: 100, size: 1, side: 'BUY' as const };
    const dataset = { datasetId: 'fixture', symbol: 'BTCUSDT', startTimeMs: 0, endTimeMs: 3_000, candles: [], trades: [trade] };
    const clock = new ReplayClockEngine(dataset, 1_999);
    expect(clock.getSnapshot().visibleTrades).toEqual([]);
    const before = clock.seek(2_000);
    trade.size = 2;
    before.visibleTrades[0].size = 3;
    expect(clock.getSnapshot().visibleTrades[0].size).toBe(1);
    expect(clock.getSnapshot().deterministicRunHash).toBe(before.deterministicRunHash);
    expect(new ReplayClockEngine(dataset, 2_000).getSnapshot().deterministicRunHash).not.toBe(before.deterministicRunHash);
});
