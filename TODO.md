# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Implement as described in the issue — all 6 acceptance criteria already satisfied:
  - `on.push.branches` includes `master`, `agent/*`, `aloop/*`
  - `on.pull_request.branches` includes `master`, `agent/*`, `aloop/*`
  - All four jobs defined: `cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`
  - No `needs` declarations among the four required jobs
  - `README.md` contains the CI badge URL (`ci.yml/badge.svg`)
  - Workflow `name: CI`
