# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to `on.push.branches` and `on.pull_request.branches` (ci.yml:5-7)
- [x] Ensure all four required jobs exist with no `needs:` dependencies: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests` (ci.yml:14/45/70/91)
- [x] Fix `cli-tests` build step to exclude `build:dashboard` (avoids missing dashboard deps in CI)
- [x] Remove out-of-scope `dashboard-e2e` job (was not in spec deliverables)
- [x] Trim `loop-script-tests` to bats-only step (removed out-of-scope shell/PowerShell steps)
