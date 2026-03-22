# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Tasks

### Up Next

- [x] Add `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, and `max_iterations` fields to `OrchestratorState` interface; populate them from CLI options or defaults when creating a new session (orchestrate.ts ~line 1052, `OrchestratorState` interface ~line 95)
- [ ] Replace hardcoded `iteration % 5 === 0` triage check (orchestrate.ts ~line 5267) with `iteration % (state.triage_interval ?? 5) === 0`; re-read state from file each pass so runtime edits take effect
- [ ] Replace hardcoded `'--max-iterations', '999999'` in the loop.sh spawn path (orchestrate.ts ~line 1415) with a config-driven or unlimited value (Number.MAX_SAFE_INTEGER or no flag); use `state.max_iterations` if set
- [ ] Thread `scan_pass_throttle_ms` from state into `runOrchestratorDaemonLoop` (currently uses CLI `intervalMs`); re-read state at the top of each daemon iteration so runtime config changes to the throttle take effect
- [ ] Implement `rate_limit_backoff` support in the scan loop: read strategy (exponential/linear/fixed) from state, apply appropriate sleep multiplier when a rate-limit event is detected; default to fixed/no-backoff if unset
- [ ] Allow `concurrency_cap` to be updated at runtime: re-read it from `orchestrator.json` each scan pass instead of relying solely on the initial CLI value (state is already written to file; daemon just needs to re-read it)
- [ ] Add tests covering: triage_interval read from state, scan_pass_throttle_ms hot-reload, rate_limit_backoff strategy selection, concurrency_cap runtime update
