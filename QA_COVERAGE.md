# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop setup adapter prompt (non-interactive) | 2026-03-24 | 28f0d0f9 | PASS | `adapter: github` written to config.yml by default |
| Adapter propagation config→meta.json (github) | 2026-03-24 | 28f0d0f9 | PASS | `meta.json` gets `"adapter": "github"` in loop sessions |
| Adapter propagation config→meta.json (local) | 2026-03-24 | 28f0d0f9 | PASS | `meta.json` gets `"adapter": "local"` when config set to local |
| adapter.test.ts unit tests (56 tests) | 2026-03-24 | 1c3ca1b8 | PASS | All 56 pass: 47 original + 9 new branch-coverage tests (Gate 2/3) |
| orchestrate.test.ts after adapter migration | 2026-03-24 | a03fb518 | PASS | All 340 pass — 25 failures fixed by mocking adapter instead of execGh |
| setup.test.ts (28 tests) | 2026-03-24 | a03fb518 | PASS | All 28 pass |
| process-requests.test.ts (6 tests) | 2026-03-24 | a03fb518 | PASS | All 6 pass |
| Dead code in adapter.ts (parseRepoSlug, unreachable existsSync) | 2026-03-24 | a03fb518 | FAIL | parseRepoSlug imported but never used (line 14); existsSync checks on lines 394/404 unreachable after ensureDirs() — Gate 4 still open |
