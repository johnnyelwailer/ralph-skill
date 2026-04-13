# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CI branch triggers (agent/*, aloop/*) | 2026-04-13 | 7bfce83b | PASS | push + PR triggers on master, agent/*, aloop/* — re-verified iter 10 |
| Concurrency control | 2026-04-13 | 7bfce83b | PASS | cancel-in-progress: true, group by workflow+ref — re-verified iter 10 |
| Four parallel jobs (no needs:) | 2026-04-13 | 7bfce83b | PASS | type-check, cli-tests, dashboard-tests, loop-script-tests; no needs: declarations — re-verified iter 10 |
| cli-tests explicit build scripts | 2026-04-13 | 7bfce83b | PASS | Uses build:server, build:shebang, build:templates, build:bin, build:agents; excludes build:dashboard — re-verified iter 10 |
| No dashboard-e2e job | 2026-04-13 | 7bfce83b | PASS | Removed from workflow; not present — re-verified iter 10 |
| README badge URL | 2026-04-13 | 7bfce83b | PASS | Points to ci.yml — correct workflow file — re-verified iter 10 |
| README hallucinated gh commands absent | 2026-04-13 | 7bfce83b | PASS | gate1/gate2/gate3/pr-rebase not present in README.md — re-verified iter 10 |
