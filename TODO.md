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

- [x] Implement `sync_branch()` in `loop.sh`: reads `auto_merge`/`base_branch` from meta.json, resolves base branch via explicit precedence, fetches non-fatally, merges, logs `branch_sync` or `merge_conflict`, queues `PROMPT_merge.md` as `000-merge-conflict.md` on conflict, returns non-zero without aborting loop.
- [x] Implement `Sync-Branch` in `loop.ps1` with identical semantics and log field names; call at the same iteration point (after queue override handling, before mode resolution).
- [x] Fix infinite-conflict-loop bug: removed `git merge --abort` so conflict markers remain in the working tree for the merge agent to process.
- [x] Fix sync.conflict test assertion in `loop_branch_coverage.tests.sh` (assert unmerged paths ARE present after conflict, not absent).
- [x] Fix sync.conflict test assertion in `loop.tests.ps1` (`Should -Not -BeNullOrEmpty` instead of `Should -BeNullOrEmpty`).
- [x] Branch coverage tests pass 57/57 (100%) including all 5 sync paths: merged, up_to_date, fetch_failure, conflict, disabled.
- [x] `aloop/templates/PROMPT_merge.md` verified to have `agent: merge` and `trigger: merge_conflict` frontmatter.
- [x] `.github/workflows/ci.yml` file exists — verified by direct read of branch HEAD
- [x] Dashboard tests job (`npm test` in `aloop/cli/dashboard`) — present in ci.yml, correct commands
- [x] README.md CI badge URL contains `actions/workflows/ci.yml/badge.svg` — verified line 1 of README.md

### In Progress (Review Findings)

- [ ] [review] Extract `sync_branch()` from loop.sh into `aloop/bin/lib/sync_branch.sh` and source it from loop.sh (1 line). Remove the ~82-line function body from loop.sh. Net change to loop.sh: −81 LOC — resolves Constitution Rule 1 violation. Update `loop_branch_coverage.tests.sh` to extract `sync_branch` from `aloop/bin/lib/sync_branch.sh` instead of `loop.sh` (update the `extract_function` call at line 165 to pass the helper file path as second argument, and update the `extract_function` helper to accept an optional source file parameter). (critical)

- [ ] [review] Extract `Sync-Branch` from loop.ps1 into `aloop/bin/lib/SyncBranch.ps1` and dot-source it from loop.ps1 (1 line: `. "$PSScriptRoot/lib/SyncBranch.ps1"`). Remove the ~84-line function body from loop.ps1. Net change to loop.ps1: −83 LOC — resolves Constitution Rule 1 violation. Update `loop.tests.ps1` to dot-source or reference `aloop/bin/lib/SyncBranch.ps1` when loading `Sync-Branch` for unit-test isolation. (critical)