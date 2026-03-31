import { describe, expect, it } from 'vitest';
import { computeAvgDuration, latestQaCoverageRefreshSignal } from './logHelpers';

describe('latestQaCoverageRefreshSignal', () => {
  it('returns null for empty string log', () => {
    expect(latestQaCoverageRefreshSignal('')).toBeNull();
  });

  it('returns null for falsy log', () => {
    expect(latestQaCoverageRefreshSignal('')).toBeNull();
  });

  it('skips non-record JSON like literal null', () => {
    const log = 'null';
    expect(latestQaCoverageRefreshSignal(log)).toBeNull();
  });

  it('skips non-record JSON like a number', () => {
    const log = '42';
    expect(latestQaCoverageRefreshSignal(log)).toBeNull();
  });

  it('skips non-record JSON like a boolean', () => {
    const log = 'true';
    expect(latestQaCoverageRefreshSignal(log)).toBeNull();
  });

  it('handles iteration as a string value', () => {
    const entry = JSON.stringify({
      event: 'iteration_complete',
      phase: 'qa',
      timestamp: '2026-01-01T00:00:00Z',
      iteration: '7',
    });
    const result = latestQaCoverageRefreshSignal(entry);
    expect(result).not.toBeNull();
    expect(result).toContain('7|');
  });

  it('handles iteration as a number value', () => {
    const entry = JSON.stringify({
      event: 'iteration_complete',
      phase: 'qa',
      timestamp: '2026-01-01T00:00:00Z',
      iteration: 5,
    });
    const result = latestQaCoverageRefreshSignal(entry);
    expect(result).not.toBeNull();
    expect(result).toContain('5|');
  });

  it('returns null when no qa iteration_complete found', () => {
    const log = JSON.stringify({ event: 'iteration_complete', phase: 'build', timestamp: 't' });
    expect(latestQaCoverageRefreshSignal(log)).toBeNull();
  });

  it('picks the latest qa iteration_complete line (scans backwards)', () => {
    const first = JSON.stringify({ event: 'iteration_complete', phase: 'qa', timestamp: '2026-01-01T00:00:00Z', iteration: 1 });
    const second = JSON.stringify({ event: 'iteration_complete', phase: 'qa', timestamp: '2026-01-02T00:00:00Z', iteration: 2 });
    const log = [first, second].join('\n');
    const result = latestQaCoverageRefreshSignal(log);
    expect(result).toContain('2|');
  });

  it('skips blank lines and non-JSON lines in log stream', () => {
    const entry = JSON.stringify({
      event: 'iteration_complete',
      phase: 'qa',
      timestamp: '2026-01-01T00:00:00Z',
      iteration: 3,
    });
    const log = ['not-json', '', '   ', entry].join('\n');
    const result = latestQaCoverageRefreshSignal(log);
    expect(result).toContain('3|');
  });

  it('uses fallback fields (type, mode, ts, time, created_at)', () => {
    const entry = JSON.stringify({
      type: 'iteration_complete',
      mode: 'qa',
      ts: '2026-01-01T00:00:00Z',
      iteration: 9,
    });
    const result = latestQaCoverageRefreshSignal(entry);
    expect(result).toContain('9|');
  });

  it('handles iteration as non-string-non-number (empty string fallback)', () => {
    const entry = JSON.stringify({
      event: 'iteration_complete',
      phase: 'qa',
      timestamp: '2026-01-01T00:00:00Z',
      iteration: null,
    });
    const result = latestQaCoverageRefreshSignal(entry);
    expect(result).not.toBeNull();
    // iteration should be empty string
    const parts = result!.split('|');
    expect(parts[1]).toBe('');
  });
});

describe('computeAvgDuration', () => {
  it('returns empty string for empty log', () => {
    expect(computeAvgDuration('')).toBe('');
  });

  it('returns empty string when no iteration_complete entries', () => {
    const log = JSON.stringify({ event: 'iteration_error', duration: '10s' });
    expect(computeAvgDuration(log)).toBe('');
  });

  it('returns empty string when count is 0 (no valid durations)', () => {
    const log = JSON.stringify({ event: 'iteration_complete', duration: 'invalid' });
    expect(computeAvgDuration(log)).toBe('');
  });

  it('computes average of valid durations', () => {
    const entries = [
      JSON.stringify({ event: 'iteration_complete', duration: '10s' }),
      JSON.stringify({ event: 'iteration_complete', duration: '20s' }),
    ].join('\n');
    const result = computeAvgDuration(entries);
    expect(result).toBe('15s');
  });

  it('skips non-record JSON values', () => {
    const entries = [
      'null',
      JSON.stringify({ event: 'iteration_complete', duration: '10s' }),
    ].join('\n');
    const result = computeAvgDuration(entries);
    expect(result).toBe('10s');
  });

  it('handles empty lines in log', () => {
    const entries = [
      '',
      '  ',
      JSON.stringify({ event: 'iteration_complete', duration: '30s' }),
    ].join('\n');
    expect(computeAvgDuration(entries)).toBe('30s');
  });

  it('handles malformed JSON lines (skips via catch)', () => {
    const entries = [
      '{invalid json',
      JSON.stringify({ event: 'iteration_complete', duration: '5s' }),
    ].join('\n');
    expect(computeAvgDuration(entries)).toBe('5s');
  });

  it('uses alternate duration field names (elapsed, took)', () => {
    const entries = [
      JSON.stringify({ event: 'iteration_complete', elapsed: '15s' }),
      JSON.stringify({ event: 'iteration_complete', took: '25s' }),
    ].join('\n');
    expect(computeAvgDuration(entries)).toBe('20s');
  });
});
