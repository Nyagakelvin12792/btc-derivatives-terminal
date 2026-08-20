>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> ROUND: RENDERER-R1A
>>> BRANCH: agent/codex
>>> COMMIT: b17d31a0885a2ef4bbda324de031cd52ddaa236a
>>> TESTS: PASS - npx.cmd vitest run (7 files, 43 tests); PASS - targeted ESLint on renderer/page files; PASS - npm.cmd run build
>>> CONTRACT VERSION: 2
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review quantitative 3D renderer foundation against R1A visual references and Terrain Contract V2
>>> TARGET: src/components/three/IntegratedDealerTerrain.tsx, src/components/three/terrain/*, src/app/page.tsx

## Implementation Summary
- Added a new Contract V2-aware quantitative renderer foundation in `src/components/three/IntegratedDealerTerrain.tsx`.
- Replaced the existing page integration from legacy `SurfaceMesh` props to full `TerrainDataContractV2` data so the renderer can use `scales`, `keyLevels`, `dtes`, and raw surface cells.
- Implemented R1A metric selector modes: `GEX`, `VANNA`, and `CHARM` complete; `COMBINED` is present but disabled with next-round semantics.
- Removed default wireframe noise, dramatic colored lighting, arbitrary CSS-positioned structural labels, and index-based surface geography in the new renderer.
- Added real Strike, DTE, and financial exposure axes as world-space chart elements.

## Files Changed
- `src/app/page.tsx`
- `src/components/three/IntegratedDealerTerrain.tsx`
- `src/components/three/terrain/axes.ts`
- `src/components/three/terrain/colors.ts`
- `src/components/three/terrain/interpolation.ts`
- `src/components/three/terrain/metric.ts`
- `src/components/three/terrain/scales.ts`
- `src/components/three/terrain/scales.test.ts`
- `.agents/handoffs/codex.md`

## Surface Interpolation Method
- Added render-only piecewise bilinear interpolation in `terrain/interpolation.ts`.
- Interpolation uses actual Strike and DTE numeric axes, not grid indexes, so nonuniform Deribit strike spacing and expiry spacing are respected.
- The analytical `surfaceGrid` remains unchanged.
- Each render sample retains a nearest Contract V2 analytical `sourceCell` for hover/selection integrity.

## Y-Axis Algorithm
- Each metric uses its own `scales.<metric>.robustAbsMax` from Terrain Contract V2.
- The robust value is converted into a symmetric human-readable display scale.
- Geometry maps `[-displayBound, +displayBound]` to the restrained world Y range of `[-5.2, +5.2]`.
- Axis ticks are real exposure values, formatted as financial labels such as `+$4B`, `$0`, and `-$750K`.

## Nice-Number Algorithm
- `createSymmetricFinancialScale()` divides the robust absolute max by four half-axis intervals, rounds the tick step up to a nice value, then sets `displayBound = tickStep * 4`.
- Nice steps include `1`, `1.25`, `1.5`, `2`, `2.5`, `5`, and `10` powers of ten.
- Locked examples in tests: `3.91B -> 4B`, `763K -> 800K`, `1.37M -> 2M`.

## Camera Defaults
- Default `3D` view uses FOV 30 with a moderate chart perspective: camera `(22, 10.5, 20)`, target `(0,0,0)`.
- `TOP` view uses `(0, 28, 0.01)` for concentration scanning.
- `FRONT` view uses `(0, 5.5, 28)` for exposure versus Strike.
- `RESET` returns to the approved default 3D chart perspective.

## Outlier Policy
- Analytical values are never changed.
- If `abs(value) > displayBound`, only rendered geometry is clipped to the display bound.
- Tooltip data still shows true Contract V2 values and marks clipped hover points as `ABOVE DISPLAY RANGE`.

## Metric Modes Completed
- `GEX`: terrain Y = `surfaceGrid.gexExposure`; green positive above zero, red negative below zero.
- `VANNA`: terrain Y = `surfaceGrid.vannaExposure`; magenta/pink positive, indigo/violet negative.
- `CHARM`: terrain Y = `surfaceGrid.charmExposure`; amber/gold positive, burnt orange negative.
- `COMBINED`: visible but disabled for a later round; no combined overlays were implemented in R1A.

## Tests
- Added tests for financial display bounds, financial tick formatting, render clipping, Strike coordinate mapping, DTE coordinate mapping, readable axis ticks, and bilinear interpolation on nonuniform axes.
- `npx.cmd vitest run src/components/three/terrain/scales.test.ts src/lib/terrain/engine.test.ts`: PASS, 2 files, 21 tests.
- `npx.cmd vitest run`: PASS, 7 files, 43 tests.
- `npm.cmd run lint -- src/components/three/IntegratedDealerTerrain.tsx src/components/three/terrain/axes.ts src/components/three/terrain/colors.ts src/components/three/terrain/interpolation.ts src/components/three/terrain/metric.ts src/components/three/terrain/scales.ts src/components/three/terrain/scales.test.ts src/app/page.tsx`: PASS.
- `npm.cmd run build`: PASS.

## Visual Checks
- Production server started with `npm.cmd run start -- -p 3010`; `http://localhost:3010` returned HTTP 200.
- Attempted headless screenshot checks at `1366x768`, `1440x900`, and `1920x1080` using Edge.
- Attempted fallback headless Chrome screenshot at `1366x768` with SwiftShader flags.
- Both browsers failed before screenshot capture with local GPU-process fatal errors (`GPU process isn't usable`) in the headless environment, so screenshot-based visual verification remains pending for Architect/Gemini in a normal browser session.
- No screenshot artifacts were produced.

## Known Limitations
- Browser screenshot verification could not be completed in this local headless environment due to GPU-process failures.
- R1A intentionally does not implement Combined mode overlays, Vanna contour overlay, Charm arrows, confluence floor redesign, behavior-zone 3D markers, Web Workers, or final visual polish.
- Current text labels use canvas sprites and may need visual tuning by Gemini after Architect review.
- Structural levels outside the visible Strike range are marked as `FULL CHAIN` edge labels rather than creating fake terrain columns.
- Tooltip styling is intentionally simple for R1A.

## Cross-Agent Requirements
- Gemini should visually verify the new `IntegratedDealerTerrain` at 1366x768, 1440x900, and 1920x1080 in a browser with working WebGL.
- Gemini should not infer Charm hedge direction from strike position; use Contract V2 semantics if displaying hedge flow in later rounds.
- Later rounds can layer Vanna contours, Charm glyphs, confluence floor, and behavior markers on top of this metric-mode foundation.
