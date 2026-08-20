>>> COMPLETED BY: Codex
>>> STATUS: COMPLETE
>>> ROUND: C1.1
>>> BRANCH: agent/codex
>>> COMMIT: c77759b1e08ee802a8765c64e7f6a457d87a0ff0
>>> TESTS: PASS - npx.cmd vitest run (6 files, 35 tests); PASS - targeted ESLint on touched terrain and Deribit API contract files; PASS - npm.cmd run build
>>> CONTRACT VERSION: 2
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Audit Codex backend and quant implementation against Gemini visual engine
>>> TARGET: src/app/api/deribit/README.md, src/lib/terrain/engine.ts, src/lib/terrain/engine.test.ts, src/lib/terrain/types.ts

## Implementation Summary
- Applied the Architect C1.1 corrections without rebuilding the Terrain Engine or modifying Gemini-owned dashboard/visualization files.
- Added `observed` metadata to surface cells and made LIVE/DEGRADED unobserved raw Greeks and IV explicitly nullable.
- Reordered Terrain Data Contract V2 scaling so GEX, Vanna, Charm, and OI scale bounds are derived from aggregated Strike x Expiry cells before intensity calculation.
- Added explicit Charm neutralizing hedge flow metadata on glyphs.
- Updated Gamma Flip crossing selection to retain all interpolated zero crossings and select the crossing nearest current spot as primary.
- Updated Vanna contour point metadata to interpolate strike and DTE from fractional d3-contour grid coordinates while preserving `x` and `y`.
- Updated `/api/deribit` contract documentation for the C1.1 nullable LIVE cell, Charm hedge-flow, Gamma Flip crossing, aggregated-scale, and contour-coordinate semantics.

## Mathematical Verification
- `charmExposure` remains signed OI_SIGN_PROXY_V1 option delta-notional drift per calendar day.
- `charmHedgeFlowUsdPerDay = -charmExposure` is now explicit and tested.
- `hedgeDirection` is now derived from neutralizing hedge flow: positive flow -> `BUY_HEDGE`, negative flow -> `SELL_HEDGE`, zero -> `NEUTRAL`.
- Portfolio-revaluation Gamma Flip now computes every zero crossing in the sampled hypothetical spot curve; primary `gammaFlip.strike` is the crossing nearest `spotPrice`.
- If no Gamma Flip crossing exists, fallback remains the curve point with minimum absolute GEX.
- Exposure intensity scales are calculated from aggregated surface-cell values, not individual contract values.
- Vanna contour strike/DTE metadata is interpolated from neighboring nonuniform grid axes instead of snapped to nearest cells.

## API Contract
- Terrain Data Contract V2 remains `schemaVersion: 2` and `assumptionModel: OI_SIGN_PROXY_V1`.
- `TerrainSurfaceCell.observed` is now required.
- For `LIVE` and `DEGRADED` unobserved rectangular cells: `observed: false`, `rawDelta: null`, `rawGamma: null`, `rawVanna: null`, `rawCharm: null`, `iv: null`, exposure/OI fields zero, and legacy `gamma: 0`.
- `DEMO` cells may still contain synthetic analytical raw Greeks and IV because `dataMode: DEMO` is explicit.
- `CharmPressureGlyph` now includes `charmHedgeFlowUsdPerDay`.
- `GammaFlipLevel` now includes `crossings: number[]`.
- `VannaContourPoint` continues to expose `x`, `y`, `strike`, and `dte`; `strike`/`dte` are interpolated coordinate metadata.

## Files Changed
- `src/app/api/deribit/README.md`
- `src/lib/terrain/engine.ts`
- `src/lib/terrain/engine.test.ts`
- `src/lib/terrain/types.ts`
- `.agents/handoffs/codex.md`

## Tests Added
- Charm hedge-flow direction regression test.
- LIVE empty rectangular cell null raw Greek/IV regression test.
- Aggregated surface-cell scale-bound regression test.
- Multiple Gamma Flip crossing selection regression test.
- Vanna contour coordinate interpolation regression test.
- Contract-shape checks for `gammaFlip.crossings` and Charm glyph hedge-flow metadata.

## Tests Executed
- `npx.cmd vitest run`: PASS, 6 files, 35 tests.
- `npm.cmd run lint -- src/lib/terrain/engine.ts src/lib/terrain/engine.test.ts src/lib/terrain/types.ts src/app/api/deribit/route.ts src/app/api/deribit/route.test.ts`: PASS.
- `npm.cmd run build`: PASS.

## Security / Resilience Findings
- No Gemini-owned UI files were modified.
- LIVE/DEGRADED unobserved cells no longer fabricate raw Greeks or IV, reducing false precision in downstream rendering.
- Rectangular geometry is preserved with zero exposure/OI placeholders, so one missing Strike x Expiry observation does not break the response.
- Data provenance remains explicit through `dataMode` and `OI_SIGN_PROXY_V1`.

## Known Limitations
- `OI_SIGN_PROXY_V1` remains a deterministic proxy and does not represent observed dealer inventory.
- The current `/api/deribit` route emits LIVE or DEMO; DEGRADED remains supported by the terrain engine contract for future API-layer partial-data handling.
- Existing Gemini `SurfaceMesh` has a numeric local `iv` shape; C1.1 keeps Gemini files untouched and preserves numeric legacy `gamma`, while new V2 consumers should read `observed` before using nullable raw values or IV.

## Gemini Integration Requirements
- Do not infer Charm hedge direction from `charmExposure`; use `charmHedgeFlowUsdPerDay` or `hedgeDirection`.
- Treat LIVE/DEGRADED `observed: false` cells as geometry placeholders, not measured option data.
- Use aggregated-cell `scales` for terrain intensity interpretation.
- Render Gamma Flip primary level from `gammaFlip.strike`; use `gammaFlip.crossings` if secondary crossings/debug visibility is needed.
- Use Vanna contour `x`/`y` as grid coordinates and `strike`/`dte` as interpolated metadata, not nearest-cell labels.
