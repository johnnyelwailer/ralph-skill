# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CI workflow file (7 jobs defined) | 2026-04-13 | ef60dc7e | PASS | All 7 jobs present with correct triggers |
| ci.yml trigger conditions | 2026-04-13 | ef60dc7e | PASS | push on master/agent/*/aloop/*, PR on master/agent/* |
| cli-tests job (bun run test) | 2026-04-13 | ef60dc7e | PASS | 452 tests passed, exit 0 |
| cli-type-check job (tsc --noEmit) | 2026-04-13 | ef60dc7e | PASS | No type errors, exit 0 |
| dashboard-tests job (vitest run) | 2026-04-13 | ef60dc7e | PASS | 148 tests, 20 files, exit 0 |
| dashboard-type-check job (tsc --noEmit) | 2026-04-13 | ef60dc7e | PASS | No type errors, exit 0 |
| loop-script-tests: loop.bats | 2026-04-13 | ef60dc7e | PASS | 15/15 bats tests, exit 0 |
| loop-script-tests: json-escape | 2026-04-13 | ef60dc7e | PASS | All assertions passed |
| loop-script-tests: path-hardening | 2026-04-13 | ef60dc7e | PASS | All assertions passed |
| loop-script-tests: provider-health-primitives | 2026-04-13 | ef60dc7e | PASS | All assertions passed |
| loop-script-tests: provider-health | 2026-04-13 | ef60dc7e | PASS | All assertions passed |
| loop-script-tests: branch-coverage | 2026-04-13 | ef60dc7e | PASS | 52/52, exit 0 |
| loop-script-tests: provenance | 2026-04-13 | ef60dc7e | FAIL | 2 assertions fail (exit 0 hides failures from CI) |
| loop-script-tests: finalizer-qa-coverage | 2026-04-13 | ef60dc7e | FAIL | 3 assertions fail + command not found (exit 0 hides from CI) |
| dashboard-e2e | never | - | SKIP | Requires Playwright browser install in CI |
| loop-script-tests-windows | never | - | SKIP | Requires Windows runner |
