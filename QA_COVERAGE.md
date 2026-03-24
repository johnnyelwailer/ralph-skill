# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| process-requests: unrecognized file quarantine | 2026-03-24 | 7921f19d | PASS | Files moved to requests/failed/ with reason: unsupported_type |
| process-requests: malformed JSON quarantine | 2026-03-24 | 7921f19d | PASS | Raw string content preserved as payload_summary |
| process-requests: known files not quarantined | 2026-03-24 | 7921f19d | PASS | epic-decomposition-results.json processed normally |
| process-requests: log goes to stderr in JSON mode | 2026-03-24 | 7921f19d | PASS | JSON output clean; log message on stderr |
| process-requests: empty/array/large files quarantined | 2026-03-24 | 7921f19d | PASS | All edge cases quarantined correctly |
| detectCurrentBlockers unit tests | 2026-03-24 | 7921f19d | PASS | 7 subtests pass — child_stuck, ci_failure, pr_conflict, dispatch_failure |
| updateBlockerSignatures unit tests | 2026-03-24 | 7921f19d | PASS | 4 subtests pass — add, increment, remove on merge, retain |
| computeOverallHealth unit tests | 2026-03-24 | 7921f19d | PASS | 4 subtests pass — healthy/degraded/critical thresholds |
| runOrchestratorScanPass blocker tracking unit tests | 2026-03-24 | 7921f19d | PASS | blocker_signatures written; diagnostics.json at threshold; queue/000-critical-alert.md asserted |
| diagnostics.json CLI-level write | never | — | — | No CLI path to trigger scan pass without GitHub; covered by unit tests |
| ALERT.md CLI-level write | never | — | — | No CLI path to trigger scan pass without GitHub; covered by unit tests |
