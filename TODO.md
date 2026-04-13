# Issue #34: Pre-iteration branch sync with conflict detection

## Tasks

### In Progress
_(none)_

### Up Next

- [ ] Fix branch triggers in `ci.yml`: replace `agent/trunk` with `agent/*` wildcard; add `aloop/*` to push triggers (TASK_SPEC: "Workflow supports `agent/*` branch pattern")
- [ ] Add CLI tests job to `ci.yml`: `bun install` + `bun run test` in `aloop/cli` (TASK_SPEC acceptance criteria #3)
- [ ] Add CLI type-check job to `ci.yml`: `bun install` + `bun run type-check` in `aloop/cli` (TASK_SPEC acceptance criteria #5)
- [ ] Add dashboard type-check job to `ci.yml`: `npm ci` + `npm run type-check` in `aloop/cli/dashboard` (TASK_SPEC acceptance criteria #5)
- [ ] Add loop script tests (Linux) job to `ci.yml`: install bats, run `bats loop.bats` + at least one `loop_*.tests.sh` in `aloop/bin/tests` (TASK_SPEC acceptance criteria #6)

### Deferred / Out of scope

Optional jobs (not in TASK_SPEC acceptance criteria):
- Dashboard E2E job (Playwright/Chromium) — optional per TASK_SPEC
- Loop script tests (Windows/Pester) — optional per TASK_SPEC

Pre-existing CI failures not caused by issue-22 (separate issues):
- CLI type-check: 2 TypeScript errors in `process-requests.ts` (TS2367, TS2304) — separate issue
- Dashboard type-check: missing Vitest globals in `App.coverage.test.ts`, `ArtifactEntry` shape mismatch in `App.test.tsx` — separate issue
- CLI tests (`bun run test`): pre-existing test failures — separate issue

Shell integration test failures — out of scope for CI setup (loop.sh behavior issues, not CI config):
- `loop_provenance.tests.sh`: assertions fail on provenance trailer injection in agent commits
- `loop_path_hardening.tests.sh`: Test 5 assertion fails on path hardening behavior in `invoke_provider`
- `loop_finalizer_qa_coverage.tests.sh`: `check_finalizer_qa_coverage_gate: command not found` (stale function reference)

### Completed

- [x] Implement as described in the issue — `sync_branch` (Bash) and `Sync-Branch` (PowerShell) added to loop runners; all 5 test scenarios pass; 57/57 branch coverage; all acceptance criteria verified
- [x] `.github/workflows/ci.yml` file exists — verified by direct read of branch HEAD
- [x] Dashboard tests job (`npm test` in `aloop/cli/dashboard`) — present in ci.yml, correct commands
- [x] README.md CI badge URL contains `actions/workflows/ci.yml/badge.svg` — verified line 1 of README.md
- [x] `sync_branch` function implemented in `loop.sh` (lines 2101–2193) with all required logic
- [x] `sync_branch` called at correct iteration point in `loop.sh` (after queue override, before finalizer/mode resolution, line ~2219)
- [x] `aloop/templates/PROMPT_merge.md` has correct frontmatter (`agent: merge`, `trigger: merge_conflict`) and resolution instructions — no changes needed
- [x] `loop_branch_coverage.tests.sh` extended with 5 `sync_branch` test cases (merged, up_to_date, fetch_failure, conflict, disabled) — all passing (100% coverage)
- [x] `Sync-Branch` function implemented in `loop.ps1` (lines 2043–2126) matching `sync_branch` semantics; called after `Run-QueueIfPresent` at line ~2232
- [x] `Sync-Branch` tests added to `loop.tests.ps1` covering merged, up_to_date, fetch_failure, conflict, and sync-disabled paths