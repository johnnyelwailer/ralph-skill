# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop setup adapter prompt (non-interactive) | 2026-03-24 | 28f0d0f9 | PASS | `adapter: github` written to config.yml by default |
| Adapter propagation config→meta.json (github) | 2026-03-24 | 28f0d0f9 | PASS | `meta.json` gets `"adapter": "github"` in loop sessions |
| Adapter propagation config→meta.json (local) | 2026-03-24 | 28f0d0f9 | PASS | `meta.json` gets `"adapter": "local"` when config set to local |
| adapter.test.ts unit tests (56 tests) | 2026-03-24 | 1c3ca1b8 | PASS | All 56 pass: 47 original + 9 new branch-coverage tests (Gate 2/3) |
| orchestrate.test.ts after adapter migration | 2026-03-24 | c37c7334 | PASS | All 341 pass (340 + new applyEstimateResults Needs decomposition test at 6cc0e592) |
| setup.test.ts (28 tests) | 2026-03-24 | a03fb518 | PASS | All 28 pass |
| process-requests.test.ts (6 tests) | 2026-03-24 | a03fb518 | PASS | All 6 pass |
| Dead code in adapter.ts (parseRepoSlug, unreachable existsSync) | 2026-03-24 | c37c7334 | PASS | Both removed by c37c7334 — grep confirms neither present in adapter.ts; Gate 4 closed |
| applyEstimateResults Needs decomposition → Ready | 2026-03-24 | c37c7334 | PASS | New test at 6cc0e592 verified in 341-test suite pass |
| TypeScript type-check (npx tsc --noEmit) | 2026-03-24 | c37c7334 | FAIL | TS2367 in process-requests.ts:407 — issue.state !== 'review' but 'review' not in OrchestratorIssueState; bug filed |
| index.test.ts (5 tests) | 2026-03-24 | c37c7334 | FAIL | 4/5 pass; "CLI catches errors and prints clean messages without stack traces" fails with ERR_MODULE_NOT_FOUND; pre-existing at a03fb518; bug filed |
