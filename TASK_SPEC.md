# Sub-Spec: Issue #124 — GH API errors must not corrupt orchestrator state — failed PRs need recovery

## Problem

When GH API returns truncated JSON (rate limit, network issue), the PR lifecycle sets issue state to 'failed' and status to 'Blocked'. This is permanent — the issue never recovers, even though the PR is fine (mergeable, clean).

## Required fixes

1. **API errors should not change issue state** — log the error, skip the pass, retry next time
2. **Blocked issues must have a reason** — comment on the PR with why it's blocked
3. **Recovery mechanism** — if a previously-failed issue's PR is now mergeable, auto-recover to pr_open
4. **Artifacts in dedicated folder** — TODO.md, STEERING.md, QA_COVERAGE.md etc. should live in a gitignored `.aloop/` folder in the worktree, or in the session dir, not in the project root where they pollute PRs
