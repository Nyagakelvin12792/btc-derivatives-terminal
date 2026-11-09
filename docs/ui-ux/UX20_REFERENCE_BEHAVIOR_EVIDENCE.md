# UX20 Reference Behavior & Chart Ergonomics Evidence

**Initiative**: `UX20: BTC TERMINAL MASTER PLAN IMPLEMENTATION`  
**Task**: `UX20.5-REF-07` (`UX20.5-PROFILE-01` through `UX20.5-SURFACE-06`)

## 1. Institutional Reference Terminal Alignment

| Domain | Reference Platform | Adopted Ergonomic & Analytical Standard | Implementation File(s) |
| :--- | :--- | :--- | :--- |
| **Drawing & Position Tooling** | TradingView | Single-click Long/Short position object placement, persistent Risk Terminal pinning when clicking blank chart canvas, 60fps synchronous drag projection without re-running heavy overlay projections, keyboard nudging (`Arrow` / `Shift+Arrow`), and full undo/redo stack (`Ctrl+Z` / `Ctrl+Y`). | `src/components/terminal/MarketStructureChart.tsx`, `src/components/terminal/drawing-model.ts`, `src/components/terminal/RiskTerminal.tsx` |
| **Footprint & Order Flow** | ATAS / Sierra Chart | 3-tier adaptive zoom density (`SUMMARY` < 22px, ` IMBALANCE` 22–44px, `BID_ASK` ≥ 44px), conservation-verified price-step aggregation (`sum(row.buy + row.sell) === candle.volume`), stacked 3:1 diagonal bid/ask imbalance highlighting, and exact vs. bar-approximated provenance badges. | `src/components/terminal/CandleFootprintCanvasOverlay.tsx`, `src/lib/chart-coordination/coordinator.ts` |
| **Resting Liquidity Surface** | Bookmap | Decoupled Canvas 2D resting depth projection (`FOCUSED` vs. `FULL` density mode) with explicit historical depth unavailability handling (never fabricating synthetic L2 depth from OHLC candles). | `src/components/terminal/LiquidityHeatmapOverlay.tsx`, `src/lib/binance/use-liquidity-heatmap.ts` |
| **Options Exposure & 2D Matrix** | Bloomberg / SpotGamma | Primary 2D Strike × Expiry table for signed GEX (`USD / 1% move`), Open Interest (`BTC`), and Implied Volatility (`%`), with 3D WebGL Gamma Terrain retained as an optional exploratory view. | `src/components/terminal/OptionsStrikeExpiryMatrix.tsx`, `src/components/terminal/ContextMode.tsx` |

## 2. Performance & Frame-Time Guardrails (`UX20.5-PROFILE-01`, `UX20.5-SYNC-02`, `UX20.5-DRAW-03`)

1. **Incremental Same-Bar Updates (`UX20.5-SYNC-02`)**:
   - `MarketStructureChart.tsx` checks `!contextChanged && previousCount === bars.length && bars.length > 0` and invokes `candles.update(bars[bars.length - 1])` instead of `candles.setData(bars)` on live intra-bar ticks, eliminating full-series re-layout on every websocket trade update.
2. **Decoupled Drawing Projection (`UX20.5-DRAW-03`)**:
   - `drawings` and `drawingDraft` are removed from the heavy `updateOverlayRef` dependency list (which projects Liquidity Heatmap frames and Footprint bars) and projected in a dedicated lightweight `useEffect` that updates `drawingViews` immediately during pointer drag.
3. **Attention Budget**:
   - Default active chart overlays are capped at ≤ 3 simultaneous layers, with progressive disclosure in the right-hand Context/Execution/Risk dock.
