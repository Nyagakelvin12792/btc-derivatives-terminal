# UX16.2 Independent Validation Matrix

Status: **TESTED IN THE DEEPSEEK VALIDATION WORKTREE — INTEGRATION REVIEW REQUIRED**

Owner of this takeover and correction: Codex

Source branch: `agent/deepseek-ux16.2-validation`
Production base reviewed: `dea002c`

The original DeepSeek draft contained incorrect hand totals, inconsistent
coverage timestamps, a reconnect scenario with an undeclared aggregate-ID gap,
and `PASS` labels without executable tests. The draft remains recoverable in
commit `c64f006`. Its oracle and matrix were replaced with the tested records
below.

## Scenario coverage

| ID | Independent input | Main assertion |
| --- | --- | --- |
| S01 | Three classified trades across two minutes | Tape, CVD, footprint and VP reconcile to $602 and $198 delta |
| S02 | Forward aggregate-ID gap | CVD restarts; VP is gapped |
| S03 | Reconnect with contiguous IDs | CVD restarts; VP is gapped even with `gapCount: 0` |
| S04 | Capture starts 125 seconds into the window | First footprint coverage starts at that trade |
| S05 | Empty capture | No bars, rows or invented POC/VA |
| S06 | Equal USD notional at two prices | Lower-price POC tie rule |
| S07 | Fractional BTC and notional | $75.25 total and $24.75 delta |
| S08 | Trades with an empty minute between them | No synthetic empty CVD/footprint bar |
| S09 | Sell-only capture | Negative CVD |
| S10 | Buy-only capture | Positive CVD |
| S11 | Trades exactly on two bucket boundaries | Stable row placement and POC |
| S12 | Five-minute boundary | Two bars |
| S13 | One-hour grouping | One bar |
| S14 | Four-hour grouping | One bar |
| S15 | Daily grouping | One bar |
| S16 | Aggregate-ID gap followed by reconnect | Three isolated CVD segments |

All expected quantities, USD notionals, segment closes, bar counts, profile
rows, POC, VAH, VAL and coverage kinds are literals in
`true-flow-oracle.test-data.ts`. The tests compare them with production output.
They additionally reconcile cell, bar and profile totals and verify that
UX16.4 imbalance flags remain disabled.

## UX16.2 acceptance gates

| Gate | Evidence | Status |
| --- | --- | --- |
| Tape, CVD, footprint and VP totals reconcile | `true-flow-reconciliation.test.ts`, S01–S16 | **PASS** in focused suite |
| CVD breaks across gaps | `true-flow-boundaries.test.ts`, S02/S03/S16 | **PASS** in focused suite |
| Footprint does not extend before capture | `true-flow-boundaries.test.ts`, S04/S05 | **PASS** in focused suite |
| Mixed/approximate profile coverage is visually distinct | Antigravity UI and browser acceptance | **PENDING assembled browser review** |
| Semantic zoom hides numbers before geometry | Antigravity UI and browser acceptance | **PENDING assembled browser review** |

Focused verification on this worktree: `npx vitest run
src/lib/orderflow/true-flow-reconciliation.test.ts
src/lib/orderflow/true-flow-boundaries.test.ts` passed **2 files, 21 tests**.
`npx tsc --noEmit` passed. Full suite, lint, build and assembled browser checks
belong to the integration checkpoint.

The tests use recorded fixtures only. They make no live data, institutional
identity, setup-grade, AI, or execution claim. UX16.3–UX16.7 remain separate
milestones.
