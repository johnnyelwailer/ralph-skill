# Issue #34: Pre-iteration branch sync with conflict detection

## Implementation Status

Core feature is implemented:
- `aloop/bin/lib/sync_branch.sh` — bash implementation (87 LOC)
- `aloop/bin/loop.ps1` — PowerShell `Sync-Branch()` function (inline, ~80 LOC)
- Both loop scripts source/call sync before each iteration
- `aloop/templates/PROMPT_merge.md` — merge agent prompt exists
- PowerShell: 5 behavioral tests in `loop.tests.ps1` (lines 3815–4016)

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

- [x] Implement `sync_branch()` in bash (`aloop/bin/lib/sync_branch.sh`)
  - Reads `auto_merge` and `base_branch` from `meta.json` via python3
  - Falls back: `git config init.defaultBranch` → `main` → `master`
  - `git fetch origin <base_branch>` non-fatally, then `git merge --no-edit`
  - Conflict: emits `merge_conflict` event, copies `PROMPT_merge.md` → `queue/000-merge-conflict.md`, returns 1
  - Success: emits `branch_sync` event with `result` (`up_to_date`/`merged`) and `merged_commit_count`
- [x] Integrate `sync_branch()` call into `loop.sh` iteration loop (sources lib, calls before each iteration, `continue` on non-zero)
- [x] Implement `Sync-Branch()` in `loop.ps1` with identical behavior
- [x] Integrate `Sync-Branch()` call into `loop.ps1` iteration loop
- [x] Create `aloop/templates/PROMPT_merge.md` with merge agent instructions
- [x] Extract `sync_branch()` into `aloop/bin/lib/sync_branch.sh` (satisfies Constitution Rule 1 — loop.sh shrank)
- [x] Add PowerShell behavioral tests for `Sync-Branch()` (5 tests: up-to-date, merged, fetch-fail, conflict, auto_merge=false)
- [x] Add bash integration tests for `sync_branch()` in `aloop/bin/tests/loop.bats` (5 tests: up-to-date, merged, fetch-fail, conflict, auto_merge=false; tests 16-20; uses `_setup_sync_git_env` BATS helper + `write_log_entry`/`write_log_entry_mixed` stubs)
- [x] Fix infinite-conflict-loop bug: removed `git merge --abort` so conflict markers remain in the working tree for the merge agent to process.
- [x] Fix sync.conflict test assertion in `loop_branch_coverage.tests.sh` (assert unmerged paths ARE present after conflict, not absent).
- [x] Fix sync.conflict test assertion in `loop.tests.ps1` (`Should -Not -BeNullOrEmpty` instead of `Should -BeNullOrEmpty`).
- [x] `.github/workflows/ci.yml` file exists — verified by direct read of branch HEAD
- [x] Dashboard tests job (`npm test` in `aloop/cli/dashboard`) — present in ci.yml, correct commands
- [x] README.md CI badge URL contains `actions/workflows/ci.yml/badge.svg` — verified line 1 of README.md