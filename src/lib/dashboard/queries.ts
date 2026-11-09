import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { TerrainDataContractV2 } from '@/lib/terrain/types';
import type { DeribitDteFilter } from '@/lib/deribit/dte-filter';

// Strict Zod Schema for API Boundary Runtime Validation (UX20.1-LIVE-01 / P1-3)
export const TerrainDataSchema = z.object({
    schemaVersion: z.number().int().positive(),
    timestamp: z.iso.datetime(),
    sourceTime: z.iso.datetime().optional(),
    coverage: z.object({ received: z.number().int().nonnegative().optional(), valid: z.number().int().nonnegative().optional(), selected: z.number().int().nonnegative() }).optional(),
    dataMode: z.enum(['LIVE', 'DEMO', 'DEGRADED']),
    assumptionModel: z.string().min(1),
    spotPrice: z.number().finite().positive(),
    summary: z.object({
        totalCallGex: z.number().finite(),
        totalPutGex: z.number().finite(),
        netGex: z.number().finite(),
        totalVannaExposure: z.number().finite(),
        totalCharmExposure: z.number().finite(),
        totalOpenInterest: z.number().finite().nonnegative(),
        gammaFlip: z.number().finite().nonnegative(),
        maxPainStrike: z.number().finite().nonnegative(),
        topPositiveGexStrike: z.number().finite().nonnegative(),
        topNegativeGexStrike: z.number().finite().nonnegative(),
        callWallExposure: z.number().finite(),
        putWallExposure: z.number().finite(),
        contractsCount: z.number().int().nonnegative(),
    }),
    scales: z.object({
        gex: z.object({ min: z.number().finite(), max: z.number().finite(), robustAbsMax: z.number().finite(), unit: z.string() }),
        vanna: z.object({ min: z.number().finite(), max: z.number().finite(), robustAbsMax: z.number().finite(), unit: z.string() }),
        charm: z.object({ min: z.number().finite(), max: z.number().finite(), robustAbsMax: z.number().finite(), unit: z.string() }),
        openInterest: z.object({ min: z.number().finite(), max: z.number().finite(), robustAbsMax: z.number().finite(), unit: z.string() }),
    }),
    strikes: z.array(z.number().finite().positive()),
    expirations: z.array(z.string()),
    dtes: z.array(z.number().finite().nonnegative()),
    surfaceGrid: z.array(z.array(z.looseObject({
        strike: z.number().positive(), expiry: z.string().min(1), dte: z.number().nonnegative(),
        observed: z.boolean(), gexExposure: z.number(), openInterestBtc: z.number().nonnegative(),
        iv: z.number().positive().nullable(),
    }))),
    keyLevels: z.record(z.string(), z.unknown()),
    maxPainByExpiry: z.array(z.unknown()),
    confluenceLevels: z.array(z.unknown()),
    vannaContours: z.array(z.unknown()),
    charmGlyphs: z.array(z.unknown()),
    confluenceFloor: z.array(z.array(z.unknown())),
    keyContracts: z.array(z.unknown()),
});

export async function fetchTerrainData(
    mode: 'LIVE' | 'DEMO' | 'DEGRADED',
    dteFilter: DeribitDteFilter = 'ALL',
    exactExpiry?: string | null,
): Promise<TerrainDataContractV2> {
    const params = new URLSearchParams({ dte: dteFilter });
    if (mode === 'DEMO') {
        params.set('mode', 'demo');
    } else if (mode === 'LIVE') {
        params.set('strict', '1');
    }
    if (exactExpiry && exactExpiry.trim().length > 0 && exactExpiry !== 'ALL') {
        params.set('expiry', exactExpiry.trim());
    }

    const url = `/api/deribit?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Failed to fetch terrain feed: ${res.status} ${res.statusText}`);
    }

    const json: unknown = await res.json();
    const parsed = TerrainDataSchema.safeParse(json);

    if (!parsed.success) {
        throw new Error(`Terrain API schema validation failed: ${parsed.error.issues[0]?.message ?? 'Malformed payload'}`);
    }

    if (mode === 'LIVE' && (parsed.data.dataMode !== 'LIVE' || !parsed.data.sourceTime || Date.now() - Date.parse(parsed.data.sourceTime) > 60_000 || Date.parse(parsed.data.sourceTime) - Date.now() > 5_000)) {
        throw new Error('Deribit options payload is unavailable or stale');
    }

    return parsed.data as unknown as TerrainDataContractV2;
}

export function useTerrainQuery(
    dataMode: 'LIVE' | 'DEMO' | 'DEGRADED',
    dteFilter: DeribitDteFilter = 'ALL',
    exactExpiry?: string | null,
) {
    const normalizedExpiry = exactExpiry && exactExpiry.trim().length > 0 ? exactExpiry.trim() : 'ALL';
    return useQuery({
        queryKey: ['terrainData', dataMode, dteFilter, normalizedExpiry],
        queryFn: () => fetchTerrainData(dataMode, dteFilter, exactExpiry),
        refetchInterval: dataMode === 'LIVE' ? 3000 : false,
        staleTime: dataMode === 'LIVE' ? 2500 : Infinity,
        retry: 1,
        refetchOnWindowFocus: dataMode === 'LIVE',
    });
}
