# UI/UX Technical Stack

Version: 1.1
Status: IMPLEMENTED AND VERIFIED
Last updated: 2026-10-22

## 1. Stack Strategy

The redesign should extend the repository's current frontend rather than replace it. Each rendering system receives a narrow responsibility:

- **Lightweight Charts** for the primary time-series chart and synchronized lower study panes.
- **ECharts** for existing analytical plots such as GEX, Vanna, Charm, OI, heatmaps, and strike/expiry summaries.
- **Three.js / React Three Fiber** for the existing 3D dealer-pressure terrain.
- **React DOM** for controls, inspectors, legends, menus, tables, accessibility, and workspace chrome.

This separation avoids forcing financial-chart interactions into the 3D renderer or using the 3D stack for ordinary UI.

## 2. Existing Repository Stack

These packages are already present and should be retained unless a separate dependency review says otherwise.

| Technology | Current version | UI responsibility |
| --- | ---: | --- |
| Next.js | 16.4.2 | Application shell, routes, client/server boundaries, build |
| React / React DOM | 19.2.8 | UI composition and stateful interaction |
| TypeScript | 5.x | Strict UI contracts and component safety |
| Tailwind CSS | 4.x | Tokens, layout, responsive styling |
| Zustand | 5.0.15 | Workspace, selection, layer, and preference state |
| TanStack Query | 5.101.4 | Existing server-state lifecycle and freshness |
| TanStack Table | 9.1.2 | Options, contracts, levels, and data tables |
| ECharts / echarts-for-react | 6.1.0 / 3.0.6 | Existing 2D analytical workspaces |
| Three.js | 0.185.1 | Dealer-pressure terrain renderer |
| React Three Fiber / Drei | 9.7.0 / 10.7.8 | React integration and 3D helpers |
| D3 Contour | 4.0.2 | Existing contour generation |
| Zod | 4.4.3 | UI preference schemas and validation |
| Lucide React | 1.33.0 | Consistent UI icons |
| clsx / tailwind-merge | 2.1.1 / 3.6.0 | Class composition |
| Vitest | 4.1.11 | Unit and component logic tests |
| ESLint | 9.x | Static quality gate |

## 3. Proposed UI Additions

The compatibility spike passed against React 19.2.8 and Next.js 16.4.2. The packages below are installed and covered by the production build and browser suite.

### 3.1 Lightweight Charts

Candidate: `lightweight-charts` 5.2.x. The researched upstream package was version 5.2.1 on 2026-10-21 and is Apache-2.0 licensed.

Use for:

- Candlestick price chart.
- Shared time scale and crosshair.
- CVD cumulative-candle pane.
- Fixed Range VP custom series/primitive.
- Anchored VWAP line and bands.
- Wall, Gamma Flip, regime-shading, POC, VAH, VAL, and marker primitives.
- Hit testing and selected-object handles.

Why:

- Purpose-built financial canvas rendering.
- Supports candlestick, line, area, bar, and histogram series.
- Plugin APIs support custom series, series primitives, and pane primitives.
- Keeps chart rendering separate from DOM-based accessible controls.

Official references:

- [Lightweight Charts repository](https://github.com/tradingview/lightweight-charts)
- [Plugin development model](https://github.com/tradingview/lightweight-charts/blob/master/website/docs/plugins/intro.md)
- [Custom series](https://github.com/tradingview/lightweight-charts/blob/master/website/docs/plugins/custom_series.md)

Guardrail: no TradingView hosted widget or proprietary Charting Library is required. This proposal uses the open-source library and custom project code.

### 3.2 Radix Primitives

Candidate: current compatible `radix-ui` or scoped `@radix-ui/react-*` packages.

Use for:

- Tabs.
- Dialogs and drawers.
- Popovers and dropdown menus.
- Tooltips.
- Selects, sliders, switches, and context menus.
- Focus management and keyboard navigation.

Why:

- Unstyled primitives fit the existing terminal design.
- WAI-ARIA-oriented behavior reduces risk in complex settings panels.
- Can be adopted incrementally.

Official references:

- [Radix Primitives overview](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)

### 3.3 React Resizable Panels

Candidate: current compatible `react-resizable-panels` release.

Use for:

- Price chart / inspector horizontal split.
- Price chart / order-flow pane vertical split.
- Collapse, restore, minimum-size, and maximum-size behavior.

Why:

- Purpose-built panel constraints.
- Supports collapsible panels and testable panel identifiers.
- Avoids maintaining custom pointer math for workspace resizing.

Official reference: [react-resizable-panels repository](https://github.com/bvaughn/react-resizable-panels)

### 3.4 Playwright and axe

Candidates:

- `@playwright/test`
- `@axe-core/playwright`

Use for:

- Desktop/mobile workflow verification.
- Keyboard workflows.
- Screenshot comparison.
- Accessibility scanning.
- Resize, collapse, save/restore, and chart-object interaction tests.

Official reference: [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)

### 3.5 Live market boundaries

| Source | Transport | Authorized responsibility |
| --- | --- | --- |
| Binance Spot public market data | Server REST via `/api/binance/market` | Kline backfill, 24-hour ticker, validated order-book snapshot |
| Binance Spot public streams | Browser combined WebSocket | Active-interval kline updates and top-20 partial depth with reconnect/stale state |
| Deribit public options feed | Existing server client via `/api/deribit` | Options structure, Greeks-derived exposures, walls, Gamma Flip, Max Pain, and cumulative DTE horizons |

TanStack Query owns REST freshness and retries. WebSocket state is held only in the live client hook and is merged over the validated REST backfill. Zustand persists preferences such as workspace, mode, layers, and DTE filter; it never persists market responses.

## 4. Rendering Ownership Matrix

| Feature | Rendering owner | Control owner | State owner |
| --- | --- | --- | --- |
| Price candles | Lightweight Charts | React toolbar | Existing data query + UI adapter |
| Walls / Gamma Flip | LWC series primitives | Options inspector | Zustand UI slice |
| Gamma regime shading | LWC pane/series primitive | Options inspector | Zustand UI slice |
| Fixed Range VP | LWC custom series/primitive | Object toolbar + settings | Zustand UI slice |
| Anchored VWAP | LWC line series + primitives | Object toolbar + settings | Zustand UI slice |
| CVD candles | LWC candlestick/custom series in lower pane | Study header/settings | Existing supplied series + UI slice |
| Delta / Book / Liquidity | LWC or ECharts by data shape | Study tabs | Existing supplied data only |
| Options metrics | React DOM | Inspector | Existing terrain/dashboard contract |
| Contracts and levels tables | TanStack Table | React controls | Existing dashboard adapters |
| GEX/Vanna/Charm/OI analysis | ECharts | Existing workspace controls | Existing terrain contract |
| 3D Surface Map | React Three Fiber / Three.js | Existing 3D controls | Existing terrain contract |
| Layout chrome | React DOM + resizable panels | Command bar/workspace menu | Zustand persisted UI slice |

## 5. State Architecture

### 5.1 Server state

Keep TanStack Query responsible for remote data, status, freshness, refetching, and errors. UI components must not copy remote data into Zustand.

### 5.2 UI state

Extend Zustand with isolated slices:

```text
workspaceSlice
  activeWorkspace
  inspectorTab
  panelSizes
  collapsedPanels
  linkGroups

studySlice
  instances
  activeStudyId
  paneOrder
  visibility

drawingSlice
  selectedObjectId
  lockedIds
  hiddenIds

preferenceSlice
  favoriteTools
  favoriteTimeframes
  gammaOpacity
  labelDensity
```

### 5.3 Persistence

- Persist UI preferences only.
- Use a versioned Zod schema.
- Migrate known older versions.
- On validation failure, preserve the failure for diagnostics and reset to defaults.
- Never persist live market responses as workspace preferences.

## 6. Study Registry

All chart studies and overlays should use a common UI registry:

```ts
type StudyInstance = {
  id: string;
  type: 'walls' | 'gamma-regime' | 'gamma-flip' | 'fixed-range-vp' | 'avwap' | 'cvd';
  title: string;
  visible: boolean;
  locked: boolean;
  pane: 'price' | 'lower-1' | 'lower-2';
  order: number;
  sourceState: 'LIVE' | 'DEMO' | 'SHADOW' | 'STALE' | 'UNAVAILABLE';
  settings: unknown;
};
```

The concrete settings are discriminated Zod schemas. `unknown` above intentionally prevents a global untyped settings bag from leaking into components.

## 7. Chart Plugin Strategy

| Visual | Preferred plugin type | Reason |
| --- | --- | --- |
| CVD OHLC | Built-in candlestick series or custom series | Own data and scale |
| VP histogram | Custom series | Own value rows, autoscale, visible-range rendering |
| AVWAP line/bands | Line series plus series primitive | Data line plus anchor/handles/fill |
| Walls and Gamma Flip | Series primitives | Decorations tied to price coordinates |
| Gamma shading | Pane/series primitive | Full-pane background regions behind price |
| Selection handles | Series primitive + DOM toolbar | Canvas hit testing with accessible DOM controls |
| Labels on scales | Series primitive axis views | Crisp price/time labels |

Canvas handles provide pointer hit testing; their accessible equivalents live in the DOM and expose the same commands through focusable controls.

## 8. Design System

### Typography

- Geist Sans for navigation, controls, and explanatory text.
- Geist Mono for prices, strikes, percentages, timestamps, and compact metric tables.
- Use `font-variant-numeric: tabular-nums` for all changing values.

### Color

- Neutral charcoal surfaces and low-contrast grid lines.
- Cyan as the principal interaction accent.
- Green/teal for positive/supportive market semantics.
- Red/rose for negative/resistance/risk semantics.
- Amber for warnings or degraded status.
- Never rely on color alone; add label, icon, line style, or pattern.

### Density

- Default desktop control height: 32–36 px.
- Mobile touch targets: at least 44 px.
- Default text: 13–14 px.
- Dense tables may use 12 px with adequate row height and keyboard focus.
- No permanent explanatory paragraphs in the chart viewport; use tooltips, help drawers, and contextual empty states.

## 9. Performance Architecture

- Create one long-lived chart instance per visible chart workspace.
- Apply incremental series updates rather than full `setData` replacement for streaming points where supported.
- Render labels and hit targets only for the visible range.
- Debounce persisted panel sizes and settings.
- Pause hidden ECharts and Three.js animations.
- Lazy-load 3D and secondary analytical workspaces.
- Avoid React state updates on every crosshair pixel movement; use chart-local callbacks or external stores with selective subscriptions.
- Keep overlay calculations outside React render functions.

## 10. Testing Stack

| Layer | Tool | Required coverage |
| --- | --- | --- |
| Pure UI state | Vitest | reducers, schemas, migrations, ordering, visibility |
| Component behavior | Vitest + React test utilities selected during UX1 | tabs, menus, keyboard, settings |
| Browser workflows | Playwright | resize, persistence, objects, filters, workspaces |
| Visual regression | Playwright screenshots | required viewport/state matrix |
| Accessibility | axe + manual keyboard | semantics, focus, labels, contrast |
| Build quality | Next build + ESLint | all milestones |

## 11. Compatibility Spike Before Installation

UX1 must prove:

1. Lightweight Charts works in a client-only Next.js component with React 19.
2. Chart disposal is clean during route/workspace switches and development strict-mode behavior.
3. A custom pane/series primitive can render, hit-test, and expose an accessible DOM toolbar.
4. Resizable panels do not break chart sizing or canvas pixel ratio.
5. Radix portals remain inside the intended z-index system.
6. Playwright can produce stable 390, 1366, 1440, and 1920 screenshot baselines on the agreed CI/browser environment.

No package should be added to `package.json` until this spike is approved.

## 12. Explicit Non-Choices

- Do not replace Next.js or React.
- Do not rewrite existing ECharts workspaces in Lightweight Charts.
- Do not rewrite the 3D terrain in ECharts or canvas.
- Do not embed a hosted TradingView widget.
- Do not add a broker SDK.
- Do not calculate order flow in the UI.
- Do not use WebGL for menus, text controls, or accessibility-critical interface elements.
- Do not introduce a second global state library.
