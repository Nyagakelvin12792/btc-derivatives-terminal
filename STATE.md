# PROJECT STATE LEDGER (`main`)

## Current Initiative: `UX20 — BTC TERMINAL MASTER PLAN IMPLEMENTATION` (`COMPLETE & VERIFIED`)

- **Integration Branch**: `main`
- **Source Baseline Commit**: `f026c1a521cf29caa426f47952ed659db022fcf5` (Audit handoff merged at `7ab2f19d17b0997a8ae5d15c892195e60f22fa5f`)
- **Master Plan Document**: `BTC_TERMINAL_IMPLEMENTATION_MASTER_PLAN_2026-11-09_1808_EAT.md`
- **Master Plan SHA-256**: `58468A3621BB76A59849FD7D1607EB31E5610108BC8EFAEC3467E56B95E61E0E`
- **Authorized Spend**: `$0.00` incremental external spend (unknown historical subscription/provider usage reported as `UNKNOWN` / `UNREPORTED`)
- **Execution Mode**: `100% PAPER / SIMULATED ONLY` (`NO LIVE EXECUTION`)
- **Verification Summary (`UX20.7-GATE-01`)**:
  - `npx tsc --noEmit` -> `0 errors`
  - `npx vitest run` -> `76 passed (76 test files), 446 passed (446 tests)`
  - `npm run build` -> `0 errors (13 routes compiled & static/dynamic generated)`
- **Independent Readiness Gates**:
  - **Software Readiness**: `READY` (`26/26 tasks implemented, tested, and verified`)
  - **Strategy Research Readiness**: `RESEARCH_RUNNER_READY_EVIDENCE_PENDING` (Deterministic backtester & ablations online; full 90–180 day historical Binance/Deribit/FRED/CoinGlass archive ingestion required for production graduation)
  - **Jev Auto-Paper Eligibility**: `NOT_ELIGIBLE` (`LOCKED OFF` — requires both §6.5 Research and Operational gates + explicit user opt-in)

---

## Historical Initiatives Preserved
- **UX15**: Professional Chart Interaction & Decision Support — `COMPLETE`
- **UX16 (`UX16.0`–`UX16.8`)**: Calm Analytical Instrument, True Flow, Liquidity Surface V2, Microstructure, Absorption, Setup Engine, Jev Shadow, Replay Calibration — `IMPLEMENTED & TESTED` (Independent audit recorded in `docs/audit/UX16_UX17_INDEPENDENT_AUDIT_2026-11-06.md`)
- **UX17 (`UX17.0`–`UX17.11`)**: Minimalist Institutional Workspace & Project Control Integration — `IMPLEMENTED & TESTED`
- **UX18 (`UX18.0`–`UX18.5`)**: Performance & Interaction Stability Overhaul — `IMPLEMENTED & TESTED`
- **UX19 (`UX19.0`–`UX19.7`)**: AVWAP Settings, VP Width Scaling, Simulated Fill Engine, Trade Journal, Jev 6-Pillar Framework — `IMPLEMENTED & TESTED`
- **UX20 (`UX20.0`–`UX20.7`)**: Master Plan Remediation, Replay Clock, Paper Account Ledger, Portfolio Analytics, Position Box Drag Fix, 2D Strike×Expiry Matrix, US Context Engine, NY Value-Area Retest Backtester, Candlestick Evidence Model, Jev Graduation Gate — `COMPLETE & VERIFIED`

---

## Completed UX20 Milestone Tracks (26 / 26 Tasks)
- **`UX20.0` (100%)**: Baseline and project evidence (`UX20.0-BASE-01`, `UX20.0-TRACK-02`)
- **`UX20.1` (100%)**: Live data, provenance and options (`UX20.1-LIVE-01`, `UX20.1-EXPIRY-02`, `UX20.1-UNITS-03`)
- **`UX20.2` (100%)**: Jev, export and request safety (`UX20.2-JEV-01`, `UX20.2-SEC-02`)
- **`UX20.3` (100%)**: Replay and numerical correctness (`UX20.3-CLOCK-01`, `UX20.3-MATH-02`)
- **`UX20.4` (100%)**: Paper execution and journal (`UX20.4-LEDGER-01`, `UX20.4-PANEL-02`, `UX20.4-PORTFOLIO-03`)
- **`UX20.5` (100%)**: Chart performance and terminal experience (`UX20.5-PROFILE-01`, `UX20.5-SYNC-02`, `UX20.5-DRAW-03`, `UX20.5-SHELL-04`, `UX20.5-FOOTPRINT-05`, `UX20.5-SURFACE-06`, `UX20.5-REF-07`)
- **`UX20.6` (100%)**: Private data and strategy research (`UX20.6-US-01`, `UX20.6-STRAT-02`, `UX20.6-RULES-03`, `UX20.6-JEV-04`, `UX20.6-USVIEW-05`, `UX20.6-EVIDENCE-06`, `UX20.6-LAB-07`)
- **`UX20.7` (100%)**: Release decision (`UX20.7-GATE-01`)

---

## Canonical Governance & Checkpoint Locations
- **UX20 Progress Document**: `docs/ui-ux/UX20_PROGRESS.md`
- **Historical Progress Document**: `docs/ui-ux/PROGRESS.md`
- **Machine-Readable Checkpoint**: `.agents/project-control-state.json`
- **Dedicated UX20 Dashboard Route**: `/project-control/ux20`
- **Codex Handoff**: `.agents/handoffs/codex.md`
- **Gemini / Antigravity Handoff**: `.agents/handoffs/gemini.md`
