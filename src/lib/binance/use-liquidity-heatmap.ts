'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createInitialLiquidityFeedState,
    reduceLiquidityFeedEvent,
    type LiquidityFeedState,
} from './liquidity-feed-state';
import {
    createLiquidityWorkerConfig,
    type LiquidityWorkerCommand,
    type LiquidityWorkerConfig,
    type LiquidityWorkerConfigOverrides,
    type LiquidityWorkerEvent,
} from './liquidity-worker-protocol';

export interface BinanceLiquidityHeatmapFeed extends LiquidityFeedState {
    pause(): void;
    resume(): void;
    clear(): void;
}

function workerErrorEvent(): LiquidityWorkerEvent {
    return {
        type: 'ERROR',
        code: 'SOCKET_UNAVAILABLE',
        message: 'The live liquidity worker stopped unexpectedly.',
        recoverable: true,
    };
}

/**
 * React-facing bridge for the dedicated Binance depth worker. High-frequency
 * reconstruction stays outside React; the UI receives only bounded frames and
 * low-frequency provenance/status changes.
 */
export function useBinanceLiquidityHeatmap(
    enabled: boolean,
    overrides: LiquidityWorkerConfigOverrides = {},
): BinanceLiquidityHeatmapFeed {
    const configKey = JSON.stringify(createLiquidityWorkerConfig(overrides));
    const config = useMemo(() => JSON.parse(configKey) as LiquidityWorkerConfig, [configKey]);
    const workerRef = useRef<Worker | null>(null);
    const [state, setState] = useState<LiquidityFeedState>(() => createInitialLiquidityFeedState(config.maxClientFrames));
    const inactiveState = useMemo(() => createInitialLiquidityFeedState(config.maxClientFrames), [config.maxClientFrames]);

    useEffect(() => {
        if (!enabled) return;

        const worker = new Worker(new URL('./liquidity.worker.ts', import.meta.url), {
            type: 'module',
            name: 'binance-liquidity-heatmap',
        });
        workerRef.current = worker;
        worker.onmessage = (message: MessageEvent<LiquidityWorkerEvent>) => {
            setState((current) => reduceLiquidityFeedEvent(
                current.maxClientFrames === config.maxClientFrames
                    ? current
                    : createInitialLiquidityFeedState(config.maxClientFrames),
                message.data,
            ));
        };
        worker.onerror = () => {
            setState((current) => reduceLiquidityFeedEvent(current, workerErrorEvent()));
        };
        const command: LiquidityWorkerCommand = { type: 'START', config };
        worker.postMessage(command);

        return () => {
            const stop: LiquidityWorkerCommand = { type: 'STOP' };
            worker.postMessage(stop);
            worker.terminate();
            if (workerRef.current === worker) workerRef.current = null;
        };
    }, [config, enabled]);

    const send = useCallback((command: LiquidityWorkerCommand) => workerRef.current?.postMessage(command), []);
    const pause = useCallback(() => send({ type: 'PAUSE' }), [send]);
    const resume = useCallback(() => send({ type: 'RESUME' }), [send]);
    const clear = useCallback(() => send({ type: 'CLEAR' }), [send]);

    const visibleState = enabled ? state : inactiveState;
    return useMemo(() => ({ ...visibleState, pause, resume, clear }), [clear, pause, resume, visibleState]);
}
