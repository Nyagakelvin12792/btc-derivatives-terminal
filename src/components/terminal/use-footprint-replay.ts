'use client';

import { useEffect, useRef, useState } from 'react';
import type { FootprintReplayCommand, FootprintReplayEvent } from '../../lib/orderflow/footprint-replay.worker';
import type { TrueFlowInterval } from '../../lib/orderflow/true-flow-contracts';

export function useFootprintReplay(enabled: boolean, main: TrueFlowInterval, footprint: TrueFlowInterval) {
    const worker = useRef<Worker | null>(null);
    const requestId = useRef(0);
    const [tape, setTape] = useState<Extract<FootprintReplayEvent, { type: 'loaded' }> | null>(null);
    const [view, setView] = useState<Extract<FootprintReplayEvent, { type: 'view' }> | null>(null);
    const [index, setIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => () => worker.current?.terminate(), []);

    const cursor = tape?.times[index];
    useEffect(() => {
        if (!enabled || cursor === undefined || !worker.current) return;
        const id = ++requestId.current;
        const timer = window.setTimeout(() => {
            const command: FootprintReplayCommand = { type: 'seek', requestId: id, cursorMs: cursor, main, footprint };
            worker.current?.postMessage(command);
        }, 45);
        return () => window.clearTimeout(timer);
    }, [enabled, cursor, main, footprint, tape]);

    function load(file: File | null) {
        requestId.current += 1;
        worker.current?.terminate();
        worker.current = null;
        setView(null);
        setTape(null);
        setIndex(0);
        setError(null);
        setLoading(Boolean(file));
        if (!file) return;
        try {
            const next = new Worker(new URL('../../lib/orderflow/footprint-replay.worker.ts', import.meta.url), {
                type: 'module', name: 'footprint-recorded-replay',
            });
            worker.current = next;
            next.onerror = () => {
                setError('Replay worker stopped.');
                setLoading(false);
            };
            next.onmessage = ({ data }: MessageEvent<FootprintReplayEvent>) => {
                if (data.type === 'loaded') {
                    setTape(data);
                    setLoading(false);
                } else if (data.type === 'view' && data.requestId === requestId.current) {
                    setView(data);
                    setError(null);
                } else if (data.type === 'error') {
                    setError(data.message);
                    setLoading(false);
                }
            };
            const command: FootprintReplayCommand = { type: 'load', file };
            next.postMessage(command);
        } catch {
            setError('Replay worker is unavailable.');
            setLoading(false);
        }
    }

    const matchingView = enabled && view && view.main.interval === main
        && (view.footprint?.interval ?? main) === footprint ? view : null;
    return {
        load, tape, index, setIndex, loading, error,
        pending: enabled && cursor !== undefined && cursor !== matchingView?.cursorMs,
        view: matchingView,
    };
}
