import { describe, it, expect } from 'vitest';
import { deriveProviderHealth } from './lib/deriveProviderHealth';

describe('deriveProviderHealth', () => {
  it('returns empty array for empty log', () => {
    expect(deriveProviderHealth('')).toEqual([]);
  });

  it('derives healthy status from iteration_complete', () => {
    const log = JSON.stringify({
      event: 'iteration_complete',
      provider: 'claude',
      timestamp: '2026-03-14T10:00:00Z',
    });
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(1);
    expect(health[0].name).toBe('claude');
    expect(health[0].status).toBe('healthy');
  });

  it('derives cooldown status from provider_cooldown', () => {
    const log = JSON.stringify({
      event: 'provider_cooldown',
      provider: 'codex',
      reason: 'rate_limit',
      consecutive_failures: 3,
      cooldown_until: '2026-03-14T11:00:00Z',
      timestamp: '2026-03-14T10:30:00Z',
    });
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(1);
    expect(health[0].name).toBe('codex');
    expect(health[0].status).toBe('cooldown');
    expect(health[0].reason).toBe('rate_limit');
    expect(health[0].consecutiveFailures).toBe(3);
  });

  it('recovers provider via provider_recovered event', () => {
    const log = [
      JSON.stringify({ event: 'provider_cooldown', provider: 'gemini', reason: 'timeout', timestamp: '2026-03-14T10:00:00Z' }),
      JSON.stringify({ event: 'provider_recovered', provider: 'gemini', timestamp: '2026-03-14T10:30:00Z' }),
    ].join('\n');
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(1);
    expect(health[0].status).toBe('healthy');
  });

  it('keeps cooldown status when iteration_complete follows cooldown (no provider_recovered)', () => {
    const log = [
      JSON.stringify({ event: 'provider_cooldown', provider: 'gemini', reason: 'timeout', timestamp: '2026-03-14T10:00:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'gemini', timestamp: '2026-03-14T10:30:00Z' }),
    ].join('\n');
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(1);
    // iteration_complete does NOT reset cooldown — only provider_recovered does
    expect(health[0].status).toBe('cooldown');
    expect(health[0].lastEvent).toBe('2026-03-14T10:30:00Z');
  });

  it('tracks multiple providers', () => {
    const log = [
      JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-14T10:00:00Z' }),
      JSON.stringify({ event: 'provider_cooldown', provider: 'codex', reason: 'auth', timestamp: '2026-03-14T10:01:00Z' }),
      JSON.stringify({ event: 'iteration_error', provider: 'gemini', timestamp: '2026-03-14T10:02:00Z' }),
    ].join('\n');
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(3);
    expect(health.map(h => h.name)).toEqual(['claude', 'codex', 'gemini']);
    expect(health[0].status).toBe('healthy');
    expect(health[1].status).toBe('cooldown');
    expect(health[2].status).toBe('healthy');
  });

  it('skips malformed lines gracefully', () => {
    const log = 'not json\n' + JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-14T10:00:00Z' });
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(1);
    expect(health[0].name).toBe('claude');
  });

  it('skips entries without provider field', () => {
    const log = JSON.stringify({ event: 'iteration_complete', timestamp: '2026-03-14T10:00:00Z' });
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(0);
  });

  it('includes configured providers with unknown status when no log events exist', () => {
    const health = deriveProviderHealth('', ['claude', 'codex', 'gemini']);
    expect(health).toHaveLength(3);
    expect(health.map(h => h.name)).toEqual(['claude', 'codex', 'gemini']);
    expect(health.every(h => h.status === 'unknown')).toBe(true);
    expect(health.every(h => h.lastEvent === '')).toBe(true);
  });

  it('merges configured providers with log-derived health', () => {
    const log = JSON.stringify({
      event: 'iteration_complete',
      provider: 'claude',
      timestamp: '2026-03-14T10:00:00Z',
    });
    const health = deriveProviderHealth(log, ['claude', 'codex', 'gemini']);
    expect(health).toHaveLength(3);
    const claude = health.find(h => h.name === 'claude')!;
    const codex = health.find(h => h.name === 'codex')!;
    const gemini = health.find(h => h.name === 'gemini')!;
    expect(claude.status).toBe('healthy');
    expect(codex.status).toBe('unknown');
    expect(gemini.status).toBe('unknown');
  });

  it('overrides unknown status with log-derived status for configured providers', () => {
    const log = [
      JSON.stringify({ event: 'provider_cooldown', provider: 'codex', reason: 'rate_limit', timestamp: '2026-03-14T10:00:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-14T10:01:00Z' }),
    ].join('\n');
    const health = deriveProviderHealth(log, ['claude', 'codex', 'gemini']);
    expect(health).toHaveLength(3);
    expect(health.find(h => h.name === 'claude')!.status).toBe('healthy');
    expect(health.find(h => h.name === 'codex')!.status).toBe('cooldown');
    expect(health.find(h => h.name === 'gemini')!.status).toBe('unknown');
  });

  it('includes non-configured providers that appear in logs', () => {
    const log = JSON.stringify({
      event: 'iteration_complete',
      provider: 'opencode',
      timestamp: '2026-03-14T10:00:00Z',
    });
    const health = deriveProviderHealth(log, ['claude']);
    expect(health).toHaveLength(2);
    expect(health.map(h => h.name)).toEqual(['claude', 'opencode']);
    expect(health.find(h => h.name === 'opencode')!.status).toBe('healthy');
    expect(health.find(h => h.name === 'claude')!.status).toBe('unknown');
  });

  it('handles undefined configuredProviders same as before', () => {
    const log = JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-14T10:00:00Z' });
    const health = deriveProviderHealth(log, undefined);
    expect(health).toHaveLength(1);
    expect(health[0].name).toBe('claude');
    expect(health[0].status).toBe('healthy');
  });

  it('filters empty strings from configuredProviders', () => {
    const health = deriveProviderHealth('', ['claude', '', 'codex']);
    expect(health).toHaveLength(2);
    expect(health.map(h => h.name)).toEqual(['claude', 'codex']);
  });
});
