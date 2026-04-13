# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Implement as described in the issue — all 6 acceptance criteria verified in `.github/workflows/ci.yml` and `README.md`:
  - `on.push.branches`: `master`, `agent/*`, `aloop/*` (ci.yml line 5)
  - `on.pull_request.branches`: `master`, `agent/*`, `aloop/*` (ci.yml line 7)
  - All four jobs present: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests`
  - No `needs` declarations among the four jobs (all independent)
  - README badge targets `actions/workflows/ci.yml/badge.svg`
  - Workflow `name: CI` (ci.yml line 1)
