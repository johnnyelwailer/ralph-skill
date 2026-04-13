# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

### Completed
- [x] Implement CI workflow as described in the issue
  - `.github/workflows/ci.yml` exists with all required jobs
  - Triggers: `push` and `pull_request` on `master`, `agent/*`, `aloop/*`
  - `cli-tests`: installs Bun, runs `bun run test` in `aloop/cli`
  - `cli-type-check`: runs `bun run type-check` in `aloop/cli`
  - `dashboard-tests`: installs Node 22, runs `npm test` in `aloop/cli/dashboard`
  - `dashboard-type-check`: runs `npm run type-check` in `aloop/cli/dashboard`
  - `loop-script-tests`: runs all `loop_*.tests.sh` bash suites + `loop.bats` on Linux
  - `dashboard-e2e`: Playwright e2e tests with proof artifact upload on failure
  - `loop-script-tests-windows`: Pester tests for `loop.tests.ps1` on Windows
  - `README.md` CI badge points to `johnnyelwailer/ralph-skill` (confirmed correct repo via `git remote -v`)
