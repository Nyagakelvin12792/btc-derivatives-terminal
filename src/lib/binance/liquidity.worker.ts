import { BinanceLiquidityRuntime, type LiquidityRuntimeSocket } from './liquidity-runtime';
import {
    createLiquidityWorkerConfig,
    type LiquidityWorkerCommand,
    type LiquidityWorkerEvent,
} from './liquidity-worker-protocol';
import type { BinanceDepthSnapshot } from './types';

interface WorkerMessageEvent {
    data: unknown;
}

interface LiquidityWorkerScope {
    onmessage: ((event: WorkerMessageEvent) => void) | null;
    postMessage(event: LiquidityWorkerEvent): void;
}

const scope = globalThis as unknown as LiquidityWorkerScope;

function createSocket(url: string): LiquidityRuntimeSocket {
    const nativeSocket = new WebSocket(url);
    const adapter: LiquidityRuntimeSocket = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        close: () => nativeSocket.close(),
    };
    nativeSocket.onopen = () => adapter.onopen?.();
    nativeSocket.onmessage = (event) => adapter.onmessage?.({ data: event.data });
    nativeSocket.onerror = () => adapter.onerror?.();
    nativeSocket.onclose = () => adapter.onclose?.();
    return adapter;
}

async function fetchSnapshot(url: string): Promise<BinanceDepthSnapshot> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Depth snapshot request failed');
    const payload = await response.json() as Partial<BinanceDepthSnapshot>;
    if (payload.dataMode !== 'LIVE' || payload.source !== 'BINANCE_SPOT' || payload.symbol !== 'BTCUSDT' || !payload.book) {
        throw new TypeError('Depth snapshot contract was invalid');
    }
    return payload as BinanceDepthSnapshot;
}

const runtime = new BinanceLiquidityRuntime({
    createSocket,
    fetchSnapshot,
    emit: (event) => scope.postMessage(event),
    now: () => Date.now(),
    setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
    clearTimeout: (handle) => clearTimeout(handle),
    setInterval: (handler, delayMs) => setInterval(handler, delayMs),
    clearInterval: (handle) => clearInterval(handle),
});

function isCommand(value: unknown): value is LiquidityWorkerCommand {
    if (!value || typeof value !== 'object') return false;
    const type = (value as { type?: unknown }).type;
    return type === 'START' || type === 'PAUSE' || type === 'RESUME' || type === 'CLEAR' || type === 'STOP';
}

scope.onmessage = (message) => {
    if (!isCommand(message.data)) {
        scope.postMessage({ type: 'ERROR', code: 'INVALID_CONFIG', message: 'Liquidity worker received an invalid command.', recoverable: false });
        return;
    }
    const command = message.data;
    try {
        switch (command.type) {
            case 'START':
                runtime.start(createLiquidityWorkerConfig(command.config));
                break;
            case 'PAUSE':
                runtime.pause();
                break;
            case 'RESUME':
                runtime.resume();
                break;
            case 'CLEAR':
                runtime.clear();
                break;
            case 'STOP':
                runtime.stop();
                break;
        }
    } catch {
        scope.postMessage({ type: 'ERROR', code: 'INVALID_CONFIG', message: 'Liquidity worker configuration was rejected.', recoverable: false });
    }
};
