# BTC Derivatives Terminal — Quantitative & Calculation Conventions (`UX20`)

**Source Baseline:** `main` (`f026c1a` / `7ab2f19`)  
**Master Plan Reference:** Sections 2, 3 (`UX20.1-UNITS-03`, `UX20.3-MATH-02`, `UX20.4-LEDGER-01`), 6, 7, and 8.

---

## 1. Units, Precision, and Time Conventions

1. **Storage & Evaluation Clock:**
   - All timestamps are stored and indexed in **UTC** (`seconds` for chart bars, `milliseconds` for trade/book/order events).
   - New York session rules (`NY_VALUE_RETEST_V1`) convert UTC timestamps to `America/New_York` observing US Daylight Saving Time (EST `UTC-5` / EDT `UTC-4`).
2. **Instrument Units:**
   - **Binance Spot (`BTCUSDT`):** Base quantity in `BTC`, quote prices in `USDT/BTC`, notional and fees in `USDT`.
   - **US Spot Reference (`BTC-USD`):** Base quantity in `BTC`, quote prices in `USD/BTC`, notional in `USD`. Never relabeled as `USDT`.
   - **Deribit BTC Options (`BTC-DERIBIT-OPT`):** Contract multiplier = `1 BTC` per contract. Open Interest is normalized in `BTC` (and explicitly converted to `USD` notional only once via validated index spot price; never double-multiplied).

---

## 2. Volume Profile & Value Area (`UX20.3-MATH-02`, §6.1)

1. **Price Buckets:**
   - Half-open intervals `[rowLow, rowHigh)`.
   - For `NY_VALUE_RETEST_V1` prior-session profile, fixed row height = `25 USDT/BTC`.
2. **Point of Control (POC):**
   - Row with the highest total volume.
   - **Tie-breaker:** Break ties toward the **lower price** row.
3. **Value Area (70% VAH / VAL):**
   - Start at POC row.
   - Iteratively expand into the adjacent upper or lower row with the larger volume.
   - **Tie-breaker:** If adjacent upper and lower rows have equal volume, expand into the **lower price** row first.
   - Stop once cumulative volume reaches at least `70%` (`0.70`) of total profile volume.
   - `VAH` is the upper edge of the highest included row; `VAL` is the lower edge of the lowest included row.
4. **Provenance Labeling:**
   - Profiles built from OHLCV candles are labeled `BAR_APPROXIMATED`.
   - Profiles built from captured aggregate trades are labeled `CAPTURED_EXACT` or `CAPTURED_WITH_GAPS`.

---

## 3. Anchored VWAP (`AVWAP`)

1. **Formula:**
   $$\text{AVWAP}_t = \frac{\sum_{i=a}^{t} P_i \cdot V_i}{\sum_{i=a}^{t} V_i}$$
   where $a$ is the anchor bar index and $P_i \in \{\text{Close}, \text{HLC3}, \text{HL2}, \text{OHLC4}\}$.
2. **Zero-Volume Guard:**
   - When cumulative volume $\sum_{i=a}^{t} V_i = 0$, the point emits a whitespace entry (`{ time }`) rather than `NaN`, `0`, or carry-forward fabrication until positive volume is observed.

---

## 4. Order Flow, Imbalance, and CVD (§6.1, §7.3)

1. **Diagonal Imbalance:**
   - At price row $i$ with lower adjacent row $i-1$ and upper adjacent row $i+1$:
     - $\text{BuyRatio}(i) = \frac{\text{AskExecutedNotional}(i)}{\text{BidExecutedNotional}(i-1)}$
     - $\text{SellRatio}(i) = \frac{\text{BidExecutedNotional}(i)}{\text{AskExecutedNotional}(i+1)}$
   - Requires observed positive denominator ($> 0$). Zero-denominator comparisons are suppressed (`false`), never `Infinity`.
2. **NY Value Retest Flow Gate (§6.1):**
   - Retest 5m candle requires signed aggressor delta $\ge 10\%$ of gross traded notional.
   - Stacked buy imbalance requires $\ge 3$ contiguous price rows each with buy notional $\ge 10,000\text{ USDT}$ and $\ge 3\times$ sell notional in the adjacent lower row.

---

## 5. Paper Account & Risk Math (§6.3)

- **Starting Capital:** `10,000` quote units (`USDT`), `1x` (no leverage or borrowing), maximum `1` open position at a time, at most `1` entry fill per session.
- **Per-Trade Risk Cap:** `0.25%` (`0.0025`) of current marked equity.
- **Weekly Equity-Loss Lock:** `1.5%` (`0.015`) below New York calendar week-open equity (`weekly_floor = week_open_equity * (1 - 0.015)`). Latches until next verified weekly checkpoint if breached.
- **Position Sizing Equations (Long):**
  ```text
  stop_trigger        = min(VAH, retest_low) - one_profile_row
  weekly_floor        = week_open_equity * (1 - 0.015)
  budget              = min(equity * 0.0025, equity - weekly_floor)
  loss_per_btc        = E * (1 + f_in) - S * (1 - f_stop)
  cash_cap            = free_cash / (E * (1 + f_in))
  quantity            = floor_to_lot(min(budget / loss_per_btc, cash_cap))
  planned_R_quote     = quantity * loss_per_btc
  target_fill_per_btc = (E * (1 + f_in) + 2 * loss_per_btc) / (1 - f_target)
  ```
- **Realized R-Multiple:**
  $$\text{Realized } R = \frac{\text{Net Realized P\&L (after entry and exit fees)}}{\text{Planned Risk } (\text{planned\_R\_quote})}$$
