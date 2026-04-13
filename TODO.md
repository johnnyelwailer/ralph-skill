# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed

- [x] Add `agent/*` and `aloop/*` branch patterns to `on.push.branches` in `.github/workflows/ci.yml` (ci.yml:5 — verified: `['master', 'agent/*', 'aloop/*']`)
- [x] Add `agent/*` and `aloop/*` branch patterns to `on.pull_request.branches` in `.github/workflows/ci.yml` (ci.yml:7 — verified: `['master', 'agent/*', 'aloop/*']`)
- [x] Ensure all four required jobs exist independently: `type-check` (line 14), `cli-tests` (line 45), `dashboard-tests` (line 70), `loop-script-tests` (line 91) — no `needs:` on any job
- [x] Workflow `name: CI` is stable (ci.yml:1)
- [x] README badge targets `actions/workflows/ci.yml/badge.svg` (README.md:1 — verified)
