>>> COMPLETED BY: Codex
>>> STATUS: COMPLETE
>>> ROUND: C1.2
>>> BRANCH: agent/codex
>>> COMMIT: 50e0faaac8644a469b153cc68dad9520dd7ed371
>>> TESTS: PASS - npx.cmd vitest run (6 files, 36 tests); PASS - targeted ESLint on touched terrain and Deribit API contract files; PASS - npm.cmd run build
>>> CONTRACT VERSION: 2
>>> NEXT AGENT: Architect
>>> ACTION REQUIRED: Audit Codex displayed terrain scope fix before Architect Gate A1
>>> TARGET: src/app/api/deribit/README.md, src/lib/terrain/engine.ts, src/lib/terrain/engine.test.ts

## Implementation Summary
- Applied the Architect C1.2 displayed surface scope correction without modifying Gemini-owned UI files.
- Terrain construction now determines the displayed expiry set first using the existing nearest-10-expiries policy.
- The displayed strike axis is now derived only from contracts whose expiry belongs to that displayed expiry set.
- Surface-cell aggregation and visible GEX/Vanna/Charm/OI scale calculation now use only the displayed-expiry subset.
- Full-chain structural analytics remain on the complete active option chain: Call Wall, Put Wall, portfolio Gamma Flip, and Max Pain by expiry.
- Updated `/api/deribit` contract documentation to clarify displayed surface scope versus full-chain structural analytics.

## Mathematical Verification
- Visible terrain scales now describe exactly the aggregated Strike x Expiry cells shown in `surfaceGrid`.
- Hidden expiries cannot distort displayed GEX, Vanna, Charm, or OI scale bounds.
- Hidden-expiry-only strikes cannot create empty visible X-axis columns.
- Full-chain Call Wall and Put Wall still aggregate across the complete active chain.
- Full-chain Gamma Flip still revalues the complete active chain across the hypothetical spot curve.
- Max Pain by expiry still uses the complete active chain and may include expiries outside the displayed terrain subset.

## API Contract
- Terrain Data Contract V2 remains `schemaVersion: 2` and `assumptionModel: OI_SIGN_PROXY_V1`.
- `expirations` is the displayed expiry set: nearest 10 expiries.
- `strikes` is scoped to contracts within displayed expiries only.
- `surfaceGrid`, `confluenceFloor`, `vannaContours`, `charmGlyphs`, and returned `scales` are display-scoped.
- `keyLevels.callWall`, `keyLevels.putWall`, `keyLevels.gammaFlip`, and `maxPainByExpiry` remain full-chain analytics.

## Files Changed
- `src/app/api/deribit/README.md`
- `src/lib/terrain/engine.ts`
- `src/lib/terrain/engine.test.ts`
- `.agents/handoffs/codex.md`

## Tests Added
- Regression test that an excluded-expiry huge exposure does not alter visible GEX/Vanna/Charm/OI scales.
- Regression test that a hidden-expiry-only strike is absent from the displayed strike axis.
- Regression test that full-chain Gamma Flip matches direct full-chain calculation.
- Regression test that full-chain Call Wall and Put Wall remain influenced by hidden-expiry contracts.
- Regression test that the displayed surface grid remains rectangular after scope filtering.

## Tests Executed
- `npx.cmd vitest run`: PASS, 6 files, 36 tests.
- `npm.cmd run lint -- src/lib/terrain/engine.ts src/lib/terrain/engine.test.ts src/lib/terrain/types.ts src/app/api/deribit/route.ts src/app/api/deribit/route.test.ts`: PASS.
- `npm.cmd run build`: PASS.

## Security / Resilience Findings
- No Gemini-owned dashboard or visualization files were modified.
- Displayed terrain no longer creates misleading empty strike columns from hidden far expiries.
- Hidden expiry outliers no longer compress or distort visible terrain intensity interpretation.
- Full-chain structural analytics preserve analytical completeness while the rendered surface stays scoped to displayed data.

## Known Limitations
- The displayed expiry policy remains the existing nearest-10-expiries rule; no dynamic viewport or user-selected expiry window was added.
- `keyContracts` still uses the returned display-scoped scales for intensity fields; raw exposure values remain available for full-chain contract ranking.
- `OI_SIGN_PROXY_V1` remains a deterministic proxy and does not represent observed dealer inventory.

## Gemini Integration Requirements
- Treat `expirations`, `strikes`, and `surfaceGrid` as one coherent displayed terrain subset.
- Use returned `scales` only to explain the visible 3D terrain, not hidden expiries.
- Continue rendering key levels as full-chain analytics; Call Wall, Put Wall, and Gamma Flip may point to strikes not present in the displayed surface axis.
- If a key level strike is not in `strikes`, render it as an off-surface/full-chain marker or label rather than forcing a new terrain column.
