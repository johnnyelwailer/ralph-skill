# TODO — Issue #181: Self-healing

## Current Phase: Bug fixes (QA + Review consolidated)

### In Progress

### Up Next

- [ ] **Implement startup health checks in `session-health.json`** — Before entering the scan loop, run `gh auth status`, `gh repo view`, and `git status` checks. Write all results (not just label results) to `session-health.json`. Currently only label self-healing results are written (line 1627). Add tests for the new checks. (priority: high) [qa/P1 + review Gate 1]

- [ ] **Implement `ALERT.md` on critical startup failures** — When critical startup checks fail (gh auth fails, no repo derivable), write `ALERT.md` with a clear error description and exit with non-zero code. Currently not implemented at all. Add tests. (priority: high) [qa/P1 + review Gate 1]

- [ ] **Extract shared `runGh` helper** — The `runGh` closure is copy-pasted nearly identically in `deriveFilterRepo` (lines 373-396) and `deriveTrunkBranch` (lines 486-509). Extract to a shared helper function to eliminate duplication. (priority: medium) [review Gate 4]

### Completed

- [x] **Fix `deriveFilterRepo` env var fallback** — Removed `&& ghHost` guard so `GITHUB_REPOSITORY` is used unconditionally. Added test with only `GITHUB_REPOSITORY` set (no `GH_HOST`). (priority: high) [qa/P1 + review Gate 1 + review Gate 2]
