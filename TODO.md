# TODO — Issue #181: Self-healing

## QA Bugs

- [ ] [qa/P1] GITHUB_REPOSITORY env var not used as filter_repo fallback: Set `GITHUB_REPOSITORY=johnnyelwailer/ralph-skill` with no git remote → `filter_repo` is null → Spec says env vars should be a fallback for missing config. Tested at commit 4519f75. (priority: high)
- [ ] [qa/P1] session-health.json missing required checks: Only contains label results → Missing `gh auth status`, `gh repo view`, `git status` checks → Spec says startup health check should verify all three and write results to session-health.json. Tested at commit 4519f75. (priority: high)
- [ ] [qa/P1] No ALERT.md written on critical startup failures: All gh calls fail and no repo derivable → No ALERT.md created, exit code 0 → Spec says "If critical checks fail, write ALERT.md and exit with clear error". Tested at commit 4519f75. (priority: high)

## Review Findings

- [ ] [review] Gate 1: `deriveFilterRepo` line 459 requires `GH_HOST` to use `GITHUB_REPOSITORY` — spec says env vars are an unconditional fallback. Remove the `&& ghHost` guard so `GITHUB_REPOSITORY` is used when set, regardless of `GH_HOST`. (priority: high)
- [ ] [review] Gate 1: Startup health check (TASK_SPEC.md lines 35-40) requires `gh auth status`, `gh repo view`, `git status` checks written to `session-health.json` — currently only label results are written. Implement the three missing checks. (priority: high)
- [ ] [review] Gate 1: TASK_SPEC.md line 40 requires writing `ALERT.md` and exiting with non-zero code when critical startup checks fail — not implemented at all. Add ALERT.md generation and non-zero exit. (priority: high)
- [ ] [review] Gate 2: `deriveFilterRepo` env var test (orchestrate.test.ts:322) sets both `GITHUB_REPOSITORY` AND `GH_HOST` — this masks the bug at line 459. Add a test with only `GITHUB_REPOSITORY` set (no `GH_HOST`) and assert `filter_repo` is derived. (priority: high)
- [ ] [review] Gate 4: `runGh` helper is copy-pasted nearly identically in `deriveFilterRepo` (lines 373-396) and `deriveTrunkBranch` (lines 486-509) — extract to a shared helper to eliminate duplication. (priority: medium)
