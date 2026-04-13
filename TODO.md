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
- [x] Implement `sync_branch()` in `aloop/bin/loop.sh` — implemented with base branch resolution, auto_merge check, non-fatal fetch, merge with conflict detection, branch_sync/merge_conflict logging, queue file injection, merge abort on conflict.
- [ ] Implement `Sync-Branch` in `aloop/bin/loop.ps1` with identical semantics
  - Same base branch resolution precedence, same log field names (`branch_sync`, `merge_conflict`, `base_branch`, `result`, `merged_commit_count`)
  - Use `Write-LogEntry` pattern consistent with existing PowerShell log calls
  - Invoke at same iteration point (after `queue_override_complete`/`queue_override_error` around line 2112)
  - `auto_merge` disable check from `meta.json`
- [ ] Add `Sync-Branch` tests to `aloop/bin/loop.tests.ps1`
  - Equivalent coverage to bash tests above
  - Verify call-order: `Sync-Branch` runs after queue override handling and before mode resolution

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

- [x] `.github/workflows/ci.yml` file exists — verified by direct read of branch HEAD
- [x] Dashboard tests job (`npm test` in `aloop/cli/dashboard`) — present in ci.yml, correct commands
- [x] README.md CI badge URL contains `actions/workflows/ci.yml/badge.svg` — verified line 1 of README.md
- [x] `sync_branch` tests to `aloop/bin/loop_branch_coverage.tests.sh` — 5 paths covered: merged, up_to_date, fetch_failure, conflict, disabled. All pass (57/57 branches, 100%).
- [x] `aloop/templates/PROMPT_merge.md` — exists with correct frontmatter (`agent: merge`, `trigger: merge_conflict`, full conflict resolution instructions); no changes needed