>>> COMPLETED BY: Codex
>>> STATUS: COMPLETE
>>> BRANCH: agent/codex
>>> COMMIT: ea8d411cf20712249218532c694380ee869a2283
>>> TESTS: PASS - npx.cmd vitest run (6 files, 30 tests); PASS - targeted ESLint on Codex-owned API, Deribit, quant, and terrain files; PASS - npm.cmd run build
>>> CONTRACT VERSION: 2
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Audit Codex backend and quant implementation against Gemini visual engine
>>> TARGET: .agents/TRIAD_SYSTEM_PROMPT.md, package.json, package-lock.json, src/app/api/deribit/README.md, src/app/api/deribit/route.ts, src/app/api/deribit/route.test.ts, src/lib/quant/engine.ts, src/lib/quant/engine.test.ts, src/lib/terrain/engine.ts, src/lib/terrain/engine.test.ts, src/lib/terrain/types.ts

## Implementation Summary
- Implemented Terrain Data Contract V2 under src/lib/terrain with schemaVersion 2, dataMode, assumptionModel, scales, keyLevels, maxPainByExpiry, confluenceLevels, keyContracts, Vanna contours, Charm glyphs, and confluenceFloor.
- Replaced the bulky /api/deribit response builder with a thin server adapter that returns LIVE V2 terrain data or explicit DEMO fallback data.
- Preserved current Gemini compatibility fields: summary legacy names, surfaceGrid gex/callGex/putGex/openInterest/gamma/iv fields, and topContracts alias.
- Added the Round C1 dependency set: d3-contour, @types/d3-contour, echarts, echarts-for-react, @tanstack/react-query, @tanstack/react-table, zustand, and zod.

## Mathematical Verification
- GEX Exposure is locked as positionSign * rawGamma * openInterestBtc * spotUsd^2 * 0.01, in USD hedge-notional change per 1% BTC move.
- Vanna Exposure is locked as positionSign * rawVanna * openInterestBtc * spotUsd * 0.01, in USD hedge-notional change per 1 volatility-point IV move.
- Charm Exposure is locked as positionSign * rawCharm * openInterestBtc * spotUsd / 365, in USD hedge-notional change per calendar day.
- Call Wall uses call-side GEX Exposure only; Put Wall uses largest absolute put-side GEX Exposure only.
- Gamma Flip revalues the active option portfolio across a hypothetical BTC spot grid and interpolates zero crossings when available.
- Max Pain is calculated per expiry using all strikes in that expiry, not visualization-sampled strikes.
- Quant calculateNetGEX now uses the C1 per-1%-move GEX unit.

## API Contract
- /api/deribit now returns Terrain Data Contract V2 with schemaVersion: 2 and assumptionModel: OI_SIGN_PROXY_V1.
- LIVE responses use Cache-Control: public, max-age=5, s-maxage=15, stale-while-revalidate=30.
- DEMO fallback responses use Cache-Control: no-store and dataMode: DEMO.
- DEGRADED is implemented as a valid terrain dataMode in the contract engine for API-layer use when partial live analytics are introduced.
- API documentation in src/app/api/deribit/README.md documents V2 fields, units, scale metadata, key levels, contours, glyphs, confluence floor, and Gemini compatibility requirements.

## Files Changed
- .agents/TRIAD_SYSTEM_PROMPT.md
- package.json
- package-lock.json
- src/app/api/deribit/README.md
- src/app/api/deribit/route.ts
- src/app/api/deribit/route.test.ts
- src/lib/quant/engine.ts
- src/lib/quant/engine.test.ts
- src/lib/terrain/engine.ts
- src/lib/terrain/engine.test.ts
- src/lib/terrain/types.ts

## Tests Added
- Terrain engine tests for exposure unit formulas, intensity bands, confluence weighting, behavior precedence, V2 response shape, structural levels, Vanna contours, Charm glyphs, confluence floor, DEMO metadata, and DEGRADED metadata.
- API route tests for LIVE V2 metadata/cache behavior and DEMO fallback/no-store behavior.
- Quant tests updated for the per-1%-move GEX convention.

## Tests Executed
- npx.cmd vitest run: PASS, 6 files, 30 tests.
- npx.cmd eslint src/app/api/deribit/route.ts src/app/api/deribit/route.test.ts src/lib/deribit/client.server.ts src/lib/deribit/client.server.test.ts src/lib/deribit/server-boundary.test.ts src/lib/deribit/normalization.ts src/lib/deribit/normalization.test.ts src/lib/deribit/types.ts src/lib/quant/engine.ts src/lib/quant/engine.test.ts src/lib/terrain/engine.ts src/lib/terrain/engine.test.ts src/lib/terrain/types.ts: PASS.
- npm.cmd run build: PASS.

## Security / Resilience Findings
- Browser/client code remains isolated from Deribit upstream and quant/terrain internals; /api/deribit is the browser-facing boundary.
- LIVE, DEMO, and DEGRADED metadata prevent silent mixing of synthetic and live analytical values.
- OI_SIGN_PROXY_V1 is emitted in every terrain contract so the UI does not present public OI as observed dealer inventory.
- Existing Deribit normalization, malformed-instrument isolation, response validation, request timeout, and in-flight/cache resilience remain in place.

## Known Limitations
- OI_SIGN_PROXY_V1 is a deterministic proxy, not true dealer positioning.
- Behavior-zone thresholds and confluence proximity bands are V1 defaults and should be reviewed after live observation.
- DEGRADED mode is supported by the terrain engine but the current route only emits LIVE or DEMO.
- Vanna contours use d3-contour polygon rings as render-ready contour primitives in grid coordinates; Gemini still needs to decide final visual projection/styling.
- No Web Worker was added because profiling evidence of material main-thread terrain-prep cost is not yet available.

## Gemini Integration Requirements
- Do not redefine dealer math, exposure units, confluence scoring, behavior labels, or OI_SIGN_PROXY_V1 semantics in UI code.
- Existing SurfaceMesh can continue consuming legacy-compatible fields, but new terrain rendering should prefer explicit V2 fields.
- Render and visibly label dataMode, especially DEMO and DEGRADED.
- Display assumptionModel: OI_SIGN_PROXY_V1 wherever dealer positioning is explained.
- Render GEX terrain, Vanna contour primitives, Charm pressure glyphs, confluence floor, Call Wall, Put Wall, Gamma Flip, max pain by expiry, and behavior-zone markers from the supplied contract.
- Use independent GEX, Vanna, and Charm scales; do not normalize these metrics against one shared maximum.
