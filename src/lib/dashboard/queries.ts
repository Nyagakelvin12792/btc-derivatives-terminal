import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { TerrainDataContractV2 } from '@/lib/terrain/types';
import { createCanonicalDashboardData } from './adapters';

// Zod Schema for API Boundary Runtime Validation
export const TerrainDataSchema = z.object({
    schemaVersion: z.number(),
    timestamp: z.string(),
    dataMode: z.enum(['LIVE', 'DEMO', 'DEGRADED']),
    assumptionModel: z.string(),
    spotPrice: z.number(),
    summary: z.object({
        totalCallGex: z.number(),
        totalPutGex: z.number(),
        netGex: z.number(),
        totalVannaExposure: z.number(),
        totalCharmExposure: z.number(),
        totalOpenInterest: z.number(),
        gammaFlip: z.number(),
        maxPainStrike: z.number(),
        topPositiveGexStrike: z.number(),
        topNegativeGexStrike: z.number(),
        callWallExposure: z.number(),
        putWallExposure: z.number(),
        contractsCount: z.number(),
    }),
    scales: z.object({
        gex: z.object({ min: z.number(), max: z.number(), robustAbsMax: z.number(), unit: z.string() }),
        vanna: z.object({ min: z.number(), max: z.number(), robustAbsMax: z.number(), unit: z.string() }),
        charm: z.object({ min: z.number(), max: z.number(), robustAbsMax: z.number(), unit: z.string() }),
        openInterest: z.object({ min: z.number(), max: z.number(), robustAbsMax: z.number(), unit: z.string() }),
    }),
    strikes: z.array(z.number()),
    expirations: z.array(z.string()),
    dtes: z.array(z.number()),
    surfaceGrid: z.array(z.array(z.any())),
    keyLevels: z.any(),
    maxPainByExpiry: z.array(z.any()),
    confluenceLevels: z.array(z.any()),
    vannaContours: z.array(z.any()),
    charmGlyphs: z.array(z.any()),
    confluenceFloor: z.array(z.array(z.any())),
    keyContracts: z.array(z.any()),
});

export async function fetchTerrainData(mode: 'LIVE' | 'DEMO' | 'DEGRADED'): Promise<TerrainDataContractV2> {
    const url = mode === 'DEMO' ? '/api/deribit?mode=demo' : '/api/deribit';
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Failed to fetch terrain feed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    const parsed = TerrainDataSchema.safeParse(json);

    if (!parsed.success) {
        console.warn('Terrain API schema validation warning:', parsed.error);
        return json as TerrainDataContractV2;
    }

    return parsed.data as TerrainDataContractV2;
}

export function useTerrainQuery(dataMode: 'LIVE' | 'DEMO' | 'DEGRADED') {
    return useQuery({
        queryKey: ['terrainData', dataMode],
        queryFn: () => fetchTerrainData(dataMode),
        refetchInterval: dataMode === 'LIVE' ? 3000 : false,
        staleTime: dataMode === 'LIVE' ? 2500 : Infinity,
        retry: 2,
        refetchOnWindowFocus: dataMode === 'LIVE',
    });
}
