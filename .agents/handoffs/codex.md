# CODEX HANDOFF REPORT — UX16.0 REVIEWED INTEGRATION

>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> BRANCH: codex/ux16-integration
>>> COMMIT: f6dd380
>>> TESTS: PASS — Vitest 31 files/209 tests; TypeScript; scoped ESLint 0 warnings/errors; default and UX16-enabled production builds; UX16 Playwright 2/2; terminal regression Playwright 13 passed/9 intentional mobile skips; legacy fallback smoke 1/1
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review the assembled UX16.0 checkpoint, approve the truthful opt-in shell, and decide whether to merge to main
>>> TARGET: codex/ux16-integration at f6dd380

## Integrated lineage

- Baseline: `49fad756`.
- Codex UX16.0 contract foundation: `6185e1f`, integrated as `d7a4afe`.
- Antigravity shell: `7fc5363`, integrated as `2ac4ada`.
- Antigravity handoff update: `ca50b74`, integrated as `8bae8eb`.
- Codex combined review and corrections: `f6dd380`.

## Review result

Antigravity's shell was not accepted unchanged. The first combined review found hard-coded values that visually claimed observed trade-based CVD, absorption, replenishment, and a `WATCH_LONG` setup even though UX16.1–UX16.5 were not implemented. The browser-test claim in the supplied transcript also did not provide reliable completion evidence. Those blockers are corrected in `f6dd380`.

## Delivered corrections

- Added `CalmMarketTerminal` and `LegacyMarketTerminal` behind `NEXT_PUBLIC_UX16_CALM_WORKSPACE`.
- Kept every UX16 public feature flag off by default.
- Restored legacy inspector/heatmap defaults when the calm-workspace flag is absent.
- Kept the raw liquidity heatmap hidden by default in the calm Context workspace.
- Replaced UI-local integrity types with the versioned `src/lib/orderflow` contracts.
- Replaced hard-coded freshness and feed claims with source-derived or explicitly unavailable provenance.
- Marked demo candles/options as `REPLAY`, demo depth/tape as `UNAVAILABLE`, and Jev as disabled `SHADOW`.
- Removed fabricated CVD, absorption, replenishment, setup zone, trigger, invalidation, evidence, conflicts, and passing gates.
- UX16.0 Flow now shows zero accepted events and explains that aggregate-trade capture begins in UX16.1.
- UX16.0 Setup now renders `INSUFFICIENT_DATA`, grade `NONE`, and missing gates.
- Removed the duplicated workspace-mode selector from the Decision Dock; the header is the single mode switcher.
- Kept existing chart, drawing, fixed-range VP, AVWAP, lower-pane, risk, history, and heatmap-toggle behavior working.
- Updated visual artifacts at 1366x768, 1664x936, and 1920x1080.
- Updated the Deribit route handler to the non-optional Next.js 16 request signature and updated its tests.

## Verification evidence

- `npx vitest run`: PASS — 31 files, 209 tests.
- `npx tsc --noEmit`: PASS.
- Scoped ESLint across all UX16 integration files, order-flow contracts, Deribit route, and browser tests: PASS — 0 warnings, 0 errors.
- Default-off production build: PASS.
- UX16-enabled production build: PASS.
- Default-off legacy browser smoke: PASS — 1/1.
- `tests/ui/ux16-calm-workspace.pw.ts`: PASS — 2/2 projects.
- `tests/ui/market-terminal.pw.ts`: PASS — 13 applicable scenarios; 9 mobile skips are declared desktop-only interactions.
- Accessibility scenario: PASS with no serious or critical automated violations.
- `git diff --cached --check`: PASS before the correction commit.

## Known repository-wide lint debt

`npx eslint .` still reports four pre-existing errors outside the UX16 integration files in legacy dashboard/3D/adapters code. They are not introduced by this checkpoint. The scoped UX16 lint gate is clean.

## Safe boundaries preserved

- No aggregate-trade WebSocket or live tape was added; that remains UX16.1.
- No true CVD, footprint, or trade-volume-profile engine was added; that remains UX16.2.
- No imbalance, absorption, acceptance, divergence, or setup-signal calculation was added.
- No Jev request or response path was enabled.
- No live execution path was introduced.
- Fixtures and demo data are never labelled live.
