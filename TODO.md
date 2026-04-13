# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`; ensure all four jobs (type-check, cli-tests, dashboard-tests, loop-script-tests) run in parallel with no `needs:` dependencies — verified complete at ci.yml:5,7,14,45,70,91
