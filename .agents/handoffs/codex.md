# CODEX HANDOFF REPORT — UX15.4 LIQUIDITY DATA FOUNDATION

>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> BRANCH: agent/codex
>>> COMMIT: 36c1104
>>> TESTS: PASS — 26 focused liquidity/API tests; full Vitest 21 files/133 tests; TypeScript; targeted ESLint; Next.js 16.4.2 production build; production npm audit 0 vulnerabilities; bounded live Binance snapshot/diff-depth verification
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review the Binance sequence contract, gap/resync behavior, frame semantics, and API boundary before Gemini connects a worker/hook and chart heatmap renderer
>>> TARGET: src/lib/binance/liquidity-depth.ts, src/lib/binance/liquidity-engine.ts, src/lib/binance/types.ts, src/lib/binance/client.server.ts, src/app/api/binance/depth/route.ts, focused tests, package.json, package-lock.json

## Delivered

- Added strict parsing for Binance Spot `depthUpdate` events using the official `E`, `U`, `u`, `b`, and `a` fields.
- Added a deterministic local order-book engine that:
  - buffers diff-depth events before REST bootstrap;
  - discards events already covered by the snapshot;
  - requires the first retained event to bridge `lastUpdateId + 1`;
  - applies insert, update, and zero-quantity deletion semantics;
  - rejects malformed or unsupported payloads;
  - invalidates the entire local book immediately when a sequence gap is detected;
  - exposes explicit `BUFFERING`, `LIVE`, `STALE`, `GAP`, and `OFFLINE` states;
  - bounds buffered events and retained price levels.
- Added a bounded liquidity-frame buffer that:
  - aggregates bids and asks into side-aware price ticks;
  - limits visible depth by basis points around mid-price;
  - applies minimum-notional filtering after aggregation;
  - buckets frames in time and replaces the current bucket rather than producing duplicates;
  - uses a fixed-capacity ring buffer;
  - exposes honest coverage start/end, capacity, frame count, and warm-up percentage;
  - never creates history before the first observed frame.
- Added `BinanceLiquidityEngine` as the future worker/hook integration contract for ingest, bootstrap, capture, gap recovery, reconnect, offline, clear, coverage, and status behavior.
- Added `GET /api/binance/depth` for fresh REST bootstrap snapshots:
  - public market data only;
  - `BTCUSDT` only;
  - validated depth limit from 100 through 1,000;
  - upstream timeout and JSON validation;
  - `Cache-Control: no-store` so a cached snapshot cannot corrupt sequence bootstrap;
  - explicit 503 `OFFLINE` response without demo substitution.
- Updated Zod from 4.4.3 to 4.6.7 after the production audit reported a high-severity constrained-collection memory-exhaustion advisory. `npm audit --omit=dev` now reports zero vulnerabilities.

## Sequence Contract

1. Open `wss://stream.binance.com:9443/ws/btcusdt@depth@100ms`.
2. Buffer valid `depthUpdate` events immediately.
3. Fetch `/api/binance/depth?limit=500` after the socket is open.
4. Discard buffered events whose `u <= snapshot.lastUpdateId`.
5. The first retained event must satisfy `U <= snapshot.lastUpdateId + 1 <= u`.
6. Apply all retained and subsequent events in arrival order.
7. For each level, quantity zero deletes the price; a positive quantity replaces it.
8. If a future event has `U > localLastUpdateId + 1`, discard the local book, clear heatmap continuity, expose `GAP`, and fetch a new snapshot.
9. Do not append frames while stale, offline, buffering, or awaiting resynchronization.

## Integration Contract for Gemini

- Do not implement a second order-book algorithm in React.
- Run `BinanceLiquidityEngine` outside high-frequency React render state, preferably in a dedicated Web Worker.
- Use the new snapshot route only for initial bootstrap and explicit resynchronization, not for polling-based heatmap history.
- Capture frames on a bounded cadence (the tested default is 500 ms), not on every 100 ms diff event.
- Treat `coverage.startedAt` as the beginning of honest session history.
- Freeze the last rendered frame and show `STALE` or `OFFLINE` when updates stop; never extrapolate liquidity.
- On `GAP`, visibly break/reset coverage and request a fresh snapshot. Never render across the gap as if data were continuous.
- Controls such as tick aggregation, visible depth, minimum notional, time window, opacity, decay, pause, and clear belong to the renderer/UI layer and must preserve these provenance states.
- The existing `use-market-feed.ts` still uses `depth20` for the current compact Book/Liquidity list. It must not be treated as heatmap history.

## Verification Evidence

- Focused Vitest: 4 files, 26 tests passed.
- Full Vitest: 21 files, 133 tests passed.
- `npx tsc --noEmit`: passed.
- Targeted ESLint for every changed TypeScript file: passed with zero errors/warnings.
- `npm run build`: passed; `/api/binance/depth` appears as a dynamic route.
- `npm audit --omit=dev`: zero production vulnerabilities.
- `git diff --check`: passed.
- Bounded live Binance validation:
  - public REST depth snapshot returned HTTP 200;
  - diff-depth stream returned the documented event shape;
  - first retained event bridged `lastUpdateId + 1` successfully.
- Local production route validation:
  - `/api/binance/depth?limit=100` returned HTTP 200, `LIVE`, `no-store`, 100 bids, and 100 asks;
  - `/api/binance/depth?limit=20` returned HTTP 400.

## Explicit Boundaries and Remaining Work

- No heatmap renderer or visible UI was added in this Codex task.
- No Web Worker or React hook was connected yet; Architect review precedes that integration.
- No durable historical depth storage was added. Coverage begins in the active browser session.
- Vercel serverless functions are not used as a pretend continuously running WebSocket collector.
- No aggregate-trade footprint, candle imbalance, smart AVWAP, Jev adapter, broker connection, or execution path was changed.
- No exchange API key is required; all Binance endpoints used here are public market data.
- `STATE.md` remains unchanged pending Architect review.
