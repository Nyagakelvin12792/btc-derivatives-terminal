'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeBinanceOrderBook } from './normalization';
import type {
    BinanceInterval,
    BinanceHistorySnapshot,
    BinanceMarketBar,
    BinanceMarketSnapshot,
    BinanceOrderBook,
    BinanceTicker24h,
    MarketFeedState,
} from './types';

const REST_REFRESH_MS = 30_000;
const STALE_AFTER_MS = 10_000;
const MAX_RECONNECT_MS = 15_000;
const HISTORY_PAGE_SIZE = 1_000;
const HISTORY_BAR_TARGET = 10_000;
const HISTORY_STALE_MS = 30 * 60_000;

function finite(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

function parseKlineEvent(payload: unknown): BinanceMarketBar | null {
    if (!payload || typeof payload !== 'object') return null;
    const event = payload as Record<string, unknown>;
    const kline = event.k;
    if (!kline || typeof kline !== 'object') return null;
    const bar = kline as Record<string, unknown>;
    const openTime = finite(bar.t);
    const closeTime = finite(bar.T);
    const open = finite(bar.o);
    const high = finite(bar.h);
    const low = finite(bar.l);
    const close = finite(bar.c);
    const volume = finite(bar.v);
    const quoteVolume = finite(bar.q);
    const trades = finite(bar.n);
    const takerBuyVolume = finite(bar.V);
    if ([openTime, closeTime, open, high, low, close, volume, quoteVolume, trades, takerBuyVolume].some((value) => value === null)) return null;
    const takerSellVolume = Math.max(0, volume! - takerBuyVolume!);
    return {
        time: Math.floor(openTime! / 1000), closeTime: closeTime!, open: open!, high: high!, low: low!, close: close!,
        volume: volume!, quoteVolume: quoteVolume!, trades: trades!, takerBuyVolume: takerBuyVolume!, takerSellVolume,
        delta: takerBuyVolume! - takerSellVolume,
    };
}

function parseCombinedMessage(raw: string): { stream: string; data: unknown; eventTime: number | null } | null {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.stream !== 'string' || !('data' in parsed)) return null;
        const data = parsed.data as Record<string, unknown> | null;
        return { stream: parsed.stream, data: parsed.data, eventTime: data ? finite(data.E) : null };
    } catch {
        return null;
    }
}

async function fetchMarketSnapshot(interval: BinanceInterval): Promise<BinanceMarketSnapshot> {
    const response = await fetch(`/api/binance/market?interval=${interval}&limit=${HISTORY_PAGE_SIZE}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Binance market feed failed with ${response.status}`);
    const payload = await response.json() as BinanceMarketSnapshot;
    if (payload.dataMode !== 'LIVE' || payload.source !== 'BINANCE_SPOT' || !Array.isArray(payload.candles)) {
        throw new Error('Binance market feed returned an invalid contract');
    }
    return payload;
}

async function fetchHistoricalCandles(interval: BinanceInterval, signal?: AbortSignal): Promise<BinanceMarketBar[]> {
    const barsByTime = new Map<number, BinanceMarketBar>();
    let endTime: number | null = null;

    while (barsByTime.size < HISTORY_BAR_TARGET) {
        const query = new URLSearchParams({ interval, limit: String(Math.min(HISTORY_PAGE_SIZE, HISTORY_BAR_TARGET - barsByTime.size)) });
        if (endTime !== null) query.set('endTime', String(endTime));
        const response = await fetch(`/api/binance/history?${query}`, { cache: 'no-store', signal });
        if (!response.ok) throw new Error(`Binance history feed failed with ${response.status}`);
        const payload = await response.json() as BinanceHistorySnapshot;
        if (payload.dataMode !== 'LIVE' || payload.source !== 'BINANCE_SPOT' || !Array.isArray(payload.candles)) {
            throw new Error('Binance history feed returned an invalid contract');
        }
        payload.candles.forEach((bar) => barsByTime.set(bar.time, bar));
        if (!payload.candles.length || payload.nextEndTime === null || payload.nextEndTime === endTime) break;
        endTime = payload.nextEndTime;
        if (payload.candles.length < Number(query.get('limit'))) break;
    }

    return [...barsByTime.values()].sort((left, right) => left.time - right.time).slice(-HISTORY_BAR_TARGET);
}

export interface BinanceMarketFeed {
    state: MarketFeedState;
    candles: BinanceMarketBar[];
    book: BinanceOrderBook | null;
    ticker: BinanceTicker24h | null;
    latencyMs: number | null;
    lastEventAt: number | null;
    coveragePercent: number;
    historyBarCount: number;
    historyTarget: number;
    historyLoading: boolean;
    isError: boolean;
}

export function useBinanceMarketFeed(interval: BinanceInterval, enabled: boolean): BinanceMarketFeed {
    const query = useQuery({
        queryKey: ['binance-market', interval],
        queryFn: () => fetchMarketSnapshot(interval),
        enabled,
        refetchInterval: enabled ? REST_REFRESH_MS : false,
        staleTime: 2_000,
        retry: 2,
    });
    const historyQuery = useQuery({
        queryKey: ['binance-history', interval, HISTORY_BAR_TARGET],
        queryFn: ({ signal }) => fetchHistoricalCandles(interval, signal),
        enabled,
        staleTime: HISTORY_STALE_MS,
        gcTime: HISTORY_STALE_MS * 2,
        refetchOnWindowFocus: false,
        retry: 1,
    });
    const [streamBars, setStreamBars] = useState<{ interval: BinanceInterval; bars: BinanceMarketBar[] }>({ interval, bars: [] });
    const [streamBook, setStreamBook] = useState<{ interval: BinanceInterval; book: BinanceOrderBook } | null>(null);
    const [socketStatus, setSocketStatus] = useState<{ interval: BinanceInterval; state: MarketFeedState }>({ interval, state: 'OFFLINE' });
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [lastEventAt, setLastEventAt] = useState<number | null>(null);

    useEffect(() => {
        if (!enabled) return;

        let stopped = false;
        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;

        const connect = () => {
            if (stopped) return;
            setSocketStatus({ interval, state: 'CONNECTING' });
            socket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=btcusdt@kline_${interval}/btcusdt@depth20`);
            socket.onopen = () => {
                attempt = 0;
                setSocketStatus({ interval, state: 'LIVE' });
            };
            socket.onmessage = (message) => {
                const combined = parseCombinedMessage(String(message.data));
                if (!combined) return;
                const receivedAt = Date.now();
                setLastEventAt(receivedAt);
                setLatencyMs(combined.eventTime === null ? null : Math.max(0, receivedAt - combined.eventTime));
                setSocketStatus({ interval, state: 'LIVE' });

                if (combined.stream.includes('@kline_')) {
                    const bar = parseKlineEvent(combined.data);
                    if (!bar) return;
                    setStreamBars((current) => {
                        const bars = current.interval === interval ? current.bars : [];
                        const previous = bars[bars.length - 1];
                        if (!previous || previous.time < bar.time) return { interval, bars: [...bars.slice(-3), bar] };
                        if (previous.time === bar.time) return { interval, bars: [...bars.slice(0, -1), bar] };
                        return current;
                    });
                } else if (combined.stream.includes('@depth20')) {
                    try {
                        setStreamBook({ interval, book: normalizeBinanceOrderBook(combined.data) });
                    } catch {
                        // Keep the last validated snapshot until the next valid depth event.
                    }
                }
            };
            socket.onerror = () => setSocketStatus({ interval, state: 'STALE' });
            socket.onclose = () => {
                if (stopped) return;
                setSocketStatus({ interval, state: 'OFFLINE' });
                const delay = Math.min(MAX_RECONNECT_MS, 1_000 * 2 ** attempt);
                attempt += 1;
                reconnectTimer = setTimeout(connect, delay);
            };
        };

        connect();
        const staleTimer = setInterval(() => {
            setLastEventAt((last) => {
                if (last !== null && Date.now() - last > STALE_AFTER_MS) setSocketStatus({ interval, state: 'STALE' });
                return last;
            });
        }, 2_000);

        return () => {
            stopped = true;
            clearInterval(staleTimer);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            socket?.close();
        };
    }, [enabled, interval]);

    const candles = useMemo(() => {
        const barsByTime = new Map((historyQuery.data ?? []).map((bar) => [bar.time, bar]));
        for (const bar of query.data?.candles ?? []) barsByTime.set(bar.time, bar);
        if (streamBars.interval === interval) {
            for (const bar of streamBars.bars) barsByTime.set(bar.time, bar);
        }
        return [...barsByTime.values()].sort((left, right) => left.time - right.time).slice(-HISTORY_BAR_TARGET);
    }, [historyQuery.data, interval, query.data?.candles, streamBars]);
    const book = streamBook?.interval === interval ? streamBook.book : query.data?.book ?? null;
    const ticker = query.data?.ticker ?? null;
    const effectiveLastEventAt = lastEventAt ?? (query.data ? Date.parse(query.data.timestamp) : null);
    const effectiveLatencyMs = latencyMs ?? query.data?.upstreamLatencyMs ?? null;

    const state = useMemo<MarketFeedState>(() => {
        if (!enabled) return 'OFFLINE';
        if (socketStatus.interval === interval && socketStatus.state === 'LIVE') return 'LIVE';
        if (candles.length) return 'STALE';
        if (query.isFetching) return 'CONNECTING';
        if (query.isError) return 'OFFLINE';
        return socketStatus.interval === interval ? socketStatus.state : 'CONNECTING';
    }, [candles.length, enabled, interval, query.isError, query.isFetching, socketStatus]);

    return {
        state,
        candles,
        book,
        ticker,
        latencyMs: effectiveLatencyMs,
        lastEventAt: effectiveLastEventAt,
        coveragePercent: Math.min(100, Math.round((candles.length / HISTORY_BAR_TARGET) * 100)),
        historyBarCount: candles.length,
        historyTarget: HISTORY_BAR_TARGET,
        historyLoading: historyQuery.isFetching,
        isError: query.isError && candles.length === 0,
    };
}
