# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` to `on.push.branches` in `.github/workflows/ci.yml` — enables CI on child loop branches
- [x] Add `agent/*` and `aloop/*` to `on.pull_request.branches` in `.github/workflows/ci.yml` — enables CI gating on PRs from agent branches
- [x] Ensure four required jobs exist with no `needs:` dependencies: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests` — all run in parallel
- [x] Verify `name: CI` is stable for README badge reference
- [x] Verify README badge targets `actions/workflows/ci.yml/badge.svg`
