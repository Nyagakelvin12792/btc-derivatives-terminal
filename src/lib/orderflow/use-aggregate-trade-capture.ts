'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AggregateTradeCapabilityV1Schema } from './contracts';
import {
    createInitialAggregateTradeFeedState,
    reduceAggregateTradeFeedEvent,
    type AggregateTradeFeedState,
} from './aggregate-trade-feed-state';
import {
    createAggregateTradeWorkerConfig,
    type AggregateTradeWorkerCommand,
    type AggregateTradeWorkerConfig,
    type AggregateTradeWorkerConfigOverrides,
    type AggregateTradeWorkerEvent,
} from './aggregate-trade-worker-protocol';

export interface BinanceAggregateTradeFeed extends AggregateTradeFeedState {
    clear(): void;
}

export function useBinanceAggregateTradeCapture(
    requested: boolean,
    overrides: AggregateTradeWorkerConfigOverrides = {},
): BinanceAggregateTradeFeed {
    const configKey = JSON.stringify(createAggregateTradeWorkerConfig(overrides));
    const config = useMemo(() => JSON.parse(configKey) as AggregateTradeWorkerConfig, [configKey]);
    const workerRef = useRef<Worker | null>(null);
    const [state, setState] = useState<AggregateTradeFeedState>(() => (
        createInitialAggregateTradeFeedState(config.maxTrades, config.maxBoundaries)
    ));
    const inactiveState = useMemo(() => ({
        ...createInitialAggregateTradeFeedState(config.maxTrades, config.maxBoundaries),
        capability: 'DISABLED' as const,
    }), [config.maxBoundaries, config.maxTrades]);

    useEffect(() => {
        const initial = createInitialAggregateTradeFeedState(config.maxTrades, config.maxBoundaries);
        if (!requested) return;

        const controller = new AbortController();
        let disposed = false;
        let worker: Worker | null = null;

        const start = async () => {
            await Promise.resolve();
            if (disposed) return;
            setState(initial);
            try {
                const response = await fetch('/api/orderflow/config', {
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error('Order-flow capability request failed');
                const capability = AggregateTradeCapabilityV1Schema.parse(await response.json());
                if (disposed) return;
                if (!capability.enabled) {
                    setState({ ...initial, capability: 'DISABLED' });
                    return;
                }

                worker = new Worker(new URL('./aggregate-trade.worker.ts', import.meta.url), {
                    type: 'module',
                    name: 'binance-aggregate-trade-capture',
                });
                workerRef.current = worker;
                setState({ ...initial, capability: 'ENABLED' });
                worker.onmessage = (message: MessageEvent<AggregateTradeWorkerEvent>) => {
                    setState((current) => reduceAggregateTradeFeedEvent(current, message.data));
                };
                worker.onerror = () => {
                    setState((current) => ({
                        ...current,
                        capability: 'ERROR',
                        error: {
                            code: 'SOCKET_UNAVAILABLE',
                            message: 'The aggregate-trade worker stopped unexpectedly.',
                            recoverable: true,
                        },
                    }));
                };
                const command: AggregateTradeWorkerCommand = { type: 'START', config };
                worker.postMessage(command);
            } catch (error) {
                if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return;
                setState({
                    ...initial,
                    capability: 'ERROR',
                    error: {
                        code: 'CONFIG_UNAVAILABLE',
                        message: 'Aggregate-trade capture configuration is unavailable.',
                        recoverable: true,
                    },
                });
            }
        };
        void start();

        return () => {
            disposed = true;
            controller.abort();
            if (worker) {
                const stop: AggregateTradeWorkerCommand = { type: 'STOP' };
                worker.postMessage(stop);
                worker.terminate();
            }
            if (workerRef.current === worker) workerRef.current = null;
        };
    }, [config, requested]);

    const clear = useCallback(() => {
        const command: AggregateTradeWorkerCommand = { type: 'CLEAR' };
        workerRef.current?.postMessage(command);
    }, []);

    const visibleState = requested ? state : inactiveState;
    return useMemo(() => ({ ...visibleState, clear }), [clear, visibleState]);
}
