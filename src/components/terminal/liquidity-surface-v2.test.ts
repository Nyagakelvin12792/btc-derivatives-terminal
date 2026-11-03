import { describe, expect, it } from 'vitest';
import type { LiquidityHeatmapFrame } from '../../lib/binance/types';
import { projectLiquidityHeatmapFrames, projectLiquiditySurfaceV2 } from './LiquidityHeatmapOverlay';

function makeFrame(index: number, timeSec: number, midPrice: number): LiquidityHeatmapFrame {
    return {
        schemaVersion: 1,
        source: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        venue: 'BINANCE_SPOT',
        capturedAt: timeSec * 1000,
        eventTime: timeSec * 1000,
        lastUpdateId: 50_000 + index,
        bestBid: midPrice - 5,
        bestAsk: midPrice + 5,
        midPrice,
        levels: [
            // Close bid (within 10 bps)
            { side: 'BID', price: midPrice - 10, quantity: 5, notionalUsd: 5 * (midPrice - 10) },
            // Close ask (within 10 bps)
            { side: 'ASK', price: midPrice + 10, quantity: 4, notionalUsd: 4 * (midPrice + 10) },
            // Heavy resting wall (high percentile)
            { side: 'BID', price: midPrice - 50, quantity: 25, notionalUsd: 25 * (midPrice - 50) },
            // Distant level (500 bps away)
            { side: 'ASK', price: midPrice * 1.05, quantity: 30, notionalUsd: 30 * midPrice * 1.05 },
            // Dust level (below 80th percentile)
            { side: 'BID', price: midPrice - 2, quantity: 0.01, notionalUsd: 0.01 * midPrice },
        ],
    };
}

describe('UX16.3 Liquidity Surface V2 coordinate projection & acceptance', () => {
    const mockTimeToX = (timeSec: number) => {
        // Linear scale: time 1000 -> x 100, time 2000 -> x 600
        return 100 + (timeSec - 1000) * 0.5;
    };

    const mockPriceToY = (price: number) => {
        // Linear scale: 70000 -> 100, 60000 -> 500
        return 100 + (70000 - price) * 0.04;
    };

    it('maps heatmap X coordinates to chart event times rather than a right-side strip', () => {
        const frames = [
            makeFrame(0, 1000, 68000), // x = 100
            makeFrame(1, 1200, 68020), // x = 200
            makeFrame(2, 1400, 68010), // x = 300
        ];

        const cells = projectLiquiditySurfaceV2(frames, {
            width: 1000,
            height: 600,
            timeToX: mockTimeToX,
            priceToY: mockPriceToY,
            settings: { densityMode: 'FULL', minPercentile: 0.1 },
        });

        expect(cells.length).toBeGreaterThan(0);
        // Ensure X coordinates match the timestamps
        const xs = new Set(cells.map((c) => Math.round(c.x)));
        expect(xs.has(100)).toBe(true);
        expect(xs.has(200)).toBe(true);
        expect(xs.has(300)).toBe(true);

        // Crucial UX16.3 test: Cells must NOT be forced into the legacy right-side 52% strip (x >= 520)
        expect(cells.some((c) => c.x < 500)).toBe(true);
    });

    it('maps heatmap Y coordinates to the price scale dynamically', () => {
        const frames = [makeFrame(0, 1000, 68000)];
        const cells = projectLiquiditySurfaceV2(frames, {
            width: 1000,
            height: 600,
            timeToX: mockTimeToX,
            priceToY: mockPriceToY,
            settings: { densityMode: 'FULL', minPercentile: 0.1 },
        });

        const bidLevel = cells.find((c) => c.price === 68000 - 10);
        expect(bidLevel).toBeDefined();
        if (bidLevel) {
            expect(bidLevel.y).toBeCloseTo(mockPriceToY(68000 - 10));
        }
    });

    it('produces visual whitespace across sequence gaps without bridging', () => {
        const frames = [
            makeFrame(0, 1000, 68000), // x = 100
            makeFrame(1, 1600, 68000), // x = 400 (600s gap!)
        ];

        const cells = projectLiquiditySurfaceV2(frames, {
            width: 1000,
            height: 600,
            timeToX: mockTimeToX,
            priceToY: mockPriceToY,
            timeframeSeconds: 60,
        });

        // Cells only exist near x=100 and x=400. In between (x=200..350), there must be ZERO cells
        const gapCells = cells.filter((c) => c.x > 150 && c.x < 380);
        expect(gapCells.length).toBe(0);
    });

    it('filters distant levels in FOCUSED density mode and retains them in FULL mode', () => {
        const frames = [makeFrame(0, 1000, 68000)];

        const focusedCells = projectLiquiditySurfaceV2(frames, {
            width: 1000,
            height: 600,
            timeToX: mockTimeToX,
            priceToY: mockPriceToY,
            settings: { densityMode: 'FOCUSED', focusedBpsRange: 200, minPercentile: 0.1 },
        });

        const fullCells = projectLiquiditySurfaceV2(frames, {
            width: 1000,
            height: 600,
            timeToX: mockTimeToX,
            priceToY: mockPriceToY,
            settings: { densityMode: 'FULL', minPercentile: 0.1 },
        });

        // 5% away level (500 bps) should be omitted in FOCUSED mode but included in FULL mode
        const distantInFocused = focusedCells.some((c) => c.price >= 68000 * 1.04);
        const distantInFull = fullCells.some((c) => c.price >= 68000 * 1.04);

        expect(distantInFocused).toBe(false);
        expect(distantInFull).toBe(true);
    });

    it('flags persistent high-notional walls with persistence indicator', () => {
        const frames = [makeFrame(0, 1000, 68000)];
        const cells = projectLiquiditySurfaceV2(frames, {
            width: 1000,
            height: 600,
            timeToX: mockTimeToX,
            priceToY: mockPriceToY,
            settings: { densityMode: 'FULL', minPercentile: 0.1 },
        });

        const persistentWall = cells.find((c) => c.persistent);
        expect(persistentWall).toBeDefined();
        expect(persistentWall?.intensity).toBeGreaterThan(0.8);
    });

    it('backward compatibility: projectLiquidityHeatmapFrames delegates to V2 when timeToX is provided', () => {
        const frames = [makeFrame(0, 1000, 68000)];
        const cellsWithTime = projectLiquidityHeatmapFrames(frames, {
            width: 1000,
            height: 600,
            priceToY: mockPriceToY,
            timeToX: mockTimeToX,
        });

        expect(cellsWithTime.length).toBeGreaterThan(0);
        expect(cellsWithTime[0].x).toBe(100);
    });

    it('re-projects different cell counts when projectLiquidityHeatmapFrames toggles densityMode FOCUSED vs FULL', () => {
        const frames = [makeFrame(0, 1000, 68000)];
        const focused = projectLiquidityHeatmapFrames(frames, {
            width: 1000,
            height: 600,
            priceToY: mockPriceToY,
            timeToX: mockTimeToX,
            densityMode: 'FOCUSED',
            minPercentile: 0.1,
        });
        const full = projectLiquidityHeatmapFrames(frames, {
            width: 1000,
            height: 600,
            priceToY: mockPriceToY,
            timeToX: mockTimeToX,
            densityMode: 'FULL',
            minPercentile: 0.1,
        });

        expect(full.length).toBeGreaterThan(focused.length);
        expect(focused.some((c) => (c.price ?? 0) >= 68000 * 1.04)).toBe(false);
        expect(full.some((c) => (c.price ?? 0) >= 68000 * 1.04)).toBe(true);
    });
});
