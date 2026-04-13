# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure four parallel jobs exist: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests` with no `needs:` dependencies
- [x] Keep `name: CI` stable so README badge (`actions/workflows/ci.yml/badge.svg`) works correctly
