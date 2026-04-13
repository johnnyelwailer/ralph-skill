# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Update `on.push.branches` to include `master`, `agent/*`, `aloop/*`
- [x] Update `on.pull_request.branches` to include `master`, `agent/*`, `aloop/*`
- [x] Ensure all four jobs present in workflow: `cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`
- [x] Verify no `needs` declared on any of the four required jobs (all independent)
- [x] Verify README badge targets `https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] Confirm workflow `name: CI`

All acceptance criteria verified against `.github/workflows/ci.yml` and `README.md`. No further work required.
