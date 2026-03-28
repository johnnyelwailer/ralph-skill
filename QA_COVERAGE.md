# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| TypeScript errors in adapter files (TS2420/TS2339/TS2740) | 2026-03-28 | 593eab560 | PASS | 0 TS errors in adapter*.ts; interface merging fix resolved prototype mixin TS errors |
| OrchestratorAdapter interface (issue #176) | 2026-03-28 | 593eab560 | PASS | 47/47 adapter tests pass after interface-merging fix; all 9 interface methods verified |
| adapter-github.ts LOC threshold | 2026-03-28 | 593eab560 | PASS | adapter-github.ts 219 LOC (under 300), adapter-github-pr.ts 137 LOC — both pass threshold |
| orchestrate.ts regression (applyDecompositionPlan/applyEstimateResults) | 2026-03-28 | 593eab560 | PASS | 319 pass / 27 fail — baseline maintained at iter 12 |
| GitHubAdapter — GHE URL support (issue #176) | 2026-03-27 | b6e32bf40 | PASS | GHE tests still pass at HEAD |
| createAdapter factory (issue #176) | 2026-03-27 | b6e32bf40 | PASS | factory tests still pass at HEAD |
| No hardcoded github.com in adapter (issue #176) | 2026-03-27 | 19440428e | PASS | 0 matches in dist/index.js at HEAD |
| index CLI catches errors without stack traces (qa/P1 fix) | 2026-03-27 | 19440428e | PASS | 5/5 index tests pass at HEAD |
| Dead import removal in orchestrate.ts | 2026-03-27 | 19440428e | PASS | No createAdapter/OrchestratorAdapter in orchestrate.ts or built artifact |
| adapter.ts LOC threshold | 2026-03-27 | 19440428e | PASS | adapter.ts 115 LOC, adapter-github.ts 252 LOC — both under 300 |
| Dead import removal in process-requests.ts | 2026-03-27 | 19440428e | PASS | No createAdapter in process-requests.ts |
| All 38 adapter tests pass after file split | 2026-03-27 | 19440428e | PASS | 38/38 pass at HEAD |
| dist/index.js shebang present | 2026-03-27 | 19440428e | PASS | #!/usr/bin/env node on line 1; packaged binary installs and runs |
| dist/dashboard/index.html restored | 2026-03-27 | 19440428e | PASS | dashboard assets present in dist/ |
