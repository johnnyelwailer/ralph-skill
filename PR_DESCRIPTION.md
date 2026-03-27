## Summary

- Implement scan-agent self-healing and diagnostics per SPEC-ADDENDUM.md §1041-1064: blocker hash tracking, count accumulation across iterations, `diagnostics.json` array schema, `ALERT.md` at N=threshold, `stuck: true` in `orchestrator.json`, stale session cleanup from `active.json`, label auto-creation via adapter, and iteration counter increment for standalone `process-requests` invocations.
- Fix 17 pre-existing test regressions across `orchestrate.test.ts`, `dashboard.test.ts`, and `EtagCache`.
- Strengthen all Gate 2 test assertions from existence/substring checks to exact value equality.
- Add Gate 3 coverage for the `cleanStaleSessions` no-match branch.

## Files Changed

- `aloop/cli/src/lib/scan-diagnostics.ts` — new module: `trackBlockers`, `writeDiagnosticsJson`, `writeAlertMd`, `cleanStaleSessions`, `runSelfHealingAndDiagnostics`; spec-compliant schema, `DEFAULT_THRESHOLD = 5`
- `aloop/cli/src/lib/scan-diagnostics.test.ts` — 20 unit tests covering all production paths; exact value assertions throughout; new no-match-branch coverage test
- `aloop/cli/src/commands/process-requests.ts` — wires `runSelfHealingAndDiagnostics` into scan loop; `blockers.json` load/save; non-array guard; post-increment `loop-plan.json` iteration counter
- `aloop/cli/src/commands/orchestrate.ts` — extends `OrchestratorState` with `stuck?: boolean`; test fixes for `statusCheckRollup` API and related mock updates
- `aloop/cli/src/commands/dashboard.test.ts` — fixes `makeDefaultRequestSpawnSync` return type cast; updated error-message regex; packaged-assets test
- `aloop/cli/src/lib/github-monitor.ts` — corrects `EtagCache` filename to `github-etag-cache.json`

## Verification

- [x] Same blocker persists for N (default 5) iterations → `diagnostics.json` written — verified by `writeDiagnosticsJson: writes file when count >= threshold` (exact schema assertions)
- [x] `diagnostics.json` schema is array of `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}` — verified by exact field assertions in multiple tests
- [x] `stuck: true` written to `orchestrator.json` on escalation (SPEC-ADDENDUM.md:1049) — verified by `writes stuck:true to orchestrator.json when blocker count >= threshold`
- [x] `ALERT.md` written at N=threshold (not 2×threshold) — verified by `writeAlertMd: writes when count >= threshold`; QA CONFIRMED at 82432eb7a
- [x] Stale sessions cleaned from `active.json`; matched issues set to `failed` in `orchestrator.json` — verified by stale session test
- [x] Stale session with no matching `child_session` does NOT rewrite `orchestrator.json` — verified by new no-match-branch test (Gate 3 coverage)
- [x] `blockers.json` non-array guard prevents TypeError on `{}` init — QA CONFIRMED at e67019313
- [x] `loop-plan.json` iteration incremented after standalone invocation — QA CONFIRMED at aca3bd052
- [x] All 1155 unit tests pass, 0 failures, type check clean
- [ ] Dashboard integration for `diagnostics.json` display — NOT implemented (scoped to future issue per TODO)
- [ ] `no_progress` escalation / loop pause — NOT implemented (scoped to future issue per TODO)

## Proof Artifacts

Internal plumbing only — no UI changes, no HTTP endpoints, no CLI output changes. Proof via unit tests; CI confirms 0 failures.
