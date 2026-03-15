# Project TODO

## Current Phase: Loop & Orchestrator Core → then Dashboard

### In Progress (P0 — Core Reliability & Coverage)

- [x] [review] Gate 3: Raise `plan.ts` branch coverage to >=80% (currently 73.91%). Add tests for `forceReviewNext`, `forceProofNext`, `forcePlanNext` mutation branches. (priority: high)
- [ ] [review] Gate 3: Raise `yaml.ts` branch coverage to >=90% (currently 73.33%). (priority: high)
- [ ] [review] Gate 3: Raise `compile-loop-plan.ts` branch coverage to >=80% (currently 78.66%). (priority: medium)
- [ ] [review] Gate 6: Missing proof artifacts for iteration 11 (`gh-test-output.txt`, `derive-mode-test.txt`, `cycle-resolution-test.txt`, `frontmatter-parse-test.txt`, `cycle-integration-test.txt`, `aloop-mention-grep.txt`). (priority: high)
- [ ] [review] Gate 8: `VERSIONS.md` is missing — create authoritative version table for the project. (priority: medium)
- [ ] [runtime][high] Add provenance tagging — every agent commit includes `Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session` trailers in both `loop.sh` and `loop.ps1`. (priority: high)

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

- [x] [review] Gate 1: Dashboard `stuck_count` visible in sidebar tooltip, header HoverCard, and StatusDot indicator.
- [x] [review] Gate 1: Dashboard session elapsed context (avg duration) in header.
- [x] [review] Gate 4: Remove copy-paste duplication in `dashboard.ts:247-264` — extracted `resolvePid` helper.
- [x] [review] Gate 1: Docs overflow ellipsis menu implemented.
- [x] [review] Gate 5: Fix duplicate `import path` in `orchestrate.test.ts`.
- [x] [review] Gate 3: Raise `requests.ts` branch coverage to >=80% (verified at 84.09%).
- [x] [review] Gate 1: Add `M/A/D/R` change type badges to commit detail view (initial work).
- [x] [review] Gate 3: Verify `gh.ts` branch coverage is >=80% (verified at 81.59%).
- [x] [loop][critical] Add `queue/` folder check before cycle in both `loop.sh` and `loop.ps1`.
- [x] [loop][critical] Add requests/ wait loop in both `loop.sh` and `loop.ps1`.
- [x] [loop][critical] Fix exit state parity: success → `exited`, interrupt/limit → `stopped`.
- [x] [loop][high] Fix `STUCK_COUNT` reset on successful iteration.
- [x] [bug][high] Fix CLI resume semantics for `aloop start <session-id> --launch resume`.
- [x] [runtime][high] Implement loop-plan.json compiler (`compile-loop-plan.ts`).
- [x] [runtime][high] Implement request processing for all 11 request types.
- [x] [orchestrator][high] Implement orchestrator core (dispatch, monitor, triage).
- [x] [gh-workflows][high] Implement `aloop gh start/watch/status/stop` commands.
- [x] [pipeline][high] Create `.aloop/pipeline.yml` and `.aloop/agents/`.
- [x] [orchestrator][high] Create `PROMPT_orch_*.md` templates.
