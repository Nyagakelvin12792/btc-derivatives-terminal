import type { TerrainDataContractV2, TerrainDataMode } from './types';

function positivePrice(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function strike(value: unknown): number | undefined {
    return positivePrice(value && typeof value === 'object' ? (value as { strike?: unknown }).strike : value);
}

export function resolveOptionLevels(data: TerrainDataContractV2, mode: TerrainDataMode, isError: boolean) {
    const isDemo = mode === 'DEMO' && data.dataMode === 'DEMO';
    if (!isDemo && (mode !== 'LIVE' || data.dataMode !== 'LIVE' || isError)) {
        return { available: false } as const;
    }

    const { keyLevels, summary } = data;
    const callExposure = keyLevels?.callWall?.exposure ?? summary.callWallExposure;
    const putExposure = keyLevels?.putWall?.exposure ?? summary.putWallExposure;
    const demoSummary = isDemo ? summary as typeof summary & { callWall?: number; putWall?: number } : undefined;
    const demoSpot = isDemo ? positivePrice(data.spotPrice) ?? 68_000 : undefined;
    return {
        available: true,
        callWall: !isDemo && callExposure === 0 ? undefined : strike(keyLevels?.callWall) ?? positivePrice(summary.topPositiveGexStrike) ?? positivePrice(demoSummary?.callWall)
            ?? (demoSpot === undefined ? undefined : demoSpot * 1.05),
        putWall: !isDemo && putExposure === 0 ? undefined : strike(keyLevels?.putWall) ?? positivePrice(summary.topNegativeGexStrike) ?? positivePrice(demoSummary?.putWall)
            ?? (demoSpot === undefined ? undefined : demoSpot * 0.95),
        gammaFlip: strike(keyLevels?.gammaFlip) ?? positivePrice(summary.gammaFlip) ?? demoSpot,
        maxPain: strike(keyLevels?.primaryMaxPain) ?? positivePrice(summary.maxPainStrike) ?? demoSpot,
        netGex: Number.isFinite(summary.netGex) ? summary.netGex : undefined,
    } as const;
}
