# Project TODO

## Current Phase: Issue #181 — Self-healing: auto-create missing labels and derive missing config

### In Progress

_(none — all acceptance criteria verified)_

### Up Next

- [x] [review] Add `child_pid`, `last_reviewed_sha` to `OrchestratorIssue` interface to eliminate `as any` casts in orchestrate.ts and process-requests.ts

### Completed

- [x] Label self-healing: `ensureLabels()` checks and creates required labels at startup (7 labels: `aloop/auto`, `aloop/epic`, `aloop/sub-issue`, `aloop/needs-refine`, `aloop/needs-review`, `aloop/in-progress`, `aloop/done`) — verified in tests (5 test cases)
- [x] Config derivation: `deriveFilterRepo()` derives repo from `gh repo view` → git remote → `meta.json` → `GITHUB_REPOSITORY` env — verified with tests for each fallback path
- [x] Trunk branch derivation: `deriveTrunkBranch()` derives from `gh repo view --json defaultBranchRef` when using default trunk — verified with 3 test cases
- [x] Startup health check: `runStartupHealthChecks()` verifies gh auth, repo access, git state — verified with 4 test cases
- [x] `session-health.json` written with labels + checks + timestamp — verified with 3 integration tests
- [x] ALERT.md written and error thrown on critical failure (gh auth) — verified in test
- [x] Graceful degradation: missing repo/labels don't block operation — verified: labels=null when no repo, non-critical check failures logged but don't throw
- [x] All derivations logged with `[orchestrate]` prefix for transparency — verified in implementation
- [x] Inline PR review comments via GitHub Reviews API (`createReview`, `resolveThread` on adapter)
- [x] Redispatch with review feedback: child loops get steering with previous review comments
- [x] Comment ID preservation across redispatch cycles
- [x] QA pass (iteration 4): 5 features verified, 0 bugs
- [x] Review pass (iteration 4): gates 1-9 pass
- [x] [spec-gap] Spec-gap analysis: no P1/P2 discrepancies found — spec fully fulfilled. 5 acceptance criteria spot-checked (provider health, CLAUDECODE sanitization, QA agent, spec-gap agent, self-healing labels): all pass. Config/template/cross-file consistency verified. Minor P3 cosmetic observations only (orchestrator templates lack frontmatter — doesn't affect runtime; loop.sh comment omits opencode — cosmetic).
