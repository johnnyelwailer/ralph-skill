# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### Completed
- [x] Implement GitHub Actions CI pipeline as described in the issue

  Delivered in `.github/workflows/ci.yml`:
  - push trigger: `master`, `agent/*`, `aloop/*`; pull_request trigger: `master`, `agent/*`
  - `cli-tests` job: bun install + `bun run test` in `aloop/cli`
  - `cli-type-check` job: bun install + `bun run type-check` in `aloop/cli`
  - `dashboard-tests` job: npm ci + `npm test` in `aloop/cli/dashboard`
  - `dashboard-type-check` job: npm ci + `npm run type-check` in `aloop/cli/dashboard`
  - `loop-script-tests` job: bats (loop.bats) + 6 `loop_*.tests.sh` files on Ubuntu
  - `loop-script-tests-windows` job: Pester `loop.tests.ps1` on Windows
  - `dashboard-e2e` job: Playwright E2E tests on Ubuntu
  - README.md CI badge pointing to this workflow
  - 27 pre-existing CLI test failures fixed so `bun run test` passes clean
