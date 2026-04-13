import { describe, expect, it } from 'vitest';
import {
  artifactUrl,
  computeAvgDuration,
  deriveProviderHealth,
  extractIterationUsage,
  extractModelFromOutput,
  formatTokenCount,
  isImageArtifact,
  parseLogLine,
  parseManifest,
  parseDurationSeconds,
  slugify,
} from './App';

describe('App.tsx parsing and data helpers', () => {
  it('covers parseLogLine json and plain text branches', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-14T10:30:00Z',
      event: 'iteration_error',
      phase: 'build',
      provider: 'claude',
      model: 'sonnet',
      duration: '45s',
      iteration: '7',
      error: 'boom',
      files_changed: [{ file: 'a.ts', status: 'modified', additions: 1, deletions: 2 }],
      message: '\u001b[31mfailed\u001b[0m',
    });
    const parsed = parseLogLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.iteration).toBe(7);
    expect(parsed?.isError).toBe(true);
    expect(parsed?.message).toBe('failed');
    expect(parsed?.filesChanged[0]).toMatchObject({ path: 'a.ts', type: 'M' });
    expect(parsed?.resultDetail).toBe('boom');

    const verdict = parseLogLine(JSON.stringify({ event: 'review_verdict_read', verdict: 'reject' }));
    expect(verdict?.resultDetail).toBe('reject');

    const commit = parseLogLine(JSON.stringify({ event: 'iteration_complete', commit: 'abcdef12345' }));
    expect(commit?.resultDetail).toBe('abcdef1');

    const text = parseLogLine('\u001b[31mstderr\u001b[0m');
    expect(text?.isSignificant).toBe(false);
    expect(text?.message).toBe('stderr');

    expect(parseLogLine('   ')).toBeNull();
  });

  it('covers log parsing and provider health edge branches', () => {
    const parsed = parseLogLine(JSON.stringify({
      type: 'iteration_complete',
      iteration: 'not-a-number',
      files: [{ status: 1 }, 'skip'],
    }));
    expect(parsed?.event).toBe('iteration_complete');
    expect(parsed?.iteration).toBeNull();
    expect(parsed?.filesChanged[0]).toMatchObject({ path: '?', type: 'M' });

    const avg = computeAvgDuration([
      JSON.stringify([]),
      JSON.stringify({ event: 'iteration_complete', duration: '0s' }),
      '{"bad"',
    ].join('\n'));
    expect(avg).toBe('');

    const health = deriveProviderHealth([
      JSON.stringify({ event: 'provider_cooldown', provider: 'codex', timestamp: '2026-03-19T10:00:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'codex', timestamp: '2026-03-19T10:01:00Z' }),
      JSON.stringify({ event: 'iteration_error', provider: '', timestamp: '2026-03-19T10:02:00Z' }),
    ].join('\n'));
    expect(health.find((h) => h.name === 'codex')?.status).toBe('cooldown');
  });

  it('covers duration parsing and average computation', () => {
    expect(parseDurationSeconds('50ms')).toBe(0.05);
    expect(parseDurationSeconds('2.5s')).toBe(2.5);
    expect(parseDurationSeconds('1m 1.5s')).toBe(61.5);
    expect(parseDurationSeconds('42')).toBe(42);
    expect(parseDurationSeconds('x')).toBeNull();

    const log = [
      JSON.stringify({ event: 'iteration_complete', duration: '30s' }),
      JSON.stringify({ event: 'iteration_complete', elapsed: '90s' }),
      JSON.stringify({ event: 'iteration_complete', took: '0s' }),
      JSON.stringify({ event: 'other', duration: '999s' }),
      'not-json',
    ].join('\n');
    expect(computeAvgDuration(log)).toBe('1m');
    expect(computeAvgDuration('')).toBe('');
  });

  it('covers provider health derivation branches', () => {
    const log = [
      JSON.stringify({ event: 'provider_cooldown', provider: 'codex', timestamp: '2026-03-14T10:00:00Z', reason: 'rate_limit', consecutive_failures: 2, cooldown_until: '2026-03-14T10:02:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-14T10:01:00Z' }),
      JSON.stringify({ event: 'iteration_error', provider: 'gemini', timestamp: '2026-03-14T10:03:00Z' }),
      JSON.stringify({ event: 'provider_recovered', provider: 'codex', timestamp: '2026-03-14T10:05:00Z' }),
      'bad-line',
    ].join('\n');

    const health = deriveProviderHealth(log);
    expect(health.map((h) => h.name)).toEqual(['claude', 'codex', 'gemini']);
    expect(health.find((h) => h.name === 'codex')?.status).toBe('healthy');
    expect(health.find((h) => h.name === 'gemini')?.status).toBe('healthy');
  });

  it('covers artifact helpers and manifest parsing', () => {
    expect(isImageArtifact({ type: 'proof', path: 'img.png', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'visual_diff', path: 'noext', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'proof', path: 'notes.txt', description: '' })).toBe(false);

    expect(artifactUrl(8, 'a b.txt')).toBe('/api/artifacts/8/a%20b.txt');

    const parsed = parseManifest({
      iteration: 9,
      outputHeader: '> build · model/x',
      manifest: {
        phase: 'proof',
        summary: 'ok',
        artifacts: [
          { type: 'screenshot', path: 'screen.png', description: 'cap', metadata: { baseline: 'base.png', diff_percentage: 1.2 } },
          { bad: true },
        ],
      },
    });
    expect(parsed?.artifacts).toHaveLength(2);
    expect(parsed?.artifacts[0].metadata?.baseline).toBe('base.png');

    const fallback = parseManifest({ iteration: 10, outputHeader: '> qa · model/y', manifest: null });
    expect(fallback?.phase).toBe('proof');

    expect(parseManifest({ iteration: 11, manifest: null })).toBeNull();
  });

  it('covers model extraction and slugify', () => {
    expect(extractModelFromOutput('> build · openrouter/hunter-alpha')).toBe('openrouter/hunter-alpha');
    expect(extractModelFromOutput('line\n> qa · model/z')).toBe('model/z');
    expect(extractModelFromOutput('nope')).toBe('');
    expect(extractModelFromOutput(undefined)).toBe('');

    expect(slugify(' Hello,  World!  -- ')).toBe('-hello-world-');
  });

  it('covers extractIterationUsage', () => {
    expect(extractIterationUsage(null)).toBeNull();
    expect(extractIterationUsage({ event: 'iteration_complete', provider: 'claude' })).toBeNull();
    expect(extractIterationUsage({ cost_usd: 0, tokens_input: 100 })).toBeNull();

    const usage = extractIterationUsage({
      tokens_input: 15200,
      tokens_output: 3400,
      tokens_cache_read: 48000,
      cost_usd: 0.0034,
    });
    expect(usage).not.toBeNull();
    expect(usage!.tokens_input).toBe(15200);
    expect(usage!.tokens_output).toBe(3400);
    expect(usage!.tokens_cache_read).toBe(48000);
    expect(usage!.cost_usd).toBe(0.0034);

    const strUsage = extractIterationUsage({
      tokens_input: '5000',
      tokens_output: '1000',
      tokens_cache_read: '0',
      cost_usd: '0.002',
    });
    expect(strUsage).not.toBeNull();
    expect(strUsage!.tokens_input).toBe(5000);
    expect(strUsage!.cost_usd).toBe(0.002);
  });

  it('covers formatTokenCount', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(15200)).toBe('15.2k');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });
});
