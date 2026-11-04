# UX17 — Minimalist Institutional Workspace: Design Research, Screenshot Audit & System Architecture

## 1. Design Research & Institutional Ergonomics Foundation

This document records the research, screenshot audit, root-cause analysis, and minimalist design system governing the **UX17 — Minimalist Institutional Workspace** initiative for the BTC Derivatives Terminal.

### 1.1 Comparative Platform Research
- **TradingView**: Prioritizes an uncluttered price canvas, compact top bar (`Symbol | Timeframe | Chart Type | Indicators | Templates`), contextual floating toolbars anchored directly to selected drawings, and right-scale collision resolution.
- **ATAS (Advanced Time And Sales)**: Uses semantic zoom on Footprint charts—wide zoom shows candle bars + volume profile + POC line; medium zoom shows delta/cluster shading + gold POC box; close zoom exposes full `Bid × Ask` split cells, diagonal imbalances (`300%`), stacked imbalance zones, and a compact tabular summary footer (`Δ`, `Δ%`, `Vol`).
- **Sierra Chart**: Emphasizes zero decorative chrome, high-contrast tabular numerals (`font-variant-numeric: tabular-nums`), strict separation between primary execution levels and tertiary historical reference lines, and multi-scope POC hierarchy (`Candle POC`, `Session POC`, `Daily/Weekly POC`).
- **Bookmap**: Separates resting order-book depth (`L2 Liquidity Heatmap` rendered with a restrained intensity ramp) from executed trade volume (`Footprint / Volume Dots`), preventing traders from confusing passive limit walls with executed market orders.
- **Cognitive Load & Gestalt Principles**:
  - **Figure–Ground Separation**: Price candles and active trade risk levels (`Entry`, `Stop`, `TP1–TP3`) must maintain the highest luminance contrast against a deep matte background (`#070A0F`).
  - **Progressive Disclosure**: Secondary indicator parameters belong inside a single collapsible **Categorized Tools Panel** (`Market Profile`, `Order Flow`, `Options Analytics`, `Liquidity`, `Market Structure`, `Sessions`, `Drawing Tools`, `Trade Management`) rather than permanently exposed across horizontal chip bars.
  - **Proximity & Common Fate**: Synchronized views (`Left Footprint` + `Right Candlestick` + `Dual Synchronized CVD Subpanes`) must share identical timestamp cursors, logical ranges, and price-scale bounds.

---

## 2. Comprehensive Screenshot & Repository Audit (`UX17.0`)

| Audit ID | Component / File | Observed Visual / Functional Defect | Verified Root Cause | Regression Risk & Safe Correction |
| :--- | :--- | :--- | :--- | :--- |
| **AUD-01** | [`MarketStructureChart.tsx:733-741`](../../src/components/terminal/MarketStructureChart.tsx) | Footprint candles and candlesticks are vertically squashed into `<15%` of the viewport, leaving `>60%` empty vertical space. | `boundsSeriesRef` injects distant option strikes (`callWall`, `putWall`, `gammaFlip`, `maxPain`, often $\pm\$4,000\text{–}\$6,000$ from spot) into the Y-axis scale. | **Low Risk**: Default price scale to `CANDLE_FIT` (fit visible candle High/Low with `8%` margin) and provide an explicit `Include Option Walls in Scale` toggle in Tools Panel. |
| **AUD-02** | [`LeftFootprintExecutionPane.tsx:84-95, 560-571`](../../src/components/terminal/LeftFootprintExecutionPane.tsx) | Left Footprint only shows 10 bars while Candlestick shows 180 bars; right price axis prints `130+` overlapping price labels every `$50`. | `count > visibleBarCount` overrides shared range to 10 bars; price axis iterates over every `bucketStep` instead of nice tick intervals. | **Low Risk**: Introduce `UnifiedChartCoordinator` (`LOCKED_1_TO_1` & `LINKED_CURSOR_FOCUS` modes) and a `computeNicePriceTicks(min, max, 12)` axis formatter. |
| **AUD-03** | [`MarketStructureChart.tsx:1966`](../../src/components/terminal/MarketStructureChart.tsx), [`LowerStudyPane.tsx`](../../src/components/terminal/LowerStudyPane.tsx) | Single full-width lower CVD pane sits beneath both charts, aligning only with the right Candlestick chart and misaligning with the left Footprint pane. | Only one `LowerStudyPane` instance is mounted across the full container width. | **Medium Risk**: Support 3 layout modes (`MODE A: Candle Only`, `MODE B: Candle + Footprint`, `MODE C: Candle + Footprint + Dual Synchronized CVD Subpanes`). |
| **AUD-04** | [`MarketStructureChart.tsx:1430-1567`](../../src/components/terminal/MarketStructureChart.tsx) | Permanent 7-chip horizontal Study Strip (21 micro-buttons) plus duplicate on-canvas Volume Profile HUD clutter the top of the chart. | Legacy study strip and floating canvas HUD both render permanently when indicators are enabled. | **Low Risk**: Replace with a compact top toolbar button (`Tools & Indicators`) opening the unified collapsible `ToolsDrawer` with 8 categories and progressive disclosure. |
| **AUD-05** | [`MarketStructureChart.tsx:907`](../../src/components/terminal/MarketStructureChart.tsx) | Fixed-Range Volume Profile spans `55%` of the chart width with high saturation, obscuring price candles; `FREE` mode lacks 2-click range anchoring. | `maxBarWidth = Math.min(plotW * 0.55, ...)` and lack of canvas click state machine for `FREE` start/end bar selection. | **Low Risk**: Cap profile width to `22%` (`Math.min(plotW * 0.22, 180)`), use restrained fill opacity (`0.22` normal, `0.38` VA, `0.68` POC), and add 2-click `FREE` range selection. |
| **AUD-06** | [`MarketStructureChart.tsx:929-958`](../../src/components/terminal/MarketStructureChart.tsx) | Right-edge labels (`CALL WALL $78,000`, `VAL`, `POC`, `LON`, `GAMMA FLIP`) collide and stack illegibly. | Each overlay renders raw Y-axis badges without collision detection. | **Low Risk**: Add `resolveRightEdgeLabels` (`src/lib/market-structure/label-layout.ts`) with priority sorting, `16px` vertical separation, and confluence grouping. |
| **AUD-07** | [`MarketStructureChart.tsx:969-991`](../../src/components/terminal/MarketStructureChart.tsx) | Active `LON` session box extends all the way to the right price scale (`plotW`), and horizontal rays stretch across future space. | `const rawEndX = endX ?? plotW;` and `<line x2={plotW} />` for the last 2 sessions. | **Low Risk**: Clamp active session right edge to `lastBarX` (`bars.at(-1).time`), disable right-edge ray extensions by default, and reduce historical session opacity. |
| **AUD-08** | [`MarketStructureChart.tsx:1593-1638`](../../src/components/terminal/MarketStructureChart.tsx) | Liquidity Heatmap renders as tiny `6px` orange ticks on a single `1H` candle instead of a readable 2D depth field. | On `1H` timeframe, 30 minutes of 1-second L2 depth snapshots map to the same candle timestamp (`x1 === x2`), collapsing width to `6px`. | **Low Risk**: Interpolate sub-bar timestamps across the active bar width + historical bars with a restrained institutional color ramp and depth threshold controls. |
| **AUD-09** | [`TopContextBar.tsx:101-106`](../../src/components/terminal/TopContextBar.tsx) | `NOV 05` options expiry button is a static unclickable badge; `AVWAP` floating toolbar sits in the far top-right corner (`right: 86, top: 12`). | Missing dropdown state in `TopContextBar.tsx`; hardcoded CSS position for `drawing-floating-toolbar`. | **Low Risk**: Wire live Deribit expiry selector dropdown in `TopContextBar` and anchor `drawing-floating-toolbar` near the selected drawing's coordinates. |
| **AUD-10** | [`MarketStructureChart.tsx:836, 1080, 1192, 1303`](../../src/components/terminal/MarketStructureChart.tsx), [`RiskTerminal.tsx:350`](../../src/components/terminal/RiskTerminal.tsx) | Clicking blank chart space clears `RiskTerminal`; Long/Short position drawings cannot be dragged into future unplotted candle timestamps. | `handleBlankChartPointerDown` clears `selectedDrawingId`; `timeToCoordinate` returns `null` for `time > lastBarTime` and bar indices are clamped to `bars.length - 1`. | **Low Risk**: Decouple `activeTradeId` / `ManagedTrade[]` from `selectedDrawingId`; use `timeToLogicalIndex` + `logicalToCoordinate` with `rightOffset: 24` for future timestamps. |

---

## 3. Minimalist Design System Tokens (`src/lib/ui/design-tokens.ts`)

| Token Category | Token Name | Value | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas Surfaces** | `canvas.primary` | `#070A0F` | Main candlestick & footprint background |
| | `canvas.elevated` | `#0C1118` | Top toolbar, collapsible Tools drawer, Risk Terminal |
| | `canvas.subtle` | `#101722` | Secondary cards, inspector header, active tab surface |
| **Borders & Grid** | `border.hairline` | `#18212C` | Panel dividers, toolbar borders (`1px solid`) |
| | `grid.line` | `rgba(148, 163, 184, 0.035)` | Quiet chart gridlines that never compete with candles |
| **Candlestick & Flow** | `candle.bull` | `#2CC7A0` | Restrained institutional teal-green (CVD-safe) |
| | `candle.bear` | `#F06152` | Restrained institutional coral-red (CVD-safe) |
| | `poc.gold` | `#F59E0B` | Candle POC & Composite POC primary marker |
| **Information Tiers** | `tier.primary` | `opacity: 1.0` | Candles, last price, active trade Entry/SL/TP |
| | `tier.secondary` | `opacity: 0.78` | POC, VAH, VAL, Anchored VWAP, Gamma Flip, Call/Put Walls |
| | `tier.tertiary` | `opacity: 0.35` | Historical sessions (`AS`/`LON`/`NY`), minor levels, inactive drawings |
| **Typography** | `font.mono` | `'JetBrains Mono', monospace` | Tabular numeric prices, deltas, R-multiples (`tabular-nums`) |
| | `font.size.label` | `10px / 11px` | Compact axis badges, toolbar buttons, footprint cells |
