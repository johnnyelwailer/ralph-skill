# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Add `agent/*` and `aloop/*` branch triggers to both `push` and `pull_request` in `.github/workflows/ci.yml` (replacing the single `agent/trunk` literal) — lines 5–7
- [x] Add `concurrency` group with `cancel-in-progress: true` to cancel redundant runs on fast-push branches — lines 9–11
- [x] Add `type-check` job running `tsc --noEmit` for both CLI (`aloop/cli`) and Dashboard (`aloop/cli/dashboard`) — lines 14–43
- [x] Add `cli-tests` job that builds the full CLI artifact then runs `npm test` — lines 45–68
- [x] Add `cache` and `cache-dependency-path` to `setup-node` in the existing `dashboard-tests` job — lines 79–82
