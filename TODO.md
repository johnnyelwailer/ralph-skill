# Issue #170: Redispatch failure handling — escalate after N attempts, don't spin or give up

## Tasks

### Up Next

- [x] Add `redispatch_failures` and `redispatch_paused` fields to `OrchestratorIssue` interface in `orchestrate.ts` (alongside existing `rebase_attempts`, `ci_failure_retries`)

- [ ] In `launchIssues()` failure catch block: increment `redispatch_failures`, and after 3 failures post a GitHub comment ("Redispatch failed 3 times: {error}. Needs manual intervention."), add label `aloop/needs-human`, set `redispatch_paused = true`

- [ ] Skip redispatch for paused issues: in the scan loop where `needs_redispatch` issues are collected (around line 5462 of orchestrate.ts), filter out issues where `redispatch_paused === true`

- [ ] Resume detection: in the triage scan loop, detect when an issue has `redispatch_paused = true` but the `aloop/needs-human` label has been removed — reset `redispatch_paused = false` and `redispatch_failures = 0` so retries can restart

- [ ] Add tests for: failure counting, escalation at 3 failures (comment + label + paused), skip-when-paused, and resume-on-label-removal
