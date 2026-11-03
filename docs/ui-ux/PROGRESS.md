# UI/UX Overhaul Progress

Version: 3.8
Last updated: 2026-11-03
Overall status: UX16.3 LIQUIDITY SURFACE V2 IN PROGRESS (60.0% IMPLEMENTED / 60.0% TESTED)
Current checkpoint: Timestamp-aligned depth projection, canvas amber sequential ramp, and density controls implemented on `agent/gemini-ux16.3-surface`

## Scope Statement

UX0–UX10 covered the presentation and interaction layer described in [PROJECT_PLAN.md](./PROJECT_PLAN.md). UX11 connected public Binance Spot data and made the existing Deribit DTE controls functional. UX12 repaired viewport persistence and brought Fixed Range VP interaction/calculation closer to TradingView using bounded Binance intrabars. UX13 removed the price-volume histogram, linked the price and time-based order-flow panes, moved study tabs below the pane, and replaced percentage drawings with time/price-anchored editable objects. UX14 makes that lower dock persistent, backfills up to 10,000 Binance candles, opens on a recent trading window, and adds explicit CVD reset anchors. Derivatives formulas, terrain mathematics, decision engines, broker integration, and execution remain outside scope.

## Current Baseline

The repository currently provides:

- Next.js/React terminal shell.
- Live Deribit options structure with cumulative DTE filtering.
- Live Binance Spot candles, 24-hour ticker, top-of-book depth, aggressor delta, and bar-level CVD.
- 3D dealer-pressure terrain.
- GEX, Vanna, Charm, and Open Interest analytical workspaces.
- Key levels, key contracts, confluence tables, and environment summaries.
- Zustand selection/layer state.
- TanStack Query and TanStack Table.
- ECharts analytical visualizations.

Observed UI limitations:

- Large permanent navigation and metric surfaces reduce chart space.
- The default page is a vertical dashboard rather than a task-focused chart workspace.
- Controls are distributed across multiple components without a unified layer manager.
- Workspaces are selectable but not user-arrangeable, linkable, or persistently saved.
- Options levels are primarily presented as cards/tables rather than a controlled chart-native overlay system.
- IV Rank has no historical contract and remains `N/A`.
- Jev has no frontend response contract and remains `SHADOW OFF`.
- Some presentation values are demo/fallback values and require unmistakable provenance labels.

## Milestone Status

| Milestone | Status | Notes |
| --- | --- | --- |
| UX0 — Research and plan | COMPLETE | Approved 16:9 direction stored; platform research and four planning documents completed |
| UX1 — UI foundation and shell | COMPLETE | Compact shell, workspace rail, command bar, accessible controls, Ctrl+K palette |
| UX2 — Resizable workspace mechanics | COMPLETE | Desktop chart/inspector split, collapsible panels, persisted UI preferences |
| UX3 — Options overlays and inspector | COMPLETE | Walls, Gamma Flip, regime shading, DTE filters, provenance states |
| UX4 — Layers and studies | COMPLETE | Layer popover, active chips, hide/show and reset controls |
| UX5 — Fixed Range VP and AVWAP | COMPLETE | VP endpoints and AVWAP anchor use chart/bar coordinates; VP supports rows, mode, placement, width, value area, visible/all-loaded range, and extend-right |
| UX6 — Order-flow panes | COMPLETE | Live bar-level CVD and Delta plus validated Book and Liquidity views from Binance Spot |
| UX7 — Saved layouts and linked tools | COMPLETE | UI persistence, save/reset controls, all legacy workspaces retained |
| UX8 — Responsive/accessibility/performance | COMPLETE | 1920×1080 and 390×844 checks, mobile bottom sheet, axe and keyboard verification |
| UX9 — Independent review/release | REVIEW REQUIRED | Architect acceptance and deployment review remain external |
| UX10 — Approved-style parity | COMPLETE | Market header, drawing tools, wall hierarchy, dual gamma zones, VP levels, AVWAP bands, CVD controls, inspector metrics, provenance and status footer implemented |
| UX11 — Live market integration | COMPLETE | Validated Binance REST/WebSocket contract, live lower panes, functional Deribit DTE horizons, explicit stale/offline handling, no demo substitution in LIVE |
| UX12 — Chart navigation and VP repair | COMPLETE | Persistent chart instance, viewport-preserving live updates, pannable overlay, 120-bar default, bounded 1s–1d intrabars, denser row allocation, and TradingView POC/VA rules |
| UX13 — Linked pane and drawing repair | COMPLETE | Price-volume histogram removed; order-flow tabs moved below; price/CVD/Delta ranges and crosshairs synchronized; data-anchored drawings selectable, draggable, lockable, deletable, and restorable |
| UX14 — Persistent flow dock and deep history | COMPLETE | Lower tabs remain visible while collapsed; clicking a tab reopens its pane; 10,000-bar paginated history; useful recent viewport; UTC day/week/month CVD anchors |
| UX15 — Professional chart interaction and decision support | COMPLETE | Six staged releases: defects/collapse, drawing/Fib, Long/Short/Risk, VP/AVWAP, heatmap/footprint, deterministic confluence/Jev shadow |
| UX16.0 — Calm workspace baseline | COMPLETE | Approved Calm Analytical Instrument workspace foundation behind feature flag |
| UX16.1 — Validated aggregate-trade capture | COMPLETE | Binance Spot aggTrade capture engine, buyer-maker classification, gap/reconnect boundaries |
| UX16.2 — True flow & project-control dashboard | COMPLETE | Gap-safe trade CVD, footprint with semantic zoom, captured VP, /project-control dashboard; released to production on main |
| UX16.3 — Liquidity Surface V2 | IN PROGRESS | Timestamp-aligned depth surface beneath candles, WebGL/canvas primitives, neutral amber ramp, focused/full toggle |

## UX0 Evidence

- [Approved 16:9 visual direction](./assets/approved-terminal-direction-16x9.png)
- [Implementation plan](./PROJECT_PLAN.md)
- [Technical stack](./TECHSTACK.md)
- [Sourced UI feature matrix](./UI_FEATURES.md)
- Current repository and dependency inventory reviewed.
- Existing workspace, state, chart, table, and 3D components reviewed.
- Official product documentation and primary GitHub sources reviewed.
- Scope boundary recorded: no backend or engine changes.

Verification completed on 2026-10-21:

- `npx.cmd vitest run`: PASS — 7 files, 47 tests.
- `npm.cmd run build`: PASS — production build, TypeScript, static generation, and route collection.
- Relative Markdown links: PASS.
- Documentation scope audit: PASS — application source and backend/engine files unchanged.

Implementation verification completed on 2026-10-22:

- `npx.cmd vitest run`: PASS — 8 files, 51 tests.
- `npm.cmd run lint`: PASS — zero errors; 34 pre-existing warnings remain in legacy components.
- `npm.cmd run build`: PASS on Next.js 16.4.2.
- Playwright desktop 1920×1080: PASS — chart render, command control, Ctrl+K, screenshot.
- Playwright mobile 390×844: PASS — chart render, command control, Options Metrics bottom sheet, screenshot.
- axe desktop/mobile: PASS — no serious or critical automated violations; color contrast is excluded from this automated gate.
- Dependency audit: critical advisories reduced from 1 to 0 by updating Next.js and `eslint-config-next` to 16.4.2; remaining advisories are transitive development-tool findings.
- Scope audit: PASS — no edits under `src/app/api/deribit/`, `src/lib/deribit/`, `src/lib/quant/`, or `src/lib/terrain/`.
- Visual evidence: `/.artifacts/ui-overhaul/market-structure-desktop-16x9.png` and `market-structure-mobile.png`.

## Research Completed

- [x] OpenTerminalUI repository and terminal-shell patterns.
- [x] TanukiTrade options overlays, GEX, IV/skew, expiry, and in-chart workflow.
- [x] Charles Schwab thinkorswim chart-study customization.
- [x] Fidelity Trader+ / Active Trader Pro layouts, linked tools, and chart tabs.
- [x] MetaTrader 5 templates, profiles, chart management, Data Window, and DOM separation.
- [x] TradingView layouts, drawing management, Fixed Range VP, Anchored VWAP, CVD, favorites, and visual ordering.
- [x] ATAS CVD, order-flow panes, Smart DOM, profiles, linked price axes, templates, and workspaces.
- [x] Lightweight Charts plugin and custom-series capability.
- [x] Accessible primitive, resizable-panel, and visual-test options.

## Decisions Recorded

| ID | Decision | Status |
| --- | --- | --- |
| UI-001 | Minimalism means progressive disclosure, not removing data | ACCEPTED |
| UI-002 | Price chart is the default primary workspace | ACCEPTED |
| UI-003 | Existing 3D terrain remains a first-class named workspace | ACCEPTED |
| UI-004 | Options Metrics opens a dedicated inspector with DTE filters | ACCEPTED |
| UI-005 | Primary and secondary walls remain visible on-chart by priority | ACCEPTED |
| UI-006 | Gamma regime uses subtle background shading plus a labelled flip | ACCEPTED |
| UI-007 | CVD uses cumulative candles with explicit anchor/reset state | ACCEPTED |
| UI-008 | Fixed Range VP stays inside its selected range | ACCEPTED |
| UI-009 | AVWAP starts at a draggable anchor and extends right only | ACCEPTED |
| UI-010 | Saved layouts, favorites, command palette, and linked panels are in scope | ACCEPTED |
| UI-011 | Missing data renders unavailable rather than zero or synthetic live data | ACCEPTED |
| UI-012 | Broker execution workflows are excluded | ACCEPTED |
| UI-013 | No proprietary product assets, code, or pixel-identical skins will be copied | ACCEPTED |

## Remaining Boundaries

### Live CVD and order flow

Binance Spot klines now supply base-volume aggressor delta using taker-buy volume. CVD is cumulative at the selected bar interval. Book and Liquidity show the validated partial order-book snapshot; they are not a historical depth heatmap.

### Fixed Range VP precision

The live profile selects the finest supported Binance interval that keeps the selected range below 5,000 intrabars, then distributes each intrabar across its traversed price rows. This materially improves precision and avoids sparse typical-price bins, but it remains an intrabar approximation rather than tick-by-tick historical volume-at-price. Tick precision still requires a separately reviewed aggregate-trade history contract.

### Options metric provenance

Every displayed metric requires source, mode, and timestamp/freshness presentation. Current demo/fallback values may be used only when clearly labelled `DEMO`.

## Next Authorized Work

1. Begin **UX16.3 — Liquidity Surface V2**: Replace the projected session strip with a true chart-aligned historical depth heatmap directly beneath candles.
2. Codex implements fixed absolute price grid bucketing, rolling depth history, and worker snapshot protocol.
3. Antigravity implements the canvas/WebGL primitive renderer, Lightweight Charts time/price synchronization through pan/zoom, and density controls.
4. Verify with deterministic fixtures and Playwright browser regression before proceeding to UX16.4.

## Required Handoff Evidence Per Milestone

- Commit SHA and branch.
- Exact changed-file list.
- Statement confirming no backend/engine changes.
- Unit/component test results.
- Lint and production-build results.
- Desktop and mobile screenshots.
- Keyboard and accessibility checks.
- Known limitations and blocked data states.
- Next owner and precise requested action.

## Change Log

### 2026-10-21 — UX0

- User approved the enhanced 16:9 chart-first direction.
- Added explicit options walls, gamma regime shading, TradingView-style CVD candles, in-range Fixed Range VP, anchored VWAP behavior, Options Metrics toggle, and DTE filtering to the design target.
- Researched seven product families using official documentation and primary repository sources.
- Defined the UI-only technical approach, feature-attribution matrix, implementation sequence, acceptance criteria, and progress gates.
- Copied the approved design preview into the repository documentation assets.
- No application source, backend, API, formula, or engine file changed.

### 2026-10-22 — UX1 through UX8

- Implemented the chart-first desktop and mobile terminal shell.
- Added options walls, Gamma Flip, regime shading, in-range Fixed Range VP, anchored VWAP, cumulative CVD candles, layer management, DTE filters, resizable inspector, command palette, and persisted UI preferences.
- Preserved every original analytical workspace behind compact navigation.
- Added explicit live/demo/unavailable presentation states and retained `NO LIVE EXECUTION` globally.
- Added unit, browser, responsive screenshot, keyboard, and automated accessibility coverage.
- Updated vulnerable Next.js 16.3.1 to 16.4.2 without changing backend/engine source.

### 2026-10-22 — UX10 approved-style parity

- Transferred UI ownership to Codex on `codex/ui-approved-parity` by explicit user approval.
- Added market timeframes, expiry context, source states, drawing and measurement tools, replay presentation, chart-native active study controls, and a compact chart tool rail.
- Made primary and secondary walls visible in the chart scale and added dual positive/negative gamma regime zones.
- Completed the demo Fixed Range VP presentation with POC, VAH, VAL, value area, draggable range, row-density setting, lock, visibility, and removal controls.
- Completed the demo AVWAP presentation with a candle-positioned draggable anchor, label, and optional deviation bands.
- Added price volume, OHLC readout, Max Pain, synchronized CVD time range, session reset marker, coverage, provenance, and CVD state controls.
- Expanded the Options inspector with Put/Call, ATM IV, honest IV Rank unavailability, Call/Put OI, chart toggles, GEX/OI display control, legend, and persistent deterministic Decision summary.
- Added explicit Binance demo, Deribit live/demo/offline, and Jev shadow-off states without manufacturing live or AI output.
- Retained `NO LIVE EXECUTION`; Long and Short chart tools are measurements only.

### 2026-10-22 — UX11 live market integration

- Added a validated public Binance Spot route for 240-bar backfill, 24-hour ticker data, and order-book snapshots.
- Added browser WebSocket updates for the active kline interval and top-20 partial depth with reconnect and stale states.
- Connected live candles, volume, bar-level CVD, Delta, Book, Liquidity, Fixed Range VP, and AVWAP to the chart workspace.
- Made `0-2D`, `7D`, `14D`, `30D`, and `ALL` cumulative Deribit horizons recalculate the options contract.
- Preserved strict live/demo separation: failed live requests render stale/offline states and never silently substitute fixtures.
- Verified 240 Binance candles, 100×100 REST depth, 932 Deribit contracts, all five DTE filters, all four lower tabs, and the 1664×936 live render.
- Final gates: 12 Vitest files / 66 tests; production build passed; Playwright 5 passed / 1 intentional mobile density skip; no serious or critical axe findings.

### 2026-10-22 — UX12 chart navigation and Fixed Range VP repair

- Stopped recreating the Lightweight Charts price chart and calling `fitContent()` on live candle, wall, AVWAP, and profile updates.
- Preserved the user's logical viewport on updates while retaining right-edge follow behavior for newly appended bars.
- Replaced screen-percentage VP endpoints with timestamp/chart coordinates and converted pointer movement through `coordinateToLogical`.
- Made the VP surface pointer-transparent so users can pan through it; movement remains available through the label and endpoint handles.
- Added 24/48/72/100 rows, Total/Up-Down/Delta, left/right placement, width, value-area %, visible/all-loaded range, and extend-right controls.
- Added bounded Binance intrabar selection from 1 second through 1 day with a hard 5,000-bar ceiling and explicit stale fallback to chart bars.
- Updated row allocation, up/down classification, POC, and value-area expansion to follow the documented TradingView methodology as closely as the available Binance kline data permits.
- Added a browser regression that pans the chart, changes VP range/settings, and verifies that the chart instance and viewport do not reset.

### 2026-10-23 — UX13 linked lower pane and drawing-object repair

- Removed the price-volume histogram and its layer toggle while preserving volume data for CVD, Delta, and Fixed Range VP calculations.
- Moved CVD, Delta, Book, and Liquidity tabs below the lower pane and moved pane metadata into a compact overlay.
- Synchronized the visible logical range and native crosshair between the main price chart and CVD/Delta charts using Lightweight Charts APIs.
- Replaced screen-percentage drawings with `{ time, price }` anchors that remain attached during pan, zoom, resize, and streaming updates.
- Added live two-point preview, OHLC-proximity snapping, selectable hit regions, visible anchors, whole-object movement, endpoint movement, per-object locking, Delete/Backspace removal, Escape cancellation, and reversible Undo.
- Added browser regressions for pane/tab geometry, crosshair synchronization, volume removal, drawing creation, movement, deletion, and restoration.

### 2026-10-23 — UX14 persistent flow dock and deep-history repair

- Kept the CVD, Delta, Book, and Liquidity tablist mounted at the workspace bottom when the lower pane is collapsed; selecting any tab reopens the pane.
- Added a validated paginated Binance history route and client cache that merges up to ten 1,000-bar pages with the current REST/WebSocket series for a 10,000-bar target.
- Preserved an immediately useful recent viewport rather than compressing all 10,000 bars into one screen, while retaining the full loaded history for navigation.
- Added `AUTO`, UTC day, UTC week, UTC month, and visible-range CVD anchors with reset markers generated from the actual cumulative series.
- Recorded a clean-room public TradingView accessibility capture using Reverse Engineer Anything. No scripts, request bodies, headers, cookies, local storage, private endpoints, or proprietary assets were collected.
- Verified the live history route returned 10 pages and 10,000 unique hourly candles; the browser opened on roughly 196 recent bars and retained the persistent lower dock.
- Promoted deployment `dpl_ixtqgAkKZMLhbjzqjG2uBuRZ7tDq` to the production alias and repeated the live API and collapse/reopen browser checks successfully.

### 2026-10-26 — UX16.0 approved baseline

- The user approved the reviewed Calm Analytical Instrument workspace on `codex/ux16-integration` at `7b8e091`.
- The UX16 workspace remains opt-in through `NEXT_PUBLIC_UX16_CALM_WORKSPACE`; the accepted UX15 terminal remains the default fallback.
- The approval authorizes staged UX16 work but does not authorize live execution, fabricated order-flow metrics, or promotion of Jev beyond shadow interpretation.

### 2026-10-26 — UX16.1 aggregate-trade capture checkpoint

- Added a server-gated Binance Spot `btcusdt@aggTrade` capture worker behind `ORDERFLOW_AGGTRADE_ENABLED`, disabled by default.
- Added strict aggregate-trade validation and buyer-maker aggressor classification, bounded batching outside React, exact duplicate rejection, deterministic late-event rejection, and explicit forward-ID gap handling.
- Added versioned capture-start, reconnect, and missing-ID boundaries without fabricating unavailable trades.
- Added deterministic replay fixtures and a replay adapter that reproduces accepted, duplicate, out-of-order, malformed, reconnect, and gap behavior.
- Added a no-store capability endpoint that exposes only the safe boolean capability contract and no secret values.
- Connected the calm workspace integrity strip to truthful `SPOT TAPE` health, provenance, accepted count, and gap state while explicitly withholding derived CVD until UX16.2.
- Verified a bounded live Binance observation of 20 consecutive aggregate trades. This confirms the public upstream stream was reachable during verification; it is not a claim of permanent availability.
- Preserved `NO LIVE EXECUTION`; no footprint, imbalance, absorption, setup-grade, or AI decision output was added.

### 2026-10-30 — UX16.2 true-flow batch 1 checkpoint (`447a9d2`)

- Started gap-safe, trade-derived CVD segments, footprint cells, and captured-trade volume profile calculations from the validated UX16.1 tape.
- Added deterministic reconciliation totals and POC/VA calculation contracts while keeping UX16.4 imbalance fields disabled.
- Added a schema-validated, read-only project-control backend for implemented/tested/accepted progress and truthful agent usage/spend reporting.
- Recorded `UNREPORTED` usage explicitly; no subscription or unknown provider usage is represented as confirmed zero cost.
- Added the institutional-context extension order covering venue-neutral contracts, SVAF hardening, Coinbase, ETF/Treasury/CFTC, CME, cross-venue confluence, Jev, and calibration.
- Reserved Antigravity for presentation/dashboard UI and DeepSeek for independent oracle fixtures/tests after the Codex checkpoint SHA is committed.
- Antigravity is actively implementing its assigned true-flow presentation and project-control dashboard files on `agent/gemini-ux16.2-ui`; no commit has been reported yet.
- DeepSeek cross-checked 16 deterministic scenarios against production and began its oracle data and validation matrix on `agent/deepseek-ux16.2-validation`; reconciliation/boundary test deliverables and a commit are still pending.
- Codex added bounded incremental true-flow session state and worker snapshot emission in `80ef5c3`; focused runtime verification proves session totals survive raw-tape eviction.
- Codex hardened reconnect coverage semantics and transactional limits in `dea002c`; all 256 repository tests pass.

### 2026-11-03 — UX16.2 assembled release candidate

- Codex preserved the Antigravity and DeepSeek drafts, corrected the DeepSeek oracle, and integrated 16 hand-calculated scenarios with 21 boundary/reconciliation tests.
- Connected the true-flow worker snapshot to the Flow inspector and linked lower CVD chart. The chart keeps timestamp alignment by using whitespace before captured trades and shows the current uninterrupted segment after a gap.
- Added inspectable CVD segments, footprint geometry with semantic zoom, and a captured-trade profile with distinct exact/gapped/mixed coverage labels.
- Added the read-only `/project-control` progress and usage/spend dashboard, including per-task evidence and explicit `UNREPORTED` cost states.
- Verified 47 unit test files and 305 tests, TypeScript, scoped ESLint, production webpack build, and 38 UX16 browser tests with two intentional mobile skips.
- UX16.2 remains shadow decision support and awaits Architect acceptance; no institutional identity claim or live execution was added.

### 2026-11-03 — UX16.2 production release on Vercel (`371a4e2`)

- Merged approved UX15 and verified UX16.2 release candidate into `371a4e2` and advanced `main`.
- Pushed `main` and `codex/release-ux16.2` to GitHub `Nyagakelvin12792/btc-derivatives-terminal`.
- Set production environment variable `NEXT_PUBLIC_UX16_CALM_WORKSPACE=true` on Vercel project `btc-terminal-codex`.
- Deployed to Vercel production (`dpl_34QpkERrYewE8Dn77HXs2Poz2jg1`) with status `Ready`.
- Assigned and attached persistent custom domain `beatcoin-terminal.vercel.app` alongside `btc-terminal-codex.vercel.app`.
- Verified live HTTP 200 responses on `/`, `/project-control`, and `/api/project-control` with live telemetry.
- Progress telemetry: 45.3% implemented, 45.3% tested, 7.5% accepted, 0 blocked tasks.

### 2026-11-03 — UX16.3 Liquidity Surface V2 implementation checkpoint

- Implemented `src/lib/binance/liquidity-surface-contracts.ts` defining `LiquidityDensityMode`, `LiquidityColorTheme`, `LiquiditySurfaceSettings`, and `ProjectedLiquiditySurfaceCell`.
- Implemented `projectLiquiditySurfaceV2()` in `src/components/terminal/LiquidityHeatmapOverlay.tsx`:
  - Maps depth X coordinates directly through chart event times (`timeToX`), eliminating the legacy 52% right-hand rectangular strip.
  - Maps depth Y coordinates through active price scale (`priceToY`) dynamically during pan, zoom, and resize.
  - Ensures sequence gaps produce honest visual whitespace without artificial continuity.
  - Applies rolling robust quantile and `log1p` normalization.
  - Replaces green/red styling with a neutral graphite-to-amber sequential ramp.
  - Outlines persistent high-notional limit order walls.
- Wired `MarketStructureChart.tsx` to pass `timeToX` and added an interactive `FOCUSED` vs `FULL` density mode toggle.
- Verified with 6/6 passing unit tests in `src/components/terminal/liquidity-surface-v2.test.ts` and all 48 test files (311 tests) repository-wide.
- Telemetry updated: Implemented progress increased from 45.3% to 60.0%, tested progress increased from 45.3% to 60.0%.
