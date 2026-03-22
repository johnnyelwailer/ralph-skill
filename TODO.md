# TODO

## Current Phase: Bug fixes (stale QA/P1 items from review gate 10)

### In Progress
- [x] [qa/P1] `aloop discover` exits 0 on non-existent path: fixed `resolveProjectRoot()` to throw when path doesn't exist; `scaffoldWorkspace` inherits the fix since it calls `discoverWorkspace` → `resolveProjectRoot`. Added test.
- [x] [qa/P1] `aloop orchestrate --issues` requires spec files: In `orchestrate.ts:1358-1363`, spec file resolution and validation happens unconditionally before `filterIssues` is checked. When `--issues 99999` is passed without a SPEC.md present, it throws "No spec files found matching: SPEC.md". Fixed by making spec validation optional in issue-dispatch mode and bypassing spec decomposition/gap-analysis queueing when `filterIssues` is set. Added regression test.
- [x] [review] Gate 10: stale P1 bugs — both `[qa/P1]` bugs above have persisted across ~6 build iterations (filed at iter 20, now ~iter 26). Fix in next build iteration: (1) `aloop discover` must exit non-zero for non-existent paths, (2) `aloop orchestrate --issues` must skip spec decomposition when dispatching specific issues. (priority: high)

### Completed
- [x] API errors should not change issue state — `checkPrGates()` returns `pending` on API errors; `prLifecycleForIssue()` returns `gates_pending` instead of transitioning to `failed` state
- [x] Blocked issues must have a reason — `postBlockedReasonComment()` posts a comment on the PR explaining the blocked reason
- [x] Recovery mechanism — `recoverFailedIssues()` scans failed issues with open PRs, re-checks gates, and transitions back to `pr_open` if all gates pass; transient API errors are distinguished from genuine failures
- [x] Artifacts in `.aloop/` folder — TODO.md, STEERING.md, QA_COVERAGE.md seeded into worktree `.aloop/` subfolder; `.gitignore` updated to exclude `.aloop/`; child loop prompts instruct agents not to commit `.aloop/` artifacts
