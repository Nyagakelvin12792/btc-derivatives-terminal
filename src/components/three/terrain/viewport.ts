import type { TerrainDataContractV2 } from '@/lib/terrain/types';
import { createSymmetricFinancialScale, formatFinancialAxis, formatStrikeAxis, niceCeil } from './scales';
import type { TerrainMetric } from './metric';
import { getMetricConfig } from './metric';

export interface TerrainAxisTick {
    value: number;
    normalizedPosition: number;
    label: string;
}

export type StructuralAnchorType = 'spot' | 'gammaFlip' | 'callWall' | 'putWall' | 'maxPain';

export interface StructuralAnchor {
    id: StructuralAnchorType;
    label: string;
    strike: number;
    normalizedPosition: number;
    inDomain: boolean;
    priority: number;
}

export interface TerrainViewportModel {
    metric: TerrainMetric;
    strikeDomain: [number, number];
    dteDomain: [number, number];
    exposureDomain: [number, number];
    strikeTicks: TerrainAxisTick[];
    dteTicks: TerrainAxisTick[];
    exposureTicks: TerrainAxisTick[];
    zoomLevel: number;
    structuralAnchors: StructuralAnchor[];
}

export interface TerrainViewportOptions {
    zoomLevel?: number;
    centerStrike?: number;
    centerDte?: number;
    centerExposure?: number;
}

interface FullDomains {
    strike: [number, number];
    dte: [number, number];
    exposure: [number, number];
}

export function createTerrainViewportModel(
    data: TerrainDataContractV2,
    metric: TerrainMetric,
    options: TerrainViewportOptions = {}
): TerrainViewportModel {
    const fullDomains = getFullDomains(data, metric);
    const zoomLevel = sanitizeZoom(options.zoomLevel ?? 1);
    const strikeDomain = zoomDomain(fullDomains.strike, options.centerStrike ?? midpoint(fullDomains.strike), zoomLevel);
    const dteDomain = zoomDomain(fullDomains.dte, options.centerDte ?? midpoint(fullDomains.dte), zoomLevel);
    const exposureDomain = zoomDomain(fullDomains.exposure, options.centerExposure ?? 0, zoomLevel);

    return {
        metric,
        strikeDomain,
        dteDomain,
        exposureDomain,
        strikeTicks: generateLinearTicks(strikeDomain, 8, formatStrikeAxis),
        dteTicks: generateLinearTicks(dteDomain, 7, formatDte),
        exposureTicks: generateLinearTicks(exposureDomain, 9, formatFinancialAxis),
        zoomLevel,
        structuralAnchors: buildStructuralAnchors(data, strikeDomain),
    };
}

export function zoomTerrainViewport(
    data: TerrainDataContractV2,
    viewport: TerrainViewportModel,
    factor: number,
    focus?: { strike?: number; dte?: number; exposure?: number }
): TerrainViewportModel {
    const nextZoom = sanitizeZoom(viewport.zoomLevel * (Number.isFinite(factor) && factor > 0 ? factor : 1));
    return createTerrainViewportModel(data, viewport.metric, {
        zoomLevel: nextZoom,
        centerStrike: focus?.strike ?? midpoint(viewport.strikeDomain),
        centerDte: focus?.dte ?? midpoint(viewport.dteDomain),
        centerExposure: focus?.exposure ?? midpoint(viewport.exposureDomain),
    });
}

export function panTerrainViewport(
    data: TerrainDataContractV2,
    viewport: TerrainViewportModel,
    delta: { strike?: number; dte?: number; exposure?: number }
): TerrainViewportModel {
    return createTerrainViewportModel(data, viewport.metric, {
        zoomLevel: viewport.zoomLevel,
        centerStrike: midpoint(viewport.strikeDomain) + (delta.strike ?? 0),
        centerDte: midpoint(viewport.dteDomain) + (delta.dte ?? 0),
        centerExposure: midpoint(viewport.exposureDomain) + (delta.exposure ?? 0),
    });
}

function getFullDomains(data: TerrainDataContractV2, metric: TerrainMetric): FullDomains {
    const strike = minMax(data.strikes);
    const dte = minMax(data.dtes);
    const scale = getMetricConfig(metric).scale(data);
    const exposureBound = createSymmetricFinancialScale(scale.robustAbsMax, 9).bound;
    return {
        strike,
        dte,
        exposure: [-exposureBound, exposureBound],
    };
}

function generateLinearTicks(domain: [number, number], targetCount: number, formatter: (value: number) => string): TerrainAxisTick[] {
    const [min, max] = normalizeDomain(domain);
    const span = max - min;
    if (span <= 0) return [{ value: min, normalizedPosition: 0.5, label: formatter(min) }];

    const rawStep = span / Math.max(1, targetCount - 1);
    const step = niceCeil(rawStep);
    const start = Math.ceil(min / step) * step;
    const ticks: TerrainAxisTick[] = [];

    for (let value = start; value <= max + step * 0.1; value += step) {
        if (value < min - step * 0.01 || value > max + step * 0.01) continue;
        ticks.push({
            value: round(value, 6),
            normalizedPosition: round((value - min) / span, 6),
            label: formatter(value),
        });
    }

    if (!ticks.some((tick) => Math.abs(tick.value) < step * 0.001) && min < 0 && max > 0) {
        ticks.push({ value: 0, normalizedPosition: round((0 - min) / span, 6), label: formatter(0) });
    }

    return ticks
        .sort((a, b) => a.value - b.value)
        .filter((tick, index, entries) => index === 0 || Math.abs(tick.value - entries[index - 1].value) > step * 0.1);
}

function buildStructuralAnchors(data: TerrainDataContractV2, strikeDomain: [number, number]): StructuralAnchor[] {
    const anchors: Array<Omit<StructuralAnchor, 'normalizedPosition' | 'inDomain'>> = [
        { id: 'spot', label: `SPOT ${formatStrikeAxis(data.spotPrice)}`, strike: data.spotPrice, priority: 1 },
        { id: 'gammaFlip', label: `FLIP ${formatStrikeAxis(data.keyLevels.gammaFlip.strike)}`, strike: data.keyLevels.gammaFlip.strike, priority: 2 },
        { id: 'callWall', label: `CALL WALL ${formatStrikeAxis(data.keyLevels.callWall.strike)}`, strike: data.keyLevels.callWall.strike, priority: 3 },
        { id: 'putWall', label: `PUT WALL ${formatStrikeAxis(data.keyLevels.putWall.strike)}`, strike: data.keyLevels.putWall.strike, priority: 3 },
    ];

    if (data.keyLevels.primaryMaxPain) {
        anchors.push({
            id: 'maxPain',
            label: `MAX PAIN ${formatStrikeAxis(data.keyLevels.primaryMaxPain.strike)}`,
            strike: data.keyLevels.primaryMaxPain.strike,
            priority: 4,
        });
    }

    return anchors
        .sort((a, b) => a.priority - b.priority)
        .map((anchor) => {
            const normalizedPosition = normalized(anchor.strike, strikeDomain);
            return {
                ...anchor,
                normalizedPosition,
                inDomain: normalizedPosition >= 0 && normalizedPosition <= 1,
            };
        });
}

function zoomDomain(fullDomain: [number, number], center: number, zoomLevel: number): [number, number] {
    const [fullMin, fullMax] = normalizeDomain(fullDomain);
    const fullSpan = fullMax - fullMin;
    if (fullSpan <= 0) return [fullMin, fullMax];

    const span = fullSpan / sanitizeZoom(zoomLevel);
    const clampedCenter = clamp(center, fullMin, fullMax);
    let min = clampedCenter - span / 2;
    let max = clampedCenter + span / 2;

    if (min < fullMin) {
        max += fullMin - min;
        min = fullMin;
    }
    if (max > fullMax) {
        min -= max - fullMax;
        max = fullMax;
    }

    return [round(Math.max(fullMin, min), 6), round(Math.min(fullMax, max), 6)];
}

function normalized(value: number, domain: [number, number]): number {
    const [min, max] = normalizeDomain(domain);
    const span = max - min;
    if (span <= 0) return 0.5;
    return round((value - min) / span, 6);
}

function minMax(values: readonly number[]): [number, number] {
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return [0, 1];
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    return min === max ? [min, min + 1] : [min, max];
}

function normalizeDomain(domain: [number, number]): [number, number] {
    const [a, b] = domain;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [0, 1];
    if (a === b) return [a, a + 1];
    return a < b ? [a, b] : [b, a];
}

function midpoint(domain: [number, number]): number {
    return (domain[0] + domain[1]) / 2;
}

function sanitizeZoom(value: number): number {
    return clamp(Number.isFinite(value) ? value : 1, 1, 12);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function formatDte(value: number): string {
    return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
}

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
