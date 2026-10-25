# CODEX HANDOFF REPORT — UX15.4 LIVE LIQUIDITY WORKER RUNTIME

>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> BRANCH: agent/codex
>>> COMMIT: 619cc95
>>> TESTS: PASS — focused worker/runtime tests; full Vitest 24 files/143 tests; TypeScript; targeted ESLint; Next.js 16.4.2 production build; production npm audit 0 vulnerabilities
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review worker lifecycle and sequence provenance, then allow Gemini to consume `useBinanceLiquidityHeatmap` in the heatmap renderer without duplicating networking or order-book logic
>>> TARGET: src/lib/binance/liquidity-worker-protocol.ts, src/lib/binance/liquidity-runtime.ts, src/lib/binance/liquidity.worker.ts, src/lib/binance/liquidity-feed-state.ts, src/lib/binance/use-liquidity-heatmap.ts, tests

## Delivered

- Preserved the sequence-safe Binance Spot depth foundation from `36c1104`.
- Added a dedicated browser Web Worker that owns:
  - `btcusdt@depth@100ms` WebSocket traffic;
  - fresh `/api/binance/depth?limit=500` bootstrap snapshots;
  - snapshot retry without discarding a healthy socket;
  - capped exponential WebSocket reconnects;
  - explicit gap resynchronization;
  - 500 ms render-frame capture rather than React updates on every 100 ms diff event;
  - periodic stale/offline/status reporting;
  - safe error messages that do not expose raw upstream details.
- Added a typed runtime controller that is testable without browser globals.
- Added a bounded React-facing reducer and `useBinanceLiquidityHeatmap` hook.
- Added pause, resume, clear, reset-reason, reconnect-attempt, warm-up, coverage, stale, gap, and offline states.
- Added `getTelemetry()` to the deterministic engine so status checks do not clone the complete heatmap history.
- Kept all work under `src/lib/binance/**`; no terminal component, visual renderer, route layout, risk UI, AI feature, or backend math was changed.

## Gemini Integration Contract

Import the client hook from:

```ts
import { useBinanceLiquidityHeatmap } from '../../lib/binance/use-liquidity-heatmap';
```

Create exactly one feed instance at the terminal ownership boundary:

```ts
const liquidityFeed = useBinanceLiquidityHeatmap(dataMode === 'LIVE', {
    heatmap: {
        tickSize: 10,
        visibleDepthBps: 100,
        minNotionalUsd: 0,
        maxFrames: 1_800,
        bucketMs: 500,
        maxLevelsPerSide: 400,
    },
    maxClientFrames: 1_800,
});
```

Renderer inputs:

- `liquidityFeed.frames`: chronological, bounded `LiquidityHeatmapFrame[]`.
- Each frame contains `capturedAt`, `eventTime`, `lastUpdateId`, best bid/ask, mid-price, and side-aware aggregated levels.
- `liquidityFeed.sequence.state`: `BUFFERING | LIVE | STALE | GAP | OFFLINE`.
- `liquidityFeed.coverage`: honest session-only start/end, frame count, capacity, and warm-up percentage.
- `liquidityFeed.connected`, `resyncRequired`, `reconnectAttempt`, and `error`: provenance/status UI.
- `liquidityFeed.pause()`, `resume()`, and `clear()`: renderer controls.
- `liquidityFeed.lastResetReason`: `CLEAR | GAP | RECONNECT`; use this to make discontinuities visible.

Required rendering behavior:

1. Render heatmap history only from `frames`; never derive history from the compact `depth20` book in `use-market-feed.ts`.
2. Freeze the last rendered frame for `STALE` or `OFFLINE`; do not synthesize or extrapolate liquidity.
3. Show `BUFFERING` while the stream is waiting for a sequence-valid REST bootstrap.
4. Break visual continuity for `GAP` and `RECONNECT`. The hook clears client frames when coverage restarts.
5. Pause stops frame capture but deliberately keeps reconstructing the live book; resume therefore returns to the current market rather than replaying stale depth.
6. Keep opacity, decay, palette, visibility, and renderer-side intensity scaling in Gemini-owned UI code. Do not move sequence validation or WebSocket handling into React.
7. The history is session-local and bounded. Do not label it as historical exchange depth before durable collection/storage exists.
8. After importing the hook into a reachable client component, rerun `npm run build`; this is the final bundler integration gate for the worker asset.

## Sequence and Recovery Contract

1. Open `wss://stream.binance.com:9443/ws/btcusdt@depth@100ms`.
2. Buffer validated diff events immediately.
3. Fetch `/api/binance/depth?limit=500` after the socket opens.
4. Bridge the first retained event across `snapshot.lastUpdateId + 1`.
5. Apply `U/u` updates in order; quantity zero deletes a level.
6. A future `U > localLastUpdateId + 1` creates an explicit `GAP`, clears continuity, and triggers a fresh snapshot.
7. Socket closure exposes `OFFLINE`, then reconnects with capped exponential backoff.
8. No frame is appended while buffering, stale, offline, or awaiting resynchronization.

## Verification Evidence

- Focused worker/runtime/reducer/config tests: 3 files, 10 tests passed.
- Full Vitest: 24 files, 143 tests passed.
- `npx tsc --noEmit`: passed.
- Targeted ESLint for all changed TypeScript files: passed with zero errors/warnings.
- `npm run build`: passed on Next.js 16.4.2.
- `npm audit --omit=dev`: zero production vulnerabilities.
- `git diff --cached --check`: passed before the source commit.

## Remaining Visual Work

- Gemini still owns the visible canvas/WebGL or chart renderer, palette, legend, settings popover, responsive layout, and browser screenshot verification.
- The heatmap will not become visible merely by merging this commit; Gemini must call the hook and draw the frames.
- A combined preview should be assembled only after Architect review and after Gemini finishes its current UI branch, then validated with the hook reachable in the production bundle.
- No durable depth database, aggregate-trade footprint, candle imbalance, smart AVWAP, Jev reasoning, broker connection, or live execution path is included here.
