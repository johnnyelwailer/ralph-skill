# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CI branch triggers (agent/*, aloop/*) | 2026-04-13 | 089a834 | PASS | push + PR triggers on master, agent/*, aloop/* |
| Concurrency control | 2026-04-13 | 089a834 | PASS | cancel-in-progress: true, group by workflow+ref |
| Four parallel jobs (no needs:) | 2026-04-13 | 089a834 | PASS | type-check, cli-tests, dashboard-tests, loop-script-tests; no needs: declarations |
| cli-tests explicit build scripts | 2026-04-13 | 089a834 | PASS | Uses build:server, build:shebang, build:templates, build:bin, build:agents; excludes build:dashboard |
| No dashboard-e2e job | 2026-04-13 | 089a834 | PASS | Removed from workflow; not present |
| README badge URL | 2026-04-13 | 089a834 | PASS | Points to ci.yml — correct workflow file |
