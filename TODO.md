# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to push and pull_request events in `.github/workflows/ci.yml`, ensure all four jobs (type-check, cli-tests, dashboard-tests, loop-script-tests) run in parallel with no inter-job dependencies, and polish workflow structure (concurrency settings, consistent naming) [reviewed: gates 1-9 pass]
