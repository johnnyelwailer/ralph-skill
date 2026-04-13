# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Add `agent/*` and `aloop/*` to `on.push.branches` and `on.pull_request.branches` triggers
- [x] Define the four required jobs: `cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`
- [x] Ensure no `needs` declarations among the four required jobs
- [x] Verify README badge targets `actions/workflows/ci.yml/badge.svg`
- [x] Workflow `name` is `CI`
- [x] Remove the `dashboard-e2e` job from `.github/workflows/ci.yml` — TASK_SPEC specifies exactly 4 jobs; the 5th job was out-of-scope gold-plating (Constitution #19, #12)
- [x] Fix the `cli-tests` build step — replaced `npm run build` with CLI-only build steps skipping `build:dashboard`
- [x] Remove the two out-of-scope steps from the `loop-script-tests` job: "Run shell script tests" and "Run PowerShell script tests" — only `bats loop.bats` is required (Constitution #12, #19)
