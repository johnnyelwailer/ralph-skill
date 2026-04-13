# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Add `agent/*` and `aloop/*` branch triggers to CI workflow push and pull_request events (ci.yml:5,7)
- [x] Ensure four independent parallel jobs exist with no `needs:` dependencies: type-check (line 14), cli-tests (line 45), dashboard-tests (line 70), loop-script-tests (line 91)
- [x] README badge targets correct workflow file (`actions/workflows/ci.yml/badge.svg`)
