# DeepSeek Prompt — UX16.2 Independent Validation Swarm

Copy everything below into DeepSeek.

---

You are DeepSeek, an independent validation contributor for the Bitcoin
Derivatives Mechanics Terminal. You are not the production implementation
owner.

## Exact starting point

- Source repository: `C:\Users\HP\Videos\btc-terminal-ux16-integration`
- Create isolated worktree:
  `C:\Users\HP\Videos\btc-terminal-deepseek-ux162-validation`
- Create branch: `agent/deepseek-ux16.2-validation`
- Branch from exact commit: `00efc7ddb2ad8b3fe0cee10ed6cf77e45634b5e7`

Stop if the commit does not resolve. Do not use `main`, UX16.1, or another SHA.

## Mandatory reading

Read completely:

1. `AGENTS.md`
2. `STATE.md`
3. `docs/ui-ux/UX16_INSTITUTIONAL_ACTIVITY_MAP_IMPLEMENTATION_PLAN.md`
4. `.agents/handoffs/codex.md`
5. `src/lib/orderflow/contracts.ts`
6. `src/lib/orderflow/true-flow-contracts.ts`
7. `src/lib/orderflow/true-flow.ts`
8. All UX16.1 aggregate-trade capture and replay tests

## Objective and boundary

Create independent, hand-calculated oracle fixtures, reconciliation tests,
gap/reconnect adversarial tests, and a validation matrix. Do not edit production
calculations, worker/runtime code, contracts, UI, APIs, or feature flags.

If canonical behavior is missing or ambiguous, report the blocker. Do not hide
a second implementation inside a test.

## Required swarm

Use an internal supervisor plus three non-overlapping child agents.

### Child A — Oracle fixture author

Exclusive file:

- `src/lib/orderflow/true-flow-oracle.test-data.ts`

Create deterministic, integer-friendly fixtures covering:

1. Buy and sell aggressors across multiple bars.
2. Multiple price buckets in one footprint bar.
3. Duplicate aggregate-trade IDs.
4. Late/out-of-order trades rejected by UX16.1.
5. Forward-ID gap.
6. Reconnect boundary with contiguous next ID.
7. Capture beginning partway through a candle.
8. Empty interval.
9. Partial final interval.
10. Exact captured profile coverage.
11. Gapped coverage.
12. Trades exactly on bucket boundaries.
13. Very small valid trades.
14. POC tie.
15. 70% value-area expansion tie.

For every valid fixture, explicitly record expected accepted trade count,
buy/sell BTC, buy/sell notional, total, delta, CVD segments, footprint cells,
profile rows, POC, VAH, VAL, coverage, and boundary reset behavior.

Do not use live data, current time, random values, or broad floating tolerances.

### Child B — Test author

Exclusive files:

- `src/lib/orderflow/true-flow-reconciliation.test.ts`
- `src/lib/orderflow/true-flow-boundaries.test.ts`

Required invariants:

- Tape buy/sell totals equal footprint and profile totals.
- CVD segment close equals accepted buy notional minus sell notional.
- Duplicates, malformed events, and rejected late events alter no derived total.
- Gap and reconnect boundaries start new CVD segments.
- No footprint exists before the first captured trade.
- Empty intervals do not invent volume.
- Replaying the same fixture yields deeply equal output.
- Exact and gapped/mixed coverage cannot share the same quality label.
- Bucket bounds are deterministic for decimal prices.
- POC and value-area ties select the lower row under the documented policy.
- UX16.4 imbalance fields remain false/null.

Expected values must come from Child A's explicit oracle, not from a duplicate
copy of the production algorithm.

### Child C — Validation reviewer

Exclusive file:

- `docs/ui-ux/UX16_2_VALIDATION_MATRIX.md`

Map every UX16.2 acceptance gate to its proving fixture/test, expected failure
mode, provenance state, and verification layer. Identify Antigravity-owned
browser items and known limitations. Confirm that imbalance, persistence,
replenishment, absorption, setup grading, Jev, and execution remain deferred.

## Allowed files

- The three test/fixture files listed above
- `docs/ui-ux/UX16_2_VALIDATION_MATRIX.md`
- `.agents/usage/deepseek.json`
- `.agents/handoffs/deepseek.md`

## Prohibited files

Do not edit:

- Any existing or new production file under `src/lib/orderflow/`
- `src/lib/project-control/**`
- `src/components/**`
- `src/app/**`
- Existing contracts or UX16.1 tests
- Feature flags, package files, `AGENTS.md`, or `STATE.md`
- Broker, execution, authentication, or secret code

Do not fix production code when a test fails. Report the exact defect to Codex.

## Verification

Run:

- focused new test files
- `npx vitest run`
- `npx tsc --noEmit`
- scoped ESLint over every changed file with zero warnings

Record unrelated pre-existing failures without modifying unrelated files.

## Usage report

Update only `.agents/usage/deepseek.json`. Copy API-response token and cost
usage exactly when exposed. If unavailable, leave numbers `null` and use
`UNREPORTED`. Include provider, exact model, task ID, timestamps, usage source,
and pricing source only when known.

## Completion

Commit to `agent/deepseek-ux16.2-validation`. Do not merge or deploy. Stop with
`REVIEW REQUIRED` and provide:

```text
>>> COMPLETED BY: DeepSeek (Validation Contributor)
>>> STATUS: REVIEW REQUIRED
>>> BRANCH: agent/deepseek-ux16.2-validation
>>> COMMIT: [exact SHA]
>>> TESTS: [exact commands and results]
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review oracle values and return production defects to Codex
>>> TARGET: UX16.2 test-only fixtures, boundary/reconciliation tests, and validation matrix
```

Also return the swarm ownership table, every invariant covered, all production
defects found, the exact usage report, and confirmation that no production or
UI files were changed.
