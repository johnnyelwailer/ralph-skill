# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CI branch triggers (agent/*, aloop/*) | 2026-04-13 | 4f2dca4a | PASS | push + PR triggers on master, agent/*, aloop/* — re-verified iter 14 |
| Concurrency control | 2026-04-13 | 4f2dca4a | PASS | cancel-in-progress: true, group by workflow+ref — re-verified iter 14 |
| Four parallel jobs (no needs:) | 2026-04-13 | 4f2dca4a | PASS | type-check, cli-tests, dashboard-tests, loop-script-tests; no needs: declarations — re-verified iter 14 |
| cli-tests explicit build scripts | 2026-04-13 | 4f2dca4a | PASS | Uses build:server, build:shebang, build:templates, build:bin, build:agents; excludes build:dashboard — re-verified iter 14 |
| No dashboard-e2e job | 2026-04-13 | 4f2dca4a | PASS | Removed from workflow; not present — re-verified iter 14 |
| README badge URL | 2026-04-13 | 4f2dca4a | PASS | Points to ci.yml — correct workflow file — re-verified iter 14 |
| README hallucinated gh commands absent | 2026-04-13 | 4f2dca4a | PASS | gate1/gate2/gate3/pr-rebase not present in README.md — re-verified iter 14 |
