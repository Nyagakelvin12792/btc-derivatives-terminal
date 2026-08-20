import { describe, expect, it } from 'vitest';
import { createLinearMapper, generateDteTicks, generateStrikeTicks } from './axes';
import { buildInterpolatedRenderGrid, interpolateCellValue } from './interpolation';
import { METRIC_CONFIGS } from './metric';
import { clampForDisplay, createSymmetricFinancialScale, formatFinancialAxis } from './scales';
import { createTerrainViewportModel, panTerrainViewport, zoomTerrainViewport } from './viewport';
import type { TerrainDataContractV2, TerrainSurfaceCell } from '@/lib/terrain/types';

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

describe('terrain viewport axis contract', () => {
    it('creates normalized HUD axis ticks from visible quantitative domains', () => {
        const data = contract();
        const viewport = createTerrainViewportModel(data, 'gex');

        expect(viewport.metric).toBe('gex');
        expect(viewport.strikeDomain).toEqual([58000, 78000]);
        expect(viewport.dteDomain).toEqual([7, 90]);
        expect(viewport.exposureDomain).toEqual([-4000000000, 4000000000]);
        expect(viewport.exposureTicks.map((tick) => tick.label)).toContain('$0');
        expect(viewport.exposureTicks.every((tick) => tick.normalizedPosition >= 0 && tick.normalizedPosition <= 1)).toBe(true);
        expect(viewport.strikeTicks.every((tick) => tick.label.startsWith('$'))).toBe(true);
    });

    it('narrows domains semantically when zooming around a focus', () => {
        const data = contract();
        const viewport = createTerrainViewportModel(data, 'gex');
        const zoomed = zoomTerrainViewport(data, viewport, 4, { strike: 69000, dte: 30, exposure: 0 });

        expect(zoomed.zoomLevel).toBe(4);
        expect(zoomed.exposureDomain).toEqual([-1000000000, 1000000000]);
        expect(zoomed.exposureTicks.map((tick) => tick.label)).toContain('+$500M');
        expect(zoomed.strikeDomain[0]).toBeGreaterThan(viewport.strikeDomain[0]);
        expect(zoomed.strikeDomain[1]).toBeLessThan(viewport.strikeDomain[1]);
    });

    it('pans the visible domain while keeping terrain and axis anchors normalized to that domain', () => {
        const data = contract();
        const zoomed = createTerrainViewportModel(data, 'gex', { zoomLevel: 2, centerStrike: 68000, centerDte: 30 });
        const panned = panTerrainViewport(data, zoomed, { strike: 2500, dte: 10 });

        expect(panned.strikeDomain[0]).toBeGreaterThan(zoomed.strikeDomain[0]);
        expect(panned.dteDomain[0]).toBeGreaterThan(zoomed.dteDomain[0]);
        expect(panned.structuralAnchors.find((anchor) => anchor.id === 'spot')?.normalizedPosition).toBeGreaterThanOrEqual(0);
        expect(panned.structuralAnchors.find((anchor) => anchor.id === 'callWall')?.label).toContain('CALL WALL');
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

function contract(): TerrainDataContractV2 {
    const surfaceGrid = [
        [cell(58000, 7, -2.5e9), cell(68000, 7, 0.5e9), cell(78000, 7, 3.8e9)],
        [cell(58000, 30, -1.5e9), cell(68000, 30, 1.2e9), cell(78000, 30, 2.4e9)],
        [cell(58000, 90, -0.8e9), cell(68000, 90, 0.7e9), cell(78000, 90, 1.8e9)],
    ];

    return {
        schemaVersion: 2,
        timestamp: '2026-08-21T00:00:00.000Z',
        dataMode: 'DEMO',
        assumptionModel: 'OI_SIGN_PROXY_V1',
        spotPrice: 69000,
        summary: {
            totalCallGex: 1,
            totalPutGex: -1,
            netGex: 0,
            totalVannaExposure: 0,
            totalCharmExposure: 0,
            totalOpenInterest: 100,
            gammaFlip: 66000,
            maxPainStrike: 68000,
            topPositiveGexStrike: 74000,
            topNegativeGexStrike: 62000,
            callWallExposure: 1,
            putWallExposure: -1,
            contractsCount: 6,
        },
        scales: {
            gex: { min: -2.5e9, max: 3.8e9, robustAbsMax: 3.91e9, unit: 'USD / 1% BTC move' },
            vanna: { min: -500e6, max: 700e6, robustAbsMax: 763e6, unit: 'USD / vol point' },
            charm: { min: -1e6, max: 1e6, robustAbsMax: 1.37e6, unit: 'USD / day' },
            openInterest: { min: 0, max: 10, robustAbsMax: 10, unit: 'BTC' },
        },
        strikes: [58000, 68000, 78000],
        expirations: ['7D', '30D', '90D'],
        dtes: [7, 30, 90],
        surfaceGrid,
        keyLevels: {
            callWall: { strike: 74000, exposure: 1 },
            putWall: { strike: 62000, exposure: -1 },
            gammaFlip: { strike: 66000, gexExposure: 0, curve: [], crossings: [66000] },
            primaryMaxPain: { expiry: '30D', dte: 30, strike: 68000, pain: 0 },
        },
        maxPainByExpiry: [{ expiry: '30D', dte: 30, strike: 68000, pain: 0 }],
        confluenceLevels: [],
        vannaContours: [],
        charmGlyphs: [],
        confluenceFloor: [],
        keyContracts: [],
        topContracts: [],
    };
}
