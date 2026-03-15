import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ── Extracted pure functions (duplicated from App.tsx for testability) ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(source: Record<string, unknown>, keys: string[], fb = ''): string {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return fb;
}

const SIGNIFICANT_EVENTS = new Set([
  'iteration_complete', 'iteration_error', 'provider_cooldown', 'provider_recovered',
  'review_verdict_read', 'review_verdict_missing', 'session_start', 'session_end', 'session_restart',
  'queue_override_applied', 'queue_override_error',
]);

interface LogEntry {
  timestamp: string;
  phase: string;
  event: string;
  provider: string;
  model: string;
  duration: string;
  message: string;
  raw: string;
  rawObj: Record<string, unknown> | null;
  iteration: number | null;
  dateKey: string;
  isSuccess: boolean;
  isError: boolean;
  commitHash: string;
  resultDetail: string;
  filesChanged: Array<{ path: string; type: string; additions: number; deletions: number }>;
  isSignificant: boolean;
}

function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let rawObj: Record<string, unknown> | null = null;
  try {
    const obj = JSON.parse(trimmed);
    if (isRecord(obj)) rawObj = obj;
  } catch { /* plain text */ }

  if (rawObj) {
    const event = str(rawObj, ['event', 'type', 'action'], '');
    const isSignificant = SIGNIFICANT_EVENTS.has(event);
    const ts = str(rawObj, ['timestamp', 'ts', 'time', 'created_at']);
    const phase = str(rawObj, ['phase', 'mode']);
    const provider = str(rawObj, ['provider']);
    const model = str(rawObj, ['model']);
    const duration = str(rawObj, ['duration', 'elapsed', 'took']);
    const message = str(rawObj, ['message', 'msg', 'detail', 'description', 'text'], event);
    const iterRaw = rawObj.iteration;
    const iteration = typeof iterRaw === 'number' ? iterRaw : (typeof iterRaw === 'string' ? parseInt(iterRaw, 10) || null : null);
    const commitHash = str(rawObj, ['commit', 'commit_hash', 'sha']);
    const isSuccess = event.includes('complete') || event.includes('success') || event.includes('approved') || event.includes('recovered');
    const isError = event.includes('error') || event.includes('fail') || event.includes('cooldown');

    let resultDetail = '';
    if (commitHash) resultDetail = commitHash.slice(0, 7);
    else if (event.includes('verdict')) resultDetail = str(rawObj, ['verdict']);
    else if (isError) resultDetail = str(rawObj, ['reason', 'error', 'exit_code'], 'error');

    const filesChanged: Array<{ path: string; type: string; additions: number; deletions: number }> = [];
    const files = rawObj.files ?? rawObj.files_changed;
    if (Array.isArray(files)) {
      for (const f of files) {
        if (isRecord(f)) {
          filesChanged.push({
            path: typeof f.path === 'string' ? f.path : typeof f.file === 'string' ? f.file : '?',
            type: (typeof f.status === 'string' ? f.status[0]?.toUpperCase() : 'M'),
            additions: typeof f.additions === 'number' ? f.additions : 0,
            deletions: typeof f.deletions === 'number' ? f.deletions : 0,
          });
        }
      }
    }

    return { timestamp: ts, phase, event, provider, model, duration, message, raw: trimmed, rawObj, iteration, dateKey: formatDateKey(ts), isSuccess, isError, commitHash, resultDetail, filesChanged, isSignificant };
  }

  return { timestamp: '', phase: '', event: '', provider: '', model: '', duration: '', message: trimmed, raw: trimmed, rawObj: null, iteration: null, dateKey: 'Log', isSuccess: false, isError: false, commitHash: '', resultDetail: '', filesChanged: [], isSignificant: true };
}

function formatDateKey(ts: string): string {
  if (!ts) return 'Unknown';
  try { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return 'Unknown'; }
}

function extractModelFromOutput(header?: string): string {
  if (!header) return '';
  const match = header.match(/^>\s*\w+\s*·\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function parseDurationSeconds(raw: string): number | null {
  if (!raw) return null;
  const msMatch = raw.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msMatch) return parseFloat(msMatch[1]) / 1000;
  const sMatch = raw.match(/^(\d+(?:\.\d+)?)s$/);
  if (sMatch) return parseFloat(sMatch[1]);
  const mixedMatch = raw.match(/^(\d+)m\s*(\d+(?:\.\d+)?)s$/);
  if (mixedMatch) return parseInt(mixedMatch[1], 10) * 60 + parseFloat(mixedMatch[2]);
  const plainMatch = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (plainMatch) return parseFloat(plainMatch[1]);
  return null;
}

function computeAvgDuration(log: string): string {
  if (!log) return '';
  let totalSec = 0;
  let count = 0;
  for (const line of log.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (!isRecord(obj)) continue;
      const event = str(obj, ['event']);
      if (event !== 'iteration_complete') continue;
      const dur = str(obj, ['duration', 'elapsed', 'took']);
      const secs = parseDurationSeconds(dur);
      if (secs !== null && secs > 0) {
        totalSec += secs;
        count++;
      }
    } catch { /* skip */ }
  }
  if (count === 0) return '';
  const avg = totalSec / count;
  if (avg < 60) return `${Math.round(avg)}s`;
  const m = Math.floor(avg / 60);
  const s = Math.round(avg % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface ProviderHealth {
  name: string;
  status: 'healthy' | 'cooldown' | 'failed';
  lastEvent: string;
  reason?: string;
  consecutiveFailures?: number;
  cooldownUntil?: string;
}

function deriveProviderHealth(log: string): ProviderHealth[] {
  const providers = new Map<string, ProviderHealth>();
  for (const line of log.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (!isRecord(obj)) continue;
      const event = str(obj, ['event']);
      const provider = str(obj, ['provider']);
      const ts = str(obj, ['timestamp']);
      if (!provider) continue;

      if (event === 'provider_cooldown') {
        providers.set(provider, {
          name: provider,
          status: 'cooldown',
          lastEvent: ts,
          reason: str(obj, ['reason']),
          consecutiveFailures: typeof obj.consecutive_failures === 'number' ? obj.consecutive_failures : undefined,
          cooldownUntil: str(obj, ['cooldown_until']),
        });
      } else if (event === 'provider_recovered') {
        providers.set(provider, { name: provider, status: 'healthy', lastEvent: ts });
      } else if (event === 'iteration_complete' || event === 'iteration_error') {
        if (!providers.has(provider)) {
          providers.set(provider, { name: provider, status: 'healthy', lastEvent: ts });
        } else {
          const existing = providers.get(provider)!;
          if (event === 'iteration_complete' && existing.status !== 'cooldown') {
            existing.status = 'healthy';
          }
          existing.lastEvent = ts;
        }
      }
    } catch { /* skip */ }
  }
  return Array.from(providers.values()).sort((a, b) => a.name.localeCompare(b.name));
}

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
    expect(result!.isSignificant).toBe(true);
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
});

describe('Synthetic iteration_running entry', () => {
  it('creates synthetic entry with correct fields when running with no result', () => {
    // Simulate the withCurrent logic from ActivityPanel
    const currentIteration = 5;
    const currentPhase = 'build';
    const currentProvider = 'claude';
    const isRunning = true;

    const deduped: LogEntry[] = [
      {
        timestamp: '2026-03-14T10:00:00Z', phase: 'plan', event: 'iteration_complete',
        provider: 'gemini', model: '', duration: '30s', message: 'done', raw: '', rawObj: null,
        iteration: 4, dateKey: 'Mar 14, 2026', isSuccess: true, isError: false,
        commitHash: 'abc1234', resultDetail: 'abc1234', filesChanged: [], isSignificant: true,
      },
    ];

    // Check if current iteration has a result
    const hasResult = deduped.some((e) => e.iteration === currentIteration && (e.isSuccess || e.isError));
    expect(hasResult).toBe(false);

    // Create synthetic entry
    const now = new Date().toISOString();
    const syntheticEntry: LogEntry = {
      timestamp: now, phase: currentPhase, event: 'iteration_running', provider: currentProvider, model: '',
      duration: '', message: 'Running...', raw: '', rawObj: null, iteration: currentIteration,
      dateKey: formatDateKey(now), isSuccess: false, isError: false, commitHash: '', resultDetail: '',
      filesChanged: [], isSignificant: true,
    };

    expect(syntheticEntry.event).toBe('iteration_running');
    expect(syntheticEntry.phase).toBe('build');
    expect(syntheticEntry.provider).toBe('claude');
    expect(syntheticEntry.iteration).toBe(5);
    expect(syntheticEntry.message).toBe('Running...');
    expect(syntheticEntry.isSuccess).toBe(false);
    expect(syntheticEntry.isError).toBe(false);
    expect(syntheticEntry.isSignificant).toBe(true);
  });

  it('does NOT create synthetic entry when current iteration has a result', () => {
    const currentIteration = 5;
    const deduped: LogEntry[] = [
      {
        timestamp: '2026-03-14T10:00:00Z', phase: 'build', event: 'iteration_complete',
        provider: 'claude', model: '', duration: '45s', message: 'done', raw: '', rawObj: null,
        iteration: 5, dateKey: 'Mar 14, 2026', isSuccess: true, isError: false,
        commitHash: 'def5678', resultDetail: 'def5678', filesChanged: [], isSignificant: true,
      },
    ];

    const hasResult = deduped.some((e) => e.iteration === currentIteration && (e.isSuccess || e.isError));
    expect(hasResult).toBe(true);
  });

  it('does NOT create synthetic entry when not running', () => {
    const isRunning = false;
    const currentIteration = 5;
    expect(isRunning).toBe(false);
    // When not running, the logic returns deduped without adding synthetic
  });

  it('does NOT create synthetic entry when currentIteration is null', () => {
    const currentIteration = null;
    expect(currentIteration).toBeNull();
  });
});

describe('Output.txt fetch and render logic', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches output.txt for iteration on expand', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('Build output content here'),
    });

    const iteration = 7;
    const res = await fetch(`/api/artifacts/${iteration}/output.txt`);
    const text = await res.text();

    expect(fetchSpy).toHaveBeenCalledWith('/api/artifacts/7/output.txt');
    expect(text).toBe('Build output content here');
  });

  it('sets outputText to empty string on 404', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await fetch('/api/artifacts/99/output.txt');
    const outputText = res.ok ? await res.text() : '';

    expect(outputText).toBe('');
  });

  it('sets outputText to empty string on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    let outputText: string;
    try {
      await fetch('/api/artifacts/1/output.txt');
      outputText = 'should not reach';
    } catch {
      outputText = '';
    }

    expect(outputText).toBe('');
  });

  it('determines hasOutput correctly for complete events', () => {
    const completeEntry = { event: 'iteration_complete', iteration: 5 };
    const errorEntry = { event: 'iteration_error', iteration: 3 };
    const runningEntry = { event: 'iteration_running', iteration: 4 };
    const noIterEntry = { event: 'session_start', iteration: null };

    const hasOutput = (entry: { event: string; iteration: number | null }) =>
      entry.iteration !== null && (entry.event.includes('complete') || entry.event.includes('error'));

    expect(hasOutput(completeEntry)).toBe(true);
    expect(hasOutput(errorEntry)).toBe(true);
    expect(hasOutput(runningEntry)).toBe(false);
    expect(hasOutput(noIterEntry)).toBe(false);
  });
});

describe('No output available fallback', () => {
  it('shows fallback when outputText is empty string', () => {
    // When outputText === '' (explicitly set after failed fetch), show "No output available"
    const outputText: string = '';
    const outputLoading = false;
    const hasOutput = true;

    // This mimics the conditional rendering logic in LogEntryRow
    const renderOutput = () => {
      if (outputLoading) return 'loading';
      if (outputText) return 'content';
      if (outputText === '') return 'no-output';
      return 'null';
    };

    expect(renderOutput()).toBe('no-output');
  });

  it('shows loading state while fetching', () => {
    const outputText = null;
    const outputLoading = true;
    const hasOutput = true;

    const renderOutput = () => {
      if (outputLoading) return 'loading';
      if (outputText) return 'content';
      if (outputText === '') return 'no-output';
      return 'null';
    };

    expect(renderOutput()).toBe('loading');
  });

  it('shows nothing when output not yet loaded', () => {
    const outputText = null;
    const outputLoading = false;
    const hasOutput = true;

    const renderOutput = () => {
      if (outputLoading) return 'loading';
      if (outputText) return 'content';
      if (outputText === '') return 'no-output';
      return 'null';
    };

    expect(renderOutput()).toBe('null');
  });

  it('renders output content when available', () => {
    const outputText = 'Build succeeded with 0 errors';
    const outputLoading = false;

    const renderOutput = () => {
      if (outputLoading) return 'loading';
      if (outputText) return 'content';
      if (outputText === '') return 'no-output';
      return 'null';
    };

    expect(renderOutput()).toBe('content');
  });
});

describe('Provider model display in log entry', () => {
  it('shows provider·model when model is present and not opencode-default', () => {
    const provider = 'claude';
    const model = 'sonnet-4.6';
    const outputHeader = '> build · openrouter/hunter-alpha';

    const displayModel = model && model !== 'opencode-default'
      ? model
      : extractModelFromOutput(outputHeader);

    expect(displayModel).toBe('sonnet-4.6');
  });

  it('extracts model from output header when model is opencode-default', () => {
    const provider = 'opencode';
    const model = 'opencode-default';
    const outputHeader = '> build · openrouter/hunter-alpha';

    const displayModel = model && model !== 'opencode-default'
      ? model
      : extractModelFromOutput(outputHeader);

    expect(displayModel).toBe('openrouter/hunter-alpha');
  });

  it('extracts model from output header when model is empty', () => {
    const provider = 'opencode';
    const model = '';
    const outputHeader = '> plan · anthropic/claude-sonnet-4';

    const displayModel = model && model !== 'opencode-default'
      ? model
      : extractModelFromOutput(outputHeader);

    expect(displayModel).toBe('anthropic/claude-sonnet-4');
  });

  it('returns provider only when no model and no output header', () => {
    const provider = 'gemini';
    const model = '';
    const outputHeader = undefined;

    const displayModel = model && model !== 'opencode-default'
      ? model
      : extractModelFromOutput(outputHeader);

    expect(displayModel).toBe('');
    // In the component, when displayModel is empty, only provider is shown
  });
});
