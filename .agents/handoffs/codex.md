>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> ROUND: RENDERER-R1A.3
>>> BRANCH: agent/codex
>>> COMMIT: 10a219108911e5c5a605a7ea4db0c054109ecf25
>>> TESTS: PASS - npx.cmd vitest run (7 files, 47 tests); PASS - targeted ESLint on renderer/terrain changed files; PASS - npm.cmd run build
>>> CONTRACT VERSION: 2
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Audit TerrainViewportModel dynamic axis contract for Gemini fixed HUD/SVG overlay integration
>>> TARGET: src/components/three/terrain/viewport.ts, src/components/three/IntegratedDealerTerrain.tsx, src/components/three/terrain/axes.ts, src/components/three/terrain/scales.test.ts, src/lib/terrain/engine.ts, src/lib/terrain/engine.test.ts

## Implementation Summary
- Added `TerrainViewportModel` in `src/components/three/terrain/viewport.ts` for fixed screen-space HUD/SVG axis rendering by Gemini.
- The viewport model exposes visible Strike, DTE, and Exposure domains, normalized tick positions, formatted tick labels, semantic `zoomLevel`, and structural anchor positions.
- Added semantic zoom and pan helpers: `zoomTerrainViewport()` and `panTerrainViewport()`.
- Wired `IntegratedDealerTerrain` to compute the viewport model and expose it through optional `onViewportChange` without breaking existing Gemini props.
- Kept current renderer modes intact: GEX, Vanna, Charm, Combined disabled.

## Root Cause / Data Diagnosis
- R1A.2 diagnosis found CASE B for the flat terrain: the DEMO Contract V2 option fixture was symmetric by strike/DTE/type, so call and put exposures canceled every displayed cell.
- Previous DEMO diagnostics: 42 cells, 42 observed, 0 unobserved; GEX/Vanna/Charm min and max all 0; robustAbsMax all 1; Spot, Gamma Flip, Call Wall, Put Wall, and Max Pain all collapsed at 69000.
- The DEMO fixture is now asymmetric while remaining explicitly `dataMode: DEMO`; LIVE quantitative calculations were not changed.

## Viewport / Axis Contract
- `TerrainViewportModel.metric`: `gex | vanna | charm | combined`.
- `strikeDomain`, `dteDomain`, and `exposureDomain` describe the currently visible quantitative chart domain.
- `strikeTicks`, `dteTicks`, and `exposureTicks` expose `{ value, normalizedPosition, label }` for fixed HUD axes where `0 -> 1` maps to screen axis position.
- Zoom narrows domains around a focus value; pan shifts the domain center and clamps to full data bounds.
- Structural anchors expose label, strike, priority, `normalizedPosition`, and `inDomain` for Spot, Gamma Flip, Call Wall, Put Wall, and Max Pain.

## Renderer Changes
- Added optional `onViewportChange?: (viewport: TerrainViewportModel) => void` to the existing terrain component interface.
- Existing dashboard integration remains compatible: `data`, `selectedStrike`, `selectedDte`, `onSelectStrike`, and `onSelectPoint` are unchanged.
- Current internal geometry/tick mapping reads from the same viewport model so terrain domain and axis domain share one source of truth.
- No Combined mode, Vanna contour overlay, Charm glyph overlay, confluence floor, Web Worker, or new dashboard module was implemented.

## DEMO Fixture Changes
- DEMO option generation now uses multiple DTEs and strikes with asymmetric call/put OI and IV distributions.
- The fixture now produces positive and negative GEX, positive and negative Vanna, positive and negative Charm, distinct structural levels, and nonzero robust scales.
- DEMO remains explicit through `dataMode: DEMO` and `assumptionModel: OI_SIGN_PROXY_V1`.

## Tests Added
- Added viewport contract tests for normalized HUD ticks, semantic zoom, pan behavior, and structural anchor labels/positions.
- Added DEMO-data regression test requiring positive/negative GEX, Vanna, Charm, nonzero robust scales, all observed DEMO cells, and non-collapsed structural strikes.

## Tests Executed
- `npx.cmd vitest run src/components/three/terrain/scales.test.ts src/lib/terrain/engine.test.ts`: PASS, 2 files, 25 tests.
- `npx.cmd vitest run`: PASS, 7 files, 47 tests.
- `npm.cmd run lint -- src/components/three/IntegratedDealerTerrain.tsx src/components/three/terrain/axes.ts src/components/three/terrain/scales.test.ts src/components/three/terrain/viewport.ts src/lib/terrain/engine.ts src/lib/terrain/engine.test.ts`: PASS.
- `npm.cmd run build`: PASS.

## Known Limitations
- Fixed screen-space HUD/SVG axis rendering itself is intentionally left to Gemini; Codex only provides the dynamic mathematical viewport contract.
- Existing Three.js world-space labels remain as interim renderer labels, but the new contract is the primary integration path for final fixed axes.
- R1A.3 did not implement additional visual redesign or R1B overlays.

## Gemini Integration Requirements
- Gemini should consume `TerrainViewportModel` for fixed HUD/SVG axes instead of deriving primary labels from Three.js text sprites.
- HUD axes should keep a stable screen frame while updating tick values from `strikeTicks`, `dteTicks`, and `exposureTicks`.
- Gemini should keep terrain viewport domains and HUD domains synchronized through `onViewportChange` or an equivalent shared-state bridge.
