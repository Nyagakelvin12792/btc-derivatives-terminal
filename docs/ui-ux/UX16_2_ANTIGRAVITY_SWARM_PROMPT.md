# Antigravity Prompt — UX16.2 Presentation and Project-Control Dashboard

Copy everything below into Antigravity.

---

You are Antigravity/Gemini, the Builder and Visual Engine contributor for the
Bitcoin Derivatives Mechanics Terminal.

## Exact starting point

- Source repository: `C:\Users\HP\Videos\btc-terminal-ux16-integration`
- Create isolated worktree: `C:\Users\HP\Videos\btc-terminal-ag-ux162-ui`
- Create branch: `agent/gemini-ux16.2-ui`
- Branch from exact commit: `00efc7ddb2ad8b3fe0cee10ed6cf77e45634b5e7`

Do not work directly in the source checkout. Stop if the commit does not
resolve. Do not substitute `main`, UX16.1, or another branch.

## Mandatory reading

Read completely before editing:

1. `AGENTS.md`
2. `STATE.md`
3. `docs/ui-ux/UX16_INSTITUTIONAL_ACTIVITY_MAP_IMPLEMENTATION_PLAN.md`
4. `docs/ui-ux/PROGRESS.md`
5. `.agents/handoffs/codex.md`
6. `src/lib/orderflow/contracts.ts`
7. `src/lib/orderflow/true-flow-contracts.ts`
8. `src/lib/orderflow/true-flow.ts`
9. `src/lib/project-control/contracts.ts`
10. `src/app/api/project-control/route.ts`
11. Relevant Next.js 16.4.2 guides under `node_modules/next/dist/docs/`

The supplied Codex contracts are authoritative. Do not infer calculations from
screenshots and do not recreate order-flow mathematics inside React.

## Objective

Implement only:

1. UX16.2 presentation components for true trade-based CVD, footprint, and
   captured-trade volume profile.
2. A read-only `/project-control` dashboard consuming `/api/project-control`.
3. Component, accessibility, responsive, and browser acceptance evidence.

Do not implement UX16.3 liquidity calculations, UX16.4 imbalance/persistence,
UX16.5 absorption/divergence, UX16.6 setup grading, UX16.7 Jev, or execution.

## Required swarm

Use an internal supervisor plus three child agents. Maintain and report a
one-writer file-ownership table.

### Child A — True-flow presentation

Exclusive production files:

- New UX16.2 components under `src/components/terminal/`
- `FlowMode.tsx` only if necessary
- `LowerStudyPane.tsx` only if necessary
- `CalmMarketTerminal.tsx` only for typed presentation wiring
- New component tests for these components

Required behavior:

- Render CVD exclusively from `TrueFlowSnapshotV1.cvdSegments`.
- Never draw a line between segment IDs.
- Display capture start, gap, and reconnect boundaries.
- Show venue, freshness, coverage, approximation, and quality.
- Do not draw footprint cells before the first captured trade.
- Render buy volume, sell volume, total, and delta from canonical footprint
  cells; leave imbalance styling absent because imbalance is UX16.4.
- Render exact captured profile separately from gapped or mixed coverage.
- Use canonical POC/VAH/VAL; do not recalculate them in components.
- Semantic zoom must hide numeric labels before footprint geometry.
- Components should accept canonical snapshots as props. Until Codex completes
  live worker emission, use deterministic typed fixtures in tests and keep any
  unavailable live connection honestly labelled.

### Child B — Project-control dashboard

Exclusive production files:

- `src/components/dashboard/ProjectControlDashboard.tsx`
- Supporting new dashboard-only components
- `src/app/project-control/page.tsx`
- Dashboard component tests

Consume only `/api/project-control` and its canonical types.

Required views:

- Implemented, tested, and Architect-accepted percentages separately.
- UX16.0 through UX16.8 milestone cards.
- Expandable feature/task hierarchy.
- Owner, supporting agents, status, branch, commit, test evidence, blockers,
  and acceptance evidence.
- Known spend, provider-reported spend, calculated spend, and unreported runs.
- Agent/provider/model/task filters.
- Optional budget display only when a budget is present.
- `UNREPORTED` and `UNKNOWN` must never be rendered as `$0.00`.
- Subscription usage must say `INCLUDED/UNREPORTED`, not free API usage.
- No decorative animated charts; use calm tables, compact progress bars, and
  progressive disclosure.
- Do not hardcode completion percentages in React.

### Child C — Browser and accessibility verifier

Exclusive files:

- `tests/ui/ux16-true-flow.pw.ts`
- `tests/ui/project-control-dashboard.pw.ts`
- `docs/ui-ux/UX16_2_VISUAL_ACCEPTANCE.md`
- New screenshot artifacts

Required scenarios:

- 1366×768, 1664×936, and 1920×1080.
- Supported mobile layout.
- No capture, valid capture, gap, reconnect, and gapped profile.
- Semantic zoom hides numbers before geometry.
- Known-cost and unreported-usage dashboard states.
- Keyboard navigation and visible focus.
- No horizontal overflow.
- No false `LIVE`, `READY`, exact-profile, or zero-cost claim.

## Allowed files

- New UX16.2 files under `src/components/terminal/**`
- New dashboard files under `src/components/dashboard/**`
- `FlowMode.tsx`, `LowerStudyPane.tsx`, and `CalmMarketTerminal.tsx` only when
  required for canonical presentation wiring
- `src/app/project-control/page.tsx`
- New component and browser tests
- `docs/ui-ux/UX16_2_VISUAL_ACCEPTANCE.md`
- `.agents/usage/gemini.json`
- `.agents/handoffs/gemini.md`

## Prohibited files

Do not edit:

- `src/lib/orderflow/**`
- `src/lib/project-control/**`
- `src/lib/binance/**`
- `src/lib/deribit/**`
- `src/lib/quant/**`
- `src/lib/terrain/**`
- `src/lib/intelligence/**`
- `src/app/api/**`
- `src/app/page.tsx`
- `AGENTS.md`, `STATE.md`, `package.json`, or `package-lock.json`
- Broker, execution, authentication, or secret-handling code

If a contract field is missing, stop and record the exact blocker. Do not invent
a UI-only parallel contract.

## Truthfulness and safety

- Never infer executed trades from candles.
- Never bridge CVD across a capture boundary.
- Never call a ratio an imbalance in UX16.2.
- Never merge approximate history into exact captured rows without an explicit
  mixed-coverage state.
- Never fabricate progress, usage, tokens, pricing, cost, or budget.
- Preserve `NO LIVE EXECUTION`.
- Do not copy proprietary TradingView code, assets, endpoints, or branding.

## Verification

Run:

- `npx vitest run`
- `npx tsc --noEmit`
- scoped ESLint over every changed file with zero warnings
- `npx next build --webpack` if the worktree uses an external `node_modules`
  junction; otherwise `npm run build`
- the existing UX16 browser suite
- the new UX16.2 and project-control browser suites

Do not weaken, delete, skip, or convert assertions to no-ops to obtain a pass.

## Usage report

Update only `.agents/usage/gemini.json`. Copy provider/tool usage exactly when
available. Otherwise leave numeric fields `null` and use `UNREPORTED`. Never
estimate tokens from text length.

## Completion

Commit to `agent/gemini-ux16.2-ui`. Do not merge or deploy. Update the handoff
and stop with `REVIEW REQUIRED`:

```text
>>> COMPLETED BY: Gemini
>>> STATUS: REVIEW REQUIRED
>>> BRANCH: agent/gemini-ux16.2-ui
>>> COMMIT: [exact SHA]
>>> TESTS: [exact commands and results]
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review UX16.2 presentation and project-control dashboard against canonical Codex outputs
>>> TARGET: [exact changed files]
```

Also return the swarm file-ownership table, screenshots, unreported usage
fields, blockers, and confirmation that no production calculations or execution
code changed.
