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

- [x] Implement pre-iteration branch sync with conflict detection as described in the issue
  - `aloop/bin/lib/sync_branch.sh`: sync_branch() extracted to lib; reads auto_merge/base_branch from meta.json, fetches non-fatally, merges, logs branch_sync (result=merged|up_to_date) or merge_conflict event, queues PROMPT_merge.md on conflict, leaves conflict markers for agent resolution
  - `aloop/bin/loop.sh`: sources lib/sync_branch.sh and calls sync_branch after queue handling, before mode resolution; net LOC reduction satisfies Constitution Rule 1 (2236 < 2329 baseline)
  - `aloop/bin/loop.ps1`: equivalent Sync-Branch implementation with same semantics; net LOC reduction satisfies Constitution Rule 1 (2374 < 2388 baseline)
  - `aloop/templates/PROMPT_merge.md`: merge conflict resolution prompt with correct frontmatter (agent: merge, trigger: merge_conflict)
  - `aloop/bin/loop_branch_coverage.tests.sh`: 57/57 branch coverage (100%) across 5 paths: merged, up_to_date, fetch_failure, conflict, disabled
  - `aloop/bin/loop.tests.ps1`: equivalent PowerShell Sync-Branch tests (pwsh unavailable in this environment)
- [x] Fix infinite-conflict-loop bug: removed `git merge --abort` so conflict markers remain in the working tree for the merge agent to process.
- [x] Fix sync.conflict test assertion in `loop_branch_coverage.tests.sh` (assert unmerged paths ARE present after conflict, not absent).
- [x] Fix sync.conflict test assertion in `loop.tests.ps1` (`Should -Not -BeNullOrEmpty` instead of `Should -BeNullOrEmpty`).
- [x] Extract `sync_branch()` from loop.sh into `aloop/bin/lib/sync_branch.sh` and source it from loop.sh (1 line). Net change to loop.sh: −81 LOC — resolves Constitution Rule 1 violation.
- [x] Extract `Sync-Branch` from loop.ps1 into `aloop/bin/lib/SyncBranch.ps1` and dot-source it from loop.ps1 (1 line). Net change to loop.ps1: −83 LOC — resolves Constitution Rule 1 violation.
- [x] `.github/workflows/ci.yml` file exists — verified by direct read of branch HEAD
- [x] Dashboard tests job (`npm test` in `aloop/cli/dashboard`) — present in ci.yml, correct commands
- [x] README.md CI badge URL contains `actions/workflows/ci.yml/badge.svg` — verified line 1 of README.md