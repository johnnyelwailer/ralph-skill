# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CI branch triggers (agent/*, aloop/*) | 2026-04-13 | 6dcae02 | PASS | push + PR triggers on master, agent/*, aloop/* — re-verified iter 2 |
| Concurrency control | 2026-04-13 | 6dcae02 | PASS | cancel-in-progress: true, group by workflow+ref — re-verified iter 2 |
| Four parallel jobs (no needs:) | 2026-04-13 | 6dcae02 | PASS | type-check, cli-tests, dashboard-tests, loop-script-tests; no needs: declarations — re-verified iter 2 |
| cli-tests explicit build scripts | 2026-04-13 | 6dcae02 | PASS | Uses build:server, build:shebang, build:templates, build:bin, build:agents; excludes build:dashboard — re-verified iter 2 |
| No dashboard-e2e job | 2026-04-13 | 6dcae02 | PASS | Removed from workflow; not present — re-verified iter 2 |
| README badge URL | 2026-04-13 | 089a834 | PASS | Points to ci.yml — correct workflow file |
