# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### In Progress

### Up Next

### Deferred / Out of Scope
- [~] Fix CLI type-check failures (TS2367, TS2304 in `process-requests.ts`) — OUT OF SCOPE.
  File is not in `.github/workflows/` or `README.md`. Pre-existing on master.
  File a separate issue to fix type errors in `process-requests.ts`.
- [~] Fix 27 pre-existing CLI test failures (`bun run test`) — OUT OF SCOPE.
  Pre-existing failures on master, not introduced by this branch.
  A separate issue should address these.
- [~] Fix 3 loop test scripts that print FAIL but exit 0 (`loop_path_hardening.tests.sh`,
  `loop_provenance.tests.sh`, `loop_finalizer_qa_coverage.tests.sh`) — OUT OF SCOPE.
  These are not in `.github/workflows/` or `README.md`. CI cannot detect their failures
  because the scripts themselves return 0 on failure. File a separate issue.

### Completed
- [x] Create `.github/workflows/ci.yml` with push/PR triggers on `master`, `agent/*`, `aloop/*`
- [x] Add CLI tests job (`bun run test` in `aloop/cli`)
- [x] Add CLI type-check job (`bun run type-check` in `aloop/cli`)
- [x] Add dashboard unit tests job (`npm test` in `aloop/cli/dashboard`)
- [x] Add dashboard type-check job (`npm run type-check` in `aloop/cli/dashboard`)
- [x] Add loop script tests job (Linux): bats + all `loop_*.tests.sh` scripts
- [x] Add Windows PowerShell loop tests job (Pester)
- [x] Add Dashboard E2E tests job (Playwright, with proof-artifacts on failure)
- [x] Fix CI cli-tests job to use `bun run test` (not `bun test` which uses Bun's incompatible runner)
- [x] Add `aloop/*` to push triggers for orchestrator branch support
- [x] Update README.md CI badge to point at `johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] Fix dashboard type imports in split test files (explicit `import { vi, beforeEach, afterEach } from 'vitest'`)
- [x] Verify dashboard type-check passes with split test files (`npm run type-check` exits 0)
