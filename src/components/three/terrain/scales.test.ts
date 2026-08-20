import { describe, expect, it } from 'vitest';
import { createLinearMapper, generateDteTicks, generateStrikeTicks } from './axes';
import { buildInterpolatedRenderGrid, interpolateCellValue } from './interpolation';
import { METRIC_CONFIGS } from './metric';
import { clampForDisplay, createSymmetricFinancialScale, formatFinancialAxis } from './scales';
import type { TerrainSurfaceCell } from '@/lib/terrain/types';

describe('renderer financial scales', () => {
    it('creates nice symmetric display bounds from robust scale values', () => {
        expect(createSymmetricFinancialScale(3.91e9).bound).toBe(4e9);
        expect(createSymmetricFinancialScale(763e3).bound).toBe(800e3);
        expect(createSymmetricFinancialScale(1.37e6).bound).toBe(2e6);
    });

    it('formats financial Y-axis labels without exposing world units', () => {
        expect(formatFinancialAxis(4e9)).toBe('+$4B');
        expect(formatFinancialAxis(0)).toBe('$0');
        expect(formatFinancialAxis(-750e3)).toBe('-$750K');
    });

    it('clips render geometry while preserving analytical values externally', () => {
        expect(clampForDisplay(10e9, 4e9)).toBe(4e9);
        expect(clampForDisplay(-10e9, 4e9)).toBe(-4e9);
        expect(clampForDisplay(2e9, 4e9)).toBe(2e9);
    });
});

describe('renderer coordinate axes', () => {
    it('maps strike and DTE values through actual numeric domains', () => {
        const strikeMapper = createLinearMapper([40000, 50000, 65000, 100000], 24);
        const dteMapper = createLinearMapper([1, 7, 30, 180], 16);

        expect(strikeMapper.toWorld(40000)).toBe(-12);
        expect(strikeMapper.toWorld(100000)).toBe(12);
        expect(strikeMapper.fromWorld(0)).toBe(70000);
        expect(dteMapper.toWorld(1)).toBe(-8);
        expect(dteMapper.toWorld(180)).toBe(8);
    });

    it('generates readable strike and DTE ticks', () => {
        const strikeMapper = createLinearMapper([20000, 35000, 50000, 65000, 90000, 120000], 24);
        const dteMapper = createLinearMapper([1, 7, 14, 30, 60, 90, 180, 365], 16);

        expect(generateStrikeTicks([20000, 35000, 50000, 65000, 90000, 120000], strikeMapper).length).toBeLessThanOrEqual(8);
        expect(generateDteTicks([1, 7, 14, 30, 60, 90, 180, 365], dteMapper).map((tick) => tick.value)).toContain(30);
    });
});

describe('renderer interpolation', () => {
    const grid: TerrainSurfaceCell[][] = [
        [cell(100, 10, 0), cell(250, 10, 100)],
        [cell(100, 40, 200), cell(250, 40, 300)],
    ];

    it('uses actual nonuniform strike and DTE coordinates for bilinear interpolation', () => {
        const value = interpolateCellValue(grid, [100, 250], [10, 40], 175, 25, METRIC_CONFIGS.gex);
        expect(value).toBe(150);
    });

    it('builds a smooth render grid while retaining nearest analytical source cells', () => {
        const renderGrid = buildInterpolatedRenderGrid(grid, METRIC_CONFIGS.gex, 5, 4);

        expect(renderGrid.samples).toHaveLength(4);
        expect(renderGrid.samples[0]).toHaveLength(5);
        expect(renderGrid.samples[0][0].sourceCell).toBe(grid[0][0]);
        expect(renderGrid.samples.at(-1)?.at(-1)?.sourceCell).toBe(grid[1][1]);
    });
});

function cell(strike: number, dte: number, gexExposure: number): TerrainSurfaceCell {
    return {
        strike,
        expiry: `${dte}D`,
        dte,
        observed: true,
        rawDelta: 0.5,
        rawGamma: 0.001,
        rawVanna: 0.1,
        rawCharm: -0.1,
        gexExposure,
        vannaExposure: gexExposure / 10,
        charmExposure: -gexExposure / 100,
        callGexExposure: Math.max(0, gexExposure),
        putGexExposure: Math.min(0, gexExposure),
        openInterestBtc: 10,
        openInterestUsd: 680000,
        iv: 55,
        gexIntensity: 50,
        vannaIntensity: 40,
        charmIntensity: 30,
        oiIntensity: 20,
        gexBand: 'HIGH',
        vannaBand: 'MEDIUM',
        charmBand: 'MEDIUM',
        oiBand: 'LOW',
        confluenceScore: 50,
        confluenceBand: 'HIGH',
        behaviorZone: 'NEUTRAL',
        gex: gexExposure,
        callGex: Math.max(0, gexExposure),
        putGex: Math.min(0, gexExposure),
        openInterest: 10,
        gamma: 0.001,
    };
}
