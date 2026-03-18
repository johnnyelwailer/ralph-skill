import { describe, expect, it } from 'vitest';
import {
  artifactUrl,
  computeAvgDuration,
  deriveProviderHealth,
  extractIterationUsage,
  extractModelFromOutput,
  formatDateKey,
  formatDuration,
  formatSecs,
  formatTime,
  formatTimeShort,
  formatTokenCount,
  isImageArtifact,
  isRecord,
  numStr,
  parseAnsiSegments,
  parseDurationSeconds,
  parseLogLine,
  parseManifest,
  relativeTime,
  renderAnsiToHtml,
  rgbStr,
  slugify,
  str,
  stripAnsi,
  toSession,
} from './App';

describe('App.tsx helper coverage', () => {
  it('covers ansi helpers', () => {
    expect(stripAnsi('\u001b[31merror\u001b[0m ok')).toBe('error ok');
    expect(rgbStr(1, 2, 3)).toBe('1,2,3');

    const segments = parseAnsiSegments('a\u001b[1;31mB\u001b[22;39mC');
    expect(segments.length).toBe(3);
    expect(segments[1].style.bold).toBe(true);
    expect(segments[1].style.fg).toBeTruthy();

    const html = renderAnsiToHtml('**x**');
    expect(html).toContain('<strong>x</strong>');

    const styledHtml = renderAnsiToHtml('\u001b[3;4mmd\u001b[0m');
    expect(styledHtml).toContain('font-style:italic');
    expect(styledHtml).toContain('text-decoration:underline');
  });

  it('covers truecolor and 256-color ansi branches', () => {
    const out = parseAnsiSegments('\u001b[38;5;200mX\u001b[48;2;1;2;3mY\u001b[0m');
    expect(out[1].style.fg).toBeTruthy();
    expect(out[1].style.bg).toBe('1,2,3');
  });

  it('covers record/string/number extraction helpers', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);

    expect(str({ a: ' ', b: 'x' }, ['a', 'b'])).toBe('x');
    expect(str({}, ['a'], 'fb')).toBe('fb');

    expect(numStr({ a: Number.POSITIVE_INFINITY, b: ' 42 ' }, ['a', 'b'])).toBe('42');
    expect(numStr({ a: 5 }, ['a'])).toBe('5');
    expect(numStr({}, ['a'], 'n/a')).toBe('n/a');
  });

  it('covers toSession fallbacks', () => {
    const s = toSession({ status: 'running', iteration: 2, stuck_count: 3 }, 'proj-12', true);
    expect(s.id).toBe('proj-12');
    expect(s.projectName).toBe('proj');
    expect(s.status).toBe('running');
    expect(s.iterations).toBe('2');
    expect(s.stuckCount).toBe(3);
    expect(s.isActive).toBe(true);
  });

  it('covers date/time formatting', () => {
    expect(formatTime('')).toBe('');
    expect(formatTimeShort('')).toBe('');

    expect(formatSecs(10)).toBe('10s');
    expect(formatSecs(65)).toBe('1m 5s');
    expect(formatSecs(120)).toBe('2m');

    expect(formatDuration('61s')).toBe('1m 1s');
    expect(formatDuration('n/a')).toBe('n/a');

    expect(formatDateKey('')).toBe('Unknown');
  });

  it('covers relativeTime branches', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 20_000).toISOString())).toBe('just now');
    expect(relativeTime(new Date(now - 8 * 60_000).toISOString())).toBe('8m ago');
    expect(relativeTime(new Date(now - 2 * 60 * 60_000).toISOString())).toBe('2h ago');
    expect(relativeTime(new Date(now - 3 * 24 * 60 * 60_000).toISOString())).toBe('3d ago');
    expect(relativeTime('')).toBe('');
  });

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
    // Returns null when rawObj is null
    expect(extractIterationUsage(null)).toBeNull();

    // Returns null when no cost_usd field
    expect(extractIterationUsage({ event: 'iteration_complete', provider: 'claude' })).toBeNull();

    // Returns null when cost_usd is 0
    expect(extractIterationUsage({ cost_usd: 0, tokens_input: 100 })).toBeNull();

    // Returns usage when cost_usd is a number
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

    // Handles string cost_usd (from bash write_log_entry)
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
