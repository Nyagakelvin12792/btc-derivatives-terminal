# UX21 independent Footprint workspace

UX21 tracks the new Footprint brief dated November 10, 2026. The UX20 release baseline is production source revision `7ea0cfc4a7c388ae86b61bdef4c361b13c16e750`. Earlier initiative definitions and checkpoints remain separate.

## Progress and evidence

The [UX21 tracker](/project-control/ux21) reads the shared `/api/project-control` snapshot. It refreshes every 15 seconds. Implementation, testing, and independent acceptance percentages use the recorded evidence for UX21 tasks only.

Definitions and task dependencies live in [ux21-plan.ts](../../src/lib/project-control/ux21-plan.ts). Resume from the [UX21 checkpoint](../../.agents/project-control-ux21-state.json). The existing Project Control snapshot applies the checkpoint separately from earlier initiatives. An entry records the owner from the task definition and, as work progresses, its branch, revision, test command and result, artifacts, review state, and blockers. Refreshing the dashboard reads recorded evidence. Evidence changes come from the versioned checkpoint.

| Milestone | Scope | Resume from |
| --- | --- | --- |
| UX21.0 | ATAS research, baseline reproduction, and source audit | Reference matrix and bug inventory |
| UX21.1 | Chart controller, independent axes, drawing, layouts, persistence, and timestamp-based coordination | Verify each pane under independent and linked interactions |
| UX21.2 | Observed trade quality, developing candles, H1/H4, aggregation, and display modes | Reconcile against classified trade fixtures and document provider coverage |
| UX21.3 | Candle-aligned statistics, true CVD, and inspection | Validate values and alignment using the same candle data |
| UX21.4 | Causal replay, profiling, regression verification, and independent acceptance | Run the test and performance matrix on the exact release revision |

## Checkpoint protocol

1. Read the source audit and current checkpoint before assigning work. Check the task dependencies.
2. Record implementation with an exact commit. Attach the passing commands, execution time, and artifacts before setting a task to tested.
3. Keep tested evidence distinct from independent acceptance. Record the reviewer and review time for acceptance.
4. Record feed limitations, missing browser evidence, and failed benchmarks with the affected tasks. A passing subset does not close a broader task.
5. Keep production verification separate from local verification. Record the live revision and URL when verified.

## Implementation handoff

- [ATAS reference matrix, baseline audit, and architecture](UX21_FOOTPRINT_RESEARCH.md). The original pane cropped the selected window, used the main chart price scale by default, and rendered estimated OHLC clusters during tape outages.
- The independent pane uses canonical UTC seconds for horizontal geometry, a separate price range, and the same transform for candles, the statistics table, CVD, and the cursor. Linked selections resolve by containing candle interval. The main Candlestick workspace keeps its existing drawing tools.
- The capture worker retains the same Binance Spot socket when intervals change. Live capture is bounded to 50,000 aggregate messages. Independent OHLC history supplies price context only. Missing trade history leaves cells blank and uncovered trade statistics unavailable. H1/H4 data coverage depends on the retained or imported trades. No server-side historical trade archive is provisioned.
- Replay accepts a bounded, schema-validated BTCUSDT Spot capture JSON and uses a worker to build a view from trades and capture boundaries at or before the cursor. Same-timestamp messages become available together. For local replay, save a tape from Footprint Settings and open it from Historical Preview. Replay does not upload the file or source order flow from OHLC.
- Grouping uses whole multiples of the source bucket. Spot exchange tick metadata comes from Binance's PRICE_FILTER. The settings panel separates cell contents, visual mode and two color palettes. Footprint supports editable horizontal levels. Broader Footprint drawing parity remains open.
- Benchmark with `npx vitest bench --run src/lib/orderflow/footprint-workspace.bench.ts`. The 30,000-print Node fixture measured mean warm H1/H4 projection times of 0.22/0.04 ms. The mock Canvas draw probe measured close-zoom H1/H4 p95 at 0.95/0.82 ms. These numbers omit browser rasterization and input latency.
- Browser regression entry point is `npx playwright test -c playwright.ux21.config.ts`. Local Chromium startup was blocked by the runner's Unix socket restrictions. Treat browser test discovery and fixture reconciliation as distinct from an executed browser suite.

### Hosted preview evidence

- Preview `6207503244e15ca2e9428d1d76ab4533ac31e213` built successfully. The desktop browser baseline showed estimated clusters while the tape reported an error. The rebuild displayed independent axes, a compact toolbar, and all ten statistics rows. During a comparable live tape outage, it displayed OHLC context and unavailable trade values.
- TypeScript and the production build passed. The first hosted tree passed 479 tests in 82 Vitest files. Playwright discovery succeeded. Real-browser automation with fixture injection remains open.
- Independent release acceptance remains open. Remaining checks include real-browser H1/H4 frame latency, narrow-screen and input-device behavior, and broader chart drawing parity.
- Hosted desktop interaction results on the initial revision. H1 zoom changed the time span from 36,000 to 28,080 seconds. ArrowLeft moved the range by 3,600 seconds. Independent H4 opened a 144,000-second range. Price-axis wheel zoom narrowed the price range from about 2,999 to 1,730 USDT while timestamps stayed fixed. The divider widened the chart from about 476 to 496 pixels. The H4 inspector showed unavailable trade values when tape was absent. Link adopted the Candlestick time range. Historical Preview exposed the tape input.

- The second hosted revision, `90bc4b66ebf8515e0abaf865e1a370be25da5c84`, returned the 0.01 USDT BTCUSDT Spot price increment and observed 30m and H4 OHLC. Its data-only WebSocket received Binance Spot trades in the browser. The live inspector showed a developing, partial-coverage candle with nonzero Bid and Ask volume and 70 aggregate messages. The count of underlying executions was unavailable, separate from the observed aggregate count.
- TypeScript, all 481 unit tests, and a local production build passed for the second revision. The automatic historical archive remains unprovisioned. The measured live session does not establish older H1/H4 trade coverage.
