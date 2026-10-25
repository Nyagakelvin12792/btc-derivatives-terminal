import { BinanceLiquidityEngine } from './liquidity-engine';
import type { BinanceDepthSnapshot } from './types';
import type { LiquidityResetReason, LiquidityWorkerConfig, LiquidityWorkerEvent } from './liquidity-worker-protocol';

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

export interface LiquidityRuntimeSocket {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    close(): void;
}

export interface LiquidityRuntimeDependencies {
    createSocket(url: string): LiquidityRuntimeSocket;
    fetchSnapshot(url: string): Promise<BinanceDepthSnapshot>;
    emit(event: LiquidityWorkerEvent): void;
    now(): number;
    setTimeout(handler: () => void, delayMs: number): TimeoutHandle;
    clearTimeout(handle: TimeoutHandle): void;
    setInterval(handler: () => void, delayMs: number): IntervalHandle;
    clearInterval(handle: IntervalHandle): void;
}

/**
 * Owns the browser-side networking lifecycle outside React. The deterministic
 * engine remains the only authority for sequence validity and heatmap frames.
 */
export class BinanceLiquidityRuntime {
    private readonly dependencies: LiquidityRuntimeDependencies;
    private config: LiquidityWorkerConfig | null = null;
    private engine: BinanceLiquidityEngine | null = null;
    private socket: LiquidityRuntimeSocket | null = null;
    private reconnectTimer: TimeoutHandle | null = null;
    private snapshotRetryTimer: TimeoutHandle | null = null;
    private captureTimer: IntervalHandle | null = null;
    private statusTimer: IntervalHandle | null = null;
    private snapshotInFlight = false;
    private generation = 0;
    private running = false;
    private paused = false;
    private connected = false;
    private reconnectAttempt = 0;

    constructor(dependencies: LiquidityRuntimeDependencies) {
        this.dependencies = dependencies;
    }

    start(config: LiquidityWorkerConfig): void {
        this.stop(false);
        this.config = config;
        this.engine = new BinanceLiquidityEngine({
            orderBook: config.orderBook,
            heatmap: config.heatmap,
            captureDepth: config.captureDepth,
            staleAfterMs: config.staleAfterMs,
        });
        this.running = true;
        this.paused = false;
        this.connected = false;
        this.reconnectAttempt = 0;
        this.generation += 1;
        this.captureTimer = this.dependencies.setInterval(() => this.capture(), config.captureIntervalMs);
        this.statusTimer = this.dependencies.setInterval(() => this.emitStatus(), config.statusIntervalMs);
        this.connect(false);
    }

    pause(): void {
        if (!this.running) return;
        this.paused = true;
        this.emitStatus();
    }

    resume(): void {
        if (!this.running) return;
        this.paused = false;
        this.emitStatus();
    }

    clear(): void {
        if (!this.engine) return;
        this.engine.clearHistory();
        this.emitReset('CLEAR');
        this.emitStatus();
    }

    stop(emitStatus = true): void {
        this.running = false;
        this.connected = false;
        this.snapshotInFlight = false;
        this.generation += 1;
        this.clearTimers();
        if (this.socket) {
            this.detachSocket(this.socket);
            this.socket.close();
            this.socket = null;
        }
        this.engine?.markOffline();
        if (emitStatus) this.emitStatus();
    }

    private connect(isReconnect: boolean): void {
        if (!this.running || !this.config || !this.engine) return;
        if (isReconnect) this.emitReset('RECONNECT');
        this.engine.beginReconnect();
        this.connected = false;
        this.emitStatus();
        const generation = this.generation;
        let socket: LiquidityRuntimeSocket;
        try {
            socket = this.dependencies.createSocket(this.config.streamUrl);
        } catch {
            this.emitError('SOCKET_UNAVAILABLE', 'Live depth stream could not be opened.');
            this.scheduleReconnect();
            return;
        }
        this.socket = socket;
        socket.onopen = () => {
            if (!this.isCurrent(generation, socket)) return;
            this.connected = true;
            this.emitStatus();
            void this.requestSnapshot(generation);
        };
        socket.onmessage = (event) => {
            if (!this.isCurrent(generation, socket) || !this.engine) return;
            try {
                if (typeof event.data !== 'string') throw new TypeError('Depth event was not text');
                const result = this.engine.ingestPayload(JSON.parse(event.data));
                if (result === 'RESYNC_REQUIRED') {
                    this.emitReset('GAP');
                    this.emitStatus();
                    void this.requestSnapshot(generation);
                }
            } catch {
                this.emitError('INVALID_EVENT', 'An invalid live depth event was ignored.');
            }
        };
        socket.onerror = () => {
            if (!this.isCurrent(generation, socket)) return;
            this.emitError('SOCKET_UNAVAILABLE', 'Live depth stream encountered a connection error.');
        };
        socket.onclose = () => {
            if (!this.isCurrent(generation, socket) || !this.engine) return;
            this.detachSocket(socket);
            this.socket = null;
            this.connected = false;
            this.engine.markOffline();
            this.scheduleReconnect();
        };
    }

    private async requestSnapshot(generation: number): Promise<void> {
        if (!this.running || !this.connected || !this.config || !this.engine || this.snapshotInFlight) return;
        this.snapshotInFlight = true;
        try {
            const snapshot = await this.dependencies.fetchSnapshot(this.config.snapshotUrl);
            if (generation !== this.generation || !this.running || !this.connected || !this.engine) return;
            const result = this.engine.bootstrap(snapshot);
            if (result.state === 'LIVE') {
                this.reconnectAttempt = 0;
                this.emitStatus();
            } else {
                this.emitReset('GAP');
                this.scheduleSnapshotRetry(generation);
            }
        } catch {
            if (generation !== this.generation || !this.running) return;
            this.emitError('SNAPSHOT_UNAVAILABLE', 'Live depth snapshot is temporarily unavailable.');
            this.scheduleSnapshotRetry(generation);
        } finally {
            if (generation === this.generation) this.snapshotInFlight = false;
        }
    }

    private scheduleSnapshotRetry(generation: number): void {
        if (!this.running || !this.connected || !this.config || this.snapshotRetryTimer) return;
        this.snapshotRetryTimer = this.dependencies.setTimeout(() => {
            this.snapshotRetryTimer = null;
            void this.requestSnapshot(generation);
        }, this.config.snapshotRetryMs);
    }

    private scheduleReconnect(): void {
        if (!this.running || !this.config || this.reconnectTimer) return;
        this.reconnectAttempt += 1;
        const exponent = Math.max(0, this.reconnectAttempt - 1);
        const delay = Math.min(this.config.reconnectMaxMs, this.config.reconnectBaseMs * 2 ** exponent);
        this.emitStatus();
        this.reconnectTimer = this.dependencies.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(true);
        }, delay);
    }

    private capture(): void {
        if (!this.running || this.paused || !this.engine) return;
        const frame = this.engine.capture(this.dependencies.now());
        if (!frame) return;
        const telemetry = this.engine.getTelemetry(this.dependencies.now());
        this.dependencies.emit({ type: 'FRAME', frame, coverage: telemetry.coverage });
        this.emitStatus();
    }

    private emitStatus(): void {
        if (!this.engine) return;
        const telemetry = this.engine.getTelemetry(this.dependencies.now());
        this.dependencies.emit({
            type: 'STATUS',
            connected: this.connected,
            paused: this.paused,
            reconnectAttempt: this.reconnectAttempt,
            resyncRequired: telemetry.resyncRequired,
            sequence: telemetry.sequence,
            coverage: telemetry.coverage,
        });
    }

    private emitReset(reason: LiquidityResetReason): void {
        this.dependencies.emit({ type: 'RESET', reason });
    }

    private emitError(code: 'INVALID_EVENT' | 'SNAPSHOT_UNAVAILABLE' | 'SOCKET_UNAVAILABLE', message: string): void {
        this.dependencies.emit({ type: 'ERROR', code, message, recoverable: true });
    }

    private clearTimers(): void {
        if (this.reconnectTimer) this.dependencies.clearTimeout(this.reconnectTimer);
        if (this.snapshotRetryTimer) this.dependencies.clearTimeout(this.snapshotRetryTimer);
        if (this.captureTimer) this.dependencies.clearInterval(this.captureTimer);
        if (this.statusTimer) this.dependencies.clearInterval(this.statusTimer);
        this.reconnectTimer = null;
        this.snapshotRetryTimer = null;
        this.captureTimer = null;
        this.statusTimer = null;
    }

    private detachSocket(socket: LiquidityRuntimeSocket): void {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
    }

    private isCurrent(generation: number, socket: LiquidityRuntimeSocket): boolean {
        return this.running && generation === this.generation && socket === this.socket;
    }
}
