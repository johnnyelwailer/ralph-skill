# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Phase 2c: needs_redispatch=true after merge agent queue (syncChildBranches) | 2026-03-24 | 35b6bd2c | PASS | All 5 syncChildBranches tests pass, including rebase failure + success paths |
| processPrLifecycle: needs_rebase=true on CONFLICTING (first attempt) | 2026-03-24 | da275c42 | PASS | "requests rebase on first merge conflict" passes; needs_redispatch=true, needs_rebase=true, rebase_attempts=1 |
| processPrLifecycle: still dispatches rebase after multiple attempts | 2026-03-24 | 35b6bd2c | FAIL | Pre-existing failure (same result on b03e1d64 before #163 changes); returns gates_pending instead of rebase_requested when CONFLICTING without mergeStateStatus |
| Redispatch path: needs_rebase=true → 000-rebase-conflict.md with agent:merge | 2026-03-24 | da275c42 | PASS | Test added (commit 009d8a11→da275c42); ok 20 passes — clears needs_rebase, writes correct file with agent:merge |
| Redispatch path: needs_rebase=false → 000-review-fixes.md with agent:build | 2026-03-24 | da275c42 | PASS | Test added (commit da275c42); ok 21 passes — regression guard for non-rebase path |
| processPrLifecycle: merges PR when all gates pass | 2026-03-24 | 35b6bd2c | FAIL | Pre-existing failure from ea377a7c (remove auto-approve); test doesn't mock invokeAgentReview |
| checkPrGates: CI checks pending/fail/pass | 2026-03-24 | 35b6bd2c | FAIL | 4 pre-existing failures; pending/fail status handling broken |
