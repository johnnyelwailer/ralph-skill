# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Add `agent/*` and `aloop/*` branch triggers to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure four independent jobs exist (`type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests`) with no `needs:` declarations
- [x] Fix `cli-tests` build step to exclude dashboard build (avoids missing dashboard devDeps)
- [x] Trim `loop-script-tests` to bats-only step (no out-of-scope shell/PowerShell test steps)
- [x] Remove out-of-scope `dashboard-e2e` job added during initial implementation
- [x] Verify README badge still targets `https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] Verify workflow `name` remains `CI` [reviewed: gates 1-9 pass]
