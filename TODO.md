# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml` (verified PASS — QA iter 10, commit 7bfce83b)
- [x] Ensure workflow `name: CI` is set (verified PASS)
- [x] Add concurrency block with `cancel-in-progress: true` (verified PASS)
- [x] Confirm four independent jobs present (`type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests`) with no `needs:` declarations (verified PASS)
- [x] Confirm `cli-tests` build step uses explicit scripts only (`build:server`, `build:shebang`, `build:templates`, `build:bin`, `build:agents`) — no `build:dashboard` (verified PASS)
- [x] Verify README badge URL targets `actions/workflows/ci.yml/badge.svg` (verified PASS)
- [x] Verify README contains no hallucinated `gh` commands (verified PASS)
