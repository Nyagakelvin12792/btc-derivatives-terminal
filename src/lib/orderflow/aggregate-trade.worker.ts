import { BinanceAggregateTradeRuntime, type AggregateTradeRuntimeSocket } from './aggregate-trade-runtime';
import {
    createAggregateTradeWorkerConfig,
    type AggregateTradeWorkerCommand,
    type AggregateTradeWorkerEvent,
} from './aggregate-trade-worker-protocol';

interface WorkerMessageEvent {
    data: unknown;
}

interface AggregateTradeWorkerScope {
    onmessage: ((event: WorkerMessageEvent) => void) | null;
    postMessage(event: AggregateTradeWorkerEvent): void;
}

const scope = globalThis as unknown as AggregateTradeWorkerScope;

function createSocket(url: string): AggregateTradeRuntimeSocket {
    const nativeSocket = new WebSocket(url);
    const adapter: AggregateTradeRuntimeSocket = {
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

const runtime = new BinanceAggregateTradeRuntime({
    createSocket,
    emit: (event) => scope.postMessage(event),
    now: () => Date.now(),
    setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
    clearTimeout: (handle) => clearTimeout(handle),
    setInterval: (handler, delayMs) => setInterval(handler, delayMs),
    clearInterval: (handle) => clearInterval(handle),
});

function isCommand(value: unknown): value is AggregateTradeWorkerCommand {
    if (!value || typeof value !== 'object') return false;
    const type = (value as { type?: unknown }).type;
    return type === 'START' || type === 'CLEAR' || type === 'STOP';
}

scope.onmessage = (message) => {
    if (!isCommand(message.data)) {
        scope.postMessage({
            type: 'ERROR',
            code: 'INVALID_CONFIG',
            message: 'Aggregate-trade worker received an invalid command.',
            recoverable: false,
        });
        return;
    }
    try {
        if (message.data.type === 'START') runtime.start(createAggregateTradeWorkerConfig(message.data.config));
        if (message.data.type === 'CLEAR') runtime.clear();
        if (message.data.type === 'STOP') runtime.stop();
    } catch {
        scope.postMessage({
            type: 'ERROR',
            code: 'INVALID_CONFIG',
            message: 'Aggregate-trade worker configuration was rejected.',
            recoverable: false,
        });
    }
};
