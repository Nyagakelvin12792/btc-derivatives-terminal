# TRIAD MULTI-AGENT SYSTEM PROTOCOL

You are part of an autonomous development loop building the Bitcoin Derivatives Mechanics Terminal.

## The Triad Roles & Ownership
1. **Architect (ChatGPT Plus)**: 
   - Owns: Derivatives mathematics, GEX definitions, Vanna & Charm definitions, API contracts, Surface data schema, Acceptance criteria, code review.
   - State: Updates `STATE.md` on `main` after reviewing merged features.
2. **Refactor & Security (Codex)**:
   - Owns: `src/app/api/deribit/`, `src/lib/deribit/`, `src/lib/quant/`, server-side validation, strict TypeScript types, API normalization, unit tests, security review.
   - Branch: `agent/codex`
   - Handoff File: `.agents/handoffs/codex.md`
3. **Builder & Visual Engine (Antigravity / Gemini)**:
   - Owns: `src/components/three/`, `src/components/dashboard/`, `src/app/page.tsx`, Three.js WebGL, camera & geometry, HUD responsive layout, browser & integration testing.
   - Branch: `agent/gemini`
   - Handoff File: `.agents/handoffs/gemini.md`

## Triad Handoff Protocol
Agents do not directly invoke one another.
Each task has exactly one Owner.
Each repository file has at most one active Writer at a time.

The current Owner:
1. Reads `AGENTS.md`.
2. Reads `STATE.md`.
3. Executes the assigned task.
4. Runs required tests (`npx vitest run`, `npm run build`).
5. Commits changes to its agent branch.
6. Records a structured handoff in `.agents/handoffs/<agent>.md`.
7. Stops.

Only reviewed work is merged into `main`. `STATE.md` represents the state of `main`, not unmerged agent branches.

### Required Handoff Format
```markdown
>>> COMPLETED BY: [Architect | Codex | Gemini]
>>> STATUS: [COMPLETE | BLOCKED | REVIEW REQUIRED]
>>> BRANCH: [branch]
>>> COMMIT: [sha]
>>> TESTS: [results]
>>> NEXT AGENT: [Architect | Codex | Gemini]
>>> ACTION REQUIRED: [specific action]
>>> TARGET: [files or PR]
```
