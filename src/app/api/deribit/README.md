# Terrain Data Contract V2

Endpoint: `GET /api/deribit`

Owner: Codex, under `src/app/api/deribit/`, `src/lib/deribit/`, `src/lib/quant/`, and `src/lib/terrain/`.

Primary consumers:
- `src/app/page.tsx`
- `src/components/three/SurfaceMesh.tsx`
- Future Gemini terrain components that consume Contract V2

Client components must fetch this endpoint. They must not import the Deribit upstream client, quant engine, or terrain engine directly.

## Request

No request body, query string, authentication, or cookies are required.

```http
GET /api/deribit
Accept: application/json
```

## Response Modes

Every response includes:

```ts
schemaVersion: 2;
dataMode: 'LIVE' | 'DEMO' | 'DEGRADED';
assumptionModel: 'OI_SIGN_PROXY_V1';
```

Mode semantics:
- `LIVE`: Deribit option chain was normalized and processed by the production terrain engine.
- `DEMO`: synthetic demonstration data; this must be visibly labeled by the UI.
- `DEGRADED`: reserved for partial live analytics. Missing values must be shown as unavailable, not synthetic.

Cache behavior:
- `LIVE`: `Cache-Control: public, max-age=5, s-maxage=15, stale-while-revalidate=30`
- `DEMO`: `Cache-Control: no-store`

## Top-Level Schema

```ts
interface TerrainDataContractV2 {
    schemaVersion: 2;
    timestamp: string;
    dataMode: 'LIVE' | 'DEMO' | 'DEGRADED';
    assumptionModel: 'OI_SIGN_PROXY_V1';
    spotPrice: number;
    summary: TerrainSummary;
    scales: TerrainScales;
    strikes: number[];
    expirations: string[];
    dtes: number[];
    surfaceGrid: TerrainSurfaceCell[][];
    keyLevels: TerrainKeyLevels;
    maxPainByExpiry: MaxPainByExpiry[];
    confluenceLevels: TerrainConfluenceLevel[];
    vannaContours: VannaContourPrimitive[];
    charmGlyphs: CharmPressureGlyph[];
    confluenceFloor: ConfluenceFloorCell[][];
    keyContracts: TerrainKeyContract[];
    topContracts: TerrainKeyContract[];
}
```

`topContracts` is retained as a legacy Gemini table compatibility alias for `keyContracts`.

## Locked Exposure Units

The response distinguishes raw Greeks from exposure metrics.

Position proxy:
- Calls use `+1`.
- Puts use `-1`.
- This is an OI-sign proxy, not observed dealer inventory.

GEX Exposure:

```ts
gexExposure = positionSign * rawGamma * openInterestBtc * spotUsd * spotUsd * 0.01
```

Unit: USD hedge-notional change per 1% BTC spot move.

Vanna Exposure:

```ts
vannaExposure = positionSign * rawVanna * openInterestBtc * spotUsd * 0.01
```

Unit: USD hedge-notional change per one volatility-point IV move.

Charm Exposure:

```ts
charmExposure = positionSign * rawCharm * openInterestBtc * spotUsd / 365
```

Unit: USD hedge-notional change per calendar day. `rawCharm` is treated as calendar-time delta drift per year.

## Summary

```ts
interface TerrainSummary {
    totalCallGex: number;
    totalPutGex: number;
    netGex: number;
    totalVannaExposure: number;
    totalCharmExposure: number;
    totalOpenInterest: number;
    gammaFlip: number;
    maxPainStrike: number;
    topPositiveGexStrike: number;
    topNegativeGexStrike: number;
    callWallExposure: number;
    putWallExposure: number;
    contractsCount: number;
}
```

Compatibility note:
- `topPositiveGexStrike` is the call wall strike.
- `topNegativeGexStrike` is the put wall strike.
- `totalCallGex`, `totalPutGex`, and `netGex` use the V2 per-1%-move GEX Exposure unit.

## Surface Grid

```ts
interface TerrainSurfaceCell {
    strike: number;
    expiry: string;
    dte: number;
    rawDelta: number;
    rawGamma: number;
    rawVanna: number;
    rawCharm: number;
    gexExposure: number;
    vannaExposure: number;
    charmExposure: number;
    callGexExposure: number;
    putGexExposure: number;
    openInterestBtc: number;
    openInterestUsd: number;
    iv: number;
    gexIntensity: number;
    vannaIntensity: number;
    charmIntensity: number;
    oiIntensity: number;
    gexBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    vannaBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    charmBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    oiBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    confluenceScore: number;
    confluenceBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    behaviorZone: DealerBehaviorZone;
    gex: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
}
```

Grid invariants:
- `surfaceGrid.length === expirations.length`
- `surfaceGrid[row].length === strikes.length`
- `dtes[row]` aligns with `expirations[row]`
- Missing option buckets are filled with zero exposure and zero OI to keep the mesh rectangular

Legacy fields:
- `gex`, `callGex`, `putGex`, `openInterest`, and `gamma` are retained for existing `SurfaceMesh` compatibility.
- New Gemini terrain work should prefer explicit V2 fields such as `gexExposure`, `openInterestBtc`, and `rawGamma`.

## Scales And Bands

Each exposure metric has an independent scale:

```ts
interface TerrainScales {
    gex: { min: number; max: number; robustAbsMax: number; unit: string };
    vanna: { min: number; max: number; robustAbsMax: number; unit: string };
    charm: { min: number; max: number; robustAbsMax: number; unit: string };
    openInterest: { min: number; max: number; robustAbsMax: number; unit: string };
}
```

Intensity values are 0 to 100 and are scaled by absolute exposure against each metric's own robust absolute maximum.

Bands:
- 0-24: `LOW`
- 25-49: `MEDIUM`
- 50-74: `HIGH`
- 75-100: `EXTREME`

## Key Levels

```ts
interface TerrainKeyLevels {
    callWall: { strike: number; exposure: number };
    putWall: { strike: number; exposure: number };
    gammaFlip: { strike: number; gexExposure: number; curve: GammaFlipCurvePoint[] };
    primaryMaxPain: MaxPainByExpiry | null;
}
```

Definitions:
- Call Wall aggregates call-side GEX Exposure by strike and selects the maximum positive call exposure.
- Put Wall aggregates put-side GEX Exposure by strike and selects the largest absolute put exposure.
- Gamma Flip revalues the full active portfolio across a hypothetical BTC spot grid and interpolates a zero crossing when available.
- Max Pain is calculated per expiry from all strikes in that expiry, not from visualization-sampled strikes.

## Vanna Contours

`vannaContours` contains true scalar-field contour primitives generated from signed Vanna Exposure values with `d3-contour`.

```ts
interface VannaContourPrimitive {
    threshold: number;
    sign: 'POSITIVE' | 'NEGATIVE' | 'ZERO';
    intensity: number;
    points: { x: number; y: number; strike: number; dte: number }[];
}
```

Thresholds currently use normalized signed levels:
`-80, -60, -40, -20, 0, 20, 40, 60, 80`.

Gemini should render positive and negative Vanna contours with visually distinct treatments and project them above the GEX terrain.

## Charm Glyphs

```ts
interface CharmPressureGlyph {
    strike: number;
    dte: number;
    expiry: string;
    charmExposure: number;
    intensity: number;
    hedgeDirection: 'BUY_HEDGE' | 'SELL_HEDGE' | 'NEUTRAL';
}
```

`hedgeDirection` is derived from Charm Exposure sign only. Gemini must not infer Charm direction from `strike > spot`.

## Confluence

Confluence measures importance, not direction.

Weighting:
- GEX intensity: 35%
- Vanna intensity: 20%
- Charm intensity: 15%
- OI intensity: 15%
- Structural-level proximity: 15%

Structural proximity considers Call Wall, Put Wall, Gamma Flip, and expiry-specific Max Pain.

`confluenceFloor` is a rectangular Strike x Expiry grid mirroring `surfaceGrid` with only confluence score and band fields for floor rendering.

## Dealer Behavior Zones

Allowed values:
- `STABILIZATION_ZONE`
- `ACCELERATION_ZONE`
- `REGIME_TRANSITION`
- `VOL_SENSITIVE_ZONE`
- `DECAY_PRESSURE_ZONE`
- `HIGH_CONFLUENCE_WALL`
- `NEUTRAL`

Labels describe deterministic tendency classifications, never guaranteed price predictions.

## Gemini Integration Requirements

- Existing Gemini files can continue reading `surfaceGrid`, `spotPrice`, `strikes`, `expirations`, `summary`, and `topContracts`.
- New terrain visualization should read `schemaVersion === 2` before using V2 fields.
- The UI must visibly distinguish `LIVE`, `DEMO`, and `DEGRADED`.
- The UI must display the `OI_SIGN_PROXY_V1` assumption model.
- Normalized intensities must never replace displayed real exposure values.
- Removing or renaming any documented V2 field requires Architect review.
