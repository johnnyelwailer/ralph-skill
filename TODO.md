# TODO — Issue #181: Self-healing

## QA Bugs

- [ ] [qa/P1] GITHUB_REPOSITORY env var not used as filter_repo fallback: Set `GITHUB_REPOSITORY=johnnyelwailer/ralph-skill` with no git remote → `filter_repo` is null → Spec says env vars should be a fallback for missing config. Tested at commit 4519f75. (priority: high)
- [ ] [qa/P1] session-health.json missing required checks: Only contains label results → Missing `gh auth status`, `gh repo view`, `git status` checks → Spec says startup health check should verify all three and write results to session-health.json. Tested at commit 4519f75. (priority: high)
- [ ] [qa/P1] No ALERT.md written on critical startup failures: All gh calls fail and no repo derivable → No ALERT.md created, exit code 0 → Spec says "If critical checks fail, write ALERT.md and exit with clear error". Tested at commit 4519f75. (priority: high)
