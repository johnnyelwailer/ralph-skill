# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Acceptance Criteria Status

All acceptance criteria verified as complete:

- [x] `.github/workflows/ci.yml` contains `on.push.branches` with `master`, `agent/*`, and `aloop/*`
- [x] `.github/workflows/ci.yml` contains `on.pull_request.branches` with `master`, `agent/*`, and `aloop/*`
- [x] `.github/workflows/ci.yml` defines all four jobs: `cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`
- [x] None of the four required jobs declares `needs` (jobs are independently runnable)
- [x] `README.md` contains the CI badge URL `https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] Workflow file `.github/workflows/ci.yml` has `name: CI`

## Completed

- [x] Implement as described in the issue — all deliverables already present in `.github/workflows/ci.yml` and `README.md` [reviewed: gates 1-9 pass]
