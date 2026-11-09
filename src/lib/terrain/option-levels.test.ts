import { describe, expect, it } from 'vitest';
import { resolveOptionLevels } from './option-levels';
import type { TerrainDataContractV2 } from './types';

const demo = {
    dataMode: 'DEMO',
    spotPrice: 80_000,
    summary: { topPositiveGexStrike: 84_000, topNegativeGexStrike: 76_000 },
} as TerrainDataContractV2;

describe('terminal option levels', () => {
    it('rejects demo and degraded snapshots in live mode', () => {
        expect(resolveOptionLevels(demo, 'LIVE', false)).toEqual({ available: false });
        expect(resolveOptionLevels({ ...demo, dataMode: 'DEGRADED' }, 'LIVE', false)).toEqual({ available: false });
    });

    it('hides the previous live snapshot on a feed error', () => {
        expect(resolveOptionLevels({ ...demo, dataMode: 'LIVE' }, 'LIVE', true)).toEqual({ available: false });
    });

    it('keeps a valid live wall without estimating the missing side', () => {
        const live = { ...demo, dataMode: 'LIVE', summary: { ...demo.summary, topNegativeGexStrike: 0 } } as const;
        expect(resolveOptionLevels(live, 'LIVE', false)).toMatchObject({
            available: true,
            callWall: 84_000,
            putWall: undefined,
            gammaFlip: undefined,
        });
    });

    it('rejects a legacy placeholder strike with zero exposure', () => {
        const live = { ...demo, dataMode: 'LIVE', summary: { ...demo.summary, putWallExposure: 0 } } as const;
        expect(resolveOptionLevels(live, 'LIVE', false)).toMatchObject({ putWall: undefined });
    });

    it('keeps demo estimates in demo mode', () => {
        const empty = { ...demo, summary: { ...demo.summary, topPositiveGexStrike: 0, topNegativeGexStrike: 0 } };
        expect(resolveOptionLevels(empty, 'DEMO', false)).toMatchObject({
            available: true,
            callWall: 84_000,
            putWall: 76_000,
        });
    });
});
