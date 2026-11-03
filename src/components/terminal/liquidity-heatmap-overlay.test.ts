import { describe, expect, it } from 'vitest';
import type { LiquidityHeatmapFrame } from '../../lib/binance/types';
import { projectLiquidityHeatmapFrames } from './LiquidityHeatmapOverlay';

function frame(index: number): LiquidityHeatmapFrame {
    return {
        schemaVersion: 1,
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        venue: 'BINANCE_SPOT',
        capturedAt: 1_000 + index * 500,
        eventTime: 990 + index * 500,
        lastUpdateId: 10_000 + index,
        bestBid: 67_990,
        bestAsk: 68_010,
        midPrice: 68_000,
        levels: [
            { side: 'BID', price: 67_980, quantity: 2 + index, notionalUsd: 135_960 + index * 1_000 },
            { side: 'ASK', price: 68_020, quantity: 1 + index, notionalUsd: 68_020 + index * 500 },
            { side: 'BID', price: 1, quantity: 1, notionalUsd: 1 },
        ],
    };
}

describe('liquidity heatmap projection', () => {
    it('bounds columns, excludes off-screen prices, and preserves bid/ask provenance', () => {
        const cells = projectLiquidityHeatmapFrames(
            Array.from({ length: 300 }, (_, index) => frame(index)),
            {
                width: 1_000,
                height: 500,
                maxColumns: 60,
                maxLevelsPerColumn: 3,
                priceToY: (price) => price < 60_000 ? null : 250 - (price - 68_000) / 2,
            },
        );

        expect(cells.length).toBeGreaterThan(0);
        expect(cells.length).toBeLessThanOrEqual(60 * 2);
        expect(new Set(cells.map((cell) => cell.side))).toEqual(new Set(['BID', 'ASK']));
        expect(cells.every((cell) => cell.x >= 520 && cell.x <= 936)).toBe(true);
        expect(cells.every((cell) => cell.y >= 0 && cell.y <= 500)).toBe(true);
        expect(cells.every((cell) => cell.intensity > 0 && cell.intensity <= 1)).toBe(true);
        expect(cells.some((cell) => cell.latest && cell.width > 18)).toBe(true);
    });

    it('does not invent cells without observed frames or valid visible levels', () => {
        expect(projectLiquidityHeatmapFrames([], { width: 800, height: 400, priceToY: () => 100 })).toEqual([]);
        expect(projectLiquidityHeatmapFrames([frame(0)], { width: 800, height: 400, priceToY: () => null })).toEqual([]);
    });
});
