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

**Issue #38 implementation verified — no gaps for CI/vitest work:**
- CI workflow (`ci.yml`) correctly runs `npm test` (vitest) in `aloop/cli/dashboard/`, triggers on PRs to master/agent/trunk, uses Node 22, runs `npm ci` first ✓
- Component refactoring (QACoverageBadge, CollapsedSidebar, SidebarContextMenu) is internal dashboard improvement within spec scope ✓

**Pre-existing P2 spec-internal inconsistency (does not block this issue, spec doc needs updating):**
- [spec-gap/P2] SPEC lines 717 and 775 (acceptance criteria in Proof and QA sections) reference a "9-step" default pipeline including proof in the cycle: `plan → build × 5 → proof → qa → review`. However, the SPEC body at lines 407–409 and 420–422 explicitly states "Proof does NOT run in the cycle — it's expensive and only meaningful as final evidence" and shows proof only in the finalizer. The `pipeline.yml` correctly implements the body text (proof in finalizer only). Fix: update SPEC ACs at lines 717 and 775 to remove proof from the cycle description and note proof runs in the finalizer only. (Spec is wrong, code is correct.)

### Spec Review — APPROVED

All in-scope requirements satisfied:
- [SPEC line 1781] `.github/workflows/ci.yml` created — GitHub Actions CI now exists ✓
- [SPEC line 1898] Workflow discoverable at `.github/workflows/*.yml` for orchestrator detection ✓
- Triggers on push + PR to `master` and `agent/trunk` ✓
- Node 22 via `actions/setup-node@v4` ✓
- `npm ci` installs deps in `aloop/cli/dashboard` before tests ✓
- `npm test` runs `vitest run` in `aloop/cli/dashboard` ✓
- No Playwright/e2e tests included; vitest config excludes `e2e/**` ✓
- jsdom configured in `vitest.config.ts` — no browser install required ✓

No gaps found. Issue #38 implementation is complete and spec-compliant.

### Notes
- No `.github/workflows/` directory or `ci.yml` exists on master or this branch
- The spec says "Dashboard deps should already be installed from the core workflow" but that core workflow hasn't been created yet — we need to include basic setup (checkout + Node + npm ci) so the dashboard test step can run
- Vitest uses jsdom — no browser install needed
- Do NOT include Playwright e2e tests
- Dashboard tests are in `aloop/cli/dashboard/src/App.test.tsx`, config in `vitest.config.ts`
- `npm test` maps to `vitest run` in dashboard's `package.json`
