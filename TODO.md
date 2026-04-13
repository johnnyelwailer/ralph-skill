# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Fix `cli-tests` build step to explicitly exclude `build:dashboard` (use `npm run clean && npm run build:server && npm run build:shebang && npm run build:templates && npm run build:bin && npm run build:agents`)
- [x] Remove `dashboard-e2e` job (fifth job not in spec) — workflow must have exactly four jobs
- [x] Trim `loop-script-tests` to minimal bats-only step: install bats + `bats loop.bats`
- [x] Verify README CI badge targets `actions/workflows/ci.yml/badge.svg` [reviewed: gates 1-9 pass]
