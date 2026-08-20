# BTC Dealer Surface Renderer — Visual Reference Rules

The four PNG files in this directory are visual references for the quantitative renderer.

They define visual grammar, NOT analytical values.

Never copy example:

- BTC prices
- exposure numbers
- dates
- IV
- OI
- strikes
- option contracts

All production values must come from Terrain Data Contract V2.

## Core Principle

THE TERRAIN IS A QUANTITATIVE CHART, NOT A 3D SCULPTURE.

A user must understand the main dealer-pressure landscape within approximately five seconds.

## Shared Coordinates

X = Strike Price

Z = Days to Expiry

Y = selected metric exposure

GEX, Vanna, and Charm each use their own real numerical Y scale.

## GEX Mode

Default mode.

Positive GEX = green above zero.

Negative GEX = red below zero.

GEX scale unit:

USD hedge-notional change per 1% BTC move.

## Vanna Mode

Vanna becomes the terrain height.

Scale unit:

USD hedge-notional change per 1 volatility-point IV move.

Positive and negative Vanna must be clearly distinguishable.

## Charm Mode

Charm becomes the terrain height.

Scale unit:

USD hedge-notional delta drift per calendar day.

Hedge-flow interpretation must follow the approved backend convention.

Do not infer hedge direction from strike location.

## Combined Mode

Combined mode is advanced.

It must preserve:

GEX terrain

Vanna contours

Charm hedge pressure

Confluence zones

Spot

Gamma Flip

Call Wall

Put Wall

Max Pain

Dealer Behavior Zones

Open Interest context

The purpose of Combined mode is to identify where multiple dealer forces overlap.

Confluence is an importance score, not a guaranteed price direction.

## Numerical Axes

Each individual metric mode must show actual numerical Y-axis ticks.

Examples:

+$4B
+$2B
$0
-$2B
-$4B

or appropriate K/M/B units.

Three.js world coordinates must never be exposed to the user.

## Surface Geometry

Use smooth render-only interpolation.

Do not modify analytical observations.

Do not create false contract observations.

Avoid:

needle spikes

vertical walls

low-poly triangle appearance

default full wireframe

## Structural Levels

Keep:

Spot

Gamma Flip

Call Wall

Put Wall

Max Pain

anchored to their real strike coordinates.

Never arrange them purely by arbitrary screen percentages.

## Confluence

Combined mode must make overlap obvious.

The viewer should be able to distinguish:

GEX-only importance

Vanna-heavy zones

Charm-heavy zones

multi-factor confluence zones

High-confluence areas should attract attention without overpowering the terrain.

## Visual Priority

Default GEX view:

1. Spot
2. GEX geography
3. zero plane
4. actual exposure scale
5. structural levels

Combined view:

1. GEX base terrain
2. strongest confluence areas
3. strongest Vanna concentrations
4. strongest Charm pressure
5. structural levels

Weak signals fade into the background.

## Data Integrity

LIVE data must never silently include synthetic analytical values.

Render interpolation is visual only.

Tooltips must resolve back to actual Contract V2 analytical cells.

For unobserved cells show:

NO DIRECT CONTRACT OBSERVATION

## Final Acceptance Rule

If the user cannot understand:

where BTC is,

where positive/negative dealer gamma is concentrated,

where Vanna matters,

where Charm matters,

and where these forces overlap,

without reading the tables first,

the visualization has failed.
