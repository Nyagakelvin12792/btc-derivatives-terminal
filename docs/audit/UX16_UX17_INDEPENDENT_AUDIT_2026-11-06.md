# Independent UX16–UX17 technical audit

Date: 2026-11-06. Scope: commit `f026c1a` on `main`, deployed at [beatcoin-terminal.vercel.app](https://beatcoin-terminal.vercel.app). UX16 and UX17 were reviewed in depth; shared risk, Jev, options, and project-control paths were checked where they affect those workflows. This report distinguishes observed failures from risks requiring a controlled live test. It is an audit snapshot, not a production certification.

## Executive decision

The terminal builds and its existing unit tests pass, but it is **not yet reliable enough for consequential market decisions**. Two user-facing data paths can show decision-like output from fallback or placeholder inputs. The Project Control dashboard overstates what its test and acceptance records establish. Stabilization should precede new features.

## Architecture and data lineage

```mermaid
flowchart LR
    B[Binance Spot REST + WebSocket] --> C[Market feed / 10k candle history]
    B --> T[Aggregate trade worker / tape]
    B --> L[Depth worker / liquidity surface]
    D[Deribit options API] --> A[/api/deribit terrain adapter]
    A --> Q[React Query terrain state]
    C --> CH[Chart + AVWAP + volume profile]
    T --> F[True-flow CVD / footprint / trade profile]
    L --> H[Heatmap + book]
    Q --> CH
    Q --> CT[Context / walls / gamma]
    CH --> R[Risk terminal + drawing state]
    CT --> J[Jev panel / local deterministic synthesis]
    P[Static plans + checkpoint JSON + usage JSON] --> PC[Project Control API / dashboard]
```

The app uses Next.js 16.4.2, React/TypeScript, TanStack Query, Zustand, lightweight-charts, canvas overlays, Web Workers, Vitest and Playwright. The server serves Binance and Deribit adapters; the browser owns live WebSockets, chart state, drawing state, and local paper-trade records. No observed production caller uses the standalone simulated fill engine or trade-bar evaluation engine.

## Verification performed

| Check | Result | Limit |
| --- | --- | --- |
| Git/Vercel identity | `main`, `origin/main`, and production metadata resolve to `f026c1a`; production READY | Does not prove all live providers are healthy |
| Vercel HTTP | `/`, `/project-control`, `/api/project-control`, `/api/orderflow/config` returned 200 | No authenticated or exchange-failure scenario exercised |
| Vitest | 64 files, 417 tests passed | Mostly local or mocked evidence |
| TypeScript | `npx tsc --noEmit` passed | Type-checking does not validate runtime responses |
| Build | `npm run build` passed | Build does not validate live data correctness |
| Playwright UX17 | 3 passed, 1 mobile case skipped | Demo mode; does not prove live order flow or paper fills |
| ESLint | Failed: 26 source errors and 103 warnings; one additional error belongs to an existing untracked file | Build currently does not enforce a clean lint gate |
| Dependency scan | `npm audit --omit=dev` reported 0 production package advisories | Does not test app authorization or secret handling |
| Independent AVWAP example | Prices 100@1 unit, 200@3 units produced 100, 175 | Only simple positive-volume case |
| Synthetic true-flow worker calculation | 1,000 trades: 92 ms snapshot; 5,000 trades: 165 ms snapshot | One local Node run, synthetic trades, not browser frame profiling |

The Playwright run regenerated three tracked screenshot files; those generated changes were restored. An existing untracked `test_position_box.js` was preserved.

## Findings and corrections

### P0-1 — Jev-branded grades can use invented inputs

**Evidence:** `src/components/terminal/JevAdvisoryPanel.tsx:32-45` substitutes fixed VP, VWAP, delta, CVD, spread and `dataQualityOk: true` values for absent inputs. `ContextMode.tsx` passes only a subset of market state. `src/lib/orderflow/jev-framework.ts` defaults to `ADVISORY`. `src/lib/orderflow/jev-adapter.ts` produces a local deterministic result and has no upstream model call despite reading a Jev key. Independent evaluation with price 69,000 and missing actual flow values produced an `AAA` grade, 0.88 confidence, a passed gate and proposed levels.

**Impact:** A trader may read a seemingly live, AI-backed grade or confidence score that is based on fabricated metrics. The displayed confidence is not a calibrated win probability.

**Correction:** Disable this panel in live mode immediately; require a complete, typed feature packet with provenance, freshness and explicit unavailable fields. Default to abstention, retain shadow-only operation, and label local deterministic evaluation accurately. Re-enable only after live integration and held-out calibration. Add an end-to-end test that removes each required input and asserts no grade, no trigger, no target and no recommendation.

### P0-2 — Failed Deribit requests can display demo walls in live workspace

**Evidence:** `src/app/api/deribit/route.ts:38-43` returns a demo terrain payload with HTTP 200 on upstream failure. `src/app/page.tsx:60-63` also falls back to demo terrain during loading/error. `CalmMarketTerminal.tsx` computes options metrics from the supplied payload; `MarketStructureChart.tsx` renders wall/gamma overlays from it. The source chip may say OFFLINE while the chart still shows levels.

**Impact:** Simulated option levels can look like current market structure. The chart's “Live BTC price chart with options structure overlays” label compounds ambiguity.

**Correction:** Return an explicit unavailable response or typed degraded envelope. In LIVE mode, suppress option overlays and decision inputs unless their source is LIVE and fresh. Preserve demo only behind a deliberate DEMO switch. Test forced Deribit failure from route to rendered chart.

### P1-3 — Terrain validation fails open

**Evidence:** `src/lib/dashboard/queries.ts:58-63` logs a Zod parse failure, then casts the malformed JSON to `TerrainDataContractV2`; portions of the schema use `z.any()`.

**Impact:** Invalid values can propagate to labels and calculations while TypeScript appears satisfied.

**Correction:** Reject malformed payloads, define typed nested schemas, and show an unavailable state. Add invalid-number, missing-array, wrong-mode and stale-timestamp tests.

### P1-4 — Project Control percentage is not an independent acceptance gate

**Evidence:** Live API reports 100% implemented/tested, 86.7% accepted, zero blocked and zero review-required tasks. UX16.4–UX16.8 are marked COMPLETE with `TESTED` evidence and no reviewer. `src/lib/project-control/snapshot.ts` builds from authored plans and imported usage JSON; it does not independently reconcile current tests, commits or live providers. `STATE.md` still says Milestone 3 SPEC READY. Several UX16 task evidence commit IDs appear to reference the previous phase and need manual reconciliation.

**Impact:** The dashboard can be mistaken for a current reliability attestation. `knownSpendUsd: 0` means recorded spend only; most agent usage is UNREPORTED, not free.

**Correction:** Separate IMPLEMENTED, TESTED, REVIEWED and LIVE-VERIFIED. Derive review-required state from missing review evidence. Validate each cited commit and test artifact. Show unreported spend as unknown. Reconcile `STATE.md` with main after actual review.

### P1-5 — Paper-trade analytics do not verify an execution lifecycle

**Evidence:** `src/lib/simulation/order-fill-engine.ts` and `src/lib/risk/trade-manager.ts:evaluateTradeOnBar` have test call sites but no production runtime call site. `RiskTerminal.tsx` creates DRAFT trades and provides manual outcome logging. Stored data are browser localStorage. Setup grades may be user selected or defaulted.

**Impact:** A log or performance statistic can reflect manual declaration rather than observed market fills. It will not be shared across browsers, and local storage is not durable server-side accounting.

**Correction:** Label all current records as manually logged paper hypotheses. Before claiming automated paper execution, wire a timestamped event engine with explicit fill policy, fees, slippage, partial fills and intrabar ambiguity; test page reload and independent event replay.

### P1-6 — Flow snapshots are expensive at sustained capture sizes

**Evidence:** `true-flow-session.ts:273-403` reconstructs and Zod-parses complete CVD segments, footprint bars and profile on each snapshot. `aggregate-trade-runtime.ts:199-207` emits a full snapshot every nonempty flush; default flush interval is 250 ms. Synthetic 5,000-trade snapshot took 165 ms on this machine. `MarketStructureChart.tsx:820-839` calls `candles.setData(bars)` after bar changes, and several derived series are rebuilt from full arrays.

**Impact:** Main-thread updates and worker CPU can become costly over long sessions. Live frame drops and memory pressure are **not yet measured**.

**Correction:** Add browser traces for 1H/4H with 10k candles and sustained live capture; measure p50/p95 frame time, worker time, memory and event-to-paint latency. Then switch to bounded incremental snapshots and `series.update` where proven equivalent. Target p95 interaction frame under 50 ms and no growing retained heap over a 30-minute replay; revise targets after baseline measurement.

### P2-7 — Lint and component ownership need cleanup

**Evidence:** 26 source lint errors include React state-in-effect and ref-in-render violations in `MarketStructureChart`, `RiskTerminal`, `SetupMode`, `IntegratedDealerTerrain`, plus explicit-any and dependency warnings. `MarketStructureChart.tsx` exceeds 2,200 lines; `CalmMarketTerminal` and `RiskTerminal` each exceed 1,100 lines.

**Impact:** Changes are hard to review, and drawing/viewport state is coupled to rendering effects. There is no evidence yet that every lint warning is a user-visible defect.

**Correction:** Establish lint-clean CI, then split by data owner and interaction boundary after characterization tests. Keep one canonical source for viewport, drawing, indicator and risk state.

### P2-8 — Dormant simulated fill engine accepts non-finite quantity

**Evidence:** Independent `SimulatedOrderFillEngine.submitOrder` calls with `NaN` or `Infinity` quantity returned OPEN orders; validation rejects only nonpositive values. The engine is not currently wired to production.

**Correction:** Require finite positive quantities and prices before wiring it; add an independent malformed-order test.

## Quantitative assessment

- **Trade flow:** Binance aggregate trades are classified using buyer-maker; the derived CVD/footprint session requires strictly increasing aggregate IDs and splits reconnect/gap segments. The 417-test suite covers many deterministic boundaries. It does not prove Binance, Coinbase, CME, ETF, or Deribit cross-venue reconciliation under live stress. Order-book heatmap shows **displayed liquidity**, which may be pulled; it is not proof of institutional execution.
- **Volume Profile:** POC/VAH/VAL logic uses an adjacent-row value-area expansion. A two-row 60/50 example can stop below 70% because the next row overshoots the target; this matches TradingView's documented stop rule. The UI should not claim the resulting area always contains exactly 70% of volume. Candle-direction up/down volume is not aggressor volume; trade-based profile must be identified separately.
- **AVWAP:** A simple independent weighted-price case passed. Zero-volume and anchor-rebuild cases still need independent numerical fixtures. The chart recomputes prefix sums when bars change.
- **Options:** `terrain/engine.ts:79-110` applies call-positive/put-negative signs to raw gamma and open interest. This is explicitly an `OI_SIGN_PROXY_V1` assumption, **not observed dealer inventory**. UX copy such as “positive gamma = mean reversion” needs qualification. Recheck Deribit contract units and independently test GEX, Vanna and Charm before promoting directional interpretations.
- **Risk:** An independent linear long example ($10k equity, 1% risk, entry 100, stop 90, target 120, 10x) produced quantity 10, $100 stop risk, $200 target profit, 2R and $100 margin. This verifies only the simple zero-cost case. Fees, funding, slippage, liquidation, partial exits and inverse contracts remain unverified.
- **Replay:** Existing tests are deterministic fixtures. Live-to-replay parity, future-data leakage and stop/target intrabar ordering were not independently reproduced in this pass.

## UX17 and interaction assessment

The restrained palette, tiered overlays and collapsible study dock provide a clearer hierarchy than earlier dense layouts. The UX17 browser tests verify several controls in DEMO mode. Live chart pan/zoom stability, drawing deletion and drag persistence, crosshair sync across chart/CVD, heatmap contrast and reduced-motion behavior require hands-on browser interaction traces. The chart remains a very large component with many effects and refs, so interaction regressions are plausible, not yet confirmed. The financial meaning of a level should be more prominent than decorative confidence or colored emphasis: source, timestamp, units and quality belong next to the number, with detailed provenance in a drill-down.

## Security and observability

No credential value was inspected or included. The Jev key is read server-side; the audited Jev adapter does not send it upstream. The project-control API appears read-only and public, so usage telemetry and agent activity should be reviewed for intended exposure. Production dependency advisories were zero at audit time. This does **not** establish complete auth, rate-limit, input-validation or data-retention security. Add structured provider-failure counters, schema-rejection counters, age/lag metrics, and user-visible source health. Avoid logging full market packets or secrets.

## Scorecard (0–5; U = unverified)

| Area | Score | Reason |
| --- | ---: | --- |
| Build and TypeScript | 4 | Both pass on committed revision |
| Unit-test breadth | 3 | 417 pass; live behavior mostly unproven |
| Data integrity | 1 | Demo fallback and fail-open schema in live path |
| Financial math | 2 | Some independent simple cases pass; options/replay/cost edges unverified |
| Live order-flow integrity | U | Local contracts tested; sustained exchange reconciliation not observed |
| Chart performance | 2 | 165 ms synthetic worker snapshot; browser profile pending |
| Interaction reliability | U | Demo browser tests pass; sustained live manipulation not profiled |
| UI coherence | 3 | Clearer hierarchy; misleading labels and placeholder grading remain |
| Paper simulation | 1 | Manual outcomes, no wired fill lifecycle |
| Security | U | Package scan only; endpoint review incomplete |
| Project Control truthfulness | 1 | Completion and spend semantics overstate evidence |
| Deployment | 3 | READY, HTTP 200, correct commit; provider failure paths unsafe |

## Stabilization sequence and acceptance gates

1. **Immediate:** Hide live Jev grades and demo Deribit levels; render explicit unavailable states. Gate: forced missing-input and provider-failure tests show no decision grade or option level.
2. **Boundary correctness:** Make terrain schema strict and validate timestamps/modes/units. Gate: malformed responses fail closed and are visible as unavailable.
3. **Dashboard truth:** Reconcile tasks, cited commits, review records and usage provenance. Gate: unreviewed tasks do not appear accepted; unknown spend stays unknown.
4. **Paper-trade truth:** Relabel manual journal, then implement and independently replay an event-driven fill engine. Gate: deterministic lifecycle with fees/slippage/intrabar policy and reload persistence.
5. **Performance/interaction:** Record production-like browser profiles for 10k candles, active flow, heatmap, 1H/4H, drawings and lower dock. Gate: measured p95 frame time and stable memory after bounded replay; optimize only identified hotspots.
6. **Quant validation:** Independent fixtures for GEX units/sign, VP, AVWAP bands/zero volume, risk costs, CVD discontinuities and heatmap book sequencing. Gate: formula, source, units and expected numerical output documented.
7. **Organization:** Apply the companion [file-organization plan](./FILE_ORGANIZATION_PLAN.md) after tests and ownership boundaries are settled. Gate: no runtime behavior change, imports/tests/build/lint clean.

## External technical references

- [TradingView Volume Profile concepts](https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/) — documented value-area and up/down-volume behavior.
- [TradingView AVWAP drawing](https://www.tradingview.com/support/solutions/43000669764-anchored-vwap-drawing-tool/) and [VWAP formula](https://www.tradingview.com/support/solutions/43000502018-volume-weighted-average-price-vwap/) — anchor and weighted-price behavior.
- [Sierra Chart Cumulative Delta](https://www.sierrachart.com/index.php?ID=292&page=doc%2FStudiesReference.php) — bid/ask volume provenance and historical-data caveats.
- [Bookmap Heatmap](https://bookmap.com/knowledgebase/docs/KB-SettingUpAndOperating-HeatmapMainChart) and [backfill limitations](https://bookmap.com/learning-center/getting-started/displaying-elements/backfill-data) — displayed liquidity versus trades and limited historical depth.
- [React Profiler](https://react.dev/reference/react/Profiler) — render measurement API; production profiling requires a special build.

## Audit limits

This pass did not run a 30-minute live feed, verify exchange invoices/contract specifications, access Vercel secrets, collect production browser traces, test mobile hardware, inspect every historical commit, or independently reproduce every phase of the full 20-phase requested audit. Those areas are marked unverified rather than assumed sound. No source code, deployment, or market-data configuration was changed.
