# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| process-requests: unrecognized file quarantine | 2026-03-24 | d05d35aa | PASS | CLI smoke test + regression; mystery-file.json → failed/ with reason: unsupported_type |
| process-requests: malformed JSON quarantine | 2026-03-24 | 7921f19d | PASS | Raw string content preserved as payload_summary |
| process-requests: known files not quarantined | 2026-03-24 | 7921f19d | PASS | epic-decomposition-results.json processed normally |
| process-requests: log goes to stderr in JSON mode | 2026-03-24 | 7921f19d | PASS | JSON output clean; log message on stderr |
| process-requests: empty/array/large files quarantined | 2026-03-24 | 7921f19d | PASS | All edge cases quarantined correctly |
| process-requests: cr-analysis-result not quarantined | 2026-03-24 | c68cb2d7 | PASS | cr-analysis-result-5.json routed to processed/ not failed/ |
| TypeScript type check (tsc --noEmit) | 2026-03-24 | 46f8fb20 | PASS | Zero TS errors |
| detectCurrentBlockers unit tests | 2026-03-24 | c68cb2d7 | PASS | 7 subtests pass — child_stuck, ci_failure, pr_conflict, dispatch_failure |
| updateBlockerSignatures unit tests | 2026-03-24 | c68cb2d7 | PASS | 4 subtests pass — add, increment, remove on merge, retain |
| computeOverallHealth unit tests | 2026-03-24 | c68cb2d7 | PASS | 4 subtests pass — healthy/degraded/critical thresholds |
| runOrchestratorScanPass blocker tracking unit tests | 2026-03-24 | 46f8fb20 | PASS | 6 subtests pass — 348/373 total pass (25 pre-existing fails, unchanged) |
| selfHealKnownBlockers unit tests | 2026-03-24 | 46f8fb20 | PASS | 7/7 subtests pass — missing labels (gh label create), missing config.json (derived from meta.json), permission errors; self_heal_attempt events logged from scan pass |
| dashboard alert banner (degraded/critical) | 2026-03-24 | 46f8fb20 | PASS | 9/9 vitest tests pass: null→no banner, healthy→no banner, degraded→amber, critical→red, dismiss, undefined health, empty blockers list, no suggested_fix, +N more |
| diagnostics.json field names (spec compliance) | 2026-03-24 | 86315a80 | PASS | spec-compliant schema verified; severity=critical branch covered |
| diagnostics.json severity=critical branch | 2026-03-24 | 86315a80 | PASS | pre-seed occurrence_count=9, scan pass → 10, assert severity===critical; subtest 6 passes |
| diagnostics.json CLI-level write | never | — | — | No CLI path to trigger scan pass without GitHub; covered by unit tests |
| ALERT.md CLI-level write | never | — | — | No CLI path to trigger scan pass without GitHub; covered by unit tests |
| processRequestsCommand Phase 1f wiring | 2026-03-24 | 4a730407 | PASS | 2/2 wiring tests pass: post_comment routed + moved to processed/ via processRequestsCommand |
| stuck flag in orchestrator.json | 2026-03-24 | 4a730407 | PASS | Unit test "sets stuck: true in orchestrator.json when persistent blockers detected" passes |
