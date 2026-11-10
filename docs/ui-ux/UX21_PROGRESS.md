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
- Grouping uses whole multiples of the source bucket. Spot exchange tick metadata, separate content and color customization, and a broader drawing tool set remain open. Footprint supports editable horizontal levels.
- Benchmark with `npx vitest bench --run src/lib/orderflow/footprint-workspace.bench.ts`. The 30,000-print Node fixture measured mean warm H1/H4 projection times of 0.22/0.04 ms. The mock Canvas draw probe measured close-zoom H1/H4 p95 at 0.95/0.82 ms. These numbers omit browser rasterization and input latency.
- Browser regression entry point is `npx playwright test -c playwright.ux21.config.ts`. Local Chromium startup was blocked by the runner's Unix socket restrictions. Treat browser test discovery and fixture reconciliation as distinct from an executed browser suite.
