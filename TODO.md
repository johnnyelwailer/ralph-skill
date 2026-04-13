# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Implement as described in the issue — `.github/workflows/ci.yml` updated with: `agent/*` and `aloop/*` branch triggers, concurrency group with cancel-in-progress, new `type-check` job (CLI + Dashboard), new `cli-tests` job with full build step, `dashboard-tests` enhanced with npm cache, `loop-script-tests` job with bats. All QA passes and review gates 1-9 passed.
