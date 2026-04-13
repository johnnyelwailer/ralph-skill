# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Add `agent/*` and `aloop/*` to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure all four required jobs exist (`type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests`) with no `needs` declarations
- [x] Add concurrency group to cancel duplicate runs on the same ref
- [x] [review] Remove out-of-scope `dashboard-e2e` job (violated TASK_SPEC and Constitution #19)
- [x] [review] Fix `cli-tests` build step — replaced `npm run build` (includes `build:dashboard`, requires dashboard deps not installed) with individual build scripts that skip `build:dashboard`
- [x] [review] Remove extra out-of-scope steps from `loop-script-tests` job (Constitution #12)
- [x] Verify README badge still targets `actions/workflows/ci.yml/badge.svg`
