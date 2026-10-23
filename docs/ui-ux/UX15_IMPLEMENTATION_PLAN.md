# UX15 Professional Chart Interaction and Decision-Support Plan

Status: PLANNED — awaiting implementation authorization  
Date: 2026-10-23  
Owner: Codex for review/security and the explicitly transferred UI work; Architect review before merge to `main`

## 1. Outcome

UX15 will turn the current market workspace into a professional, chart-first analysis surface while preserving the terminal's existing information and its `NO LIVE EXECUTION` boundary. It will correct the current interaction defects, provide TradingView-like mechanics through an original implementation on the existing chart stack, add honest real-time order-flow visualization, and use Jev only as a labelled shadow analyst over validated deterministic inputs.

This is not a pixel clone of TradingView and will not copy proprietary code, assets, endpoints, or branding. Public behavior will be studied with restricted clean-room observation, while implementation ideas may be adapted from license-compatible open-source repositories after review.

## 2. Confirmed User Requirements

1. Fix the Liquidity view so content never collides with the lower dock or viewport edge.
2. Keep the CVD, Delta, Book, and Liquidity dock at the bottom.
3. Make the entire lower study pane collapsible. The dock remains visible; selecting a tab reopens the pane.
4. Hide drawing-object controls unless the user explicitly selects an object; blank click or `Escape` dismisses them.
5. Remove duplicate drawing controls. The left rail owns drawing creation; the upper bar owns chart navigation and workspace actions.
6. Add a two-anchor Fibonacci retracement/extension tool.
7. Make Long/Short tools true position-planning objects with entry, stop, target, risk/reward, quantity, leverage, fees, and drag handles.
8. Restore a proper Risk terminal using deterministic account and position-sizing calculations.
9. Add a real-time liquidity heatmap with explicit coverage, warm-up, freshness, and provenance.
10. Add profile opacity and selected-range controls up to 1,000 source bars. Profile row resolution remains a separate setting.
11. Offer deterministic smart AVWAP anchor suggestions with reasons and manual override.
12. Add order-flow candle/footprint imbalances only when classified trade data supports them.
13. Add an AI confluence assistant for the user's primary 1H and 4H workflow, with Jev remaining shadow-only and unable to execute trades.

## 3. Scope Classification

### Release-blocking defects

- Liquidity pane overflow and bottom-dock collision.
- Lower pane collapse/reopen behavior.
- Persistent contextual drawing toolbar.
- Duplicate drawing creation controls.

### Professional chart tools

- Drawing selection state machine, deletion, locking, undo, and object tree behavior.
- Fibonacci retracement/extension.
- Long/Short position objects.
- Account-aware Risk terminal.
- VP and AVWAP interaction upgrades.

### New market-data products

- Sequence-safe local level-2 order book.
- Real-time liquidity heatmap.
- Aggregate-trade classification.
- Footprint and diagonal imbalance visualization.

### Decision support

- Deterministic 1H/4H confluence assessment.
- Jev shadow interpretation of a validated, bounded feature packet.
- Explicit `WATCH`, `WAIT`, and `AVOID` states—not automatic trade authority.

## 4. Delivery Sequence

### UX15.0 — Interaction repair and collapsible lower pane

- Replace the Liquidity pane's rigid grid with a responsive layout that scrolls internally where required.
- Keep the dock mounted at the workspace bottom in every state.
- Add an explicit collapse/expand control, keyboard label, persisted height, and minimum/maximum pane bounds.
- Re-clicking the active tab may toggle the pane; selecting any other tab opens it.
- Link crosshair/time range continuously across price, CVD, and Delta whether the pane was just reopened or resized.
- Do not auto-select a newly completed drawing. Show its contextual toolbar only after an explicit object click.
- Dismiss selection on blank click, `Escape`, tool switch, workspace switch, or object deletion.
- Remove drawing creation actions from the upper toolbar. Retain one left-side grouped rail with flyouts.

Acceptance:

- No overlap or clipped values at 1366×768, 1664×936, 1920×1080, or supported mobile widths.
- The lower dock remains visible while content is collapsed.
- A tab click restores the correct pane without recreating the chart or resetting its viewport.
- Exactly one drawing-creation surface is visible.
- The contextual object toolbar appears only for an explicitly selected object and disappears on blank click or `Escape`.

### UX15.1 — Drawing foundation and Fibonacci

- Formalize drawing states: idle, armed, creating, selected, moving, resizing, locked, hidden, deleted, and restored.
- Add larger invisible hit regions, hover feedback, endpoint handles, whole-object movement, lock/hide/delete, `Delete`/`Backspace`, `Escape`, and Undo/Redo.
- Add a Fibonacci flyout to the left rail.
- Fibonacci uses two time/price anchors and default levels `0`, `0.236`, `0.382`, `0.5`, `0.618`, `0.786`, and `1`, with optional `1.272` and `1.618` extensions.
- Settings include custom levels, color, opacity, line style, labels, prices, reverse, extend left/right, and a log-scale warning.
- Persist semantic anchors and settings, never viewport pixels.

Acceptance:

- Drawings remain attached through pan, zoom, resize, history load, and live updates.
- Every object can be selected, moved, edited, hidden, locked, deleted, and restored.
- No drawing toolbar remains stranded after selection is cleared.

### UX15.2 — Long/Short objects and Risk terminal

- Long requires `stop < entry < target`; Short requires `target < entry < stop`.
- Three draggable price lines control entry, stop, and target; horizontal extent remains adjustable.
- Display risk/reward, price/tick/percentage distance, estimated P&L, and position quantity in compact and expanded modes.
- Risk inputs: account balance, risk amount or percentage, remaining daily-loss budget, maximum drawdown guard, leverage, lot/contract size, point value, quantity precision, fees, and slippage.
- Risk-limited quantity:

  `risk amount / (absolute entry-stop distance × point value per unit + per-unit costs)`

- Leverage-limited quantity:

  `(account equity × leverage) / entry`, adjusted for instrument lot/contract rules.

- Final quantity is the lower valid bound. Invalid or exhausted-risk states block a `READY` label and explain why.
- The Risk terminal and chart object share one deterministic model so values cannot diverge.

Acceptance:

- Unit tests cover long/short formulas, leverage cap, fees/slippage, precision, invalid geometry, and exhausted daily-risk budget.
- Dragging entry/stop/target updates the terminal immediately without moving unrelated chart objects.
- This remains position planning only; no broker or order-submission action exists.

### UX15.3 — Fixed Range VP and smart AVWAP

#### Fixed Range VP

- Let the selected range span 1–1,000 loaded source bars with start/end handles and a typed bar-count option.
- Keep profile row resolution separate from source-bar count. Expose row resolution, value-area percentage, Total/Up-Down/Delta mode, left/right placement, width, opacity, colors, and extend-right.
- Show explicit POC, VAH, VAL, selected bar count, price range, calculation source, and approximation status.
- Use a worker for heavier 1,000-bar recomputations and recompute only affected visible/profile ranges.

#### Smart AVWAP

- Modes: Auto, Session, Week, Month, Highest High, Lowest Low, Highest Volume, Swing High, Swing Low, and Manual.
- Generate ranked candidates deterministically using swing significance, volume z-score, recency, volatility displacement, and proximity to validated options structure.
- For 1H, prefer recent session/week, meaningful swing, and volume-event candidates. For 4H, prefer week/month and major swing/volume-event candidates.
- Display the chosen anchor time, reason, confidence factors, and alternatives. The user can always override or drag the anchor.
- Keep deviation bands configurable and state that an anchor is a contextual tool, not a guaranteed reversal level.

Acceptance:

- VP range/opacity changes never reset the viewport.
- VP reports the actual source-bar count and never silently truncates above a limit.
- Auto AVWAP produces reproducible candidates from the same input and never calls an AI model to choose its anchor.

### UX15.4 — Level-2 book and liquidity heatmap

- Bootstrap a local order book from an exchange REST depth snapshot, buffer WebSocket depth events, apply sequence IDs in order, and resynchronize immediately on a gap.
- Replace the current top-level snapshot-only assumption with a time-series depth-frame model.
- Aggregate price levels into zoom-aware bins and time buckets; use a bounded ring buffer and Web Worker.
- Render the heatmap as a chart primitive/custom series on canvas or WebGL, while DOM controls remain accessible.
- Controls: visible depth, aggregation tick, time window, minimum notional, color scale, decay, opacity, venue, pause, and clear.
- Show coverage start, warm-up, last update, sequence health, reconnects, venue, and `LIVE/STALE/OFFLINE` status.
- Start with current-session live history. Durable historical heatmap replay requires a continuously running collector and storage; Vercel serverless functions alone are not a durable WebSocket collector.

Acceptance:

- Sequence gaps force resync; they never produce a visually continuous but invalid book.
- Disconnects freeze and mark stale instead of inventing depth.
- Panning and crosshair interaction remain responsive at the target frame budget.

### UX15.5 — Footprint and imbalance candles

- Consume classified aggregate trades with event time, price, quantity, and aggressor side.
- Bucket trades by candle and price row to compute bid/ask volume, delta, POC, and total volume.
- Add diagonal imbalance using a configurable ratio, minimum volume, stacked-imbalance count, and optional highlight/outline.
- Modes: Candles, Footprint, Delta, and Imbalance; default remains uncluttered Candles.
- State the data limitation clearly: exact historical footprints cannot be reconstructed from OHLCV candles. History begins when trade collection begins unless a tick-history source is added.

Acceptance:

- Trade classification and bucket aggregation have deterministic fixture tests.
- Missing history renders a coverage boundary, not synthetic cells.
- Footprint mode can be disabled without affecting the existing chart or options overlays.

### UX15.6 — Deterministic confluence and Jev shadow assistant

- Build a server-side feature packet from validated inputs only:
  - 1H and 4H trend, structure, ATR/volatility, and location.
  - Gamma regime, GEX, Gamma Flip, Max Pain, walls, selected DTE horizon, IV, and data freshness.
  - VP POC/VAH/VAL and AVWAP relation.
  - CVD/delta direction and divergence.
  - Book imbalance, heatmap liquidity, absorption, and footprint imbalance when available.
  - Risk-budget state and all missing/stale/conflicting inputs.
- A deterministic baseline first classifies regime, location, flow alignment, conflicts, invalidation levels, and whether evidence is sufficient.
- Jev receives only that bounded packet through a server-only adapter using the existing Vercel secret. The key is never sent to the browser, logged, or embedded in a client bundle.
- Require a validated response schema: `WATCH_LONG`, `WATCH_SHORT`, `WAIT`, or `AVOID`; concise thesis; confirming conditions; invalidations; conflicts; risk flags; freshness; confidence; model version; and feature hash.
- Add timeout, rate limit, cache, kill switch, prompt-injection resistance, input/output size limits, and audit metadata without secret or raw-account data.
- Default to `WAIT`/unavailable on stale critical inputs, schema failure, timeout, or disagreement that cannot be resolved.
- Keep Jev visibly labelled `SHADOW`; it cannot submit orders, change risk limits, or override deterministic safeguards.

Acceptance:

- Identical feature packets produce traceable baseline outputs and a stable packet hash.
- Replay tests measure calibration, abstention, contradiction, and stale-data behavior before any promotion.
- The UI answers four questions: what is happening, where it matters, what confirms it, and what invalidates it.

## 5. Clean-Room Research Plan

Reverse Engineer Anything (REA) is installed machine-wide for controlled public behavior observation. For TradingView, capture only public accessibility structure, screenshots, geometry, and user-visible state transitions for:

- arm → draw → finish → select → move → resize → deselect → delete → undo;
- left-rail grouped flyouts and favorite tools;
- Fibonacci placement and settings;
- Long/Short placement, editing, compact labels, and risk settings;
- VP range selection and style/input settings;
- Auto Anchored VWAP inputs and anchor changes;
- footprint/imbalance settings and visible coverage behavior.

Captures must exclude source scripts, private endpoints, request/response bodies, headers, cookies, local/session storage, credentials, proprietary assets, and automated circumvention. Findings become behavioral acceptance criteria, not copied implementation.

## 6. Open-Source Reference Strategy

| Reference | Idea used | Boundary |
| --- | --- | --- |
| TradingView Lightweight Charts | Existing chart engine; primitives/custom series for heatmap, footprints, and overlays | Use official APIs; no proprietary Charting Library |
| KLineChart | Overlay lifecycle, control-point editing, and Fibonacci interaction patterns | Study Apache-2.0 concepts; implement in the current stack |
| VisualHFT | Separation of normalized L2/trade connectors from imbalance and microstructure studies | Study Apache-2.0 architecture; do not port WPF UI |
| Binance Spot WebSocket documentation | Sequence-safe diff-depth and aggregate-trade contracts | Treat exchange documentation as the data authority |
| `mamonet/orderbook-heatmap` | Small proof of concept for canvas depth history and trade overlays | Research only; insufficient maturity for a production dependency |
| `liquiditymapperfast` | WebGL depth history, footprint, recording, and replay ideas | Research only; security/license review before any reuse |

## 7. Technical Architecture

- Retain React, Next.js, TanStack Query, Zod, and Lightweight Charts.
- Add no second full charting framework.
- Use chart primitives/custom series for price-scale-aware visualizations.
- Use a Web Worker for book reconstruction, trade bucketing, footprint aggregation, and heavy VP recomputation.
- Keep high-frequency book/trade buffers outside React render state; publish bounded snapshots to the UI.
- Use an explicit versioned workspace schema for pane height/collapse, drawings, VP, AVWAP, heatmap, footprint, and risk settings.
- Use server-only routes for Jev and durable persisted data. Do not expose secrets or pretend a Vercel request function is a continuous collector.
- If historical depth/footprint is required beyond browser-session coverage, deploy a separate always-on collector and store compressed time buckets/trades in the project's durable database or object storage after an architecture review.

## 8. Quality Gates

Every implementation stage requires:

- Focused Vitest unit/component coverage.
- TypeScript and lint checks.
- Next.js production build.
- Playwright workflows at 1366×768, 1664×936, and 1920×1080, plus the supported mobile matrix.
- Viewport-persistence, crosshair-linking, keyboard, accessibility, and visual-regression checks.
- Live-data gap/stale/offline tests for any market-data stage.
- Git diff audit confirming unrelated backend, Deribit, quant, and execution code was not changed.
- Architect review before merge to `main`.

## 9. Non-Negotiable Safety and Trust Rules

- No live execution.
- No fabricated order-flow history or silent demo fallback.
- No AI-only trading decision.
- No AI access to exchange credentials or unrestricted raw prompts.
- No copied commercial source code, assets, endpoints, or branding.
- Every market-derived display shows venue, freshness, coverage, and approximation level.
- When evidence is incomplete or contradictory, the system abstains.

## 10. Source Record

- [TradingView Long and Short Position tools](https://www.tradingview.com/support/solutions/43000475660-how-to-use-long-and-short-position-drawing-tools/)
- [TradingView Auto Anchored VWAP](https://www.tradingview.com/support/solutions/43000652199-vwap-auto-anchored/)
- [TradingView Anchored VWAP drawing](https://www.tradingview.com/support/solutions/43000669764-anchored-vwap-drawing-tool/)
- [TradingView Fibonacci Retracement](https://www.tradingview.com/support/solutions/43000518158-fibonacci-retracement-drawing-tool/)
- [TradingView Volume Footprint](https://www.tradingview.com/support/solutions/43000726164-volume-footprint-charts-a-complete-guide/)
- [TradingView Periodic Volume Profile](https://www.tradingview.com/support/solutions/43000703072-periodic-volume-profile/)
- [Lightweight Charts](https://github.com/tradingview/lightweight-charts)
- [KLineChart](https://github.com/klinecharts/KLineChart)
- [VisualHFT](https://github.com/visualHFT/VisualHFT)
- [Binance Spot WebSocket streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)
- [Reverse Engineer Anything](https://github.com/morluto/rea)

