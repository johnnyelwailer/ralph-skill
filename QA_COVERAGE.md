# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| process-requests: blocker tracking (blockers.json) | 2026-03-27 | ea766e506 | PASS | blockers.json created on first run, count increments correctly, firstSeenIteration preserved |
| process-requests: blocker persistence between iterations | 2026-03-27 | ea766e506 | PASS | blockers.json loads and updates correctly across multiple process-requests invocations |
| process-requests: diagnostics.json escalation (threshold=5) | 2026-03-27 | ea766e506 | PASS | diagnostics.json written at count=5 (fixed from 3); schema is spec-compliant array with type/message/first_seen_iteration/current_iteration/severity/suggested_fix |
| process-requests: diagnostics.json current_iteration field | 2026-03-27 | aca3bd052 | PASS | current_iteration correctly tracks lastSeenIteration in standalone mode — loop-plan.json.iteration incremented by process-requests itself on each run — FIXED |
| process-requests: ALERT.md creation | 2026-03-27 | 82432eb7a | PASS | ALERT.md fires at count=5 (threshold) as spec requires — FIXED |
| process-requests: stuck flag in orchestrator.json | 2026-03-27 | 8d0ee5afb | PASS | stuck: true written at count=5 — FIXED |
| process-requests: error handling (missing session-dir) | 2026-03-27 | ea766e506 | PASS | exits 1 with clear error when --session-dir not provided |
| process-requests: error handling (non-existent dir) | 2026-03-27 | 7bb514de3 | FAIL | silently exits 0 when session dir does not exist — still unfixed |
| process-requests: JSON output mode | 2026-03-27 | ea766e506 | PASS | --output json works, returns scan summary |
| process-requests: diagnostics in JSON output | 2026-03-27 | 7bb514de3 | FAIL | --output json does not include diagnostics/blocker summary — still unfixed |
| process-requests: blockers.json backward compat ({} init) | 2026-03-27 | e67019313 | PASS | {} is now coerced to [] — no TypeError, blockers.json correctly initialized as array — FIXED |
| test suite (now param removal + TS cast) | 2026-03-27 | 7bb514de3 | PASS | 1153/1154 tests pass, 0 fail — writeDiagnosticsJson now param removed + type cast both pass |
| process-requests: diagnostics.json writing (now param removed) | 2026-03-27 | 7bb514de3 | PASS | diagnostics.json still written correctly after unused now param removed from writeDiagnosticsJson |
| label auto-creation adapter | 2026-03-27 | ea766e506 | SKIP | gh CLI blocked by aloop PATH hardening in test environment; cannot test without real GitHub access |
