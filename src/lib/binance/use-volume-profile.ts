'use client';

import { useQuery } from '@tanstack/react-query';
import type { BinanceMarketBar, BinanceVolumeProfileSnapshot } from './types';
import { selectVolumeProfileInterval } from './volume-profile';

interface VolumeProfileRange {
    startTimeSeconds: number;
    endTimeSeconds: number;
    displayBarSeconds: number;
}

async function fetchVolumeProfile(range: VolumeProfileRange): Promise<BinanceVolumeProfileSnapshot> {
    const spanSeconds = Math.max(range.displayBarSeconds, range.endTimeSeconds - range.startTimeSeconds + range.displayBarSeconds);
    const interval = selectVolumeProfileInterval(spanSeconds);
    const query = new URLSearchParams({
        interval,
        startTime: String(Math.round(range.startTimeSeconds * 1_000)),
        endTime: String(Math.round((range.endTimeSeconds + range.displayBarSeconds) * 1_000 - 1)),
    });
    const response = await fetch(`/api/binance/volume-profile?${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Binance volume profile feed failed with ${response.status}`);
    const payload = await response.json() as BinanceVolumeProfileSnapshot;
    if (payload.dataMode !== 'LIVE' || payload.source !== 'BINANCE_SPOT' || !Array.isArray(payload.candles)) {
        throw new Error('Binance volume profile feed returned an invalid contract');
    }
    return payload;
}

export interface BinanceVolumeProfileFeed {
    candles: BinanceMarketBar[];
    interval: BinanceVolumeProfileSnapshot['interval'] | null;
    state: 'IDLE' | 'LOADING' | 'LIVE' | 'STALE';
}

export function useBinanceVolumeProfile(range: VolumeProfileRange | null, enabled: boolean): BinanceVolumeProfileFeed {
    const query = useQuery({
        queryKey: ['binance-volume-profile', range?.startTimeSeconds, range?.endTimeSeconds, range?.displayBarSeconds],
        queryFn: () => fetchVolumeProfile(range!),
        enabled: enabled && range !== null,
        staleTime: 10_000,
        placeholderData: (previous) => previous,
        retry: 1,
    });

    return {
        candles: query.data?.candles ?? [],
        interval: query.data?.interval ?? null,
        state: !enabled || range === null ? 'IDLE' : query.isLoading ? 'LOADING' : query.isError ? 'STALE' : query.data ? 'LIVE' : 'LOADING',
    };
}
