# CODEX HANDOFF REPORT

>>> COMPLETED BY: Codex
>>> STATUS: REVIEW REQUIRED
>>> BRANCH: codex/ui-approved-parity
>>> COMMIT: 1a28139
>>> TESTS: PASS — Vitest 14 files/77 tests; targeted ESLint clean; Next.js 16.4.2 production build; Playwright 6 passed/2 intentional mobile skips; axe clean; live 1,440-intrabar profile smoke passed
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review UX12 viewport persistence, Fixed Range Volume Profile methodology, and preserved no-live-execution boundary; approve preview/merge or return specific defects
>>> TARGET: src/components/terminal/MarketStructureChart.tsx, src/lib/ui/market-fixtures.ts, src/app/api/binance/volume-profile/, src/lib/binance/volume-profile.ts, src/lib/binance/use-volume-profile.ts, tests/ui/market-terminal.pw.ts, docs/ui-ux/

## Delivered

- Stopped the main chart from being destroyed and recreated when candles, walls, AVWAP, or volume-profile inputs update.
- Preserved the user-selected viewport while panning or zooming and retained right-edge following only while the user is already at the live edge.
- Kept `fitContent()` for intentional context changes and the explicit reset action rather than background data updates.
- Rebuilt Fixed Range Volume Profile selection around actual chart time coordinates with draggable start/end handles and a movable profile label.
- Added profile controls for 24/48/72/100 rows, Total/Up-Down/Delta display, left/right placement, width, value-area percentage, visible/all-loaded range, and extend-right behavior.
- Distributed intrabar volume across every overlapped price row and calculated POC/VAH/VAL using TradingView-documented value-area expansion and tie behavior.
- Added a bounded Binance intrabar endpoint that selects the finest supported interval within a hard 5,000-bar ceiling, with explicit live-source failures and no demo substitution.
- Added panning regression coverage proving profile-setting changes do not recreate the chart or reset its visible logical range.
- Updated the UX12 plan, progress, technical-stack, feature-provenance documents, and desktop/mobile/live screenshots.

## Verification Evidence

- `npx.cmd vitest run`: PASS — 14 files, 77 tests.
- Targeted ESLint across changed TypeScript and TSX files: PASS — no output.
- `npm.cmd run build`: PASS — Next.js 16.4.2 production compilation and TypeScript validation; route `/api/binance/volume-profile` included.
- `npx.cmd playwright test tests/ui/market-terminal.pw.ts`: PASS — 6 passed, 2 intentional mobile-only skips.
- Automated accessibility: PASS — no serious or critical violations.
- Local live smoke: `/api/binance/volume-profile` returned `LIVE`, `BINANCE_SPOT`, and 1,440 five-minute intrabars for a 120-hour range.
- Visual evidence: `.artifacts/ui-overhaul/market-structure-live-1664x936.png`.

## Explicit Data Boundaries

- The profile is an intrabar approximation of volume-at-price, not tick-level or exchange-proprietary reconstruction.
- Up/down allocation follows candle direction, consistent with the documented profile approximation; it is not bid/ask aggressor classification.
- Intrabar retrieval is capped at 5,000 bars and selects a coarser interval when required to stay within that ceiling.
- The change does not alter options calculations, wall authority, decision logic, or any backend execution behavior.
- No live-order execution was introduced; trading tools remain visual measurements and the existing shadow/paper safety boundary remains intact.
- Architect review is required before merge to `main`.
