# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure all four independent jobs present: `cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests` (no `needs` between them)
- [x] Verify `name: CI` in workflow file
- [x] Verify README badge targets `actions/workflows/ci.yml/badge.svg` [reviewed: gates 1-9 pass]
