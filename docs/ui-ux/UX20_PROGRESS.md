# UX20 remediation evidence and open acceptance

The earlier completion labels were withdrawn. The 27 planned task IDs remain registered. This table records what the remediation branch changes and which acceptance checks remain open. See the linked independent audit for the baseline findings. [Independent audit](https://chatgpt.com/library?file_id=libfile_ccdaba8cf1348191bbe359d6a3bc8a29&account_id=personal)

| Task | Branch evidence and open acceptance |
|---|---|
| UX20.0-BASE-01 | Audited baseline f1f8da9, Linux x64, Node 24.22.1, npm 11.9.0. Lockfile install, typecheck, Vitest (76 files, 446 tests), build and Playwright discovery (80 cases, UX16 config 54) exited 0. Original pre-UX20 independent baseline recorded 316 passes and eight load blockers. Retain them as partial historical evidence. |
| UX20.0-TRACK-02 | Removed generated test and review records and stale UX20 overrides. Readiness requires passing artifacts and independent review on the exact source SHA. Prior milestones are retained. External CI artifact and commit attestation remains open. |
| UX20.1-LIVE-01 | Route-level fixtures verify index outage, null IV, missing OI and stale timestamps through the real adapter. Binance feeds remain separate from options outages. Runtime provider soak remains open. |
| UX20.1-EXPIRY-02 | Exact query filters the full chain. UTC rollover removes expired cached rows. The comma-separated windows represent the union of cumulative horizons. Provider/preview browser transitions remain open. |
| UX20.1-UNITS-03 | BTC/USD/CONTRACTS conversion and same-currency annualized basis helpers. Deribit volume_usd is preserved as supplied in quote dollars. Captured venue reconciliation remains open. |
| UX20.2-JEV-01 | Streaming 64 KiB byte limit, model admission and redacted errors. Server-attested feature freshness and edge policy remain open. |
| UX20.2-SEC-02 | CSV control-prefix and UTF-8 byte-cap regressions. Spreadsheet round-trip and endpoint review remain open. |
| UX20.3-CLOCK-01 | Immutable replay snapshots, availability cutoffs, release stream and content-sensitive hash. The terminal exposes a candle-only Historical Preview while the full multi-stream replay UI is pending. |
| UX20.3-MATH-02 | The chart uses the tested profile module. Independent provider/Greek golden matrix remains open. |
| UX20.4-LEDGER-01 | Weekly headroom, finite and long-only geometry, gap-aware diagnostics, quote-backed manual entry and delayed protective exit projection. Manual desk uses full-size top-of-book quotes and requires sufficient liquidity. Partial execution, gap reconciliation and comprehensive marks remain open. |
| UX20.4-PANEL-02 | Risk desk shows the reconciled paper position and journal. Browser storage writes serialize across tabs. The previous journal remains a separate legacy planning surface. Pending order UI, full recovery drill and chart links remain open. |
| UX20.4-PORTFOLIO-03 | Account analytics use the reconciled paper snapshot. Account resets, complete marks, filters and journal drill-down remain open. |
| UX20.5-PROFILE-01 | Measured before/after matrix and one-hour endurance remain open. |
| UX20.5-SYNC-02 | Regression covers replacement, append, correction and same-candle updates. Frame timing and cross-pane pixel parity remain open. |
| UX20.5-DRAW-03 | Removed drawing projection from the heavy overlay callback. Pointer and reload acceptance remains open. |
| UX20.5-SHELL-04 | Built-in preset selection survives reload. Searchable study-instance registry and browser acceptance remain open. |
| UX20.5-FOOTPRINT-05 | Zoom hysteresis and a simplified overview. High-DPI, grouping and cursor parity acceptance remain open. |
| UX20.5-SURFACE-06 | Context mounts the actual chain, masks unobserved cells and shows timestamp/coverage. Focus/tooltip and refresh acceptance remain open. |
| UX20.5-REF-07 | Documented references only. No verified external interaction capture. |
| UX20.6-US-01 | Private capture skipped pending documented rights, retention, provider reconciliation and verified cost. |
| UX20.6-STRAT-02 | Diagnostic no longer falls back to in-sample data and cannot graduate. Promotion gate requires the specified holdout size, eligible sessions, positive week-block lower bound, positive doubled-friction expectancy and concentration limit. Matched multi-session backtests and forward evidence remain open. |
| UX20.6-RULES-03 | Point-in-time long-only value/retest/flow/trigger evaluator with timestamped quote and options gates. Single-decision fixture verifies delayed entry and session boundaries. Full rule matrix and session runner remain open. |
| UX20.6-JEV-04 | Automatic eligibility requires forward evidence and ticket validation fails at expiry. Durable manual Jev ticket handoff and verified shadow/manual counts remain open. |
| UX20.6-USVIEW-05 | Removed hardcoded release dates and prefilled futures/ETF values. The drawer shows an NY clock and manually entered context. Official calendar and permitted private feed remain open. |
| UX20.6-EVIDENCE-06 | Local decision output includes source event IDs and input checksum. Immutable run store and candle overlays remain open. |
| UX20.6-LAB-07 | Local versioned JSON inspection and explicitly synthetic diagnostic. Queue/cancel, saved run comparisons, full backtest and chart navigation remain open. |
| UX20.7-GATE-01 | The independent readiness gates stay separate. Release and production alias change require independent evidence. |

Local inspection reads the file in the browser without transmitting it. Use the schema in `src/lib/strategy/local-retest-input.ts` for a single BTC/USDT point-in-time input. Store raw licensed datasets outside the repository. The single-decision screen is distinct from walk-forward and holdout analysis.
