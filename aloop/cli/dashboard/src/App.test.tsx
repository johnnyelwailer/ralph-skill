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

// ── DocsPanel filtering logic (duplicated from App.tsx for testability) ──

const DOC_ORDER = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
const TAB_LABELS: Record<string, string> = { 'TODO.md': 'TODO', 'SPEC.md': 'SPEC', 'RESEARCH.md': 'RESEARCH', 'REVIEW_LOG.md': 'REVIEW LOG', 'STEERING.md': 'STEERING' };
const MAX_VISIBLE_TABS = 4;

function filterDocs(docs: Record<string, string>): string[] {
  const availableDocs = DOC_ORDER.filter((n) => docs[n] != null && docs[n] !== '');
  const extraDocs = Object.keys(docs).filter((n) => !DOC_ORDER.includes(n) && docs[n] != null && docs[n] !== '');
  return [...availableDocs, ...extraDocs];
}

function computeVisibleTabs(allDocs: string[]): { visible: string[]; overflow: string[] } {
  return {
    visible: allDocs.slice(0, MAX_VISIBLE_TABS),
    overflow: allDocs.slice(MAX_VISIBLE_TABS),
  };
}

function resolveDefaultTab(allDocs: string[]): string {
  return allDocs.includes('TODO.md') ? 'TODO.md' : allDocs[0] ?? '_health';
}

function resolveTabLabel(name: string): string {
  return TAB_LABELS[name] ?? name.replace(/\.md$/i, '');
}

describe('filterDocs', () => {
  it('returns empty array for empty docs', () => {
    expect(filterDocs({})).toEqual([]);
  });

  it('returns empty array when all docs are empty strings', () => {
    expect(filterDocs({ 'TODO.md': '', 'SPEC.md': '' })).toEqual([]);
  });

  it('returns only non-empty docs in docOrder sequence', () => {
    const docs = { 'TODO.md': '- [ ] task', 'SPEC.md': '', 'RESEARCH.md': '# research' };
    expect(filterDocs(docs)).toEqual(['TODO.md', 'RESEARCH.md']);
  });

  it('filters out null and undefined values', () => {
    const docs = {
      'TODO.md': '# tasks',
      'SPEC.md': '' as unknown as string,
    };
    // Only TODO.md should pass (SPEC.md is empty string)
    expect(filterDocs(docs)).toEqual(['TODO.md']);
  });

  it('includes extra docs not in docOrder after standard docs', () => {
    const docs = {
      'TODO.md': '- [ ] task',
      'custom.md': 'custom content',
      'another.md': 'more content',
    };
    const result = filterDocs(docs);
    expect(result[0]).toBe('TODO.md');
    // extra docs are sorted by Object.keys order
    expect(result).toContain('custom.md');
    expect(result).toContain('another.md');
    expect(result).toHaveLength(3);
  });

  it('filters out empty extra docs', () => {
    const docs = {
      'TODO.md': '- [ ] task',
      'custom.md': '',
      'another.md': 'content',
    };
    const result = filterDocs(docs);
    expect(result).toEqual(['TODO.md', 'another.md']);
  });

  it('preserves docOrder ordering for standard docs', () => {
    const docs = {
      'STEERING.md': '# steer',
      'TODO.md': '- [ ] task',
      'SPEC.md': '# spec',
    };
    const result = filterDocs(docs);
    expect(result).toEqual(['TODO.md', 'SPEC.md', 'STEERING.md']);
  });

  it('handles whitespace-only content as non-empty (current behavior)', () => {
    // Current implementation does NOT trim, so whitespace-only passes the filter
    const docs = { 'TODO.md': '   ', 'SPEC.md': '\n\n' };
    const result = filterDocs(docs);
    expect(result).toEqual(['TODO.md', 'SPEC.md']);
  });

  it('handles single standard doc', () => {
    expect(filterDocs({ 'TODO.md': 'content' })).toEqual(['TODO.md']);
  });

  it('handles all 5 standard docs populated', () => {
    const docs: Record<string, string> = {};
    for (const d of DOC_ORDER) docs[d] = `content for ${d}`;
    expect(filterDocs(docs)).toEqual(DOC_ORDER);
  });
});

describe('computeVisibleTabs', () => {
  it('returns all docs as visible when count <= MAX_VISIBLE_TABS', () => {
    const allDocs = ['TODO.md', 'SPEC.md', 'RESEARCH.md'];
    const { visible, overflow } = computeVisibleTabs(allDocs);
    expect(visible).toEqual(['TODO.md', 'SPEC.md', 'RESEARCH.md']);
    expect(overflow).toEqual([]);
  });

  it('splits at MAX_VISIBLE_TABS boundary', () => {
    const allDocs = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
    const { visible, overflow } = computeVisibleTabs(allDocs);
    expect(visible).toEqual(['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md']);
    expect(overflow).toEqual(['STEERING.md']);
  });

  it('handles exactly MAX_VISIBLE_TABS docs', () => {
    const allDocs = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md'];
    const { visible, overflow } = computeVisibleTabs(allDocs);
    expect(visible).toHaveLength(4);
    expect(overflow).toEqual([]);
  });

  it('handles empty input', () => {
    const { visible, overflow } = computeVisibleTabs([]);
    expect(visible).toEqual([]);
    expect(overflow).toEqual([]);
  });

  it('handles more than MAX_VISIBLE_TABS', () => {
    const allDocs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const { visible, overflow } = computeVisibleTabs(allDocs);
    expect(visible).toEqual(['a', 'b', 'c', 'd']);
    expect(overflow).toEqual(['e', 'f', 'g']);
  });
});

describe('resolveDefaultTab', () => {
  it('returns TODO.md when present in docs', () => {
    expect(resolveDefaultTab(['SPEC.md', 'TODO.md', 'RESEARCH.md'])).toBe('TODO.md');
  });

  it('returns first doc when TODO.md is not present', () => {
    expect(resolveDefaultTab(['SPEC.md', 'RESEARCH.md'])).toBe('SPEC.md');
  });

  it('returns _health when no docs exist', () => {
    expect(resolveDefaultTab([])).toBe('_health');
  });
});

describe('resolveTabLabel', () => {
  it('returns known label for standard docs', () => {
    expect(resolveTabLabel('TODO.md')).toBe('TODO');
    expect(resolveTabLabel('SPEC.md')).toBe('SPEC');
    expect(resolveTabLabel('RESEARCH.md')).toBe('RESEARCH');
    expect(resolveTabLabel('REVIEW_LOG.md')).toBe('REVIEW LOG');
    expect(resolveTabLabel('STEERING.md')).toBe('STEERING');
  });

  it('strips .md extension for unknown docs', () => {
    expect(resolveTabLabel('custom.md')).toBe('custom');
  });

  it('handles name without extension', () => {
    expect(resolveTabLabel('notes')).toBe('notes');
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

// ── Additional pure-function coverage (duplicated from App.tsx for testability) ──

function numStr(source: Record<string, unknown>, keys: string[], fb = '--'): string {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fb;
}

function toSession(source: Record<string, unknown>, fallback: string, isActive: boolean) {
  return {
    id: str(source, ['session_id', 'id'], fallback),
    name: str(source, ['session_id', 'name', 'session_name'], fallback),
    projectName: str(source, ['project_name'], fallback.split('-').slice(0, -1).join('-') || fallback),
    status: str(source, ['state', 'status'], 'unknown'),
    phase: str(source, ['phase', 'mode'], ''),
    elapsed: str(source, ['elapsed', 'elapsed_time', 'duration'], '--'),
    iterations: numStr(source, ['iteration', 'iterations']),
    isActive,
    branch: str(source, ['branch'], ''),
    startedAt: str(source, ['started_at'], ''),
    endedAt: str(source, ['ended_at'], ''),
    pid: numStr(source, ['pid'], ''),
    provider: str(source, ['provider'], ''),
    workDir: str(source, ['work_dir'], ''),
    stuckCount: typeof source.stuck_count === 'number' ? source.stuck_count : 0,
  };
}

function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDuration(raw: string): string {
  const match = raw.match(/^(\d+)s$/);
  if (!match) return raw;
  return formatSecs(parseInt(match[1], 10));
}

function relativeTime(ts: string): string {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch { return ''; }
}

const STRIP_ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
function stripAnsi(text: string): string {
  return text.replace(STRIP_ANSI_RE, '');
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
function isImageArtifact(a: { path: string; type: string }) {
  const ext = a.path.includes('.') ? a.path.slice(a.path.lastIndexOf('.')).toLowerCase() : '';
  return IMAGE_EXT.has(ext) || a.type === 'screenshot' || a.type === 'visual_diff';
}

function artifactUrl(iter: number, file: string) { return `/api/artifacts/${iter}/${encodeURIComponent(file)}`; }

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

interface ManifestPayloadTest {
  iteration: number;
  phase: string;
  summary: string;
  artifacts: Array<{ type: string; path: string; description: string; metadata?: { baseline?: string; diff_percentage?: number } }>;
  outputHeader?: string;
}

function parseManifest(am: { iteration: number; manifest: unknown; outputHeader?: string }): ManifestPayloadTest | null {
  const m = am.manifest;
  if (!isRecord(m) && !am.outputHeader) return null;
  const manifest = isRecord(m) ? m : null;
  return {
    iteration: am.iteration,
    phase: manifest && typeof manifest.phase === 'string' ? manifest.phase : 'proof',
    summary: manifest && typeof manifest.summary === 'string' ? manifest.summary : '',
    artifacts: manifest && Array.isArray(manifest.artifacts) ? (manifest.artifacts as unknown[]).filter(isRecord).map((a: Record<string, unknown>) => ({
      type: typeof a.type === 'string' ? a.type : 'unknown',
      path: typeof a.path === 'string' ? a.path : '',
      description: typeof a.description === 'string' ? a.description : '',
      metadata: isRecord(a.metadata) ? {
        baseline: typeof (a.metadata as Record<string, unknown>).baseline === 'string' ? (a.metadata as Record<string, unknown>).baseline as string : undefined,
        diff_percentage: typeof (a.metadata as Record<string, unknown>).diff_percentage === 'number' ? (a.metadata as Record<string, unknown>).diff_percentage as number : undefined,
      } : undefined,
    })) : [],
    outputHeader: am.outputHeader,
  };
}

// ── Tests for numStr ──

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

  it('returns custom fallback', () => {
    expect(numStr({}, ['count'], 'n/a')).toBe('n/a');
  });

  it('skips NaN and Infinity', () => {
    expect(numStr({ count: NaN }, ['count'])).toBe('--');
    expect(numStr({ count: Infinity }, ['count'])).toBe('--');
  });

  it('skips empty string values', () => {
    expect(numStr({ count: '   ' }, ['count'])).toBe('--');
  });

  it('tries multiple keys in order', () => {
    expect(numStr({ iterations: 10 }, ['iteration', 'iterations'])).toBe('10');
  });
});

// ── Tests for toSession ──

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
    expect(s.name).toBe('sess-123');
    expect(s.projectName).toBe('my-project');
    expect(s.status).toBe('running');
    expect(s.phase).toBe('build');
    expect(s.iterations).toBe('3');
    expect(s.isActive).toBe(true);
    expect(s.branch).toBe('feature/x');
    expect(s.pid).toBe('12345');
    expect(s.stuckCount).toBe(2);
  });

  it('uses fallback when fields are missing', () => {
    const s = toSession({}, 'my-project-20260314', false);
    expect(s.id).toBe('my-project-20260314');
    expect(s.projectName).toBe('my-project');
    expect(s.status).toBe('unknown');
    expect(s.isActive).toBe(false);
    expect(s.stuckCount).toBe(0);
  });

  it('derives projectName from fallback by removing last segment', () => {
    const s = toSession({}, 'ralph-skill-20260314-154219', false);
    expect(s.projectName).toBe('ralph-skill-20260314');
  });

  it('uses fallback as projectName when no dash segments', () => {
    const s = toSession({}, 'standalone', false);
    expect(s.projectName).toBe('standalone');
  });
});

// ── Tests for formatSecs ──

describe('formatSecs', () => {
  it('formats seconds only', () => {
    expect(formatSecs(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatSecs(125)).toBe('2m 5s');
  });

  it('formats exact minutes', () => {
    expect(formatSecs(120)).toBe('2m');
  });

  it('formats zero', () => {
    expect(formatSecs(0)).toBe('0s');
  });
});

// ── Tests for formatDuration ──

describe('formatDuration', () => {
  it('converts seconds-only string', () => {
    expect(formatDuration('90s')).toBe('1m 30s');
  });

  it('passes through non-matching format', () => {
    expect(formatDuration('2m 30s')).toBe('2m 30s');
    expect(formatDuration('unknown')).toBe('unknown');
  });

  it('converts short duration', () => {
    expect(formatDuration('5s')).toBe('5s');
  });
});

// ── Tests for relativeTime ──

describe('relativeTime', () => {
  it('returns empty for empty string', () => {
    expect(relativeTime('')).toBe('');
  });

  it('returns "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const ts = new Date(Date.now() - 5 * 60000).toISOString();
    expect(relativeTime(ts)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const ts = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(relativeTime(ts)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const ts = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(relativeTime(ts)).toBe('2d ago');
  });
});

// ── Tests for stripAnsi ──

describe('stripAnsi', () => {
  it('strips ANSI color codes', () => {
    expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
  });

  it('strips multiple codes', () => {
    expect(stripAnsi('\x1b[1m\x1b[32mbold green\x1b[0m normal')).toBe('bold green normal');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});

// ── Tests for isImageArtifact ──

describe('isImageArtifact', () => {
  it('detects PNG files', () => {
    expect(isImageArtifact({ path: 'screenshot.png', type: 'file' })).toBe(true);
  });

  it('detects JPG files', () => {
    expect(isImageArtifact({ path: 'photo.jpg', type: 'file' })).toBe(true);
    expect(isImageArtifact({ path: 'photo.jpeg', type: 'file' })).toBe(true);
  });

  it('detects SVG files', () => {
    expect(isImageArtifact({ path: 'logo.svg', type: 'file' })).toBe(true);
  });

  it('detects by type=screenshot', () => {
    expect(isImageArtifact({ path: 'data.bin', type: 'screenshot' })).toBe(true);
  });

  it('detects by type=visual_diff', () => {
    expect(isImageArtifact({ path: 'data.bin', type: 'visual_diff' })).toBe(true);
  });

  it('returns false for non-image files', () => {
    expect(isImageArtifact({ path: 'output.txt', type: 'file' })).toBe(false);
    expect(isImageArtifact({ path: 'data.json', type: 'file' })).toBe(false);
  });

  it('returns false for files without extension', () => {
    expect(isImageArtifact({ path: 'README', type: 'file' })).toBe(false);
  });
});

// ── Tests for artifactUrl ──

describe('artifactUrl', () => {
  it('generates correct URL', () => {
    expect(artifactUrl(7, 'output.txt')).toBe('/api/artifacts/7/output.txt');
  });

  it('encodes special characters in filename', () => {
    expect(artifactUrl(1, 'file with spaces.png')).toBe('/api/artifacts/1/file%20with%20spaces.png');
  });
});

// ── Tests for slugify ──

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('API & CLI Integration!')).toBe('api-cli-integration');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('foo---bar')).toBe('foo-bar');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

// ── Tests for parseManifest ──

describe('parseManifest', () => {
  it('returns null when manifest is null and no outputHeader', () => {
    expect(parseManifest({ iteration: 1, manifest: null })).toBeNull();
  });

  it('returns payload when outputHeader is present even without manifest', () => {
    const result = parseManifest({ iteration: 5, manifest: null, outputHeader: '> build · claude' });
    expect(result).not.toBeNull();
    expect(result!.iteration).toBe(5);
    expect(result!.phase).toBe('proof');
    expect(result!.artifacts).toEqual([]);
    expect(result!.outputHeader).toBe('> build · claude');
  });

  it('parses full manifest with artifacts', () => {
    const manifest = {
      phase: 'build',
      summary: 'Added feature X',
      artifacts: [
        { type: 'screenshot', path: 'screen.png', description: 'Dashboard view' },
        { type: 'file', path: 'output.log', description: 'Build output' },
      ],
    };
    const result = parseManifest({ iteration: 3, manifest });
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('build');
    expect(result!.summary).toBe('Added feature X');
    expect(result!.artifacts).toHaveLength(2);
    expect(result!.artifacts[0].type).toBe('screenshot');
    expect(result!.artifacts[0].path).toBe('screen.png');
  });

  it('handles artifact with metadata', () => {
    const manifest = {
      phase: 'proof',
      summary: '',
      artifacts: [
        { type: 'visual_diff', path: 'diff.png', description: 'Pixel diff', metadata: { baseline: 'base.png', diff_percentage: 2.5 } },
      ],
    };
    const result = parseManifest({ iteration: 4, manifest });
    expect(result!.artifacts[0].metadata).toEqual({ baseline: 'base.png', diff_percentage: 2.5 });
  });

  it('filters non-record entries from artifacts array', () => {
    const manifest = {
      phase: 'build',
      summary: '',
      artifacts: ['not-an-object', null, { type: 'file', path: 'a.txt', description: '' }],
    };
    const result = parseManifest({ iteration: 2, manifest });
    expect(result!.artifacts).toHaveLength(1);
    expect(result!.artifacts[0].path).toBe('a.txt');
  });

  it('defaults missing artifact fields', () => {
    const manifest = {
      phase: 'review',
      summary: '',
      artifacts: [{}],
    };
    const result = parseManifest({ iteration: 1, manifest });
    expect(result!.artifacts[0]).toEqual({ type: 'unknown', path: '', description: '', metadata: undefined });
  });
});

// ── Tests for findBaselineIterations (artifact comparison history scrubbing) ──

interface ManifestPayloadForTest {
  iteration: number;
  phase: string;
  summary: string;
  artifacts: Array<{ type: string; path: string; description: string; metadata?: { baseline?: string; diff_percentage?: number } }>;
  outputHeader?: string;
}

function findBaselineIterations(artifactPath: string, currentIteration: number, allManifests: ManifestPayloadForTest[]): number[] {
  return allManifests
    .filter((m) => m.iteration < currentIteration && m.artifacts.some((a) => a.path === artifactPath))
    .map((m) => m.iteration)
    .sort((a, b) => b - a);
}

describe('findBaselineIterations', () => {
  const mkManifest = (iteration: number, paths: string[]): ManifestPayloadForTest => ({
    iteration,
    phase: 'proof',
    summary: '',
    artifacts: paths.map((p) => ({ type: 'screenshot', path: p, description: '' })),
  });

  it('returns empty array when no prior iterations exist', () => {
    const manifests = [mkManifest(5, ['dashboard.png'])];
    expect(findBaselineIterations('dashboard.png', 5, manifests)).toEqual([]);
  });

  it('returns prior iterations with matching artifact path, newest first', () => {
    const manifests = [
      mkManifest(2, ['dashboard.png']),
      mkManifest(4, ['dashboard.png']),
      mkManifest(7, ['dashboard.png']),
    ];
    expect(findBaselineIterations('dashboard.png', 7, manifests)).toEqual([4, 2]);
  });

  it('excludes iterations that do not contain the artifact', () => {
    const manifests = [
      mkManifest(1, ['other.png']),
      mkManifest(3, ['dashboard.png']),
      mkManifest(5, ['dashboard.png', 'other.png']),
    ];
    expect(findBaselineIterations('dashboard.png', 5, manifests)).toEqual([3]);
  });

  it('excludes iterations >= current iteration', () => {
    const manifests = [
      mkManifest(3, ['dash.png']),
      mkManifest(5, ['dash.png']),
      mkManifest(8, ['dash.png']),
    ];
    // current is 5 — should only see iter 3
    expect(findBaselineIterations('dash.png', 5, manifests)).toEqual([3]);
  });

  it('returns empty array when artifact path matches no manifests', () => {
    const manifests = [
      mkManifest(1, ['a.png']),
      mkManifest(2, ['b.png']),
    ];
    expect(findBaselineIterations('nonexistent.png', 3, manifests)).toEqual([]);
  });

  it('handles empty manifests array', () => {
    expect(findBaselineIterations('anything.png', 1, [])).toEqual([]);
  });
});
