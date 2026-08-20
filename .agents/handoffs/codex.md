>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> ROUND: RENDERER-R1A.1
>>> BRANCH: agent/codex
>>> COMMIT: d60d75db880e298af077576cdc689e3d8250e108
>>> TESTS: PASS - npx.cmd vitest run (7 files, 43 tests); PASS - targeted ESLint on restored Gemini dashboard and R1A renderer integration (0 errors, 27 warnings); PASS - npm.cmd run build
>>> CONTRACT VERSION: 2
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review R1A renderer integration against latest Gemini G2 dashboard architecture and Zustand selection synchronization
>>> TARGET: src/app/page.tsx, src/app/layout.tsx, src/app/providers.tsx, src/components/dashboard/*, src/components/three/IntegratedDealerTerrain.tsx, src/lib/dashboard/*

## Implementation Summary
- Fetched `origin` and restored the latest Gemini G2 dashboard architecture from `origin/agent/gemini` instead of keeping the older Codex manual-fetch page.
- Preserved Gemini-owned dashboard infrastructure: TanStack Query, Zustand store, sidebar/workspaces, ECharts workspaces, TanStack tables, dealer summary panels, key-level profile, map-reading panel, behavior legend, and LIVE/DEMO handling.
- Integrated the R1A `IntegratedDealerTerrain` renderer into the Gemini dashboard contract without restoring manual `fetch` or `setInterval` behavior.
- Preserved R1A renderer behavior: GEX/Vanna/Charm modes, disabled Combined mode, real financial Y axis, Strike/DTE axes, render-only interpolation, outlier clipping, wireframe off, neutral lighting, camera presets, and coordinate-based Spot/Flip/Walls/Max Pain.

## Dashboard Integration
- `src/app/page.tsx` now uses Gemini's TanStack Query data flow via `useTerrainQuery(dataMode)`.
- Zustand selection state remains the single dashboard coordination layer through `useTerminalStore`.
- The terrain receives the expected interface: `data`, `selectedStrike`, `selectedDte`, `onSelectStrike`, and `onSelectPoint`.
- Terrain clicks call `onSelectStrike(cell.strike)` and `onSelectPoint(cell)`.
- Gemini's page-level `onSelectPoint` callback calls `setSelectedPoint(cell.strike, cell.dte, cell.expiry)`, keeping `selectedStrike`, `selectedDte`, and `selectedExpiry` synchronized in Zustand.

## Files Changed
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/providers.tsx`
- `src/components/dashboard/ConfluenceLevelsTable.tsx`
- `src/components/dashboard/DealerBehaviorLegend.tsx`
- `src/components/dashboard/DealerEnvironmentSummary.tsx`
- `src/components/dashboard/EChartsWorkspaces.tsx`
- `src/components/dashboard/ExpirySliceChart.tsx`
- `src/components/dashboard/ExposureScalePanel.tsx`
- `src/components/dashboard/FooterBar.tsx`
- `src/components/dashboard/GexHeatmap.tsx`
- `src/components/dashboard/HowToReadMapPanel.tsx`
- `src/components/dashboard/KeyContractsTable.tsx`
- `src/components/dashboard/KeyLevelProfile.tsx`
- `src/components/dashboard/Sidebar.tsx`
- `src/components/dashboard/StrikeSliceChart.tsx`
- `src/components/dashboard/TanStackTables.tsx`
- `src/components/dashboard/TopTickerBar.tsx`
- `src/components/dashboard/Workspaces.tsx`
- `src/components/three/IntegratedDealerTerrain.tsx`
- `src/lib/dashboard/adapters.ts`
- `src/lib/dashboard/queries.ts`
- `src/lib/dashboard/store.ts`
- `src/lib/dashboard/types.ts`
- `.agents/handoffs/codex.md`

## Tests Executed
- `npx.cmd vitest run src/components/three/terrain/scales.test.ts src/lib/terrain/engine.test.ts src/app/api/deribit/route.test.ts`: PASS, 3 files, 23 tests.
- `npx.cmd vitest run`: PASS, 7 files, 43 tests.
- `npm.cmd run lint -- src/app/page.tsx src/app/layout.tsx src/app/providers.tsx src/components/dashboard src/components/three/IntegratedDealerTerrain.tsx src/components/three/terrain src/lib/dashboard`: PASS with 0 errors and 27 existing warnings.
- `npm.cmd run build`: PASS.

## Security / Resilience Findings
- No new client-side Deribit fetching was introduced.
- Existing server/query separation is preserved: dashboard state consumes the Terrain Contract V2 API through TanStack Query.
- No manual polling loop was restored.
- TypeScript build now verifies the restored Gemini dashboard against the Contract V2 dashboard adapters.

## Known Limitations
- Targeted ESLint still reports warnings in Gemini dashboard files for unused imports/variables and React hook dependency hints, but exits successfully with 0 errors.
- R1A.1 did not perform a renderer redesign, visual polish pass, or R1B overlay work.
- Browser visual screenshot verification was not rerun in this correction pass; prior R1A headless WebGL checks were blocked by local GPU-process failures.

## Gemini Integration Requirements
- Gemini should verify the restored G2 dashboard layout still matches its approved interaction model.
- Architect should verify terrain click selection updates all expected Zustand fields: `selectedStrike`, `selectedDte`, and `selectedExpiry`.
- Future R1B work can build on the existing R1A renderer utilities without changing the Terrain Contract V2 backend.
