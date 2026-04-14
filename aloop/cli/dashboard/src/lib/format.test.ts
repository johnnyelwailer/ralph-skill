import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRecord, str, numStr, toSession,
  formatSecs, formatDuration, formatDateKey, relativeTime,
  formatTokenCount, parseDurationSeconds, computeAvgDuration,
  parseLogLine, SIGNIFICANT_EVENTS,
  isImageArtifact, artifactUrl, extractModelFromOutput,
  deriveProviderHealth, slugify,
} from './format';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

describe('str', () => {
  it('returns first non-empty string value found', () => {
    expect(str({ a: 'hello' }, ['a', 'b'])).toBe('hello');
    expect(str({ b: 'world' }, ['a', 'b'])).toBe('world');
  });

  it('returns fallback when no key matches', () => {
    expect(str({}, ['a'], 'fallback')).toBe('fallback');
    expect(str({}, ['a'])).toBe('');
  });

  it('skips empty strings', () => {
    expect(str({ a: '', b: 'found' }, ['a', 'b'])).toBe('found');
  });

  it('skips whitespace-only strings', () => {
    expect(str({ a: '   ', b: 'found' }, ['a', 'b'])).toBe('found');
  });
});

describe('numStr', () => {
  it('converts finite number to string', () => {
    expect(numStr({ n: 42 }, ['n'])).toBe('42');
    expect(numStr({ n: 0 }, ['n'])).toBe('0');
  });

  it('returns trimmed string value', () => {
    expect(numStr({ n: '  7  ' }, ['n'])).toBe('7');
  });

  it('returns fallback for missing keys', () => {
    expect(numStr({}, ['n'])).toBe('--');
    expect(numStr({}, ['n'], 'N/A')).toBe('N/A');
  });

  it('tries multiple keys in order', () => {
    expect(numStr({ iterations: 5 }, ['iteration', 'iterations'])).toBe('5');
  });
});

describe('formatSecs', () => {
  it('formats seconds only', () => {
    expect(formatSecs(0)).toBe('0s');
    expect(formatSecs(59)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatSecs(60)).toBe('1m');
    expect(formatSecs(90)).toBe('1m 30s');
    expect(formatSecs(125)).toBe('2m 5s');
  });

  it('omits seconds when zero', () => {
    expect(formatSecs(120)).toBe('2m');
    expect(formatSecs(300)).toBe('5m');
  });
});

describe('formatDuration', () => {
  it('converts Ns format to human-readable', () => {
    expect(formatDuration('45s')).toBe('45s');
    expect(formatDuration('90s')).toBe('1m 30s');
  });

  it('returns input unchanged for non-matching format', () => {
    expect(formatDuration('2m 30s')).toBe('2m 30s');
    expect(formatDuration('1h')).toBe('1h');
  });
});

describe('formatDateKey', () => {
  it('returns Unknown for empty input', () => {
    expect(formatDateKey('')).toBe('Unknown');
  });

  it('formats a valid ISO timestamp', () => {
    const result = formatDateKey('2026-04-14T10:00:00Z');
    expect(result).toMatch(/Apr\s+14,?\s+2026/i);
  });
});

describe('relativeTime', () => {
  it('returns empty for empty input', () => {
    expect(relativeTime('')).toBe('');
  });

  it('returns "just now" for recent timestamp', () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe('just now');
  });

  it('returns minutes ago for past timestamp', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(past)).toBe('5m ago');
  });
});

describe('formatTokenCount', () => {
  it('formats small numbers as-is', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(0)).toBe('0');
  });

  it('formats thousands with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(15200)).toBe('15.2k');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokenCount(1_000_000)).toBe('1.0M');
    expect(formatTokenCount(2_500_000)).toBe('2.5M');
  });
});

describe('parseDurationSeconds', () => {
  it('returns null for empty string', () => {
    expect(parseDurationSeconds('')).toBeNull();
  });

  it('parses milliseconds', () => {
    expect(parseDurationSeconds('500ms')).toBe(0.5);
    expect(parseDurationSeconds('1500ms')).toBe(1.5);
  });

  it('parses seconds', () => {
    expect(parseDurationSeconds('30s')).toBe(30);
    expect(parseDurationSeconds('45.5s')).toBe(45.5);
  });

  it('parses mixed minutes and seconds', () => {
    expect(parseDurationSeconds('2m 30s')).toBe(150);
  });

  it('parses plain number', () => {
    expect(parseDurationSeconds('42')).toBe(42);
  });

  it('returns null for unparseable', () => {
    expect(parseDurationSeconds('abc')).toBeNull();
    expect(parseDurationSeconds('2h')).toBeNull();
  });
});

describe('computeAvgDuration', () => {
  it('returns empty for empty log', () => {
    expect(computeAvgDuration('')).toBe('');
  });

  it('returns empty when no iteration_complete events', () => {
    const log = JSON.stringify({ event: 'session_start' });
    expect(computeAvgDuration(log)).toBe('');
  });

  it('computes average from iteration_complete events', () => {
    const log = [
      JSON.stringify({ event: 'iteration_complete', duration: '30s' }),
      JSON.stringify({ event: 'iteration_complete', duration: '60s' }),
    ].join('\n');
    expect(computeAvgDuration(log)).toBe('45s');
  });

  it('ignores zero/negative durations', () => {
    const log = JSON.stringify({ event: 'iteration_complete', duration: '0s' });
    expect(computeAvgDuration(log)).toBe('');
  });
});

describe('SIGNIFICANT_EVENTS', () => {
  it('includes expected events', () => {
    expect(SIGNIFICANT_EVENTS.has('iteration_complete')).toBe(true);
    expect(SIGNIFICANT_EVENTS.has('session_start')).toBe(true);
    expect(SIGNIFICANT_EVENTS.has('provider_cooldown')).toBe(true);
  });

  it('does not include arbitrary events', () => {
    expect(SIGNIFICANT_EVENTS.has('some_random_event')).toBe(false);
  });
});

describe('parseLogLine', () => {
  it('returns null for empty string', () => {
    expect(parseLogLine('')).toBeNull();
    expect(parseLogLine('   ')).toBeNull();
  });

  it('parses JSON log line', () => {
    const line = JSON.stringify({
      event: 'iteration_complete',
      phase: 'build',
      provider: 'claude',
      iteration: 5,
    });
    const entry = parseLogLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.event).toBe('iteration_complete');
    expect(entry!.isSignificant).toBe(true);
    expect(entry!.isSuccess).toBe(true);
  });

  it('parses plain text as non-significant entry', () => {
    const entry = parseLogLine('plain text output');
    expect(entry).not.toBeNull();
    expect(entry!.rawObj).toBeNull();
    expect(entry!.message).toBe('plain text output');
    expect(entry!.isSignificant).toBe(false);
  });
});

describe('isImageArtifact', () => {
  it('detects image extensions', () => {
    expect(isImageArtifact({ path: 'screen.png', type: 'file', description: '' })).toBe(true);
    expect(isImageArtifact({ path: 'photo.jpg', type: 'file', description: '' })).toBe(true);
    expect(isImageArtifact({ path: 'icon.svg', type: 'file', description: '' })).toBe(true);
  });

  it('detects screenshot type', () => {
    expect(isImageArtifact({ path: 'any.txt', type: 'screenshot', description: '' })).toBe(true);
  });

  it('returns false for non-images', () => {
    expect(isImageArtifact({ path: 'output.txt', type: 'file', description: '' })).toBe(false);
    expect(isImageArtifact({ path: 'data.json', type: 'file', description: '' })).toBe(false);
  });
});

describe('artifactUrl', () => {
  it('generates correct URL', () => {
    expect(artifactUrl(3, 'output.png')).toBe('/api/artifacts/3/output.png');
  });

  it('encodes special characters in filename', () => {
    expect(artifactUrl(1, 'my file.png')).toBe('/api/artifacts/1/my%20file.png');
  });
});

describe('extractModelFromOutput', () => {
  it('returns empty for undefined', () => {
    expect(extractModelFromOutput(undefined)).toBe('');
  });

  it('extracts model from opencode header', () => {
    expect(extractModelFromOutput('> build · openrouter/hunter-alpha')).toBe('openrouter/hunter-alpha');
  });

  it('returns empty for non-matching header', () => {
    expect(extractModelFromOutput('some random text')).toBe('');
  });
});

describe('deriveProviderHealth', () => {
  it('returns empty array for empty log', () => {
    expect(deriveProviderHealth('')).toEqual([]);
  });

  it('marks provider as healthy on iteration_complete', () => {
    const log = JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-01-01T00:00:00Z' });
    const health = deriveProviderHealth(log);
    expect(health).toHaveLength(1);
    expect(health[0].name).toBe('claude');
    expect(health[0].status).toBe('healthy');
  });

  it('marks provider as cooldown on provider_cooldown', () => {
    const log = JSON.stringify({ event: 'provider_cooldown', provider: 'gemini', reason: 'rate limit', timestamp: '2026-01-01T00:00:00Z' });
    const health = deriveProviderHealth(log);
    const gemini = health.find(h => h.name === 'gemini');
    expect(gemini?.status).toBe('cooldown');
    expect(gemini?.reason).toBe('rate limit');
  });

  it('seeds configured providers as unknown', () => {
    const health = deriveProviderHealth('', ['claude', 'gemini']);
    expect(health).toHaveLength(2);
    expect(health.every(h => h.status === 'unknown')).toBe(true);
  });

  it('sorts providers alphabetically', () => {
    const log = [
      JSON.stringify({ event: 'iteration_complete', provider: 'openai', timestamp: '' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '' }),
    ].join('\n');
    const health = deriveProviderHealth(log);
    expect(health[0].name).toBe('claude');
    expect(health[1].name).toBe('openai');
  });
});

describe('slugify', () => {
  it('lowercases text', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('foo bar baz')).toBe('foo-bar-baz');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('foo--bar')).toBe('foo-bar');
  });
});

describe('toSession', () => {
  it('maps a full record to SessionSummary', () => {
    const raw = {
      session_id: 'sess-1',
      project_name: 'my-project',
      state: 'running',
      phase: 'build',
      elapsed: '5m',
      iteration: 3,
      branch: 'main',
      started_at: '2026-01-01T00:00:00Z',
      ended_at: '',
      pid: 1234,
      provider: 'claude',
      work_dir: '/tmp',
      stuck_count: 1,
    };
    const session = toSession(raw, 'fallback', true);
    expect(session.id).toBe('sess-1');
    expect(session.projectName).toBe('my-project');
    expect(session.status).toBe('running');
    expect(session.isActive).toBe(true);
    expect(session.stuckCount).toBe(1);
    expect(session.provider).toBe('claude');
  });

  it('derives project name from project_root when project_name missing', () => {
    const raw = { session_id: 's', project_root: '/home/user/my-project/' };
    const session = toSession(raw, 'fallback', false);
    expect(session.projectName).toBe('my-project');
  });
});
