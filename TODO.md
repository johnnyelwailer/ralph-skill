# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Add `agent/*` and `aloop/*` to `on.push.branches` and `on.pull_request.branches` triggers
- [x] Workflow `name` is `CI`
- [x] Add concurrency group (`${{ github.workflow }}-${{ github.ref }}`) with `cancel-in-progress: true`
- [x] Define four required jobs with no `needs` declarations: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests`
- [x] Verify README badge targets `actions/workflows/ci.yml/badge.svg`
- [x] Remove the `dashboard-e2e` job — spec specifies exactly 4 jobs; this was out-of-scope (Constitution #19, #12)
- [x] Fix the `cli-tests` build step — use CLI-only build steps instead of `npm run build` (which includes `build:dashboard`)
- [x] Remove out-of-scope steps from `loop-script-tests` — only `bats loop.bats` is required (Constitution #12, #19)
