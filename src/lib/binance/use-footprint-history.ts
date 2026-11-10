'use client';

import { useQuery } from '@tanstack/react-query';
import type { BinanceHistorySnapshot, BinanceInterval } from './types';

/** Independent Footprint uses OHLC history only for price context. The trade worker owns order flow. */
export function useFootprintHistory(interval: BinanceInterval, enabled: boolean) {
    return useQuery({
        queryKey: ['binance-footprint-ohlc', interval],
        enabled,
        staleTime: 30_000,
        refetchInterval: enabled ? 30_000 : false,
        retry: 1,
        queryFn: async ({ signal }) => {
            const response = await fetch(`/api/binance/history?interval=${interval}&limit=1000`, { signal });
            if (!response.ok) throw new Error('Independent candle history unavailable');
            const history = await response.json() as BinanceHistorySnapshot;
            if (history.dataMode !== 'LIVE' || history.source !== 'BINANCE_SPOT' || history.interval !== interval || !Array.isArray(history.candles)) {
                throw new Error('Unexpected independent candle history');
            }
            return history.candles;
        },
    });
}
