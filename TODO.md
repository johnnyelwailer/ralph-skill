# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Implement as described in the issue — `.github/workflows/ci.yml` updated with `agent/*` and `aloop/*` branch triggers on both push and pull_request, four parallel jobs (type-check, cli-tests, dashboard-tests, loop-script-tests), no `needs:` dependencies. All acceptance criteria verified. Final review: PASS. [reviewed: gates 1-9 pass]
