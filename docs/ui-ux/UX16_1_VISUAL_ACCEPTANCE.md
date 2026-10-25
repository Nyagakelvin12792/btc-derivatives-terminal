# UX16.1 Aggregate-Trade Capture — Visual Acceptance Specification

## 1. Executive Summary & Core Contract

This document specifies the visual acceptance criteria and browser verification contract for **UX16.1: Aggregate-Trade Capture** within the Bitcoin Derivatives Mechanics Terminal.

UX16.1 is strictly a **capture-only milestone**. Its sole visual manifestation in the terminal is the honest, calm exposure of tape capture health and provenance in the **Data Integrity Strip** under the `SPOT TAPE` domain.

> [!IMPORTANT]
> **Strict Non-Negotiable Boundary:**
> UX16.1 must **NOT** calculate or display:
> - True Cumulative Volume Delta (CVD)
> - Footprint charts or bid/ask delta clusters
> - Tape-derived volume profile
> - Order flow imbalances
> - Absorption or replenishment signals
> - Institutional-activity claims
> - Trade setup scores or candidate evaluations
> - A-grade trade signals
> - Any live execution path

---

## 2. Server Capability & Feature Flags

1. **Client Shell Opt-In**:
   - `NEXT_PUBLIC_UX16_CALM_WORKSPACE=true`: Activates the UX16 calm analytical instrument shell.
   - When absent or false: The terminal safely falls back to the legacy UX15 layout.

2. **Server Feature Flag**:
   - `ORDERFLOW_AGGTRADE_ENABLED`: Controls shadow capture of Binance Spot aggregate trades.
   - **Safe Default**: When absent or false, server-side capture is disabled.

3. **Capability Endpoint Contract**:
   - `GET /api/orderflow/config`
   - Response Shape:
     ```json
     {
       "schemaVersion": 1,
       "enabled": boolean,
       "dataMode": "SHADOW",
       "source": "BINANCE_SPOT",
       "symbol": "BTCUSDT"
     }
     ```
   - Cache control: `no-store` to prevent caching capability status across sessions.

---

## 3. Visual States & Theme Token Matrix

The `SPOT TAPE` status badge resides in the bottom Data Integrity Strip (`data-testid="data-integrity-trades"`). It uses the established Calm Analytical Instrument design tokens:

| State | Badge Text / Dot Color | Border Token | Background Token | Condition |
| :--- | :--- | :--- | :--- | :--- |
| **`UNAVAILABLE`** | Text: `#5C697A`<br>Dot: `bg-[#5C697A]` | `#18212C` | `#070A0F` | Flag disabled, DEMO data mode, or server offline |
| **`LOADING`** | Text: `#8390A0`<br>Dot: `bg-[#8390A0]` | `#263445` | `#0C1118` | Checking capability (`GET /api/orderflow/config`) or stream buffering prior to first accepted trade |
| **`READY`** | Text: `#2CC7A0`<br>Dot: `bg-[#2CC7A0]` | `#18212C` | `#0C1118` | Live connection active AND $\ge 1$ validated accepted trades captured |
| **`PARTIAL`** | Text: `#E6B450`<br>Dot: `bg-[#E6B450]` | `#18212C` | `#0C1118` | Continuity gap detected in trade sequence; capture is incomplete |
| **`STALE`** | Text: `#8E98A6`<br>Dot: `bg-[#8E98A6]` | `#8E98A6`/40 | `#8E98A6`/10 | Stream connected but no trade received for $> 15,000\text{ms}$ |
| **`ERROR`** | Text: `#E06379`<br>Dot: `bg-[#E06379]` | `#18212C` | `#0C1118` | Network disconnect, malformed payload, or worker crash |
| **`REPLAY`** | Text: `#39A9F5`<br>Dot: `bg-[#39A9F5]` | `#18212C` | `#0C1118` | Replaying deterministic recorded fixture session |

### Visual Discipline Rules
- Green (`#2CC7A0`) is permitted **only** when capture is verifiably live and receiving accepted trades (`READY`).
- Saturated red is reserved **strictly** for fatal capture/worker errors (`ERROR`).
- Yellow/Amber (`#E6B450`) indicates degraded continuity (`PARTIAL`) or stale feeds (`STALE`).
- Muted neutral slate (`#5C697A` / `#8390A0`) is used for disabled or in-flight discovery states.
- No glowing borders, animations, or pulsing effects.

---

## 4. Provenance Popover & Detail Copy

Clicking or keyboard-activating (`Enter` / `Space`) the `SPOT TAPE` badge reveals the Popover card:

### Provenance Attributes
- **Mode**: `SHADOW` (or `REPLAY`)
- **Source**: `BINANCE_SPOT`
- **Venue**: `BINANCE_SPOT`
- **Precision**: `TRADE`
- **Approximation**: `NONE`
- **Freshness**: Measured elapsed ms (e.g. `124ms`) or `—` when unavailable
- **Capture gaps**: Unsigned integer count of sequence gaps
- **Quality**: `HIGH` | `MEDIUM` | `LOW` | `UNAVAILABLE`

### Required Detail Text
1. **When Disabled (Default)**:
   > *"Shadow aggregate-trade capture is disabled by the server feature flag."*
   > (or *"Aggregate-trade capture is not connected in UX16.0; true trade-based CVD begins in UX16.1."*)
2. **When Checking Capability**:
   > *"Checking the shadow aggregate-trade capture capability."*
3. **When Active & Connected**:
   > *"Binance Spot aggregate trades; [N] captured; capture only, no derived CVD yet."*
   - `[N]` must be a formatted non-negative integer (e.g. `1,420 captured`).
   - The phrase *"capture only, no derived CVD yet"* is **mandatory**.
4. **When Stream Error**:
   > *"Shadow aggregate-trade capture is unavailable."* (or descriptive error message).
   - Under no circumstances may internal stack traces, environment variables, or API secrets be surfaced.

---

## 5. Failure & Edge Case Behavior

1. **Safe Default**:
   - Absent or false `ORDERFLOW_AGGTRADE_ENABLED` MUST display `UNAVAILABLE`.
   - Never defaults to `READY` or `LIVE`.
   - Demo mode displays `UNAVAILABLE` for tape with detail explaining no replay tape is presented as live.

2. **Unreachable / Intermittent Exchange**:
   - If Binance WebSocket fails to connect or closes unexpectedly, status immediately degrades to `ERROR` or `UNAVAILABLE`.
   - Never fabricates placeholder trade counts or hangs in `READY`.

3. **Continuity Gaps & Reconnects**:
   - Aggregate trades have strictly monotonic IDs (`a` property).
   - If a gap occurs ($a_{t} > a_{t-1} + 1$), gap count is incremented, and status transitions to `PARTIAL`.
   - The UI never implies continuous unbroken capture across a gap boundary.

4. **Malformed Capability Response**:
   - If `/api/orderflow/config` returns HTTP 500, HTML, or malformed JSON, the terminal UI must not crash.
   - Status degrades to `ERROR` or `UNAVAILABLE`.

---

## 6. Viewport & Responsive Acceptance Criteria

### Desktop 1366×768 (Reference Min-Desktop)
- Data Integrity Strip remains docked above the bottom edge without colliding with the chart or lower studies.
- All domain badges (`CANDLES`, `OPTIONS`, `L2 DEPTH`, `SPOT TAPE`, `SETUP`, `JEV`) are rendered on a single line.
- Popover opens above the strip (`side="top"`), fully visible without clipping.

### Desktop 1920×1080 (Reference Standard)
- Ample horizontal breathing room across all integrity badges.
- Chart canvas, Decision Dock, and Data Integrity Strip maintain clean visual hierarchy.

### Mobile 390×844 (Reference Mobile Viewport)
- The Data Integrity Strip supports touch scrolling (`overflow-x-auto`) without introducing page-level horizontal scrollbars.
- Popover width is fixed to `w-72` (288px), comfortably fitting within the 390px mobile viewport with margin.
- Touch target heights are at least 20px with sufficient padding for touch interaction.

---

## 7. Verification Matrix

| Test Suite | Scenario | Expected Outcome |
| :--- | :--- | :--- |
| `ux16-aggregate-trade-capture.pw.ts` | Safe default (`enabled: false`) | `SPOT TAPE` shows `UNAVAILABLE`, detail notes disabled flag |
| `ux16-aggregate-trade-capture.pw.ts` | Delayed config response | `SPOT TAPE` shows `LOADING`, no fake counts |
| `ux16-aggregate-trade-capture.pw.ts` | Malformed config response | Terminal does not crash, shows `ERROR` or `UNAVAILABLE` |
| `ux16-aggregate-trade-capture.pw.ts` | Enabled stream | `READY` only after $\ge 1$ trades, shows `"capture only, no derived CVD yet"` |
| `ux16-aggregate-trade-capture.pw.ts` | Responsive viewports | 1366×768, 1920×1080, and 390×844 render cleanly without overflow |
| `ux16-aggregate-trade-capture.pw.ts` | Keyboard accessibility | Tab to badge, Enter/Space opens Popover, Escape dismisses |
| `ux16-calm-workspace.pw.ts` | Shell & modes regression | Context, Flow, and Setup modes render correctly |
| `market-terminal.pw.ts` | UX15 fallback & legacy parity | Full terminal drawing and structure regression passes |
