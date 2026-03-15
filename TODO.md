# Project TODO

## Current Phase: Review Gate Closure (P0) + Spec-Compliance Cleanup

### In Progress
- [x] [review][high] Create root `VERSIONS.md` with authoritative dependency/runtime version table so Gate 8 can validate version compliance.

### Up Next
- [x] [runtime][high] Implement provenance commit trailers in both `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` (`Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session`) and add/adjust tests to lock behavior.
- [ ] [dashboard][medium] Enforce SPEC docs-tab rule: show only docs with non-empty content in tab lists while preserving overflow behavior.
- [ ] [dashboard][medium] Add targeted tests for dashboard behavior touched recently (`DocsPanel` non-empty filtering and related UI expectations) to prevent Gate 2 regressions.
- [ ] [runtime][medium] Investigate and fix loop shell arithmetic/log-path warnings observed during `loop_provenance.tests.sh` (`log.jsonl.raw` missing path and `0\n0` arithmetic parse errors).

### Deferred
- [ ] [dashboard][low] Broader unit coverage expansion for `App.tsx` interaction paths.
- [ ] [dashboard][low] Raise/verify branch coverage in `aloop/cli/src/commands/dashboard.ts` beyond current gate minimums.
- [ ] [dashboard][low] Repair broken E2E `smoke.spec.ts` flow once core P0 gates are green.

### Completed
- [x] [runtime][high] Implement provenance commit trailers in both `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` (`Aloop-Agent`, `Aloop-Iteration`, `Aloop-Session`) and add/adjust tests to lock behavior.
- [x] [review] Gate 6 artifact drift for iter-11 resolved (artifacts verified present).
- [x] [dashboard] Keep provider health as docs-panel tab (spec-aligned; no sidebar move needed).
- [x] [dashboard] `M/A/D/R` file-type indicators are present in expanded commit rows.
- [x] [dashboard] Per-iteration duration display is present in activity rows.
- [x] [review] Gate 3: `plan.ts` branch coverage >=80% (verified 96.29%).
- [x] [review] Gate 3: `yaml.ts` branch coverage >=90% (verified 96.29%).
- [x] [review] Gate 3: `compile-loop-plan.ts` branch coverage >=80% (verified 90.58%).
- [x] [review] Gate 3: `requests.ts` branch coverage >=80% (verified 84.09%).
- [x] [review] Gate 3: `gh.ts` branch coverage >=80% (verified 81.59%).

## Blocked
