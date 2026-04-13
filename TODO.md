# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Implement as described in the issue — all acceptance criteria verified:
  - `on.push.branches` and `on.pull_request.branches` include `master`, `agent/*`, `aloop/*`
  - All four jobs (`cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`) are defined
  - No inter-job `needs` declarations
  - README badge targets `actions/workflows/ci.yml/badge.svg`
  - Workflow `name: CI`
