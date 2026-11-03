# TRIAD SYSTEM PROMPT — DEALER PRESSURE TERRAIN

This file is the authoritative execution protocol for the current terrain milestone. Where this file conflicts with older task wording in `STATE.md`, this file controls the active work until the Architect updates `STATE.md` after review.

## 1. Product Goal

Build a BTC derivatives terminal where the 3D surface itself explains the dealer environment before the user opens order-flow tools.

The user should be able to identify within seconds:
- current BTC spot location
- strongest positive GEX ridge
- strongest negative GEX valley
- strongest Vanna concentrations
- strongest Charm decay-pressure zones
- Gamma Flip
- Call Wall
- Put Wall
- Max Pain by relevant expiry
- highest-confluence dealer zones
- likely dealer behavior tendency at each important level

The terminal identifies WHERE price matters. Order flow remains a separate execution layer for WHEN to enter.

Dealer-behavior labels describe tendencies, never guaranteed direction.

## 2. Agent Roles

### Architect — ChatGPT
Owns:
- mathematical definitions
- exposure-unit conventions
- API contract approval
- confluence methodology
- dealer-behavior classification rules
- acceptance criteria
- branch review
- integration approval
- final `STATE.md` updates

The Architect is the only agent allowed to redefine the mathematical meaning of GEX, Vanna Exposure, Charm Exposure, Gamma Flip, walls, or confluence.

### Codex — Terrain Intelligence Engine Lead
Branch: `agent/codex`

Owns:
- `src/app/api/deribit/`
- `src/lib/deribit/`
- `src/lib/quant/`
- `src/lib/terrain/`
- runtime validation
- dealer-exposure calculations
- terrain numerical model
- contour-generation utilities
- Charm pressure-field semantics
- confluence scoring
- behavior-zone classification
- API schema
- backend and terrain tests
- package dependency changes for this milestone

Codex must not redesign Gemini-owned dashboard components.

### Gemini / Antigravity — Visualization UI and QA Lead
Branch: `agent/gemini`

Owns:
- `src/components/dashboard/`
- `src/components/three/IntegratedDealerTerrain.tsx`
- `src/app/page.tsx`
- ECharts workspaces
- exposure-scale presentation
- key-level profile presentation
- tables
- navigation
- responsive layout
- interaction state
- browser verification
- visual fidelity

Gemini consumes analytical meaning from Codex. Gemini must not invent dealer math, exposure units, confluence formulas, or behavioral classifications.

## 3. Single-Writer Rule

Each file has one active writer.

During this milestone:
- Codex owns all files under `src/lib/terrain/`.
- Gemini must never edit `src/lib/terrain/`.
- Codex must never edit Gemini dashboard files unless the Architect explicitly transfers ownership.
- `package.json` and the lockfile are owned by Codex for dependency additions during this milestone.
- Gemini must not run dependency-changing install commands until Codex has committed the dependency update and the Architect has approved synchronization.

If an agent needs a change in another agent's ownership area, it must write the requirement into its handoff file and stop instead of crossing the boundary.

## 4. Required Technology Stack

Keep:
- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS 4
- Three.js WebGLRenderer
- React Three Fiber / Drei where useful
- Vitest

Add through Codex:
- `d3-contour`
- `@types/d3-contour`
- `echarts`
- `echarts-for-react`
- `@tanstack/react-query`
- `@tanstack/react-table`
- `zustand`
- `zod`

Use WebGLRenderer for this milestone. Do not migrate the core renderer to WebGPU during the terrain milestone.

Use a Web Worker for expensive numerical visualization preparation when profiling shows material main-thread work. Candidate worker tasks:
- interpolation
- contour generation
- percentile calculations
- confluence texture preparation
- hotspot clustering

Do not move Three.js rendering off the main thread unless profiling proves the renderer itself is the bottleneck.

## 5. Locked Exposure Conventions

Public open interest does not reveal true dealer inventory. The first production model is an explicit OI-signed dealer proxy. Every API response must expose the assumption model so the UI never presents the proxy as directly observed dealer positioning.

Required metadata:
`assumptionModel: "OI_SIGN_PROXY_V1"`

Proxy sign convention for V1:
- calls: `+1`
- puts: `-1`

### 5.1 GEX Exposure

Raw gamma is Black-Scholes gamma per USD spot move.

Displayed GEX Exposure unit:
`USD hedge-notional change per 1% BTC spot move`

Formula:
`gexExposure = positionSign * rawGamma * openInterestBtc * spotUsd^2 * 0.01`

Do not label `rawGamma * OI * spot^2` as per-1%-move exposure without the `0.01` factor.

### 5.2 Vanna Exposure

Raw Vanna is `∂Delta / ∂sigma`, with sigma represented as a decimal.

Displayed Vanna Exposure unit:
`USD hedge-notional change per 1 volatility-point IV move`

One volatility point equals `0.01` in decimal volatility.

Formula:
`vannaExposure = positionSign * rawVanna * openInterestBtc * spotUsd * 0.01`

### 5.3 Charm Exposure

The quant engine must document the raw Charm convention explicitly.

For this milestone, Charm Exposure displayed in the UI means:
`estimated USD hedge-notional change caused by one calendar day of time decay, holding spot and IV constant`

If raw Charm represents calendar-time Delta drift per year, use:
`charmExposurePerDay = positionSign * rawCharm * openInterestBtc * spotUsd / 365`

If the implementation uses a time-to-expiry derivative instead, convert the sign to calendar-time drift before the daily exposure calculation.

Tests must lock the convention.

## 6. Structural Level Definitions

### Call Wall
Aggregate call-side GEX Exposure by strike using calls only.

`callWall = strike with maximum positive call-side GEX Exposure`

Return both strike and exposure magnitude.

### Put Wall
Aggregate put-side GEX Exposure by strike using puts only.

`putWall = strike with largest absolute put-side GEX Exposure`

Return both strike and exposure magnitude.

### Gamma Flip
Do not use a simple sign change between current strike buckets as the final Gamma Flip.

Revalue the full active option portfolio across a hypothetical BTC spot grid around current spot.

At each hypothetical spot:
- recompute raw Greeks
- recompute GEX Exposure
- aggregate portfolio GEX Exposure

Find the spot where portfolio GEX crosses zero. Interpolate between neighboring grid points when possible.

Return:
- `gammaFlip`
- sampled spot/GEX curve for testing or debug

### Max Pain
Calculate per expiry using all relevant strikes, not only visualization-sampled strikes.

Return:
- `maxPainByExpiry[]`
- a primary dashboard max-pain value for the nearest meaningful expiry

## 7. Terrain Data Contract V2

Codex must introduce a versioned terrain response. Keep raw Greeks separate from exposures and normalized visual intensities.

Required top-level fields:

```ts
{
  schemaVersion: 2,
  timestamp,
  dataMode: "LIVE" | "DEMO" | "DEGRADED",
  assumptionModel: "OI_SIGN_PROXY_V1",
  spotPrice,
  summary,
  scales,
  strikes,
  expirations,
  dtes,
  surfaceGrid,
  keyLevels,
  maxPainByExpiry,
  confluenceLevels,
  keyContracts
}
```

Required surface cell concept:

```ts
{
  strike,
  expiry,
  dte,

  rawDelta,
  rawGamma,
  rawVanna,
  rawCharm,

  gexExposure,
  vannaExposure,
  charmExposure,

  callGexExposure,
  putGexExposure,
  openInterestBtc,
  openInterestUsd,
  iv,

  gexIntensity,
  vannaIntensity,
  charmIntensity,
  oiIntensity,
  confluenceScore,
  behaviorZone
}
```

Normalized intensities are 0 to 100 and must never replace real exposure values.

## 8. Exposure Scaling

Each metric has an independent scale.

Do not normalize GEX, Vanna, and Charm against one shared maximum.

Use robust dataset-relative scaling. Prefer a high absolute percentile, such as P95 or P98, with a safe fallback to the maximum absolute value.

Return scale metadata:

```ts
{
  gex: { min, max, robustAbsMax, unit },
  vanna: { min, max, robustAbsMax, unit },
  charm: { min, max, robustAbsMax, unit }
}
```

Intensity bands:
- 0-24: LOW
- 25-49: MEDIUM
- 50-74: HIGH
- 75-100: EXTREME

## 9. Confluence Engine

Confluence measures importance, not direction.

Each component is normalized 0 to 100.

Initial V1 weighting:
- GEX intensity: 35%
- Vanna intensity: 20%
- Charm intensity: 15%
- OI intensity: 15%
- Structural-level component: 15%

`confluenceScore = 0.35*GEX + 0.20*Vanna + 0.15*Charm + 0.15*OI + 0.15*Structure`

Structural component should account for proximity to:
- Call Wall
- Put Wall
- Gamma Flip
- expiry-specific Max Pain

Cap the final score at 100.

Bands:
- 0-39: LOW
- 40-59: MEDIUM
- 60-79: HIGH
- 80-100: EXTREME

Codex must test this calculation independently.

## 10. Dealer Behavior Classification

Behavior labels are tendencies. Never return guaranteed price predictions.

Allowed V1 labels:
- `STABILIZATION_ZONE`
- `ACCELERATION_ZONE`
- `REGIME_TRANSITION`
- `VOL_SENSITIVE_ZONE`
- `DECAY_PRESSURE_ZONE`
- `HIGH_CONFLUENCE_WALL`
- `NEUTRAL`

Suggested deterministic precedence:
1. If a strike is a Call Wall or Put Wall and confluence >= 80: `HIGH_CONFLUENCE_WALL`
2. Else if within the defined proximity band of Gamma Flip: `REGIME_TRANSITION`
3. Else if absolute Vanna intensity >= 75 and exceeds both GEX and Charm intensity by a meaningful margin: `VOL_SENSITIVE_ZONE`
4. Else if absolute Charm intensity >= 75 and DTE is short: `DECAY_PRESSURE_ZONE`
5. Else if GEX Exposure is strongly positive and GEX intensity >= 60: `STABILIZATION_ZONE`
6. Else if GEX Exposure is strongly negative and GEX intensity >= 60: `ACCELERATION_ZONE`
7. Else: `NEUTRAL`

The Architect reviews threshold tuning after live observations.

## 11. Vanna Contour Model

Vanna must be a true scalar-field contour system.

Codex owns contour generation in `src/lib/terrain/` using `d3-contour` or an equivalent tested marching-squares implementation.

Required contour thresholds should cover both signs, for example normalized levels:
`-80, -60, -40, -20, 0, 20, 40, 60, 80`

Contour placement must depend mathematically on Vanna Exposure values.

Codex should expose contour polylines in grid or normalized coordinates with:
- threshold
- sign
- intensity
- points

Gemini projects these contour lines slightly above the GEX surface.

Positive and negative Vanna require visually distinct treatment.

## 12. Charm Pressure Model

Charm is a signed hedge-pressure scalar, not a literal fluid moving toward spot.

Codex must provide render-ready Charm glyph semantics:

```ts
{
  strike,
  dte,
  expiry,
  charmExposure,
  intensity,
  hedgeDirection: "BUY_HEDGE" | "SELL_HEDGE" | "NEUTRAL"
}
```

Gemini must not infer direction from `strike > spot`.

Low-intensity areas should contain few or faint glyphs.
High-intensity areas should dominate visually.

Use Three.js instancing for large glyph counts.

## 13. Confluence Pressure Floor

Codex produces a Strike × Expiry confluence grid from 0 to 100.

Gemini renders it as a flat floor below the GEX terrain.

Visual meaning:
- LOW: nearly invisible
- MEDIUM: dim
- HIGH: bright
- EXTREME: strong hotspot glow

The floor must pull the eye toward the few regions where several dealer forces overlap.

## 14. Gemini Visualization Requirements

Gemini renders the analytical contract without redefining it.

The final Surface Map must show simultaneously:
- GEX physical terrain
- true Vanna contours
- Charm pressure glyphs
- confluence pressure floor
- Spot
- Call Wall
- Put Wall
- Gamma Flip
- relevant Max Pain
- behavior-zone markers

Three persistent exposure gauges must remain visible:
- GEX Exposure, USD per 1% spot move
- Vanna Exposure, USD per 1 vol-point IV move
- Charm Exposure, USD per day

Each gauge shows:
- positive max
- zero
- negative max
- LOW
- MEDIUM
- HIGH
- EXTREME

The terrain viewport is the dominant visual element.

## 15. Key-Level Profile

Selecting a strike must show a compact profile:
- strike
- distance from spot
- GEX Exposure and intensity
- Vanna Exposure and intensity
- Charm Exposure and intensity
- Call Wall / Put Wall status
- Gamma Flip proximity
- Max Pain relationship
- OI concentration
- confluence score
- behavior-zone classification

This panel explains WHY a level matters.

## 16. 2D Analytical Workspaces

Gemini uses ECharts for:
- GEX heatmap
- Vanna heatmap
- Charm heatmap
- strike slices
- expiry slices
- open-interest distributions
- GEX profile
- Vanna profile
- Charm profile

Use shared data and linked selection.

Gemini uses TanStack Table for:
- Confluence Levels
- Key Contracts
- Open Interest tables

Gemini uses Zustand for shared selection and workspace state.

Gemini uses TanStack Query for `/api/deribit` polling, cache, retry, stale state, and reconnect behavior. Replace manual polling once the new dependency base is approved.

Use Zod validation at the browser/API contract boundary.

## 17. Data Modes

Never silently mix live and demo analytical values.

`LIVE`: all required values originate from live normalized Deribit data and the production terrain engine.

`DEMO`: explicit synthetic demonstration data. Always show DEMO visibly.

`DEGRADED`: live response exists, but some required analytical values are unavailable. Missing fields display N/A or disabled layers.

The UI must never make synthetic data look live.

## 18. Round-Based Work Protocol

Agents do not invoke one another directly.

The handoff loop is:
Codex -> Architect -> Gemini -> Architect -> Codex as needed.

### Round C1 — Codex, immediate
Codex must:
1. Add the approved dependencies to `package.json` and lockfile.
2. Create `src/lib/terrain/`.
3. Lock GEX/Vanna/Charm unit tests.
4. Implement Terrain Data Contract V2.
5. Implement call wall, put wall, portfolio Gamma Flip, Max Pain by expiry.
6. Implement independent scales and intensity bands.
7. Implement confluence scoring.
8. Implement behavior classification.
9. Implement Vanna contour primitives.
10. Implement Charm glyph semantics.
11. Implement confluence grid.
12. Add tests.
13. Update API documentation.
14. Commit and push `agent/codex`.
15. Update `.agents/handoffs/codex.md`.
16. Stop for Architect review.

Codex must not edit Gemini-owned UI files in C1.

### Round G1 — Gemini, may run in parallel with C1
Gemini must NOT edit `IntegratedDealerTerrain.tsx` during G1.

Gemini may work on existing-dependency UI only:
1. Build/refine `ExposureScalePanel` presentation.
2. Build/refine `KeyLevelProfile` presentation.
3. Build/refine `DealerBehaviorLegend`.
4. Improve responsive layout and panel proportions.
5. Improve tables and selection presentation without changing analytical formulas.
6. Prepare UI props/types to accept Contract V2, but do not fabricate production values.
7. Update `.agents/handoffs/gemini.md`.
8. Commit and push `agent/gemini`.
9. Stop for Architect review.

Gemini must not modify package dependencies in G1.

### Architect Gate A1
The Architect reviews C1 and G1.

The Architect either:
- ACCEPTS the Codex contract and directs integration, or
- returns specific corrections.

Do not start G2 until the Architect approves synchronization with the accepted Codex base.

### Round G2 — Gemini after Architect approval
After the Architect-approved Codex work is synchronized into Gemini's branch, Gemini must:
1. Replace decorative Vanna lines with supplied true contour primitives.
2. Replace heuristic Charm arrows with supplied Charm glyph semantics.
3. Render the confluence floor.
4. Render three large independent scales.
5. Wire Key Level Profile.
6. Migrate 2D analytical charts to ECharts.
7. Use TanStack Table for data tables where appropriate.
8. Use Zustand shared state.
9. Use TanStack Query for live API fetching.
10. Enforce LIVE/DEMO/DEGRADED presentation.
11. Preserve the approved dashboard design.
12. Browser-test at 1366x768, 1440x900, and 1920x1080.
13. Commit and push.
14. Update handoff.
15. Stop for Architect review.

### Round C2 — Codex integration correction
After Gemini G2, Codex reads Gemini's handoff and only fixes backend/terrain-contract issues that prevent truthful rendering or performance.

No visual redesign.

### Round G3 — Gemini final visual polish
After C2 approval, Gemini performs final visual polish only.

No new dealer math.

## 19. Synchronization Rule

Do not blindly merge one agent branch into the other.

The Architect reviews agent commits first.

After approval, the Architect will state the accepted SHA or instruct the user which branch should be integrated into `main`.

Before a dependent round begins, the receiving agent must synchronize from the Architect-approved base.

If the required approved base is not present locally, stop and report BLOCKED rather than improvising with stale contracts.

## 20. Required Verification

Codex minimum:
- terrain unit tests
- quant tests
- Deribit normalization tests
- API contract tests
- targeted ESLint
- production build

Gemini minimum:
- unit tests
- production build
- browser interaction verification
- no console errors
- no WebGL errors
- no horizontal overflow at target resolutions
- visible three scales
- visible GEX/Vanna/Charm meaning
- working selection synchronization

## 21. Five-Second Visual Acceptance Test

The Surface Map is not complete unless a user can identify within approximately five seconds:
1. current BTC location
2. strongest positive GEX ridge
3. strongest negative GEX valley
4. strongest Vanna concentration
5. strongest Charm zone
6. Gamma Flip
7. Call Wall
8. Put Wall
9. highest-confluence region

If these are not obvious, the visualization requires another pass.

## 22. Required Handoff Format

Every agent must end with:

```markdown
>>> COMPLETED BY: [Codex | Gemini]
>>> STATUS: [COMPLETE | BLOCKED | REVIEW REQUIRED]
>>> BRANCH: [branch]
>>> COMMIT: [sha]
>>> TESTS: [results]
>>> CONTRACT VERSION: [version if relevant]
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: [specific audit]
>>> TARGET: [files]
```

Handoff must also include:
- files changed
- calculations or UI behavior added
- assumptions
- tests
- known limitations
- cross-agent requirements
- exact dependency changes

## 23. Stop Rule

When the assigned round is complete, commit, push, update the agent's own handoff file, and stop.

Do not merge into `main`.
Do not continue into the other agent's next round.
Do not silently redefine the analytical contract.
