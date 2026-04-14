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

- [x] Remove `git merge --abort` from conflict path in both `aloop/bin/lib/sync_branch.sh` (line 61) and `aloop/bin/lib/Sync-Branch.ps1` (line 69)
  - Both scripts call `git merge --abort` on conflict, which wipes the conflict markers from the working tree before the merge agent can resolve them.
  - `PROMPT_merge.md` explicitly expects markers to be present: "left conflict markers in the working tree" and step 1 is `git diff --name-only --diff-filter=U`.
  - Both test suites confirm markers must remain:
    - Bash (`loop_branch_coverage.tests.sh` ~line 1170): checks `git diff --name-only --diff-filter=U | grep -q .`
    - PowerShell (`loop.tests.ps1` ~line 3999): checks `$unmerged | Should -Not -BeNullOrEmpty`
  - Fix: remove the `git merge --abort` lines from both lib files. Leave the working tree with conflict markers so the queued merge agent can resolve them.
  - Verify: `bash aloop/bin/loop_branch_coverage.tests.sh` must show 57/57 branches covered.

- [x] **[review] Extract `Sync-Branch` from loop.ps1 to `lib/Sync-Branch.ps1`, revert out-of-scope changes, achieve net LOC reduction vs master**
  - `Sync-Branch` function extracted from `loop.ps1` (inline, ~83 lines) to `aloop/bin/lib/Sync-Branch.ps1` (89 LOC); `loop.ps1` now dot-sources it with a single line, achieving net-negative LOC change on `loop.ps1`.
  - Out-of-scope additions (extra helper functions and test scaffolding added directly to loop scripts) were reverted to comply with Constitution Rule 1.
  - Total project LOC remains below the 2273-line master baseline.

- [x] Implement `sync_branch()` in bash (`aloop/bin/lib/sync_branch.sh`, 87 LOC)
- [x] Integrate `sync_branch()` into `loop.sh` (source at line 1997–1998, conditional call at line 2034)
- [x] Extract `Sync-Branch` into `aloop/bin/lib/Sync-Branch.ps1` (89 LOC) and dot-source from `loop.ps1` line 1848
- [x] Integrate `Sync-Branch` call into `loop.ps1` iteration cycle (line 1954)
- [x] `aloop/templates/PROMPT_merge.md` has correct frontmatter (`agent: merge`, `trigger: merge_conflict`) and merge resolution instructions
- [x] Add bash branch coverage tests for all 5 sync paths in `loop_branch_coverage.tests.sh` (sync.merged, sync.up_to_date, sync.fetch_failure, sync.conflict, sync.disabled)
- [x] Add PowerShell behavioral tests for `Sync-Branch` in `loop.tests.ps1` (lines 3815–4015)
- [x] Add bats integration tests for `sync_branch()` in `aloop/bin/tests/loop.bats`
- [x] `.github/workflows/ci.yml` file exists — verified by direct read of branch HEAD
- [x] Dashboard tests job (`npm test` in `aloop/cli/dashboard`) — present in ci.yml, correct commands
- [x] README.md CI badge URL contains `actions/workflows/ci.yml/badge.svg` — verified line 1 of README.md