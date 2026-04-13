# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` to `on.push.branches` in `.github/workflows/ci.yml`
- [x] Add `agent/*` and `aloop/*` to `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure all four required jobs exist (`cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`) with no inter-job `needs` dependencies
- [x] Verify workflow `name: CI` is set
- [x] Verify README badge targets `actions/workflows/ci.yml/badge.svg`
