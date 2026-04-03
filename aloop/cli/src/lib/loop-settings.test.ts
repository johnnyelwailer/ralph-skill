import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLoopSettings, type ReadonlyLoopSettings } from './loop-settings.js';
import { DEFAULT_LOOP_SETTINGS } from './defaults.js';

describe('loadLoopSettings', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'loop-settings-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns frozen object', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({ loopSettings: {} }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(Object.isFrozen(result), true);
  });

  it('returns all default values when file is missing', () => {
    const missingPath = join(tempDir, 'nonexistent.json');
    const result = loadLoopSettings(missingPath);
    
    assert.strictEqual(result.max_iterations, DEFAULT_LOOP_SETTINGS.max_iterations);
    assert.strictEqual(result.max_stuck, DEFAULT_LOOP_SETTINGS.max_stuck);
    assert.strictEqual(result.inter_iteration_sleep, DEFAULT_LOOP_SETTINGS.inter_iteration_sleep);
    assert.strictEqual(result.phase_retries_multiplier, DEFAULT_LOOP_SETTINGS.phase_retries_multiplier);
    assert.deepStrictEqual(result.cooldown_ladder, DEFAULT_LOOP_SETTINGS.cooldown_ladder);
    assert.strictEqual(result.concurrent_cap_cooldown, DEFAULT_LOOP_SETTINGS.concurrent_cap_cooldown);
    assert.strictEqual(result.request_timeout, DEFAULT_LOOP_SETTINGS.request_timeout);
    assert.strictEqual(result.request_poll_interval, DEFAULT_LOOP_SETTINGS.request_poll_interval);
    assert.strictEqual(result.unavailable_sleep, DEFAULT_LOOP_SETTINGS.unavailable_sleep);
    assert.strictEqual(result.provider_timeout, DEFAULT_LOOP_SETTINGS.provider_timeout);
    assert.deepStrictEqual(result.health_lock_retry_delays_ms, DEFAULT_LOOP_SETTINGS.health_lock_retry_delays_ms);
    assert.strictEqual(result.triage_interval, DEFAULT_LOOP_SETTINGS.triage_interval);
    assert.strictEqual(result.scan_pass_throttle_ms, DEFAULT_LOOP_SETTINGS.scan_pass_throttle_ms);
    assert.strictEqual(result.rate_limit_backoff, DEFAULT_LOOP_SETTINGS.rate_limit_backoff);
    assert.strictEqual(result.concurrency_cap, DEFAULT_LOOP_SETTINGS.concurrency_cap);
    assert.strictEqual(result.retry_backoff_linear_step_secs, DEFAULT_LOOP_SETTINGS.retry_backoff_linear_step_secs);
    assert.strictEqual(result.retry_backoff_exponential_base, DEFAULT_LOOP_SETTINGS.retry_backoff_exponential_base);
    assert.strictEqual(result.phase_retries_min, DEFAULT_LOOP_SETTINGS.phase_retries_min);
    assert.strictEqual(result.cost_per_iteration_usd, DEFAULT_LOOP_SETTINGS.cost_per_iteration_usd);
    assert.strictEqual(result.budget_approaching_threshold, DEFAULT_LOOP_SETTINGS.budget_approaching_threshold);
    assert.strictEqual(result.qa_coverage_gate_max_untested_pct, DEFAULT_LOOP_SETTINGS.qa_coverage_gate_max_untested_pct);
    assert.strictEqual(result.git_fetch_timeout_ms, DEFAULT_LOOP_SETTINGS.git_fetch_timeout_ms);
    assert.strictEqual(result.git_merge_base_timeout_ms, DEFAULT_LOOP_SETTINGS.git_merge_base_timeout_ms);
    assert.strictEqual(result.gh_cli_timeout_ms, DEFAULT_LOOP_SETTINGS.gh_cli_timeout_ms);
    assert.strictEqual(result.gh_watch_interval_secs, DEFAULT_LOOP_SETTINGS.gh_watch_interval_secs);
    assert.strictEqual(result.gh_watch_max_concurrent, DEFAULT_LOOP_SETTINGS.gh_watch_max_concurrent);
    assert.strictEqual(result.gh_feedback_max_iterations, DEFAULT_LOOP_SETTINGS.gh_feedback_max_iterations);
    assert.strictEqual(result.gh_ci_failure_persistence_limit, DEFAULT_LOOP_SETTINGS.gh_ci_failure_persistence_limit);
    assert.strictEqual(result.gh_etag_cache_ttl_ms, DEFAULT_LOOP_SETTINGS.gh_etag_cache_ttl_ms);
    assert.strictEqual(result.priority_critical, DEFAULT_LOOP_SETTINGS.priority_critical);
    assert.strictEqual(result.priority_high, DEFAULT_LOOP_SETTINGS.priority_high);
    assert.strictEqual(result.priority_low, DEFAULT_LOOP_SETTINGS.priority_low);
  });

  it('returns all default values when file is unreadable', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, 'not valid json {{{');
    const result = loadLoopSettings(planPath);
    
    assert.strictEqual(result.max_iterations, DEFAULT_LOOP_SETTINGS.max_iterations);
    assert.strictEqual(result.max_stuck, DEFAULT_LOOP_SETTINGS.max_stuck);
  });

  it('reads all fields from valid loop-plan.json with loopSettings', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    const customSettings = {
      max_iterations: 100,
      max_stuck: 5,
      inter_iteration_sleep: 10,
      phase_retries_multiplier: 3,
      cooldown_ladder: [0, 60, 180, 600, 1200, 3600],
      concurrent_cap_cooldown: 60,
      request_timeout: 600,
      request_poll_interval: 5,
      unavailable_sleep: 30,
      provider_timeout: 7200,
      health_lock_retry_delays_ms: [10, 20, 30, 40, 50],
      triage_interval: 10,
      scan_pass_throttle_ms: 45000,
      rate_limit_backoff: 'exponential' as const,
      concurrency_cap: 5,
      retry_backoff_linear_step_secs: 10,
      retry_backoff_exponential_base: 3,
      phase_retries_min: 1,
      cost_per_iteration_usd: 0.75,
      budget_approaching_threshold: 0.9,
      qa_coverage_gate_max_untested_pct: 25,
      git_fetch_timeout_ms: 20000,
      git_merge_base_timeout_ms: 5000,
      gh_cli_timeout_ms: 45000,
      gh_watch_interval_secs: 30,
      gh_watch_max_concurrent: 5,
      gh_feedback_max_iterations: 3,
      gh_ci_failure_persistence_limit: 2,
      gh_etag_cache_ttl_ms: 60000,
      priority_critical: 150,
      priority_high: 75,
      priority_low: -20,
    };
    
    writeFileSync(planPath, JSON.stringify({ loopSettings: customSettings }));
    const result = loadLoopSettings(planPath);
    
    assert.strictEqual(result.max_iterations, 100);
    assert.strictEqual(result.max_stuck, 5);
    assert.strictEqual(result.inter_iteration_sleep, 10);
    assert.strictEqual(result.phase_retries_multiplier, 3);
    assert.deepStrictEqual(result.cooldown_ladder, [0, 60, 180, 600, 1200, 3600]);
    assert.strictEqual(result.concurrent_cap_cooldown, 60);
    assert.strictEqual(result.request_timeout, 600);
    assert.strictEqual(result.request_poll_interval, 5);
    assert.strictEqual(result.unavailable_sleep, 30);
    assert.strictEqual(result.provider_timeout, 7200);
    assert.deepStrictEqual(result.health_lock_retry_delays_ms, [10, 20, 30, 40, 50]);
    assert.strictEqual(result.triage_interval, 10);
    assert.strictEqual(result.scan_pass_throttle_ms, 45000);
    assert.strictEqual(result.rate_limit_backoff, 'exponential');
    assert.strictEqual(result.concurrency_cap, 5);
    assert.strictEqual(result.retry_backoff_linear_step_secs, 10);
    assert.strictEqual(result.retry_backoff_exponential_base, 3);
    assert.strictEqual(result.phase_retries_min, 1);
    assert.strictEqual(result.cost_per_iteration_usd, 0.75);
    assert.strictEqual(result.budget_approaching_threshold, 0.9);
    assert.strictEqual(result.qa_coverage_gate_max_untested_pct, 25);
    assert.strictEqual(result.git_fetch_timeout_ms, 20000);
    assert.strictEqual(result.git_merge_base_timeout_ms, 5000);
    assert.strictEqual(result.gh_cli_timeout_ms, 45000);
    assert.strictEqual(result.gh_watch_interval_secs, 30);
    assert.strictEqual(result.gh_watch_max_concurrent, 5);
    assert.strictEqual(result.gh_feedback_max_iterations, 3);
    assert.strictEqual(result.gh_ci_failure_persistence_limit, 2);
    assert.strictEqual(result.gh_etag_cache_ttl_ms, 60000);
    assert.strictEqual(result.priority_critical, 150);
    assert.strictEqual(result.priority_high, 75);
    assert.strictEqual(result.priority_low, -20);
  });

  it('reads all fields from valid loop-plan.json with loop_settings (snake_case)', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    const customSettings = {
      max_iterations: 75,
      max_stuck: 4,
      triage_interval: 15,
      concurrency_cap: 7,
    };
    
    writeFileSync(planPath, JSON.stringify({ loop_settings: customSettings }));
    const result = loadLoopSettings(planPath);
    
    assert.strictEqual(result.max_iterations, 75);
    assert.strictEqual(result.max_stuck, 4);
    assert.strictEqual(result.triage_interval, 15);
    assert.strictEqual(result.concurrency_cap, 7);
  });

  it('parses inline array string for cooldown_ladder', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        cooldown_ladder: '[0, 120, 300, 900, 1800, 3600]',
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.deepStrictEqual(result.cooldown_ladder, [0, 120, 300, 900, 1800, 3600]);
  });

  it('parses inline array string for health_lock_retry_delays_ms', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        health_lock_retry_delays_ms: '[50, 100, 150]',
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.deepStrictEqual(result.health_lock_retry_delays_ms, [50, 100, 150]);
  });

  it('parses inline array string with spaces', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        cooldown_ladder: '[ 0 , 120 , 300 ]',
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.deepStrictEqual(result.cooldown_ladder, [0, 120, 300]);
  });

  it('falls back to default for invalid array string', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        cooldown_ladder: '[not, numbers]',
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.deepStrictEqual(result.cooldown_ladder, DEFAULT_LOOP_SETTINGS.cooldown_ladder);
  });

  it('accepts valid rate_limit_backoff values', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    
    for (const backoff of ['exponential', 'linear', 'fixed'] as const) {
      writeFileSync(planPath, JSON.stringify({
        loopSettings: { rate_limit_backoff: backoff },
      }));
      const result = loadLoopSettings(planPath);
      assert.strictEqual(result.rate_limit_backoff, backoff);
    }
  });

  it('rejects invalid rate_limit_backoff and uses default', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: { rate_limit_backoff: 'invalid' },
    }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.rate_limit_backoff, DEFAULT_LOOP_SETTINGS.rate_limit_backoff);
  });

  it('uses default when rate_limit_backoff is missing', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({ loopSettings: {} }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.rate_limit_backoff, DEFAULT_LOOP_SETTINGS.rate_limit_backoff);
  });

  it('converts string numbers to numbers', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        max_iterations: '200',
        max_stuck: '10',
        concurrency_cap: '8',
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.max_iterations, 200);
    assert.strictEqual(result.max_stuck, 10);
    assert.strictEqual(result.concurrency_cap, 8);
  });

  it('ignores null values and uses defaults', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        max_iterations: null,
        max_stuck: null,
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.max_iterations, DEFAULT_LOOP_SETTINGS.max_iterations);
    assert.strictEqual(result.max_stuck, DEFAULT_LOOP_SETTINGS.max_stuck);
  });

  it('handles empty loopSettings object', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({ loopSettings: {} }));
    const result = loadLoopSettings(planPath);
    
    assert.strictEqual(result.max_iterations, DEFAULT_LOOP_SETTINGS.max_iterations);
    assert.strictEqual(result.triage_interval, DEFAULT_LOOP_SETTINGS.triage_interval);
    assert.strictEqual(result.concurrency_cap, DEFAULT_LOOP_SETTINGS.concurrency_cap);
  });

  it('ignores loopSettings when it is an array', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({ loopSettings: [1, 2, 3] }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.max_iterations, DEFAULT_LOOP_SETTINGS.max_iterations);
  });

  it('ignores non-object loopSettings', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({ loopSettings: 'invalid' }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.max_iterations, DEFAULT_LOOP_SETTINGS.max_iterations);
  });

  it('prefers loopSettings over loop_settings', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: { max_iterations: 100 },
      loop_settings: { max_iterations: 50 },
    }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.max_iterations, 100);
  });

  it('handles empty array string for cooldown_ladder', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        cooldown_ladder: '[]',
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.deepStrictEqual(result.cooldown_ladder, DEFAULT_LOOP_SETTINGS.cooldown_ladder);
  });

  it('handles partially valid number strings', () => {
    const planPath = join(tempDir, 'loop-plan.json');
    writeFileSync(planPath, JSON.stringify({
      loopSettings: {
        max_iterations: 'not-a-number',
        max_stuck: 5,
      },
    }));
    const result = loadLoopSettings(planPath);
    assert.strictEqual(result.max_iterations, DEFAULT_LOOP_SETTINGS.max_iterations);
    assert.strictEqual(result.max_stuck, 5);
  });
});