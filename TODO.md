# TODO — Issue #181: Self-healing

## Current Phase: Bug fixes (QA + Review consolidated)

### In Progress

### Up Next

- [ ] **Extract shared `runGh` helper** — The `runGh` closure is copy-pasted nearly identically in `deriveFilterRepo` (lines 373-396) and `deriveTrunkBranch` (lines 486-509). Extract to a shared helper function to eliminate duplication. (priority: medium) [review Gate 4]

### Completed

- [x] **Fix `deriveFilterRepo` env var fallback** — Removed `&& ghHost` guard so `GITHUB_REPOSITORY` is used unconditionally. Added test with only `GITHUB_REPOSITORY` set (no `GH_HOST`). (priority: high) [qa/P1 + review Gate 1 + review Gate 2]

- [x] **Implement startup health checks in `session-health.json`** — Added `runStartupHealthChecks` function that runs `gh auth status`, `gh repo view`, and `git status --porcelain` checks. All results (labels + startup checks) now written to `session-health.json`. (priority: high) [qa/P1 + review Gate 1]

- [x] **Implement `ALERT.md` on critical startup failures** — When `gh auth status` fails (critical check), writes `ALERT.md` with error details and throws with non-zero exit. `gh repo view` failure is non-critical since repo may not be configured yet. (priority: high) [qa/P1 + review Gate 1]
