/**
 * Default loop settings — single source of truth for all hardcoded defaults.
 * These match the defaults in .aloop/pipeline.yml loop section.
 * Keep in sync with loop.sh, loop.ps1, and pipeline.yml.
 */
export const DEFAULT_LOOP_SETTINGS = {
  // Iteration control
  max_iterations: 50,
  max_stuck: 3,
  inter_iteration_sleep: 3,
  phase_retries_multiplier: 2,

  // Provider cooldown ladder (seconds per consecutive failure count)
  cooldown_ladder: [0, 120, 300, 900, 1800, 3600],
  concurrent_cap_cooldown: 120,

  // Request processing
  request_timeout: 300,
  request_poll_interval: 2,

  // Provider availability
  unavailable_sleep: 60,
  provider_timeout: 10800,

  // Health file locking
  health_lock_retry_delays_ms: [50, 100, 150, 200, 250],

  // Orchestrator-specific
  triage_interval: 5,
  scan_pass_throttle_ms: 30000,
  rate_limit_backoff: 'fixed' as 'exponential' | 'linear' | 'fixed',
  concurrency_cap: 3,

  // Phase retry behavior
  retry_backoff_linear_step_secs: 5,    // linear backoff: consecutive * this value
  retry_backoff_exponential_base: 2,    // exponential backoff: base ^ consecutive
  phase_retries_min: 2,                 // minimum MAX_PHASE_RETRIES (floor for single-provider)

  // Budget estimation (orchestrator)
  cost_per_iteration_usd: 0.50,         // default cost estimate when no real token data
  budget_approaching_threshold: 0.8,    // fraction of budget cap that triggers pause warning

  // QA coverage gate (finalizer)
  qa_coverage_gate_max_untested_pct: 30, // block exit if untested features exceed this %
} as const;
