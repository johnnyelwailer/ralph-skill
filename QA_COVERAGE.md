# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CI branch triggers (agent/*, aloop/*) | 2026-04-13 | f4570eb4 | PASS | push + PR triggers on master, agent/*, aloop/* — re-verified iter 9 |
| Concurrency control | 2026-04-13 | f4570eb4 | PASS | cancel-in-progress: true, group by workflow+ref — re-verified iter 9 |
| Four parallel jobs (no needs:) | 2026-04-13 | f4570eb4 | PASS | type-check, cli-tests, dashboard-tests, loop-script-tests; no needs: declarations — re-verified iter 9 |
| cli-tests explicit build scripts | 2026-04-13 | f4570eb4 | PASS | Uses build:server, build:shebang, build:templates, build:bin, build:agents; excludes build:dashboard — re-verified iter 9 |
| No dashboard-e2e job | 2026-04-13 | f4570eb4 | PASS | Removed from workflow; not present — re-verified iter 9 |
| README badge URL | 2026-04-13 | f4570eb4 | PASS | Points to ci.yml — correct workflow file — re-verified iter 9 |
| README hallucinated gh commands absent | 2026-04-13 | f4570eb4 | PASS | gate1/gate2/gate3/pr-rebase not present in README.md — re-verified iter 9 |
