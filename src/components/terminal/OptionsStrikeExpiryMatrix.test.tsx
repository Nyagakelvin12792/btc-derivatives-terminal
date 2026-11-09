import { describe, expect, it } from 'vitest';
import { buildStrikeExpiryMatrixRows } from './OptionsStrikeExpiryMatrix';
import type { TerrainSurfaceCell } from '../../lib/terrain/types';

function makeCell(overrides: Partial<TerrainSurfaceCell> & { strike: number; expiry: string; dte: number }): TerrainSurfaceCell {
    return {
        strike: overrides.strike,
        expiry: overrides.expiry,
        dte: overrides.dte,
        observed: true,
        rawDelta: 0.5,
        rawGamma: 0.001,
        rawVanna: 0.01,
        rawCharm: -0.01,
        gexExposure: overrides.gexExposure ?? 0,
        vannaExposure: 0,
        charmExposure: 0,
        callGexExposure: 0,
        putGexExposure: 0,
        openInterestBtc: overrides.openInterestBtc ?? 0,
        openInterestUsd: (overrides.openInterestBtc ?? 0) * 70_000,
        iv: overrides.iv ?? 54,
        gexIntensity: 0.6,
        vannaIntensity: 0.2,
        charmIntensity: 0.1,
        oiIntensity: 0.5,
        gexBand: 'HIGH',
        vannaBand: 'LOW',
        charmBand: 'LOW',
        oiBand: 'MEDIUM',
        confluenceScore: 72,
        confluenceBand: 'HIGH',
        behaviorZone: 'STABILIZATION_ZONE',
        gex: overrides.gexExposure ?? 0,
        callGex: 0,
        putGex: 0,
        openInterest: overrides.openInterestBtc ?? 0,
        gamma: 0.001,
    };
}

describe('buildStrikeExpiryMatrixRows (UX20.5-SURFACE-06)', () => {
    it('builds strike x expiry matrix rows from TerrainSurfaceCell entries', () => {
        const result = buildStrikeExpiryMatrixRows(
            [
                makeCell({
                    strike: 70_000,
                    expiry: '29NOV26',
                    dte: 7,
                    gexExposure: 48_000_000,
                    openInterestBtc: 1_240,
                    iv: 54.2,
                }),
                makeCell({
                    strike: 68_000,
                    expiry: '29NOV26',
                    dte: 7,
                    gexExposure: -22_000_000,
                    openInterestBtc: 890,
                    iv: 58.1,
                }),
            ],
            69_200,
            70_000,
            68_000,
            69_000,
        );

        expect(result.isSyntheticPreview).toBe(false);
        expect(result.expiries).toEqual(['29NOV26']);
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0]?.strike).toBe(70_000);
        expect(result.rows[0]?.byExpiry['29NOV26']?.signedGexUsd).toBe(48_000_000);
    });
});
