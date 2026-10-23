# CODEX HANDOFF REPORT

>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> BRANCH: agent/codex
>>> COMMIT: 00bdaea
>>> TESTS: PASS — 17 focused position-risk tests; full Vitest 16 files/98 tests; TypeScript; targeted ESLint; Next.js 16.4.2 production build; production npm audit 0 vulnerabilities
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review the UX15.2 linear-instrument risk contract and calculations before Gemini connects it to Long/Short drawings or the Risk terminal
>>> TARGET: src/lib/quant/position-risk.ts, src/lib/quant/position-risk.test.ts

## Delivered

- Added a pure deterministic position-risk engine for linear instruments.
- Added shared Long and Short geometry validation:
  - Long requires `stop < entry < target`.
  - Short requires `target < entry < stop`.
- Added account risk requests by USD amount or equity percentage.
- Added daily-loss and maximum-drawdown remaining-budget caps.
- Added risk-limited, leverage-limited, and configured maximum-quantity caps.
- Added explicit point value, lot size, quantity step, minimum quantity, maximum quantity, and quantity precision.
- Added entry/exit fees and adverse two-sided slippage to loss and reward estimates.
- Added stop loss, target profit, reward/risk, notional, margin, distance, and underlying-unit outputs.
- Added explicit `ready`, `blocked`, and `invalid` states with typed error and warning codes.
- Added finite-number and derived-arithmetic overflow protection so invalid inputs fail closed.
- Kept the model independent from React, chart components, APIs, exchange credentials, and execution code.

## Formula Contract

- Requested risk is either the supplied USD amount or `equity × riskPercent / 100`.
- Effective risk is the minimum of requested risk, remaining daily-loss budget, and remaining drawdown budget.
- Stop risk per displayed quantity is:

  `abs(entry - stop) × pointValue × lotSize + entry costs + stop-exit costs`

- Risk quantity is `effectiveRisk / stopRiskPerQuantity`.
- Leverage quantity is `(equity × leverage) / entryNotionalPerQuantity`.
- Final raw quantity is the minimum of risk quantity, leverage quantity, and optional maximum quantity.
- Final quantity is always rounded down to the permitted quantity step.
- Target reward deducts entry costs and target-exit costs before reward/risk is reported.

## Focused Test Coverage

1. Canonical risk-limited Long position.
2. Equivalent valid Short position.
3. Leverage-limited position.
4. Fees and two-sided slippage.
5. Remaining daily-loss cap.
6. Realized gains do not expand the daily-loss limit.
7. Remaining maximum-drawdown cap.
8. Exhausted daily-loss budget.
9. Exhausted maximum-drawdown budget.
10. Invalid Long and Short geometry.
11. Quantity-step rounding without exceeding risk.
12. Minimum-quantity block.
13. Point value and lot-size conversion.
14. Maximum-quantity cap.
15. Non-finite and out-of-range input rejection.
16. Non-positive net target reward after costs.
17. Derived-arithmetic overflow rejection.

## Verification Evidence

- `npx vitest run src/lib/quant/position-risk.test.ts`: PASS — 1 file, 17 tests.
- `npx vitest run`: PASS — 16 files, 98 tests.
- `npx tsc --noEmit`: PASS.
- `npx eslint src/lib/quant/position-risk.ts src/lib/quant/position-risk.test.ts`: PASS.
- `npm run build`: PASS — Next.js 16.4.2 production compilation, TypeScript, page-data collection, and static generation.
- `npm audit --omit=dev`: PASS — 152 production dependencies, 0 known vulnerabilities.
- `git diff --check`: PASS.

## Integration Contract for Gemini

- Import `calculatePositionRisk` from `@/lib/quant/position-risk` only after Architect approval.
- Keep one calculation result as the source for both chart Long/Short labels and the Risk terminal.
- Never reproduce the formulas inside React components.
- Render `ready` only when `metrics` is non-null.
- Render `blocked` as an account/risk-capacity state and show its typed reason.
- Render `invalid` as a malformed-input or invalid-geometry state; do not retain a stale previous result.
- Preserve `NO LIVE EXECUTION`. This result is an analysis/position-planning model, not an order payload.

## Explicit Boundaries

- This model supports linear instruments only; inverse and quanto contracts require a separately reviewed contract.
- Fees and slippage are deterministic user/config inputs, not exchange estimates.
- No UI component, API route, Binance/Deribit collector, Jev adapter, options engine, or execution path was changed.
- No package or lockfile change was made.
- Antigravity retains exclusive ownership of UX15.0 terminal layout and drawing-interface files during the parallel cycle.
- `STATE.md` remains unchanged pending Architect review.

