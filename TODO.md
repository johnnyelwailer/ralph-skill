# Issue #38: CI: Add dashboard unit tests (vitest)

## Current Phase: Implementation

### In Progress
_(none)_

### Up Next
_(none)_

### Completed
- [x] Create `.github/workflows/ci.yml` with Node.js setup, dependency install, and a dashboard unit test step that runs `npm test` in `aloop/cli/dashboard/`
- [x] Verify the workflow file is valid YAML and the test step references the correct working directory (`aloop/cli/dashboard`)

### Spec-Gap Analysis
- spec-gap analysis: no discrepancies found — spec fully fulfilled
- All acceptance criteria verified: CI workflow runs `vitest run` via `npm test`, triggers on PRs to master, uses jsdom (no browser needed), excludes Playwright e2e tests
- Tests pass locally: 87 tests, 2 test files

---

## Issue #176: Adapter Interface (aloop/issue-176 branch)

### Spec-Gap Analysis

- [spec-gap] P3 — `adapter.ts` implements `OrchestratorAdapter` interface + `GitHubAdapter` class but SPEC.md has no mention of this pluggable adapter abstraction layer. Spec says: (no spec text — feature is undocumented). Code does: defines 18-method interface + factory function. Suggest: add adapter architecture to SPEC.md Architecture section. Files: `aloop/cli/src/lib/adapter.ts`, `SPEC.md`.
- [spec-gap] P3 — 4 of 18 adapter methods have no unit tests: `closePr()`, `getPrDiff()`, `queryPrs()`, `checkBranchExists()`. Spec says: (no explicit test coverage requirement). Suggest: add test suites for these methods. File: `aloop/cli/src/lib/adapter.test.ts`.

No P1 or P2 gaps found — implementation is complete and correct within the narrowed PR scope (adapter.ts + adapter.test.ts only). Orchestrate.ts wiring is intentionally deferred to a follow-up PR per refactor scope decision.

### Notes
- No `.github/workflows/` directory or `ci.yml` exists on master or this branch
- The spec says "Dashboard deps should already be installed from the core workflow" but that core workflow hasn't been created yet — we need to include basic setup (checkout + Node + npm ci) so the dashboard test step can run
- Vitest uses jsdom — no browser install needed
- Do NOT include Playwright e2e tests
- Dashboard tests are in `aloop/cli/dashboard/src/App.test.tsx`, config in `vitest.config.ts`
- `npm test` maps to `vitest run` in dashboard's `package.json`
