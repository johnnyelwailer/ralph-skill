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
- [ ] [spec-gap][P2] `dependency_cycle` blocker detection never triggers — `BlockerType` includes `'dependency_cycle'` (orchestrate.ts:96) and `BLOCKER_SUGGESTED_ACTIONS` has its entry (orchestrate.ts:5268), but `detectCurrentBlockers` (orchestrate.ts:5290-5336) never detects it. Spec says "detect and track dependency cycles." Fix: add detection logic in `detectCurrentBlockers`, or update spec to document it as a future type. Files: `orchestrate.ts:5290-5336`
- [ ] [spec-gap][P2] Missing `handleRequest` unhandled-type logging — TASK_SPEC.md requires: (a) "In `handleRequest` switch default case: log clear error with request type, id, and payload summary", (b) "Write unhandled requests to `requests/failed/` with `reason: 'unsupported_type'`". No `handleRequest` function exists and no `requests/failed/` directory handling is present. Files: `orchestrate.ts` (handleRequest not found)

### Notes
- No `.github/workflows/` directory or `ci.yml` exists on master or this branch
- The spec says "Dashboard deps should already be installed from the core workflow" but that core workflow hasn't been created yet — we need to include basic setup (checkout + Node + npm ci) so the dashboard test step can run
- Vitest uses jsdom — no browser install needed
- Do NOT include Playwright e2e tests
- Dashboard tests are in `aloop/cli/dashboard/src/App.test.tsx`, config in `vitest.config.ts`
- `npm test` maps to `vitest run` in dashboard's `package.json`
