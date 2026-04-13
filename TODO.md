# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to CI workflow (`on.push.branches` and `on.pull_request.branches`)
- [x] Ensure four parallel jobs exist with no `needs:` dependencies: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests`
- [x] Remove out-of-scope jobs and steps (e.g. `dashboard-e2e`, extra shell/PowerShell steps)
- [x] Fix `cli-tests` build script to exclude `build:dashboard` (dashboard deps not installed in that job)
