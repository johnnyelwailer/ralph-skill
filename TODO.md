# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` to `on.push.branches` in `.github/workflows/ci.yml`
- [x] Add `agent/*` and `aloop/*` to `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure all four required jobs exist (`cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`)
- [x] Confirm no inter-job `needs` dependencies among the four required jobs
- [x] Verify `README.md` CI badge targets `actions/workflows/ci.yml/badge.svg`
- [x] Confirm workflow `name: CI` is set [reviewed: gates 1-9 pass]
