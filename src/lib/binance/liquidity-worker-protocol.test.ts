import { describe, expect, it } from 'vitest';
import { createLiquidityWorkerConfig } from './liquidity-worker-protocol';

describe('liquidity worker configuration', () => {
    it('merges bounded renderer overrides without losing sequence safeguards', () => {
        const config = createLiquidityWorkerConfig({
            captureIntervalMs: 1_000,
            heatmap: { tickSize: 25, maxFrames: 900 },
        });
        expect(config).toEqual(expect.objectContaining({
            captureIntervalMs: 1_000,
            snapshotUrl: '/api/binance/depth?limit=500',
            orderBook: expect.objectContaining({ maxBufferedEvents: 5_000 }),
            heatmap: expect.objectContaining({ tickSize: 25, maxFrames: 900, visibleDepthBps: 100 }),
        }));
    });

    it('rejects unsafe protocols and inverted reconnect limits', () => {
        expect(() => createLiquidityWorkerConfig({ streamUrl: 'https://example.com' })).toThrow(/ws or wss|unsupported protocol/);
        expect(() => createLiquidityWorkerConfig({ snapshotUrl: 'file:///secret' })).toThrow(/unsupported protocol/);
        expect(() => createLiquidityWorkerConfig({ reconnectBaseMs: 2_000, reconnectMaxMs: 1_000 })).toThrow(/reconnectMaxMs/);
    });
});
