# Deribit Surface API Contract

Endpoint: `GET /api/deribit`

Owner: Codex, under `src/app/api/deribit/` and `src/lib/deribit/`.

Primary consumers:
- `src/app/page.tsx`
- `src/components/three/SurfaceMesh.tsx`

This endpoint is the browser-facing boundary for the visual engine. Client components must fetch this endpoint and must not import the Deribit upstream client or quant engine directly.

## Request

No request body, query string, authentication, or cookies are required.

```http
GET /api/deribit
Accept: application/json
```

## Response Behavior

The route returns JSON for both live Deribit data and synthetic fallback data.

- Live success uses `Cache-Control: public, max-age=5, s-maxage=15, stale-while-revalidate=30`.
- Synthetic fallback uses `Cache-Control: no-store`.
- Deribit upstream errors are handled server-side. The visual engine should still receive the same top-level JSON shape.

## Top-Level Schema

```ts
interface DeribitSurfaceResponse {
    timestamp: string;
    spotPrice: number;
    summary: DeribitSurfaceSummary;
    expirations: string[];
    strikes: number[];
    surfaceGrid: SurfaceGridCell[][];
    topContracts: OptionPoint[];
}
```

### `timestamp`

ISO-8601 timestamp for the server-side response build time.

Example: `"2026-08-20T08:30:00.000Z"`

### `spotPrice`

BTC/USD index price in USD.

### `summary`

```ts
interface DeribitSurfaceSummary {
    totalCallGex: number;
    totalPutGex: number;
    netGex: number;
    totalOpenInterest: number;
    gammaFlip: number;
    maxPainStrike: number;
    topPositiveGexStrike: number;
    topNegativeGexStrike: number;
    contractsCount: number;
}
```

Units:
- `totalCallGex`, `totalPutGex`, `netGex`: signed dollar gamma exposure.
- `totalOpenInterest`: BTC-denominated open interest summed across normalized contracts.
- `gammaFlip`, `maxPainStrike`, `topPositiveGexStrike`, `topNegativeGexStrike`: USD strike levels.
- `contractsCount`: number of normalized active contracts included in the response.

Conventions:
- Call GEX is positive.
- Put GEX is negative.
- `netGex = totalCallGex + totalPutGex`.
- `topPositiveGexStrike` is the call wall currently displayed by `page.tsx`.
- `topNegativeGexStrike` is the put wall currently displayed by `page.tsx`.

### `expirations`

Expiry labels in ascending expiry order. Live data uses Deribit expiry codes such as `"25DEC26"`. Synthetic fallback uses duration labels such as `"7D"`.

`SurfaceMesh` treats this as the Z-axis labels and expects it to align by index with `surfaceGrid` rows.

### `strikes`

Sampled USD strike levels in ascending order.

`SurfaceMesh` treats this as the X-axis and expects it to align by index with each `surfaceGrid` row.

### `surfaceGrid`

```ts
interface SurfaceGridCell {
    strike: number;
    dte: number;
    expiry: string;
    gex: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
    iv: number;
}
```

Grid shape:
- `surfaceGrid.length === expirations.length`.
- Each row is ordered by `strikes`.
- Each cell corresponds to one expiry and strike bucket.
- Missing live option buckets are filled with zero exposure and zero open interest so the mesh remains rectangular.

Units:
- `strike`: USD strike.
- `dte`: days to expiry.
- `expiry`: expiry label matching the row label.
- `gex`, `callGex`, `putGex`: signed dollar gamma exposure.
- `openInterest`: BTC-denominated open interest.
- `gamma`: raw Black-Scholes gamma, per 1 USD spot move.
- `iv`: implied volatility as a percent, not a decimal. Example: `55` means 55 percent.

`SurfaceMesh` consumes:
- `surfaceGrid`
- `spotPrice`
- `strikes`
- `expirations`
- `selectedMetric`, selected in the page as one of `gex`, `openInterest`, `iv`, or `gamma`

### `topContracts`

```ts
interface OptionPoint {
    instrument: string;
    strike: number;
    expiryStr: string;
    expiryDate: string;
    dte: number;
    tte: number;
    type: 'call' | 'put';
    openInterest: number;
    iv: number;
    delta: number;
    gamma: number;
    vanna: number;
    charm: number;
    gex: number;
    volume: number;
}
```

Ordering: descending by absolute `gex`, limited to 15 contracts.

Units:
- `instrument`: Deribit instrument name.
- `strike`: USD strike.
- `expiryStr`: Deribit expiry code.
- `expiryDate`: ISO string after JSON serialization.
- `dte`: days to expiry.
- `tte`: year fraction, `dte / 365`.
- `type`: option side, `call` or `put`.
- `openInterest`: BTC-denominated open interest.
- `iv`: implied volatility as a percent, not a decimal.
- `delta`: raw Black-Scholes delta.
- `gamma`: raw Black-Scholes gamma, per 1 USD spot move.
- `vanna`: raw Black-Scholes vanna.
- `charm`: raw Black-Scholes charm.
- `gex`: signed dollar gamma exposure.
- `volume`: BTC-denominated Deribit volume, defaulting to `0` when missing or malformed.

## Dollar Exposure Formula

The response distinguishes raw Greeks from dollar exposure metrics.

```ts
rawGamma = BlackScholesGamma(spot, strike, tte, ivDecimal, rate)
dollarGex = rawGamma * openInterestBtc * spotPriceUsd * spotPriceUsd
signedGex = optionType === 'call' ? dollarGex : -dollarGex
```

`gamma`, `delta`, `vanna`, and `charm` are raw model outputs. `gex`, `callGex`, `putGex`, `totalCallGex`, `totalPutGex`, and `netGex` are dollar exposure metrics.

## Visual Engine Compatibility Notes

- The browser fetches `/api/deribit`; it should not call Deribit directly.
- `SurfaceMesh` requires numeric `surfaceGrid` cells. The server normalizes malformed Deribit values before this response is built.
- The mesh can render only when at least two expiry rows and two strike columns are present. The fallback response supplies a rectangular synthetic grid.
- Extra fields may exist in `topContracts`; the current visual page ignores unknown fields.
- Removing or renaming any documented field is a breaking change for the Gemini visualization layer.
