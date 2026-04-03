import { describe, it, expect } from 'vitest';
import { extractModelFromOutput, parseDurationSeconds, computeAvgDuration } from './AppView';

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
