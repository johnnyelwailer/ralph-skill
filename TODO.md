# Issue #35: Phase control & retry logic: verification and hardening

## Tasks

### Up Next

- [x] Add `stderr_tail` field to PowerShell `iteration_error` log entries
  - `Invoke-ProviderProcess` returns `$result.Error` (full stderr string) but it's discarded after the `throw`
  - Before each provider `throw`, capture `$script:lastProviderStderrTail = ($result.Error -split "\`n" | Select-Object -Last ($env:ALOOP_STDERR_TAIL_LINES ?? 20)) -join "\`n"`
  - Initialize `$script:lastProviderStderrTail = $null` alongside `$script:lastProviderOutputText` (line ~965)
  - Clear it on success (alongside `$script:lastProviderOutputText` clear)
  - Add `stderr_tail = [string]$script:lastProviderStderrTail` to the `iteration_error` Write-LogEntry at line 2356–2361
  - Use `$env:ALOOP_STDERR_TAIL_LINES` (default 20) to bound captured lines — no magic constants (Constitution Rule 15)

- [ ] Add test coverage for `stderr_tail` in `iteration_error` entries
  - Extend Bash retry test suite in `loop.tests.ps1` (`Describe 'loop.sh — retry-same-phase behavioral'`): assert that `iteration_error` entries for provider failures include a non-empty `stderr_tail` field
  - Extend PowerShell retry test suite (`Describe 'loop.ps1 — retry-same-phase behavioral'`): same assertion
  - Update the fake provider scripts to write a short stderr line on forced failures (e.g. `echo "forced plan failure" >&2` in Bash; write to stderr in PS fake provider) so the tail is non-empty and testable

### Verified (no changes needed)

- [x] Failed iterations do NOT advance cycle position except on retry exhaustion — confirmed in `register_iteration_failure` (loop.sh:691–750) and `Register-IterationFailure` (loop.ps1:1004–1055): `advance_cycle_position`/`Advance-CyclePosition` only called after exhaustion threshold
- [x] Retry-same-phase uses next round-robin provider — iteration counter increments on every pass (including retries), so `RR_NEXT_INDEX` (Bash) and `($IterationNumber - 1) % count` (PS) naturally rotate providers; test assertions at loop.tests.ps1:572 and 1352 confirm
- [x] Default `MAX_PHASE_RETRIES` = `len(providers) × 2` in round-robin mode — confirmed at loop.sh:1926–1940 and loop.ps1:978 with `[Math]::Max(2, count * 2)`
- [x] `phase_prerequisite_miss` events include `requested`, `actual`, `reason` — confirmed at loop.sh:399,405,414 and loop.ps1:286–308
- [x] Bash `iteration_error` includes `stderr_tail` — confirmed at loop.sh:1500 (capture via `tail -n "${ALOOP_STDERR_TAIL_LINES:-20}"`) and loop.sh:2302 (log field)
- [x] Queue overrides remain higher priority than cycle position — `run_queue_if_present`/`Run-QueueIfPresent` called before mode resolution in both runners; no cycle advance on queue execution
- [x] After `MAX_PHASE_RETRIES`, cycle advances with `phase_retry_exhausted` log — confirmed in both exhaustion paths; `failure_reasons` array included
- [x] Integration tests for success→advance, failure→retry-same, exhaustion→advance — covered in `loop.tests.ps1` sections 3 (Bash, lines 387–588) and 4 (PS, lines 1163–1371)
