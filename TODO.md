# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure all four independent jobs exist: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests` — no `needs` declarations
- [x] Verify README badge targets `https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] Confirm workflow `name: CI` is stable
