>>> COMPLETED BY: Codex
>>> STATUS: COMPLETE
>>> BRANCH: agent/codex
>>> COMMIT: 358399a213f493041e6ba2d782b2a1feff4edbf7
>>> TESTS: PASS - npx.cmd vitest run (2 files, 13 tests); PASS - npx.cmd eslint src/app/api/deribit/route.ts src/lib/deribit/client.ts src/lib/deribit/normalization.ts src/lib/deribit/normalization.test.ts src/lib/deribit/types.ts src/lib/quant/engine.ts src/lib/quant/engine.test.ts; PASS - npm.cmd run build
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Review per-instrument fault isolation for Deribit normalization and confirm resilience behavior. No Gemini-owned files were changed and the existing visualization API shape was preserved.
>>> TARGET: src/lib/deribit/normalization.ts, src/lib/deribit/normalization.test.ts

## Codex Notes
- Isolated Deribit book-summary row normalization so malformed rows, invalid instruments, missing required numeric fields, or property access exceptions return null and are skipped instead of failing the full response.
- Isolated normalized-option conversion so a bad internal instrument entry cannot break conversion of later valid instruments.
- Added a regression case with a throwing instrument_name getter followed by a valid put option to verify later valid instruments still survive.
- Units and API compatibility were unchanged: raw Deribit IV remains normalized as percent in book rows, option IV is still exposed as decimal plus percent, open interest and volume remain BTC-denominated, and no Gemini-owned files changed.
