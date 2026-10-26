import { AggregateTradeTape } from './aggregate-trade-tape';
import type {
    AggregateTradeWorkerConfig,
    AggregateTradeWorkerErrorCode,
    AggregateTradeWorkerEvent,
} from './aggregate-trade-worker-protocol';
import type { ClassifiedTradeV1 } from './contracts';

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

export interface AggregateTradeRuntimeSocket {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    close(): void;
}

export interface AggregateTradeRuntimeDependencies {
    createSocket(url: string): AggregateTradeRuntimeSocket;
    emit(event: AggregateTradeWorkerEvent): void;
    now(): number;
    setTimeout(handler: () => void, delayMs: number): TimeoutHandle;
    clearTimeout(handle: TimeoutHandle): void;
    setInterval(handler: () => void, delayMs: number): IntervalHandle;
    clearInterval(handle: IntervalHandle): void;
}

function unwrapAggregateTradePayload(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const wrapper = value as Record<string, unknown>;
    if ('stream' in wrapper || 'data' in wrapper) {
        if (wrapper.stream !== 'btcusdt@aggTrade' || !('data' in wrapper)) {
            throw new TypeError('Combined stream wrapper was invalid');
        }
        return wrapper.data;
    }
    return value;
}

/** Owns the aggregate-trade WebSocket lifecycle outside React. */
export class BinanceAggregateTradeRuntime {
    private readonly dependencies: AggregateTradeRuntimeDependencies;
    private config: AggregateTradeWorkerConfig | null = null;
    private tape: AggregateTradeTape | null = null;
    private socket: AggregateTradeRuntimeSocket | null = null;
    private reconnectTimer: TimeoutHandle | null = null;
    private flushTimer: IntervalHandle | null = null;
    private statusTimer: IntervalHandle | null = null;
    private pendingBatch: ClassifiedTradeV1[] = [];
    private generation = 0;
    private running = false;
    private connected = false;
    private reconnectAttempt = 0;
    private continuityBreakPending = false;

    constructor(dependencies: AggregateTradeRuntimeDependencies) {
        this.dependencies = dependencies;
    }

    start(config: AggregateTradeWorkerConfig): void {
        this.stop(false);
        this.config = config;
        this.tape = new AggregateTradeTape(config);
        this.running = true;
        this.connected = false;
        this.reconnectAttempt = 0;
        this.continuityBreakPending = false;
        this.generation += 1;
        this.flushTimer = this.dependencies.setInterval(() => this.flush(), config.flushIntervalMs);
        this.statusTimer = this.dependencies.setInterval(() => this.emitStatus(), config.statusIntervalMs);
        this.connect();
    }

    clear(): void {
        if (!this.tape) return;
        this.pendingBatch = [];
        this.tape.clear();
        this.dependencies.emit({ type: 'RESET' });
        this.emitStatus();
    }

    stop(emitStatus = true): void {
        this.flush();
        this.running = false;
        this.connected = false;
        this.generation += 1;
        this.clearTimers();
        if (this.socket) {
            this.detachSocket(this.socket);
            this.socket.close();
            this.socket = null;
        }
        this.tape?.markOffline();
        if (emitStatus) this.emitStatus();
    }

    private connect(): void {
        if (!this.running || !this.config || !this.tape) return;
        this.tape.markBuffering();
        this.emitStatus();
        const generation = this.generation;
        let socket: AggregateTradeRuntimeSocket;
        try {
            socket = this.dependencies.createSocket(this.config.streamUrl);
        } catch {
            this.emitError('SOCKET_UNAVAILABLE', 'Live aggregate-trade stream could not be opened.');
            this.tape.markOffline();
            this.scheduleReconnect();
            return;
        }
        this.socket = socket;
        socket.onopen = () => {
            if (!this.isCurrent(generation, socket)) return;
            this.connected = true;
            this.reconnectAttempt = 0;
            this.emitStatus();
        };
        socket.onmessage = (event) => {
            if (!this.isCurrent(generation, socket) || !this.tape) return;
            let payload: unknown;
            try {
                if (typeof event.data !== 'string') throw new TypeError('Aggregate-trade event was not text');
                payload = unwrapAggregateTradePayload(JSON.parse(event.data));
            } catch {
                this.tape.ingest(null, this.dependencies.now());
                this.emitError('INVALID_EVENT', 'An invalid aggregate-trade event was ignored.');
                return;
            }
            const result = this.tape.ingest(payload, this.dependencies.now());
            if (result.status === 'INVALID') {
                this.emitError('INVALID_EVENT', 'An invalid aggregate-trade event was ignored.');
                return;
            }
            if (result.status !== 'ACCEPTED') return;
            this.continuityBreakPending = false;
            this.pendingBatch.push(result.trade);
            if (result.boundary) this.dependencies.emit({ type: 'BOUNDARY', boundary: result.boundary });
        };
        socket.onerror = () => {
            if (!this.isCurrent(generation, socket)) return;
            this.emitError('SOCKET_UNAVAILABLE', 'Live aggregate-trade stream encountered a connection error.');
        };
        socket.onclose = () => {
            if (!this.isCurrent(generation, socket) || !this.tape) return;
            this.detachSocket(socket);
            this.socket = null;
            this.connected = false;
            if (!this.continuityBreakPending) {
                const boundary = this.tape.markReconnect(this.dependencies.now());
                this.dependencies.emit({ type: 'BOUNDARY', boundary });
                this.continuityBreakPending = true;
            }
            this.tape.markOffline();
            this.scheduleReconnect();
        };
    }

    private scheduleReconnect(): void {
        if (!this.running || !this.config || this.reconnectTimer) return;
        this.reconnectAttempt += 1;
        const exponent = Math.max(0, this.reconnectAttempt - 1);
        const delay = Math.min(this.config.reconnectMaxMs, this.config.reconnectBaseMs * 2 ** exponent);
        this.emitStatus();
        this.reconnectTimer = this.dependencies.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private flush(): void {
        if (this.pendingBatch.length === 0) return;
        const trades = this.pendingBatch;
        this.pendingBatch = [];
        this.dependencies.emit({ type: 'TRADE_BATCH', trades });
        this.emitStatus();
    }

    private emitStatus(): void {
        if (!this.tape) return;
        const telemetry = this.tape.telemetry(this.dependencies.now());
        this.dependencies.emit({
            type: 'STATUS',
            connected: this.connected,
            reconnectAttempt: this.reconnectAttempt,
            retainedTradeCount: telemetry.retainedTradeCount,
            lastAggregateTradeId: telemetry.lastAggregateTradeId,
            coverage: telemetry.coverage,
            stats: telemetry.stats,
        });
    }

    private emitError(code: AggregateTradeWorkerErrorCode, message: string): void {
        this.dependencies.emit({ type: 'ERROR', code, message, recoverable: true });
    }

    private clearTimers(): void {
        if (this.reconnectTimer) this.dependencies.clearTimeout(this.reconnectTimer);
        if (this.flushTimer) this.dependencies.clearInterval(this.flushTimer);
        if (this.statusTimer) this.dependencies.clearInterval(this.statusTimer);
        this.reconnectTimer = null;
        this.flushTimer = null;
        this.statusTimer = null;
    }

    private detachSocket(socket: AggregateTradeRuntimeSocket): void {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
    }

    private isCurrent(generation: number, socket: AggregateTradeRuntimeSocket): boolean {
        return this.running && generation === this.generation && socket === this.socket;
    }
}
