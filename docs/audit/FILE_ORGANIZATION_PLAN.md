# Project file-organization plan

Date: 2026-11-06. This is a behavior-preserving cleanup map for the UX16–UX17 stabilization period. File moves have **not** been applied; the independent audit is the prerequisite.

## Current inventory

- `src/app`: Next pages and API routes; keep route structure intact.
- `src/components/terminal`: a broad flat collection of chart, drawings, options, order flow, heatmap, risk, replay and workspace components. Several files exceed 1,000 lines; `MarketStructureChart.tsx` exceeds 2,200.
- `src/lib`: mostly domain grouped (`binance`, `deribit`, `orderflow`, `terrain`, `risk`, `simulation`, `project-control`). `src/lib/ui/market-fixtures.ts` also contains live-used volume-profile logic, so its name/location obscure ownership.
- `docs/ui-ux`: UX15–UX19 plans, findings, status and agent prompts mixed together.
- `.agents`: handoffs, project-control checkpoint and usage records; these are operational evidence, not generic docs.
- `.artifacts/ui-overhaul`: 51 tracked screenshots. `test-results`, `.next`, `.vercel`, `node_modules` and `.env*` are ignored/generated or secret-bearing.
- Root `STATE.md` is stale relative to current `main`; an existing untracked root `test_position_box.js` has unknown ownership and must be preserved until its owner decides whether it belongs in tests.

## Target layout

```text
docs/
  audit/                  independent reports and evidence index
  architecture/           current data-flow and contract diagrams
  plans/ux15..ux19/       canonical plans, status and agent prompts by milestone
  reference/              external source and formula records
src/
  app/                    Next routes unchanged
  components/terminal/
    workspace/            shell, navigation, layout, status
    chart/                chart host, viewport, scales, crosshair
    drawings/             drawing objects, tools, anchors
    overlays/             options, heatmap, sessions, profile
    studies/              CVD, delta, footprint, lower dock
    risk/                 risk UI and paper journal
  lib/                    existing domain folders retained
tests/
  unit/                   only if future migration materially improves discovery
  ui/                     current Playwright tests
  audit/                  independent numerical and failure-path cases
```

## Safe execution order

1. Freeze a baseline: commit SHA, 417-test result, build and known lint failures. Inventory imports and test ownership.
2. Correct P0 data-integrity issues before any large move. Add strict behavior tests for missing options/flow input.
3. Move docs first, with redirect/index links from old entry points. Keep one canonical `STATE.md` on main and generate dashboard status from reviewable evidence.
4. Extract pure calculations and state selectors from large components **without** altering chart event ownership. Establish characterization tests for pan/zoom, drawing persistence and live status.
5. Move components in small domain batches. Update imports and ownership notes; run focused tests, full Vitest, TypeScript, lint, build and Playwright after each batch. Avoid broad formatting during moves.
6. Separate fixtures from production calculations. Rename `market-fixtures.ts` only after import graph and tests confirm no hidden behavior changes.
7. Define screenshot retention and regeneration policy. Keep accepted baselines; place transient test output in ignored `test-results`. Preserve the untracked `test_position_box.js` until ownership is resolved.

## Exit criteria

Every file has one clear owner, no production module imports a demo fixture implicitly, `STATE.md` and Project Control agree on reviewed status, all tests/build pass, lint is clean, visual baselines are unchanged unless approved, and production feature behavior is unchanged by the move.
