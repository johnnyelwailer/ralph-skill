# Issue #94: Pipeline must be 100% data/config driven — no hardcoded intervals or thresholds

## Tasks

- [x] Implement as described in the issue

## Summary

All pipeline intervals and thresholds are now configurable via `.aloop/pipeline.yml`:

- Iteration control: `max_iterations`, `max_stuck`, `inter_iteration_sleep`, `phase_retries_multiplier`
- Cooldown ladder: `cooldown_ladder`, `concurrent_cap_cooldown`
- Request processing: `request_timeout`, `request_poll_interval`
- Provider settings: `unavailable_sleep`, `provider_timeout`
- Health locking: `health_lock_retry_delays_ms`
- Orchestrator: `triage_interval`, `scan_pass_throttle_ms`, `rate_limit_backoff`, `concurrency_cap`
- Phase retries: `retry_backoff_linear_step_secs`, `retry_backoff_exponential_base`, `phase_retries_min`
- Budget: `cost_per_iteration_usd`, `budget_approaching_threshold`
- QA gate: `qa_coverage_gate_max_untested_pct`
- Git/CLI timeouts: `git_fetch_timeout_ms`, `git_merge_base_timeout_ms`, `gh_cli_timeout_ms`
- GitHub monitoring: `gh_watch_interval_secs`, `gh_watch_max_concurrent`, `gh_feedback_max_iterations`, `gh_ci_failure_persistence_limit`, `gh_etag_cache_ttl_ms`
- Priority mapping: `priority_critical`, `priority_high`, `priority_low`

Defaults are defined in `aloop/cli/src/lib/defaults.ts` and loaded from `loop-plan.json` at runtime. Hot-reload is supported via `meta.json` in orchestrator sessions.
