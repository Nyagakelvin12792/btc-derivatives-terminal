# UX16.2 Visual and Browser Acceptance Specification

## 1. Overview and Milestone Purpose

**Milestone**: UX16.2 — True Trade-Based CVD, Footprint, and Captured-Trade Volume Profile Presentation & Read-Only Project Control Dashboard  
**Status**: DRAFT — CODEX TAKEOVER REVIEW IN PROGRESS  
**Source Baseline**: `codex/ux16.2-true-flow` (commit `00efc7ddb2ad8b3fe0cee10ed6cf77e45634b5e7`)  
**Worktree Branch**: `agent/gemini-ux16.2-ui`  
**Ownership Boundary**:
- Pure calculations and contracts: Codex (`src/lib/orderflow/true-flow.ts`, `src/lib/orderflow/true-flow-contracts.ts`, `src/lib/project-control/contracts.ts`, `src/app/api/project-control/route.ts`).
- Presentation, dashboard, and browser acceptance: Antigravity / Gemini (`src/components/terminal/TrueCvdPane.tsx`, `FootprintChartOverlay.tsx`, `CapturedVolumeProfileOverlay.tsx`, `TrueFlowProvenanceBanner.tsx`, `FlowMode.tsx`, `LowerStudyPane.tsx`, `CalmMarketTerminal.tsx`, `src/components/dashboard/*`, `src/app/project-control/page.tsx`, `tests/ui/*`).

---

## 2. Component Presentation Catalog & Truthfulness Rules

### 2.1 True CVD Presentation (`TrueCvdPane.tsx`)
- **Strict Boundary Rule**: CVD is rendered exclusively from `TrueFlowSnapshotV1.cvdSegments`. **A continuous line is never drawn between distinct segment IDs**.
- **Boundaries**: Each segment start explicitly displays its boundary reason:
  - `CAPTURE_START`: Blue tag (`#39A9F5`) indicating session initiation.
  - `AGGREGATE_ID_GAP`: Crimson tag (`#F06152`) indicating missing trade IDs.
  - `RECONNECT`: Amber tag (`#E5A83B`) indicating WebSocket reconnect boundary.
- **Delta Rendering**: Stepped delta plot and table tabular nums.
  - Bullish cumulative delta: `#2CC7A0` (emerald).
  - Bearish cumulative delta: `#F06152` (coral).
- **Empty State**: When no captured segments exist, renders honest calm status: `"Awaiting aggregate-trade stream or deterministic replay fixture. No continuous delta is fabricated from candles."`

### 2.2 Footprint Chart Overlay (`FootprintChartOverlay.tsx`)
- **Pre-Capture Rule**: **No footprint cells are drawn before the first captured trade**. Footprint cells begin strictly at the first classified trade.
- **Volume Metrics**: Renders buy volume, sell volume, total notional, and delta from canonical footprint cells.
- **Imbalance Styling**: **Imbalance styling is absent** because imbalance detection is scheduled for UX16.4. No diagonal imbalance flags or saturated alert highlights appear.
- **Canonical Levels**:
  - POC: Highlighted with amber border and indicator (`#E5A83B`) using canonical `bar.pocPrice`. Never recalculated in components.
- **Semantic Zoom**:
  - `DETAILED` (`barWidth >= 48`): Renders full bounding geometry AND split volume numeric labels (`buy | sell`).
  - `COMPACT` (`20 <= barWidth < 48`): **Hides numeric volume labels before geometry**, rendering price levels and color blocks without text noise.
  - `OVERVIEW` (`barWidth < 20`): Minimal delta density indicator.

### 2.3 Captured-Trade Volume Profile (`CapturedVolumeProfileOverlay.tsx`)
- **Coverage Separation**:
  - `CAPTURED_EXACT`: Rendered with emerald badge (`#2CC7A0`).
  - `CAPTURED_WITH_GAPS`: Rendered with distinct coral badge (`#F06152`). A reconnect can create a continuity break even when `gapCount` is zero.
  - `MIXED_APPROXIMATE`: Rendered with amber badge (`#E5A83B`), declaring `MIXED APPROXIMATE COVERAGE`.
- **Key Structural Levels**:
  - Canonical `pocPrice` with `#E5A83B` tag.
  - Canonical `vahPrice` and `valPrice` with `#39A9F5` bounds.
  - Value Area shaded background between VAL and VAH.
  - No levels are recalculated in components.

### 2.4 Data Provenance Banner (`TrueFlowProvenanceBanner.tsx`)
- Displays:
  - Venue: `BINANCE_SPOT`
  - Sequence State: `LIVE`, `BUFFERING`, `GAP`, `STALE`, `OFFLINE`
  - Precision: `TRADE`
  - Approximation: `NONE`, `BAR_DERIVED`, `MIXED_COVERAGE`
  - Data Quality: `HIGH`, `MEDIUM`, `LOW`, `UNAVAILABLE`
  - Freshness (ms) and Gap count.

---

## 3. Project-Control Dashboard (`/project-control`)

### 3.1 Separate Completion Percentages
- Implemented, tested, and Architect-accepted percentages are rendered separately:
  - **Implemented**: `progress.totals.implementedPercent%`
  - **Tested**: `progress.totals.testedPercent%`
  - **Architect Accepted**: `progress.totals.acceptedPercent%`
- Percentages are derived from canonical telemetry and **never hardcoded in React**.

### 3.2 Milestones & Task Hierarchy
- Cards for milestones `UX16.0` through `UX16.8`.
- Expandable milestone card reveals feature groups and individual tasks.
- For each task:
  - Task ID, title, description, weight, owner, supporting agents, and status.
  - Blockers prominently flagged in red alert boxes when present.
  - Acceptance criteria and dependencies.
  - Evidence: branch, commit, evidence status, test runs list (with pass/fail counts), reviewedBy, and reviewedAt.

### 3.3 Spend & Cost Truthfulness
- Summary metrics: Known Spend, Provider Reported Spend, Calculated Spend, Unreported Runs count.
- **Strict Rule**: `UNREPORTED` and `UNKNOWN` are **never displayed as `$0.00`**. They are labelled with a muted badge (`#8E98A6`).
- **Subscription Rule**: Subscription runs display `INCLUDED/UNREPORTED`, **never free API usage**.
- **Budgets**: Budget section is only shown if numerical budgets are configured.

### 3.4 Interactive Filters
- Agent filter (`ALL`, `ARCHITECT`, `CODEX`, `ANTIGRAVITY`, `DEEPSEEK`, etc.).
- Work status filter (`ALL`, `COMPLETE`, `IN_PROGRESS`, `REVIEW_REQUIRED`, `BLOCKED`, `NOT_STARTED`).
- Real-time search query matching title, ID, description, or feature.

---

## 4. Visual Evidence Artifacts

| Artifact | Resolution | Description |
| :--- | :--- | :--- |
| `ux16-2-true-flow-mobile-390x844.png` | 390×844 | Mobile responsive layout with zero horizontal overflow |
| `project-control-milestones-1920x1080.png` | 1920×1080 | Project Control dashboard showing milestones and separate completion percentages |
| `project-control-spend-1920x1080.png` | 1920×1080 | Spend & telemetry tab showing cost truthfulness and subscription handling |
| `project-control-mobile-390x844.png` | 390×844 | Mobile responsive layout of project control dashboard |

---

## 5. Verification Results

- **Focused component tests**: 2 files, 25 tests passed during Codex takeover review.
- **TypeScript**: `npx tsc --noEmit` passed during Codex takeover review.
- **Full suite, build and Playwright**: pending assembled integration review.
- **Live true-flow wiring**: pending; draft components are not yet connected to the worker snapshot.
