# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| OrchestratorAdapter interface (issue #176) | 2026-03-29 | 7a4c5fe29 | PASS | 47/47 adapter tests pass at final HEAD 7a4c5fe29 |
| GitHubAdapter — GHE URL support (issue #176) | 2026-03-29 | 7a4c5fe29 | PASS | "works with GHE URLs" + "uses ghHost from config" tests pass |
| adapter-github.ts LOC threshold | 2026-03-29 | 7a4c5fe29 | PASS | adapter.ts 132, adapter-github.ts 219, adapter-github-pr.ts 137 — all under 300 LOC |
| TypeScript errors in adapter files | 2026-03-29 | 7a4c5fe29 | PASS | 0 TS errors in adapter*.ts; tsc --noEmit: no adapter errors |
| dist/bin/loop.sh round-robin defaults | 2026-03-29 | 7a4c5fe29 | PASS | dist/bin/loop.sh:31 = "claude,opencode,codex,gemini,copilot" and help text match |
| No hardcoded github.com in adapter (issue #176) | 2026-03-29 | 7a4c5fe29 | PASS | 2 occurrences in dist/index.js are docs/help strings in unrelated modules |
| loop.sh round-robin defaults (iter 12 fix) | 2026-03-28 | 847ab1c30 | PASS | aloop/bin/loop.sh:31 and help text match config.yml and loop.ps1 — all five providers in correct order |
| orchestrate.ts regression (applyDecompositionPlan/applyEstimateResults) | 2026-03-28 | 9141b315d | PASS | 319 pass / 27 fail — baseline maintained at HEAD 9141b315d |
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
