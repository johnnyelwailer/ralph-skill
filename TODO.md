# TODO — Issue #181: Self-healing

## Current Phase: Bug fixes (QA + Review consolidated)

### In Progress

### Up Next

- [x] **Extract shared `runGh` helper** — The duplicated `runGh` closures in `deriveFilterRepo` and `deriveTrunkBranch` were replaced by shared `runGhWithFallback` helper to eliminate duplication while preserving behavior/logging. (priority: medium) [review Gate 4]

### Completed

- [x] **Fix `deriveFilterRepo` env var fallback** — Removed `&& ghHost` guard so `GITHUB_REPOSITORY` is used unconditionally. Added test with only `GITHUB_REPOSITORY` set (no `GH_HOST`). (priority: high) [qa/P1 + review Gate 1 + review Gate 2]

- [x] **Implement startup health checks in `session-health.json`** — Added `runStartupHealthChecks` function that runs `gh auth status`, `gh repo view`, and `git status --porcelain` checks. All results (labels + startup checks) now written to `session-health.json`. (priority: high) [qa/P1 + review Gate 1]

- [x] **Implement `ALERT.md` on critical startup failures** — When `gh auth status` fails (critical check), writes `ALERT.md` with error details and throws with non-zero exit. `gh repo view` failure is non-critical since repo may not be configured yet. (priority: high) [qa/P1 + review Gate 1]
