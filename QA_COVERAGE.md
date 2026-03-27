# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| process-requests: blocker tracking (blockers.json) | 2026-03-27 | ea766e506 | PASS | blockers.json created on first run, count increments correctly, firstSeenIteration preserved |
| process-requests: blocker persistence between iterations | 2026-03-27 | ea766e506 | PASS | blockers.json loads and updates correctly across multiple process-requests invocations |
| process-requests: diagnostics.json escalation (threshold=5) | 2026-03-27 | ea766e506 | PASS | diagnostics.json written at count=5 (fixed from 3); schema is spec-compliant array with type/message/first_seen_iteration/current_iteration/severity/suggested_fix |
| process-requests: diagnostics.json current_iteration field | 2026-03-27 | 82432eb7a | FAIL | current_iteration=1 and lastSeenIteration=1 in standalone mode (no loop-plan.json updates); correctly tracks when loop-plan.json is externally incremented. Open bug: qa/P1 |
| process-requests: ALERT.md creation | 2026-03-27 | 82432eb7a | PASS | ALERT.md fires at count=5 (threshold) as spec requires — FIXED |
| process-requests: stuck flag in orchestrator.json | 2026-03-27 | 8d0ee5afb | PASS | stuck: true written at count=5 — FIXED |
| process-requests: error handling (missing session-dir) | 2026-03-27 | ea766e506 | PASS | exits 1 with clear error when --session-dir not provided |
| process-requests: error handling (non-existent dir) | 2026-03-27 | ea766e506 | FAIL | silently exits 0 when session dir does not exist — still unfixed from prior session |
| process-requests: JSON output mode | 2026-03-27 | ea766e506 | PASS | --output json works, returns scan summary |
| process-requests: diagnostics in JSON output | 2026-03-27 | ea766e506 | FAIL | --output json does not include diagnostics/blocker summary — still unfixed from prior session |
| process-requests: blockers.json backward compat ({} init) | 2026-03-27 | ea766e506 | FAIL | initializing blockers.json as {} (empty object) causes TypeError: existingRecords.map is not a function; bug filed qa/P2 |
| label auto-creation adapter | 2026-03-27 | ea766e506 | SKIP | gh CLI blocked by aloop PATH hardening in test environment; cannot test without real GitHub access |
