# Issue #124: GH API errors must not corrupt orchestrator state

## Tasks

- [x] API errors should not change issue state — gate set to `pending` not `fail`, issue stays `pr_open`
- [x] Blocked issues must have a reason — `postBlockedReasonComment()` posts "Blocking reason:" on GitHub issue
- [ ] [spec-gap/P2] Recovery mechanism for previously-failed issues not implemented — TASK_SPEC requires "if a previously-failed issue's PR is now mergeable, auto-recover to pr_open" but no code exists for this (`orchestrate.ts` never transitions `failed` → `pr_open`)
- [ ] [spec-gap/P2] 13 test failures in `orchestrate.test.ts` — tests pass: 319, fail: 13. Failures span multiple suites (validateDoR, launchChildLoop, reviewPrDiff, queueGapAnalysisForIssues, runOrchestratorScanPass, etc.). Some may be pre-existing on master, but need verification.
- [ ] [spec-gap/P3] TASK_SPEC #4 (artifacts in dedicated folder) partially addressed — artifacts (TODO.md, STEERING.md) live in worktree root with `.gitignore` entries, not in `.aloop/` subfolder. TASK_SPEC says "should live in a gitignored `.aloop/` folder in the worktree, or in the session dir". Current gitignore approach prevents PR pollution but doesn't match the preferred layout.
- [ ] [spec-gap/P2] SPEC.md has no section covering API error resilience for orchestrator PR lifecycle — the fix (gate=pending on API error, preserve issue state) is implemented and tested but not documented in SPEC.md acceptance criteria. TASK_SPEC.md describes the requirement but SPEC.md §Monitor+Gate+Merge (line 1873) doesn't mention error handling behavior.
