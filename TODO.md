# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### Completed
- [x] Create `.github/workflows/ci.yml` with 7 CI jobs: cli-tests, cli-type-check, dashboard-tests, dashboard-type-check, loop-script-tests (Linux), dashboard-e2e, loop-script-tests-windows
- [x] Configure push/pull_request triggers for master, agent/*, and aloop/* branches
- [x] CLI tests job: bun install + bun run test in aloop/cli
- [x] CLI type-check job: bun install + bun run type-check in aloop/cli
- [x] Dashboard tests job: npm ci + npm test in aloop/cli/dashboard
- [x] Dashboard type-check job: npm ci + npm run type-check in aloop/cli/dashboard
- [x] Loop script tests (Linux): bats loop.bats + 6 shell test scripts in aloop/bin
- [x] Loop script tests (Windows): Invoke-Pester on loop.tests.ps1
- [x] Dashboard E2E job with Playwright chromium install and proof-artifacts upload on failure
- [x] README.md CI badge at line 1 pointing to johnnyelwailer/ralph-skill/actions/workflows/ci.yml

### Deferred (out of scope — file separate issues)
- [~] loop_provenance.tests.sh exits 0 when 2 assertions fail — CI cannot detect these failures (pre-existing bug in test script, not in ci.yml scope)
- [~] loop_finalizer_qa_coverage.tests.sh exits 0 when 3 assertions fail + check_finalizer_qa_coverage_gate command not found — CI cannot detect (pre-existing bug in test script, not in ci.yml scope)
