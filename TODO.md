# Issue #35: Phase control & retry logic: verification and hardening

## Tasks

### Up Next

- [x] Add `stderr_tail` capture to Bash `invoke_provider` in `loop.sh` — before `rm -f "$tmp_stderr"` (line 1499), capture `tail -n "${ALOOP_STDERR_TAIL_LINES:-20}" "$tmp_stderr"` into a global `LAST_PROVIDER_STDERR_TAIL`. Then add `"stderr_tail" "$LAST_PROVIDER_STDERR_TAIL"` to the `iteration_error` log entry at line 2296. Initialize `LAST_PROVIDER_STDERR_TAIL=""` at the top of `invoke_provider` and clear it on the success path.

- [ ] Add `stderr_tail` capture to PowerShell `Invoke-Provider` in `loop.ps1` — when a provider returns non-zero exit code (lines ~677-752), extract `($result.Error -split '\n' | Select-Object -Last ([int]($env:ALOOP_STDERR_TAIL_LINES ?? 20))) -join '\n'` into `$script:lastProviderStderrTail`. Initialize `$script:lastProviderStderrTail = $null` near line 965. Add `stderr_tail = $script:lastProviderStderrTail` to the `iteration_error` log entry at line 2356.

- [ ] Add `stderr_tail` tests to `loop.tests.ps1` — extend the `'loop.sh — retry-same-phase behavioral'` Describe block (and/or the PS1 behavioral tests) with an It block that verifies: when a provider emits stderr before failing, the `iteration_error` log entry includes a non-empty `stderr_tail` field. The fake provider script should write to stderr (`echo "test error output" >&2`) before exiting non-zero.

- [ ] Add a dedicated Bash shell integration script `aloop/bin/loop_phase_control.tests.sh` covering the three core retry/advance scenarios end-to-end against `loop.sh`: (1) success→advance: one successful plan iteration advances CYCLE_POSITION; (2) failure→retry-same: one failed iteration does NOT advance CYCLE_POSITION; (3) exhaustion→advance: N+1 consecutive failures trigger `phase_retry_exhausted` log event and advance CYCLE_POSITION. Use the same fake-provider pattern as `loop_branch_coverage.tests.sh` (source functions, stub providers). Must run non-interactively and exit 0 on pass.

### Completed

- [x] Prior review (5a4f553): all gates 1-9 pass — retry-without-advance, provider-rotation, MAX_PHASE_RETRIES formula, prerequisite-miss schema, queue-precedence, exhaustion-behavior all verified correct in existing code.
