# Project TODO

## Current Phase: Loop & Orchestrator Core → then Dashboard

### In Progress (P0 — Core Reliability & Coverage)

- [ ] [review] Gate 8: `VERSIONS.md` is missing — create authoritative version table for the project. (priority: medium)
- [ ] [runtime][high] Add provenance tagging — every agent commit includes `Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session` trailers in both `loop.sh` and `loop.ps1`. (priority: high)
- [x] [review] Gate 6: Missing proof artifacts for iteration 11 — verified they ARE present in artifacts/iter-11/. (priority: low)

### Up Next (P1 — Dashboard UX Polish)

- [ ] [dashboard][medium] Move per-provider health to dedicated left-pane sidebar tab (separate from Docs). (priority: medium)
- [ ] [dashboard][medium] Move sidebar expand/collapse toggle button to be vertically centered with header title row. (priority: medium)
- [ ] [dashboard][medium] Filter out empty documentation files from Docs tab list. (priority: medium)
- [ ] [dashboard][medium] Add `M/A/D/R` change type badges to commit detail view. (priority: medium)
- [ ] [dashboard][medium] Add per-iteration duration to log rows. (priority: medium)

### Deferred (P2 — Dashboard Test Coverage)

- [ ] [dashboard][low] Unit tests for `App.tsx` logic.
- [ ] [dashboard][low] Backend `dashboard.ts` branch coverage.
- [ ] [dashboard][low] Fix broken E2E tests in `smoke.spec.ts`.

### Completed

- [x] [review] Gate 3: Raise `plan.ts` branch coverage to >=80% (verified at 96.29%). [reviewed: gates 1-7 pass]
- [x] [review] Gate 3: Raise `yaml.ts` branch coverage to >=90% (verified at 96.29%). [reviewed: gates 1-7 pass]
- [x] [review] Gate 3: Raise `compile-loop-plan.ts` branch coverage to >=80% (verified at 90.58%). [reviewed: gates 1-7 pass]
- [x] [review] Gate 1: Dashboard `stuck_count` visible in sidebar tooltip, header HoverCard, and StatusDot indicator. [reviewed: gates 1-7 pass]
- [x] [review] Gate 1: Dashboard session elapsed context (avg duration) in header. [reviewed: gates 1-7 pass]
- [x] [review] Gate 4: Remove copy-paste duplication in `dashboard.ts:247-264` — extracted `resolvePid` helper. [reviewed: gates 1-7 pass]
- [x] [review] Gate 1: Docs overflow ellipsis menu implemented. [reviewed: gates 1-7 pass]
- [x] [review] Gate 5: Fix duplicate `import path` in `orchestrate.test.ts`. [reviewed: gates 1-7 pass]
- [x] [review] Gate 3: Raise `requests.ts` branch coverage to >=80% (verified at 84.09%). [reviewed: gates 1-7 pass]
- [x] [review] Gate 3: Verify `gh.ts` branch coverage is >=80% (verified at 81.59%). [reviewed: gates 1-7 pass]

