# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop setup adapter prompt (non-interactive) | 2026-03-24 | 28f0d0f9 | PASS | `adapter: github` written to config.yml by default |
| Adapter propagation config→meta.json (github) | 2026-03-24 | 28f0d0f9 | PASS | `meta.json` gets `"adapter": "github"` in loop sessions |
| Adapter propagation config→meta.json (local) | 2026-03-24 | 28f0d0f9 | PASS | `meta.json` gets `"adapter": "local"` when config set to local |
| adapter.test.ts unit tests (47 tests) | 2026-03-24 | 28f0d0f9 | PASS | All 47 pass: GitHubAdapter, LocalAdapter, createAdapter factory |
| orchestrate.test.ts after adapter migration | 2026-03-24 | 28f0d0f9 | FAIL | 25/340 failing: checkPrGates, reviewPrDiff, launchChildLoop, validateDoR — bug filed |
| setup.test.ts (24 tests) | 2026-03-24 | 28f0d0f9 | PASS | All 24 pass including interactive mode with adapter prompt |
| process-requests.test.ts (10 tests) | 2026-03-24 | 28f0d0f9 | PASS | All 10 pass |
