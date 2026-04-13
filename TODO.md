# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Up Next

- [x] Remove the `dashboard-e2e` job from `.github/workflows/ci.yml` — TASK_SPEC specifies exactly 4 jobs (`cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`); the 5th `dashboard-e2e` job with Playwright caching is out-of-scope gold-plating (Constitution #19, #12)

- [x] Fix the `cli-tests` build step — `npm run build` in `aloop/cli` calls `build:dashboard` first, which requires `vite` from dashboard devDependencies, but the job only installs `aloop/cli` deps. Replace `npm run build` with the CLI-only build steps: `npm run build:server && npm run build:shebang && npm run build:templates && npm run build:bin && npm run build:agents` (or add dashboard dep install before the build step)

- [ ] Remove the two out-of-scope steps from the `loop-script-tests` job: "Run shell script tests" (iterates `aloop/bin/*.tests.sh`) and "Run PowerShell script tests" (runs Pester). TASK_SPEC scope is CI trigger/job polish only; the only required step is the existing `bats loop.bats` test (Constitution #12, #19)

### Completed

- [x] Add `agent/*` and `aloop/*` to `on.push.branches` and `on.pull_request.branches` triggers
- [x] Define the four required jobs: `cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`
- [x] Ensure no `needs` declarations among the four required jobs
- [x] Verify README badge targets `actions/workflows/ci.yml/badge.svg`
- [x] Workflow `name` is `CI`
