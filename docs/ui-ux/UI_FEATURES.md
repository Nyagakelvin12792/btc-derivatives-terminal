# Sourced UI Feature Matrix

Version: 1.0  
Status: RESEARCH COMPLETE — DESIGN INPUT  
Last updated: 2026-10-21

## 1. Research Method

This document records which interaction ideas informed the terminal redesign, where each idea will be applied, and what will deliberately not be copied.

Research rules:

- Prefer official product documentation and primary GitHub repositories.
- Borrow interaction concepts and workflow principles, not proprietary code, assets, branding, or pixel-identical layouts.
- Open-source code is not imported merely because its repository was studied.
- Features requiring broker execution are excluded.
- Features requiring unavailable market data remain gated and labelled.

## 2. Feature Attribution Matrix

| Source | Observed idea | Applied to this terminal | Adaptation / guardrail | Phase |
| --- | --- | --- | --- | --- |
| OpenTerminalUI | `Ctrl+K` command palette and `Ctrl+G`-style navigation | Global command palette for symbols, workspaces, layers, studies, and settings | Use one `Ctrl+K` surface to avoid shortcut overload; no AI query execution in this UI milestone | UX7 |
| OpenTerminalUI | Grouped, collapsible navigation rail | Compact workspace rail for Chart, 3D Surface, GEX, Vanna, Charm, and OI | Default collapsed; preserve direct keyboard access | UX1 |
| OpenTerminalUI | Provenance chips and provider status row | `LIVE`, `DEMO`, `SHADOW`, `STALE`, `UNAVAILABLE` badges and bottom health bar | Never infer provider health from route existence; render known state only | UX1/UX3 |
| OpenTerminalUI | Synchronized multi-panel workstation | Link groups for chart, options inspector, 3D surface, and tables | Begin with one primary chart and optional panes; do not default to a nine-panel wall | UX7 |
| OpenTerminalUI | Saved views and launchpad workspaces | Named workspace presets | Keep presets task-based: Market Structure, Options, Order Flow, 3D Surface, Review | UX7 |
| TanukiTrade | Options metrics shown directly on the technical chart | Chart-native walls, Gamma Flip, Max Pain, GEX/OI overlays | Deribit/BTC data only; no mapped equity/ETF proxy substitution | UX3 |
| TanukiTrade | GEX Profile and GEX history workflow | GEX/OI segmented display and optional historical workspace entry | Existing engine values only; history appears only if already available | UX3 |
| TanukiTrade | 0DTE expected-move and expiry-specific context | DTE filter chips and expiry-aware level labels | BTC DTE buckets use existing expiries; no expected-move calculation added in UI | UX3 |
| TanukiTrade | Dynamic IVR/options dashboard | Options inspector for IV, IV rank, skew, OI, put/call, and walls | Each unavailable metric displays `UNAVAILABLE`; no UI-derived IV rank | UX3 |
| TanukiTrade | Expiry table with horizontal comparisons | Compact expiry/DTE table inside Options inspector or Data workspace | Progressive disclosure; not permanently placed over chart | UX3 |
| Charles Schwab thinkorswim | Studies can be added, edited, moved to lower panes, and removed | Unified study manager, pane placement, gear, and remove controls | Limited to supported project studies; no proprietary thinkScript compatibility | UX4 |
| Charles Schwab thinkorswim | Persistent studies and chart customization | Persist study instances and settings by workspace | Versioned local schema with reset and migration | UX4/UX7 |
| Charles Schwab thinkorswim | Rich drawing tools with direct chart interaction | Left drawing toolbar and selected-object context toolbar | Initial scope limited to existing/approved drawing types | UX5 |
| Fidelity Trader+ / Active Trader Pro | Movable and resizable tool panels | Resizable chart, inspector, and study panes | Constrained layout prevents off-screen panels and runaway canvas size | UX2 |
| Fidelity Trader+ / Active Trader Pro | Collapsible sidebars | Collapsible right inspector and compact left navigation | Closing a panel preserves its state and restores chart area | UX1/UX2 |
| Fidelity Trader+ / Active Trader Pro | Linked tools update together | Link groups for symbol, strike, expiry/DTE, and compatible crosshair state | Links are explicit and visible; no hidden global coupling | UX7 |
| Fidelity Active Trader Pro | Chart tabs with distinct settings | Named workspace presets and optional chart tabs | Prefer workspaces over many nested tabs; maximum initial preset set is five | UX7 |
| Fidelity Active Trader Pro | Saved chart templates and export | Save/restore study layout; later image/data export entry points | Export is UI-only and must use displayed authorized data | UX7 |
| MetaTrader 5 | Templates save one chart; profiles save entire workspace | Separate study template and full workspace concepts | Clear naming prevents overwriting a full layout with a study template | UX7 |
| MetaTrader 5 | Data Window shows precise values at cursor | Crosshair data strip and Data inspector | Values come from the selected chart time/price and include source state | UX2/UX3 |
| MetaTrader 5 | Fast navigation for symbol, timeframe, and date | Command bar and `Go to time` command | No order-entry commands | UX1/UX7 |
| MetaTrader 5 | Docked/undocked charts and multiple monitors | Future detachable workspace architecture | Not required for initial web release; plan state model so it is not blocked | Later |
| TradingView | Fixed Range Volume Profile defined by two chart coordinates | VP stays inside selected range with start/end handles | Preserve project calculation; borrow only interaction model | UX5 |
| TradingView | Anchored VWAP starts from a user-selected point | Draggable AVWAP anchor; line extends right only | Preserve project calculation and replay rules | UX5 |
| TradingView | CVD uses cumulative OHLC candles with anchor resets | CVD candle pane, zero line, anchor, and reset dividers | Render only supplied values; no frontend trade classification | UX6 |
| TradingView | Object Tree controls layer order and visibility | Unified Layer Manager and active-study chips | Include project-specific health/source state per object | UX4 |
| TradingView | Favorites for tools, indicators, and timeframes | Favorite tools/timeframes at top of menus | Stored locally in versioned UI preferences | UX7 |
| TradingView | Lock, hide, keep-drawing, snap, and remove controls | Drawing toolbar modes and global drawing actions | Default one-shot tools; keep-drawing must be explicitly enabled | UX4/UX5 |
| TradingView | Layouts preserve symbols, intervals, indicators, drawings, and settings | Saved chart-first workspaces | No cloud sync in this milestone; local persistence only | UX7 |
| TradingView | Multi-chart synchronization | Optional linked chart/pane state | Initial release stays single-primary-chart to protect clarity and performance | Later |
| ATAS | CVD visual modes include candles, bars, and line with session mode | Candles default; line/bars optional in settings | Candle mode is the default approved design; session metadata remains explicit | UX6 |
| ATAS | Smart DOM combines depth, trades, liquidity, and profile columns | Separate Book and Liquidity panes with compact aligned metrics | No DOM trading controls; display only authorized data | UX6 |
| ATAS | Volume Profile shows POC, VAH, VAL, and configurable data views | In-range VP with structural labels and value-area shading | Initial mode uses existing project profile data; TPO excluded unless separately authorized | UX5 |
| ATAS | Linked price axes across charts, heatmaps, and DOM | Compatible price-axis linking between chart and future book/liquidity views | Link only when units and scaling are equivalent | UX7 |
| ATAS | Workspaces and layers organize complex modules | Task-based workspace presets and Layer Manager | Limit default visible modules to avoid reproducing ATAS complexity | UX7 |
| ATAS | Full-screen analysis and magnifier modes | Chart maximize and focused inspection mode | Magnifier is later; maximize is part of UX2 | UX2 |

## 3. Platform-by-Platform Application

### 3.1 OpenTerminalUI

Primary source:

- [OpenTerminalUI README](https://github.com/Hitheshkaranth/OpenTerminalUI/blob/main/README.md)

Useful principles:

- Keyboard-first navigation.
- Grouped terminal navigation.
- Data provenance and honest degraded states.
- Saved workspaces and linked context.

Applied here:

- `Ctrl+K` command palette.
- Compact workspace rail.
- Provider/source badges in the status bar and inspector.
- Workspace presets with shared symbol/strike/DTE context.

Not copied:

- No OpenTerminalUI code, theme, screen composition, AI agent console, portfolio, broker, or research modules are imported.

### 3.2 TanukiTrade

Primary sources:

- [TanukiTrade product overview](https://www.tanukitrade.com/)
- [TanukiTrade web application overview](https://www.app.tanukitrade.com/)

Useful principles:

- Keep options context on the chart instead of forcing window switching.
- Present GEX levels, Gamma Flip, walls, IV/skew, and expiries together.
- Allow rapid expiry/DTE comparison.

Applied here:

- Options Metrics toggle.
- DTE filter chips.
- Chart-native walls, Gamma Flip, Max Pain, and gamma regime.
- Options inspector with IV/OI/skew fields when supplied.

Not copied:

- No TradingView scripts, proprietary formulas, ORATS data, equity-to-ETF mappings, pricing, marketing design, or brand assets.

### 3.3 Charles Schwab thinkorswim

Primary sources:

- [thinkorswim desktop](https://www.schwab.com/trading/thinkorswim/desktop)
- [Edit and customize studies](https://advisorservices.schwab.com/story/edit-customize-studies-on-thinkorswim)
- [Getting started with thinkorswim charts](https://advisorservices.schwab.com/story/getting-started-with-thinkorswim-charts)

Useful principles:

- Studies should be editable before and after insertion.
- A study can live on price or in a lower pane.
- Persistent chart setups reduce repetitive configuration.

Applied here:

- Study manager and active-study legend.
- Move-compatible studies between price and lower panes.
- Per-instance gear, visibility, duplication, and removal.

Not copied:

- No order tickets, thinkScript, broker controls, branding, or proprietary interface assets.

### 3.4 Fidelity Trader+ / Active Trader Pro

Primary sources:

- [Fidelity Trader+ overview](https://www.fidelity.com/trading/advanced-trading-tools/active-trader-pro/overview)
- [Active Trader Pro layouts and linking](https://www.fidelity.com/products/atbt/help/ActiveTraderTools_Layouts_Help.html)
- [Active Trader Pro charting](https://www.fidelity.com/products/atbt/help/ActiveTraderTools_Chart_Help.html)
- [Fidelity Trader+ navigation and linked tools](https://www.fidelity.com/trading/trader-desktop-user-guide/navigation)

Useful principles:

- Resize, reposition, maximize, minimize, and link tools.
- Save and restore layouts.
- Use chart tabs/templates for different tasks.

Applied here:

- Resizable inspector and study panes.
- Explicit link groups.
- Workspace presets and save/restore.
- Chart maximize mode.

Not copied:

- No account, portfolio, order ticket, Level 2 entitlement, or multi-monitor native desktop implementation in this milestone.

### 3.5 MetaTrader 5

Primary sources:

- [View and configure charts](https://www.metatrader5.com/en/terminal/help/charts_analysis/charts)
- [MetaTrader 5 user interface](https://www.metatrader5.com/en/terminal/help/startworking/interface)
- [Depth of Market](https://www.metatrader5.com/en/terminal/help/trading/depth_of_market)

Useful principles:

- Separate chart templates from whole-workspace profiles.
- Keep precise crosshair values in a dedicated Data Window.
- Support fast navigation and recoverable chart configurations.

Applied here:

- Study templates versus workspace presets.
- Data inspector and crosshair summary.
- Command palette navigation.

Not copied:

- No Expert Advisors, MQL, one-click trading, orders, positions, or broker DOM actions.

### 3.6 TradingView

Primary sources:

- [Fixed Range Volume Profile](https://www.tradingview.com/support/solutions/43000707985-fixed-range-volume-profile-drawing-tool/)
- [Anchored VWAP](https://www.tradingview.com/support/solutions/43000669764-anchored-vwap-drawing-tool/)
- [Cumulative Volume Delta](https://www.tradingview.com/support/solutions/43000725058-cumulative-volume-delta/)
- [Layouts](https://www.tradingview.com/support/solutions/43000746975-tradingview-layouts-a-quick-guide/)
- [Drawing tools](https://www.tradingview.com/support/solutions/43000703396-drawing-tools-available-on-tradingview/)
- [Visual order and Object Tree](https://www.tradingview.com/support/solutions/43000474299-how-can-i-change-the-visual-order-layer-of-indicators-drawings-candles/)
- [Favorites](https://www.tradingview.com/support/solutions/43000662392-how-to-favorite-indicators-financials-drawing-tools-and-timeframes/)

Useful principles:

- Direct manipulation of drawings and anchored studies.
- Clear separation between overlay studies and lower panes.
- Object visibility, locking, ordering, and favorites.
- Saved layouts with predictable scope.

Applied here:

- Fixed Range VP, AVWAP, CVD candle behavior, Layer Manager, active-study chips, drawing actions, favorites, and layouts.

Not copied:

- No TradingView logo, hosted widget, proprietary Charting Library, Pine scripts, community content, broker panel, or pixel-identical skin.

### 3.7 ATAS

Primary sources:

- [ATAS CVD](https://help.atas.net/en/support/solutions/articles/72000602360)
- [ATAS Chart Window](https://help.atas.net/en/support/solutions/articles/72000602255)
- [ATAS Smart DOM](https://atas.net/modules/smart-dom/)
- [ATAS Volume Profile and TPO](https://help.atas.net/en/support/solutions/articles/72000602305-market-profile-tpo)
- [ATAS workspaces](https://atas.net/modules/workspaces/)
- [ATAS linked price axes](https://help.atas.net/en/support/solutions/articles/72000660390-link-price-axis)

Useful principles:

- Order-flow views need their own focused panes and explicit modes.
- CVD benefits from candle, bar, and line choices plus session controls.
- Price-aligned modules help compare chart, liquidity, and flow.
- Profile tools should expose POC and value-area structure clearly.

Applied here:

- CVD candle pane.
- Delta, Book, and Liquidity tabs.
- Price-axis linking only for compatible modules.
- VP structural labels and object settings.

Not copied:

- No chart trading, DOM order entry, Smart Tape execution, proprietary footprint calculation, TPO engine, or broker connectivity.

## 4. Project-Specific Features Not Borrowed

The following design elements are native to this project even when general chart patterns resemble other terminals:

- Dealer-pressure 3D terrain across strike and DTE.
- Combined GEX, Vanna, Charm, and confluence interpretation.
- Gamma-regime shading driven by the project's existing engine contract.
- Options-wall hierarchy tied to the project's key-level model.
- Explicit assumption-model presentation for dealer-position estimates.
- Analysis-only `NO LIVE EXECUTION` boundary.

## 5. Features Deliberately Rejected

| Rejected feature | Reason |
| --- | --- |
| One-click order entry | Outside analysis-only scope and creates execution risk |
| Broker account/position panels | Requires new backend, credentials, and regulatory/security scope |
| Default nine- or sixteen-chart grid | Conflicts with cognitive-load objective |
| Permanent DOM beside every chart | Consumes space; use an optional pane only when valid data exists |
| Unlabelled synthetic order-flow data | Violates provenance and trust requirements |
| Automatic AI trade recommendation | Decision authority and evidence gates are outside this UI milestone |
| Pixel clone of any commercial platform | Unnecessary and creates IP/brand confusion |
| Full TPO/footprint engine | Requires calculations not authorized in this UI-only scope |
| Cloud workspace synchronization | Requires backend persistence outside this milestone |

## 6. Design Synthesis

The resulting product is intentionally not a clone of any single platform:

- **TradingView** contributes direct chart-object interaction.
- **TanukiTrade** contributes options context on the chart.
- **ATAS** contributes focused order-flow presentation.
- **OpenTerminalUI** contributes keyboard navigation and data trust.
- **Schwab** contributes study management.
- **Fidelity** contributes linked, resizable tools.
- **MetaTrader 5** contributes templates, profiles, and precise data inspection.
- **This project** contributes the derivatives mechanics, dealer-terrain model, gamma regime, walls, confluence, and strict analysis-only safety boundary.

The applied design keeps price and derivatives structure visible, moves configuration and detailed metrics into controlled surfaces, and makes every data state auditable.

