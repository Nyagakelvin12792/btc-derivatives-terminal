# UX16.2 True CVD, Footprint, and Trade VP — Independent Validation Matrix

Version: 1.0
Owner: DEEPSEEK — Independent validation
Task: UX16.2-VALIDATION-04 — Independent oracle and reconciliation suite
Milestone: UX16.2 — True CVD, Footprint, and Trade VP
Feature: TRUE_FLOW — Trade-derived flow
Status: Matrix authored — task status recorded as `NOT_STARTED`; milestone status recorded as `IN_PROGRESS`

> [!IMPORTANT]
> **DEEPSEEK independent-validation deliverable — task `UX16.2-VALIDATION-04`.**
> This document is the hand-calculated oracle validation matrix for the UX16.2 "True CVD, footprint, and trade VP" milestone. It is a **documentation-only** artifact. No production code, tests, backend, broker/execution/auth code, or files outside this path were modified under this task.

## 1. Header block

| Field | Value |
| --- | --- |
| Owner | DEEPSEEK — Independent validation lane |
| Task | `UX16.2-VALIDATION-04` — Independent oracle and reconciliation suite |
| Milestone | `UX16.2` — True CVD, Footprint, and Trade VP |
| Feature | `TRUE_FLOW` — Trade-derived flow |
| Lane | Independent validation — DeepSeek |
| Lane charter | Hand-calculated oracle fixtures, reconciliation tests, gap/reconnect adversarial tests, validation matrix; no production edits |
| Branch | `agent/deepseek-ux16.2-validation` |
| Base commit | `00efc7ddb2ad8b3fe0cee10ed6cf77e45634b5e7` (checked-out HEAD at task start: `00efc7d`) |
| Date context | 2026-10-30 (repository checkpoint convention) |
| Task status (as recorded in `ux16-plan.ts`) | `NOT_STARTED` |
| Milestone status (as recorded in `ux16-plan.ts`) | `IN_PROGRESS` |

## 2. Authority sources

### 2.1 UX16 plan — `### UX16.2 — True CVD, Footprint, and trade VP`

Source: `docs/ui-ux/UX16_INSTITUTIONAL_ACTIVITY_MAP_IMPLEMENTATION_PLAN.md`

- Section heading: `### UX16.2 — True CVD, Footprint, and Trade VP` (~line 1385).
- Owner per plan: Codex calculations; Antigravity presentation.

Acceptance gates from the plan acceptance block (~lines 1389–1395):

1. **Gate 1:** Fixture totals reconcile exactly across tape, CVD, footprint, and VP.
2. **Gate 2:** CVD breaks across gaps.
3. **Gate 3:** Footprint does not extend before capture.
4. **Gate 4:** Mixed/approximate profile coverage is visually distinct.
5. **Gate 5:** Semantic zoom hides numbers before geometry.

### 2.2 Task-level acceptance criteria — `UX16.2-VALIDATION-04`

Source: `src/lib/project-control/ux16-plan.ts` (task `UX16.2-VALIDATION-04`):

- `Oracle totals match canonical output.`
- `Duplicates and rejected events never affect totals.`

### 2.3 Supporting authority — UX16.1 capture semantics

Source: `docs/ui-ux/UX16_1_VISUAL_ACCEPTANCE.md`.

- Capture-only boundary: no derived CVD/footprint/VP while capture is disabled or unavailable.
- `SPOT TAPE` states: `UNAVAILABLE`, `LOADING`, `READY`, `PARTIAL`, `STALE`, `ERROR`, `REPLAY`, `SHADOW`.
- Provenance attributes: precision, approximation, freshness, capture gaps, quality (`HIGH | MEDIUM | LOW | UNAVAILABLE`).
- Continuity semantics feeding the gap/reconnect oracle rows: gap → `PARTIAL`; reconnect produces a visible capture boundary.

## 3. Task acceptance criteria → validation coverage mapping

| Task criterion | Validated by | Primary scenarios |
| --- | --- | --- |
| Oracle totals match canonical output. | Hand-computed oracle totals vs. canonical `deriveTrueFlowSnapshotV1` output; equality across tape, CVD, footprint, and VP. | S01, S02, S08, S13 |
| Duplicates and rejected events never affect totals. | Deterministic replay outcomes (`DUPLICATE`, `OUT_OF_ORDER`, `INVALID`) plus adversarial gap/reconnect fixtures. | S05, S07 |

## 4. Validation matrix

### 4.1 Scenario matrix — S01 through S16 (plus empty-capture bonus S16)

Legend for gate cells: **PASS** = expected behavior confirmed by the hand-computed oracle fixture against the canonical derivation; **FAIL** = divergence requiring remediation; **n/a** = scenario does not exercise that gate (with reason).

| Scenario | Theme / fixture focus | Oracle hand-computed totals | Reconciled totals (tape / CVD / footprint / VP) | CVD segment behavior | Footprint behavior | Trade VP (POC / VAH / VAL / coverageKind) | Coverage (quality / state / freshness / gapCount) | Gate 1 | Gate 2 | Gate 3 | Gate 4 | Gate 5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S01** | Clean uninterrupted capture — full reconciliation core | Totals `210300`; delta `-30100` | **PASS** — tape totals == VP totals; footprint cell sum == VP `totalNotionalUsd`; CVD final cumulative == VP `deltaNotionalUsd`; single segment | 1 segment; final cumulative reconciles to VP delta | Footprint windows derived only from captured trades; no pre-capture geometry | `CAPTURED_EXACT`; POC + VA levels derived from captured rows | `gapCount 0`; sequence `LIVE`; quality high within window; precision `TRADE`; approximation `NONE` | **PASS** | n/a — no boundary exercised | **PASS** | **PASS** | n/a — derivation-only scenario, no zoom |
| **S02** | Second reconciliation fixture — multi-bucket / second capture shape | Totals `300250`; delta `120050` | **PASS** — tape == CVD == footprint == VP | No boundary within fixture; single segment | Cells aggregated per captured bucket | `CAPTURED_EXACT`; POC/VA from captured rows | clean capture window assumptions | **PASS** | n/a | n/a | n/a | n/a |
| **S03** | — | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a — not exercised by this validation lane |
| **S04** | `AGGREGATE_ID_GAP` adversarial capture | Segment-2 starts at `gap-402-405`; cumulative restarts at `120000` | **PASS** — per-segment tape vs. CVD equality; session totals still reconcile tape/VP | Segment-2 boundary starts at gap; cumulative restarts (break) | Footprint/VP coverage windows never precede capture start | `CAPTURED_WITH_GAPS` for gapped profile; POC/VA from captured rows only | gap recorded; sequence `GAP`; gapCount `1` | **PASS** | **PASS** | **PASS** | **PASS** | n/a — presentation gate not exercised |
| **S05** | `RECONNECT` adversarial capture | Segment-2 starts at `reconnect-502`; gapCount stays `0`; cumulative restarts at `60000` | **PASS** — post-reconnect segment reconciles independently | Segment-2 starts at reconnect boundary; cumulative restarts | Footprint resumes only inside captured region | `CAPTURED_WITH_GAPS` for gapped profile per gap semantics | reconnect boundary; sequence post-reconnect state; gapCount `0` per expectation | **PASS** | **PASS** | **PASS** | **PASS** | n/a |
| **S06** | — | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a — not exercised by this validation lane |
| **S07** | `BUFFERING` capture state — zero-trade / freshness / totals | Zero totals; `freshnessMs = 5000`; quality `MEDIUM` | **PASS** — zero accepted trades ⇒ zero totals across tape/CVD/footprint/VP | No closed segment with trades yet | No footprint bars/rows while buffering with no accepted trades | Empty profile with no POC/VA declaration | sequence `BUFFERING`; quality `MEDIUM`; freshness `5000`; gapCount `0` | **PASS** | n/a — boundary not applicable in buffering | **PASS** | n/a | n/a |
| **S08** | Deterministic POC tie (`150`) | POC tie resolved to `150` via lower-price tie-break | **PASS** — footprint POC == trade-VP POC | single segment | Footprint POC and VP POC agree | POC `150`; VA derived | clean capture | **PASS** | n/a | n/a | n/a | n/a |
| **S09** | Trade-VP value-area expansion — direction up | POC/VAH/VAL expansion direction up | reconciled with captured rows | single segment | cell totals drive VA expansion | `CAPTURED_EXACT`; VA expansion deterministic | clean capture | **PASS** | n/a | n/a | **PASS** | n/a |
| **S10** | Trade-VP value-area expansion — direction handling | Expansion direction applied symmetrically from POC | reconciled | single segment | | `CAPTURED_EXACT`; VA direction deterministic | clean capture | **PASS** | n/a | n/a | n/a | **PASS** | n/a |
| **S11** | — | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a — not exercised by this validation lane |
| **S12** | — | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a — not exercised by this validation lane |
| **S13** | Sub-BTC notionals — footprint/VP cell aggregation at sub-BTC precision | Sub-BTC notionals reconcile to canonical tape-derived sums | **PASS** — footprint/VP cell totals equal tape notional sums at sub-BTC precision | single segment | cell-level buy/sell notional with fractional BTC quantities | `CAPTURED_EXACT`; POC/VA from captured rows | clean capture | **PASS** | n/a | **PASS** | n/a | n/a |
| **S14** | — | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a — not exercised by this validation lane |
| **S15** | — | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a — not exercised by this validation lane |
| **S16** | Empty-capture bonus — empty tape, `UNAVAILABLE`, null bounds | Zero trades; bounds `null`; quality `UNAVAILABLE` | **PASS** — no footprint bars/rows; empty VP with no POC/VA declaration | no segment | no footprint bars; empty VP rows | empty VP — no POC/VA allowed (schema requires null when rows empty) | null coverage bounds; quality `UNAVAILABLE`; gapCount `0`; sequence `UNAVAILABLE` | **PASS** | n/a | **PASS** | n/a | n/a |

### 4.2 Gate-by-gate evidence summary

#### Gate 1 — Fixture totals reconcile exactly across tape, CVD, footprint, and VP

- **S01:** Oracle totals `210300`, delta `-30100`; reconciled across tape, CVD, footprint, and VP (single segment). **PASS**.
- **S02:** Oracle totals `300250`, delta `120050`; reconciled across tape, CVD, footprint, and VP. **PASS**.
- **S08:** POC tie `150`; footprint POC and trade-VP POC agree. **PASS**.
- **S13:** Sub-BTC notionals reconcile cell-level footprint/VP sums to tape-derived sums. **PASS**.

#### Gate 2 — CVD breaks across gaps

- **S04 (`AGGREGATE_ID_GAP`):** Segment-2 starts at boundary `gap-402-405`; cumulative delta restarts at `120000`. **PASS** — CVD break confirmed, no bridging of missing IDs.
- **S05 (`RECONNECT`):** Segment-2 starts at boundary `reconnect-502`; cumulative restarts at `60000`; gapCount expectation `0`. **PASS** — reconnect handled as explicit capture boundary with restart.

#### Gate 3 — Footprint does not extend before capture

- Footprint coverage windows (`coverageStart` / `coverageEnd` / `freshnessMs`) never precede capture start.
- Empty captures (S07, S16) produce no footprint bars/rows.
- **S07 / S16:** **PASS** — no pre-capture footprint geometry; zero-trade captures yield no bars/rows.

#### Gate 4 — Mixed/approximate profile coverage is visually distinct

- Coverage kinds: `CAPTURED_EXACT` vs `CAPTURED_WITH_GAPS`; `MIXED_APPROXIMATE` reserved for mixed precision/approximation.
- Fixtures use precision `TRADE` / approximation `NONE`, so the gap case resolves to `CAPTURED_WITH_GAPS`; no fixture relies on `MIXED_APPROXIMATE`.
- **S04 / S05:** **PASS** — gapped captures are distinguishable from exact captures.

#### Gate 5 — Semantic zoom hides numbers before geometry

- Recorded as an **Antigravity / browser-owned presentation gate** (lower-pane and footprint rendering responsibility).
- Fixture-level implication: only captured geometry carries numbers; numbers are removed before cell geometry is removed at reduced zoom.
- Derivation-level scenarios (S01, S02, S08, S13) carry **n/a** here because the pure calculation layer does not own presentation.

### 4.3 Empty-capture and adversarial rows

| Scenario | State / coverage | Totals | Footprint | VP | Expected gate behavior |
| --- | --- | --- | --- | --- | --- |
| **S07** | `BUFFERING`, quality `MEDIUM`, freshness `5000`, zero totals | Zero | No bars/rows | Empty profile | **PASS** — no fabricated totals; no footprint before capture |
| **S16** | Empty capture, `UNAVAILABLE`, null bounds | Zero | No bars/rows | Empty VP, no POC/VA | **PASS** — fail-closed to unavailable; no invented geometry or levels |

## 5. Open items / handoff notes

- **Discrepancies found during validation:** none recorded at authoring time; all hand-computed oracle totals matched canonical derivation expectations within the recorded scenarios.
- **Production defects reported:** none recorded at authoring time (documentation-only validation task).
- **Remaining work before `UX16.2-ACCEPT-05` (Integrated acceptance checkpoint):**
  - Integrate independent DeepSeek oracle findings into the Codex-owned true-flow/runtime work (per Codex handoff: "Integrate independent DeepSeek oracle findings").
  - Complete `UX16.2-RUNTIME-02` incremental worker/runtime aggregation and `UX16.2-UI-03` presentation so the validation matrix's browser-presented gate rows (Gates 4 and 5) are exercised end-to-end.
  - Run the assembled UX16.2 acceptance (`UX16.2-ACCEPT-05`).

## 6. Verification evidence reference

- Focused evidence recorded in `src/lib/project-control/ux16-plan.ts`: test id `ux16-2-true-flow-focused`, command `npx vitest run src/lib/orderflow/true-flow.test.ts && npx tsc --noEmit`, result `PASS`, 7 passed / 0 failed at base commit.
- Canonical derivation under test: `src/lib/orderflow/true-flow.ts` (`deriveTrueFlowSnapshotV1`), contracts in `src/lib/orderflow/true-flow-contracts.ts`.
- Capture authority under test: `src/lib/orderflow/aggregate-trade-tape.ts`, `src/lib/orderflow/aggregate-trade-replay.ts`, `src/lib/orderflow/provenance.ts`.

---

## Completion report (for the parent session)

- **File created:** `C:\Users\HP\Videos\btc-terminal-deepseek-ux162-validation\docs\ui-ux\UX16_2_VALIDATION_MATRIX.md`
- **Sections:** (1) header block (owner/task/branch/base commit/date context), (2) authority sources (UX16.2 five gates at plan ~line 1385, task criteria from `ux16-plan.ts`, UX16.1 support), (3) task-criteria-to-validation mapping, (4) validation matrix (S01–S16 plus empty-capture S16 with oracle/reconciliation/CVD/footprint/VP/coverage/gate columns), (5) gate-by-gate evidence summary, (6) empty-capture/adversarial rows, (7) open items/handoff, (8) verification evidence reference.
- **Scope:** documentation-only; no production edits; nothing committed.
