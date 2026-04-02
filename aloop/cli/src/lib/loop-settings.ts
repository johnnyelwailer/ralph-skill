import { readFileSync } from 'node:fs';
import { DEFAULT_LOOP_SETTINGS } from './defaults.js';

export interface LoopSettings {
  // Iteration control
  max_iterations: number;
  max_stuck: number;
  inter_iteration_sleep: number;
  phase_retries_multiplier: number;

  // Provider cooldown
  cooldown_ladder: number[];
  concurrent_cap_cooldown: number;

  // Request processing
  request_timeout: number;
  request_poll_interval: number;

  // Provider availability
  unavailable_sleep: number;
  provider_timeout: number;

  // Health file locking
  health_lock_retry_delays_ms: number[];

  // Orchestrator-specific
  triage_interval: number;
  scan_pass_throttle_ms: number;
  rate_limit_backoff: 'exponential' | 'linear' | 'fixed';
  concurrency_cap: number;

  // Phase retry behavior
  retry_backoff_linear_step_secs: number;
  retry_backoff_exponential_base: number;
  phase_retries_min: number;

  // Budget estimation
  cost_per_iteration_usd: number;
  budget_approaching_threshold: number;

  // QA coverage gate
  qa_coverage_gate_max_untested_pct: number;

  // Git/CLI timeouts (milliseconds)
  git_fetch_timeout_ms: number;
  git_merge_base_timeout_ms: number;
  gh_cli_timeout_ms: number;

  // GitHub watch/monitoring
  gh_watch_interval_secs: number;
  gh_watch_max_concurrent: number;
  gh_feedback_max_iterations: number;
  gh_ci_failure_persistence_limit: number;
  gh_etag_cache_ttl_ms: number;

  // Priority mapping from issue labels
  priority_critical: number;
  priority_high: number;
  priority_low: number;
}

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type ReadonlyLoopSettings = DeepReadonly<LoopSettings>;

const DEFAULTS: ReadonlyLoopSettings = DEFAULT_LOOP_SETTINGS as unknown as ReadonlyLoopSettings;

function readNumber(source: Record<string, unknown>, key: string, fallback: number): number {
  const val = source[key];
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function readStringEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const val = source[key];
  if (typeof val === 'string' && (allowed as readonly string[]).includes(val)) return val as T;
  return fallback;
}

function readNumberArray(source: Record<string, unknown>, key: string, fallback: number[]): number[] {
  const val = source[key];
  if (Array.isArray(val) && val.every((v) => typeof v === 'number' && !Number.isNaN(v))) {
    return val as number[];
  }
  // Handle inline array strings like "[0, 120, 300]"
  if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return fallback;
    const parts = inner.split(',').map((s) => s.trim()).filter(Boolean);
    const nums = parts.map(Number);
    if (!nums.some(Number.isNaN)) return nums;
  }
  return fallback;
}

/**
 * Load loop settings from a loop-plan.json file, falling back to defaults.
 * Returns a frozen object with all settings resolved.
 */
export function loadLoopSettings(loopPlanPath: string): ReadonlyLoopSettings {
  let raw: Record<string, unknown> = {};
  try {
    const plan = JSON.parse(readFileSync(loopPlanPath, 'utf8'));
    const s = plan?.loopSettings ?? plan?.loop_settings;
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      raw = s as Record<string, unknown>;
    }
  } catch {
    // File missing or unreadable — use all defaults
  }

  const s: LoopSettings = {
    // Iteration control
    max_iterations: readNumber(raw, 'max_iterations', DEFAULTS.max_iterations),
    max_stuck: readNumber(raw, 'max_stuck', DEFAULTS.max_stuck),
    inter_iteration_sleep: readNumber(raw, 'inter_iteration_sleep', DEFAULTS.inter_iteration_sleep),
    phase_retries_multiplier: readNumber(raw, 'phase_retries_multiplier', DEFAULTS.phase_retries_multiplier),

    // Provider cooldown
    cooldown_ladder: readNumberArray(raw, 'cooldown_ladder', [...DEFAULTS.cooldown_ladder]),
    concurrent_cap_cooldown: readNumber(raw, 'concurrent_cap_cooldown', DEFAULTS.concurrent_cap_cooldown),

    // Request processing
    request_timeout: readNumber(raw, 'request_timeout', DEFAULTS.request_timeout),
    request_poll_interval: readNumber(raw, 'request_poll_interval', DEFAULTS.request_poll_interval),

    // Provider availability
    unavailable_sleep: readNumber(raw, 'unavailable_sleep', DEFAULTS.unavailable_sleep),
    provider_timeout: readNumber(raw, 'provider_timeout', DEFAULTS.provider_timeout),

    // Health file locking
    health_lock_retry_delays_ms: readNumberArray(raw, 'health_lock_retry_delays_ms', [...DEFAULTS.health_lock_retry_delays_ms]),

    // Orchestrator-specific
    triage_interval: readNumber(raw, 'triage_interval', DEFAULTS.triage_interval),
    scan_pass_throttle_ms: readNumber(raw, 'scan_pass_throttle_ms', DEFAULTS.scan_pass_throttle_ms),
    rate_limit_backoff: readStringEnum(raw, 'rate_limit_backoff', ['exponential', 'linear', 'fixed'] as const, DEFAULTS.rate_limit_backoff),
    concurrency_cap: readNumber(raw, 'concurrency_cap', DEFAULTS.concurrency_cap),

    // Phase retry behavior
    retry_backoff_linear_step_secs: readNumber(raw, 'retry_backoff_linear_step_secs', DEFAULTS.retry_backoff_linear_step_secs),
    retry_backoff_exponential_base: readNumber(raw, 'retry_backoff_exponential_base', DEFAULTS.retry_backoff_exponential_base),
    phase_retries_min: readNumber(raw, 'phase_retries_min', DEFAULTS.phase_retries_min),

    // Budget estimation
    cost_per_iteration_usd: readNumber(raw, 'cost_per_iteration_usd', DEFAULTS.cost_per_iteration_usd),
    budget_approaching_threshold: readNumber(raw, 'budget_approaching_threshold', DEFAULTS.budget_approaching_threshold),

    // QA coverage gate
    qa_coverage_gate_max_untested_pct: readNumber(raw, 'qa_coverage_gate_max_untested_pct', DEFAULTS.qa_coverage_gate_max_untested_pct),

    // Git/CLI timeouts (milliseconds)
    git_fetch_timeout_ms: readNumber(raw, 'git_fetch_timeout_ms', DEFAULTS.git_fetch_timeout_ms),
    git_merge_base_timeout_ms: readNumber(raw, 'git_merge_base_timeout_ms', DEFAULTS.git_merge_base_timeout_ms),
    gh_cli_timeout_ms: readNumber(raw, 'gh_cli_timeout_ms', DEFAULTS.gh_cli_timeout_ms),

    // GitHub watch/monitoring
    gh_watch_interval_secs: readNumber(raw, 'gh_watch_interval_secs', DEFAULTS.gh_watch_interval_secs),
    gh_watch_max_concurrent: readNumber(raw, 'gh_watch_max_concurrent', DEFAULTS.gh_watch_max_concurrent),
    gh_feedback_max_iterations: readNumber(raw, 'gh_feedback_max_iterations', DEFAULTS.gh_feedback_max_iterations),
    gh_ci_failure_persistence_limit: readNumber(raw, 'gh_ci_failure_persistence_limit', DEFAULTS.gh_ci_failure_persistence_limit),
    gh_etag_cache_ttl_ms: readNumber(raw, 'gh_etag_cache_ttl_ms', DEFAULTS.gh_etag_cache_ttl_ms),

    // Priority mapping from issue labels
    priority_critical: readNumber(raw, 'priority_critical', DEFAULTS.priority_critical),
    priority_high: readNumber(raw, 'priority_high', DEFAULTS.priority_high),
    priority_low: readNumber(raw, 'priority_low', DEFAULTS.priority_low),
  };

  return Object.freeze(s);
}
