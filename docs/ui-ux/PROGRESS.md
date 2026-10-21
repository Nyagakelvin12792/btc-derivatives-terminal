# UI/UX Overhaul Progress

Version: 1.0  
Last updated: 2026-10-21  
Overall status: RESEARCH AND PLANNING COMPLETE — IMPLEMENTATION NOT STARTED  
Current checkpoint: UX0 COMPLETE; UX1 requires Architect approval and Gemini ownership

## Scope Statement

This tracker covers only the presentation and interaction layer described in [PROJECT_PLAN.md](./PROJECT_PLAN.md). Backend feeds, APIs, derivatives formulas, terrain calculations, order-flow engines, decision engines, and execution are outside scope.

## Current Baseline

The repository currently provides:

- Next.js/React terminal shell.
- Deribit live/demo mode presentation.
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
- CVD, Fixed Range VP, and Anchored VWAP are not currently implemented in this repository's UI.
- Some presentation values are demo/fallback values and require unmistakable provenance labels.

## Milestone Status

| Milestone | Status | Notes |
| --- | --- | --- |
| UX0 — Research and plan | COMPLETE | Approved 16:9 direction stored; platform research and four planning documents completed |
| UX1 — UI foundation and shell | NOT STARTED | Requires Gemini implementation branch and Architect approval |
| UX2 — Resizable workspace mechanics | NOT STARTED | UI-only state and persistence |
| UX3 — Options overlays and inspector | NOT STARTED | Existing data only; no new calculations |
| UX4 — Layers and studies | NOT STARTED | Unified object tree and active-study controls |
| UX5 — Fixed Range VP and AVWAP | NOT STARTED | Presentation/interaction work only |
| UX6 — Order-flow panes | BLOCKED FOR LIVE DATA | UI shell can proceed; live values require an already-authorized frontend contract |
| UX7 — Saved layouts and linked tools | NOT STARTED | Preserve 3D and analysis workspaces |
| UX8 — Responsive/accessibility/performance | NOT STARTED | Includes browser and visual regression gates |
| UX9 — Independent review/release | NOT STARTED | Requires zero-backend-diff audit |

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

## Dependencies and Blockers

### Live CVD and order flow

The UI can implement the pane, empty state, interaction model, settings, and fixture-based visual tests. It cannot claim or display live CVD until an existing authorized frontend contract supplies timestamped CVD OHLC values, anchor/reset metadata, coverage, and freshness. Creating that feed or calculation is outside this milestone.

### Price-series input

The chart workspace needs an existing frontend-consumable time-series contract. This plan does not authorize a new candle collector or API. Until a contract is formally available, the implementation must remain isolated to labelled demo fixtures and component tests.

### Options metric provenance

Every displayed metric requires source, mode, and timestamp/freshness presentation. Current demo/fallback values may be used only when clearly labelled `DEMO`.

## Next Authorized Work

After approval:

1. Architect reviews the information architecture, data-label semantics, and scope boundary.
2. Gemini creates the UI implementation branch and owns dashboard/page/chart presentation files.
3. Gemini completes UX1 without modifying backend-owned paths.
4. Codex reviews TypeScript boundaries, accessibility, dependency risk, and the git diff.
5. Architect accepts or rejects UX1 evidence before UX2 begins.

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
