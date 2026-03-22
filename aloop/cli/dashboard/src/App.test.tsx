import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { 
  findBaselineIterations, 
  isRecord, 
  str, 
  parseLogLine, 
  formatDateKey, 
  extractModelFromOutput, 
  parseDurationSeconds, 
  computeAvgDuration, 
  deriveProviderHealth,
  numStr,
  toSession,
  formatSecs,
  formatDuration,
  relativeTime,
  stripAnsi,
  isImageArtifact,
  artifactUrl,
  slugify,
  parseManifest
} from './AppView';

// ── Tests ──

describe('parseLogLine', () => {
  it('returns null for empty string', () => {
    expect(parseLogLine('')).toBeNull();
    expect(parseLogLine('   ')).toBeNull();
  });

  it('parses JSON log line with all fields', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-14T10:30:00Z',
      event: 'iteration_complete',
      phase: 'build',
      provider: 'claude',
      model: 'sonnet-4.6',
      duration: '45s',
      iteration: 7,
      commit: 'abc123def456',
      message: 'Built feature X',
    });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('iteration_complete');
    expect(result!.phase).toBe('build');
    expect(result!.provider).toBe('claude');
    expect(result!.model).toBe('sonnet-4.6');
    expect(result!.duration).toBe('45s');
    expect(result!.iteration).toBe(7);
    expect(result!.commitHash).toBe('abc123def456');
    expect(result!.resultDetail).toBe('abc123d');
    expect(result!.isSuccess).toBe(true);
    expect(result!.isError).toBe(false);
    expect(result!.isSignificant).toBe(true);
  });

  it('parses error event with reason', () => {
    const line = JSON.stringify({
      event: 'iteration_error',
      phase: 'build',
      provider: 'codex',
      reason: 'rate limit exceeded',
      iteration: 3,
    });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
    expect(result!.isSuccess).toBe(false);
    expect(result!.resultDetail).toBe('rate limit exceeded');
  });

  it('parses cooldown event as error', () => {
    const line = JSON.stringify({
      event: 'provider_cooldown',
      provider: 'gemini',
      reason: 'timeout',
    });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
    expect(result!.resultDetail).toBe('timeout');
  });

  it('parses session_start as significant', () => {
    const line = JSON.stringify({ event: 'session_start', timestamp: '2026-03-14T08:00:00Z' });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.isSignificant).toBe(true);
  });

  it('marks non-significant events correctly', () => {
    const line = JSON.stringify({ event: 'frontmatter_applied', provider: 'claude' });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.isSignificant).toBe(false);
  });

  it('parses file changes array', () => {
    const line = JSON.stringify({
      event: 'iteration_complete',
      files: [
        { path: 'src/foo.ts', status: 'M', additions: 10, deletions: 3 },
        { path: 'src/bar.ts', status: 'A', additions: 42 },
      ],
    });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.filesChanged).toHaveLength(2);
    expect(result!.filesChanged[0]).toEqual({ path: 'src/foo.ts', type: 'M', additions: 10, deletions: 3 });
    expect(result!.filesChanged[1]).toEqual({ path: 'src/bar.ts', type: 'A', additions: 42, deletions: 0 });
  });

  it('parses plain text line as non-JSON entry', () => {
    const result = parseLogLine('some plain text output');
    expect(result).not.toBeNull();
    expect(result!.rawObj).toBeNull();
    expect(result!.message).toBe('some plain text output');
    expect(result!.isSignificant).toBe(false);
  });

  it('parses iteration as string', () => {
    const line = JSON.stringify({ event: 'iteration_complete', iteration: '5' });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.iteration).toBe(5);
  });

  it('returns null for invalid iteration string', () => {
    const line = JSON.stringify({ event: 'iteration_complete', iteration: 'abc' });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.iteration).toBeNull();
  });

  it('uses ts/time/created_at as timestamp fallbacks', () => {
    const line1 = JSON.stringify({ event: 'test', ts: '2026-01-01T00:00:00Z' });
    expect(parseLogLine(line1)!.timestamp).toBe('2026-01-01T00:00:00Z');

    const line2 = JSON.stringify({ event: 'test', time: '2026-02-01T00:00:00Z' });
    expect(parseLogLine(line2)!.timestamp).toBe('2026-02-01T00:00:00Z');

    const line3 = JSON.stringify({ event: 'test', created_at: '2026-03-01T00:00:00Z' });
    expect(parseLogLine(line3)!.timestamp).toBe('2026-03-01T00:00:00Z');
  });

  it('uses files_changed as fallback for files', () => {
    const line = JSON.stringify({
      event: 'iteration_complete',
      files_changed: [{ file: 'src/x.ts', status: 'D', deletions: 20 }],
    });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.filesChanged).toHaveLength(1);
    expect(result!.filesChanged[0].path).toBe('src/x.ts');
    expect(result!.filesChanged[0].type).toBe('D');
  });

  it('handles file entry with missing status defaulting to M', () => {
    const line = JSON.stringify({
      event: 'iteration_complete',
      files: [{ path: 'src/x.ts', additions: 5 }],
    });
    const result = parseLogLine(line);
    expect(result!.filesChanged[0].type).toBe('M');
  });

  it('parses verdict event detail', () => {
    const line = JSON.stringify({ event: 'review_verdict_read', verdict: 'approved', provider: 'claude' });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.resultDetail).toBe('approved');
    expect(result!.isSignificant).toBe(true);
  });
});

describe('extractModelFromOutput', () => {
  it('returns empty string for undefined', () => {
    expect(extractModelFromOutput(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractModelFromOutput('')).toBe('');
  });

  it('extracts model from opencode header format', () => {
    expect(extractModelFromOutput('> build · openrouter/hunter-alpha')).toBe('openrouter/hunter-alpha');
  });

  it('extracts model from header with different phase', () => {
    expect(extractModelFromOutput('> plan · anthropic/claude-sonnet-4-20250514')).toBe('anthropic/claude-sonnet-4-20250514');
  });

  it('extracts model from multiline header (first line)', () => {
    const header = '> review · gemini-2.5-pro\nsome other content';
    expect(extractModelFromOutput(header)).toBe('gemini-2.5-pro');
  });

  it('returns empty for non-matching header', () => {
    expect(extractModelFromOutput('some random text')).toBe('');
  });

  it('returns empty for header without bullet separator', () => {
    expect(extractModelFromOutput('> build openrouter/hunter-alpha')).toBe('');
  });

  it('handles model with slashes and hyphens', () => {
    expect(extractModelFromOutput('> proof · google/gemini-flash-1.5')).toBe('google/gemini-flash-1.5');
  });
});

describe('parseDurationSeconds', () => {
  it('returns null for empty string', () => {
    expect(parseDurationSeconds('')).toBeNull();
  });

  it('parses milliseconds', () => {
    expect(parseDurationSeconds('1500ms')).toBe(1.5);
    expect(parseDurationSeconds('500ms')).toBe(0.5);
  });

  it('parses seconds', () => {
    expect(parseDurationSeconds('30s')).toBe(30);
    expect(parseDurationSeconds('45.5s')).toBe(45.5);
  });

  it('parses mixed minutes and seconds', () => {
    expect(parseDurationSeconds('2m 30s')).toBe(150);
    expect(parseDurationSeconds('1m 0.5s')).toBe(60.5);
  });

  it('parses plain number as seconds', () => {
    expect(parseDurationSeconds('42')).toBe(42);
    expect(parseDurationSeconds('3.14')).toBe(3.14);
  });

  it('returns null for unparseable string', () => {
    expect(parseDurationSeconds('abc')).toBeNull();
    expect(parseDurationSeconds('2 hours')).toBeNull();
  });
});

describe('computeAvgDuration', () => {
  it('returns empty string for empty log', () => {
    expect(computeAvgDuration('')).toBe('');
  });

  it('returns empty string when no iteration_complete events', () => {
    const log = JSON.stringify({ event: 'session_start' }) + '\n' +
                JSON.stringify({ event: 'iteration_error', duration: '10s' });
    expect(computeAvgDuration(log)).toBe('');
  });

  it('computes average from iteration_complete events', () => {
    const log = [
      JSON.stringify({ event: 'iteration_complete', duration: '30s' }),
      JSON.stringify({ event: 'iteration_complete', duration: '60s' }),
      JSON.stringify({ event: 'iteration_error', duration: '999s' }),
    ].join('\n');
    expect(computeAvgDuration(log)).toBe('45s');
  });

  it('formats as minutes when average >= 60s', () => {
    const log = [
      JSON.stringify({ event: 'iteration_complete', duration: '90s' }),
      JSON.stringify({ event: 'iteration_complete', duration: '150s' }),
    ].join('\n');
    expect(computeAvgDuration(log)).toBe('2m');
  });

  it('ignores entries with zero or negative durations', () => {
    const log = JSON.stringify({ event: 'iteration_complete', duration: '0s' });
    expect(computeAvgDuration(log)).toBe('');
  });

  it('skips malformed JSON lines', () => {
    const log = 'not json\n' + JSON.stringify({ event: 'iteration_complete', duration: '20s' });
    expect(computeAvgDuration(log)).toBe('20s');
  });
});

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

describe('numStr', () => {
  it('returns number as string', () => {
    expect(numStr({ count: 5 }, ['count'])).toBe('5');
  });

  it('returns trimmed string value', () => {
    expect(numStr({ count: '  42  ' }, ['count'])).toBe('42');
  });

  it('returns fallback for missing key', () => {
    expect(numStr({}, ['count'])).toBe('--');
  });

  it('tries multiple keys in order', () => {
    expect(numStr({ iterations: 10 }, ['iteration', 'iterations'])).toBe('10');
  });
});

describe('toSession', () => {
  it('maps full session record', () => {
    const raw = {
      session_id: 'sess-123',
      project_name: 'my-project',
      state: 'running',
      phase: 'build',
      elapsed: '5m',
      iteration: 3,
      branch: 'feature/x',
      started_at: '2026-03-14T10:00:00Z',
      ended_at: '',
      pid: 12345,
      provider: 'claude',
      work_dir: '/tmp/work',
      stuck_count: 2,
    };
    const s = toSession(raw, 'fallback', true);
    expect(s.id).toBe('sess-123');
    expect(s.status).toBe('running');
    expect(s.isActive).toBe(true);
    expect(s.stuckCount).toBe(2);
  });
});

describe('formatSecs', () => {
  it('formats seconds only', () => {
    expect(formatSecs(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatSecs(125)).toBe('2m 5s');
  });
});

describe('relativeTime', () => {
  it('returns "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe('just now');
  });
});

describe('stripAnsi', () => {
  it('strips ANSI color codes', () => {
    expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
  });
});

describe('isImageArtifact', () => {
  it('detects PNG files', () => {
    expect(isImageArtifact({ path: 'screenshot.png', type: 'file', description: '' })).toBe(true);
  });
});

describe('artifactUrl', () => {
  it('generates correct URL', () => {
    expect(artifactUrl(7, 'output.txt')).toBe('/api/artifacts/7/output.txt');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
});

describe('parseManifest', () => {
  it('parses full manifest with artifacts', () => {
    const manifest = {
      phase: 'build',
      summary: 'Added feature X',
      artifacts: [
        { type: 'screenshot', path: 'screen.png', description: 'Dashboard view' },
      ],
    };
    const result = parseManifest({ iteration: 3, manifest });
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('build');
  });
});

describe('findBaselineIterations', () => {
  const mkManifest = (iteration: number, paths: string[]) => ({
    iteration,
    phase: 'proof',
    summary: '',
    artifacts: paths.map((p) => ({ type: 'screenshot', path: p, description: '' })),
    outputHeader: ''
  });

  it('returns prior iterations with matching artifact path, newest first', () => {
    const manifests = [
      mkManifest(2, ['dashboard.png']),
      mkManifest(4, ['dashboard.png']),
      mkManifest(7, ['dashboard.png']),
    ];
    expect(findBaselineIterations('dashboard.png', 7, manifests as any[])).toEqual([4, 2]);
  });
});
