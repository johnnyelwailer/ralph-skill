# QA Coverage — Issue #181: Self-healing

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Label self-healing at startup | 2026-03-21 | 4519f75 | PARTIAL | `session-health.json` written with label results, but labels show "failed" (gh blocked by PATH hardening); no `already_existed` populated even when labels exist on repo |
| Config derivation from git remote | 2026-03-21 | 4519f75 | PASS | `filter_repo` correctly derived from `git remote origin` when `--repo` flag omitted |
| Config derivation from env var | 2026-03-21 | 4519f75 | FAIL | `GITHUB_REPOSITORY` env var NOT used as fallback — `filter_repo` remains null when no git remote and no `--repo` flag |
| Startup health check / session-health.json | 2026-03-21 | 4519f75 | FAIL | Only contains label results; missing `gh auth status`, `gh repo view`, `git status` checks per spec |
| ALERT.md on critical failure | 2026-03-21 | 4519f75 | FAIL | No `ALERT.md` written when all derivation and label checks fail; spec says critical failures should produce ALERT.md |
| Graceful degradation | 2026-03-21 | 4519f75 | PASS | Orchestrator exits 0 and initializes session even with all gh calls failing |
| Trunk branch derivation | 2026-03-21 | 4519f75 | PARTIAL | Attempts `gh repo view --json defaultBranchRef` but falls back to hardcoded `agent/trunk` — no git-based fallback |
