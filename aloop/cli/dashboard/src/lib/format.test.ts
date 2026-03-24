import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatTime,
  formatTimeShort,
  formatSecs,
  formatDuration,
  formatDateKey,
  relativeTime,
  formatTokenCount,
  parseDurationSeconds,
} from './format';

describe('formatTime', () => {
  it('returns empty string for empty input', () => {
    expect(formatTime('')).toBe('');
  });

  it('returns empty string for null-like falsy input', () => {
    expect(formatTime(undefined as unknown as string)).toBe('');
  });

  it('returns "Invalid Date" for unparseable date string', () => {
    expect(formatTime('not-a-date')).toBe('Invalid Date');
  });

  it('returns a time string for a valid ISO timestamp', () => {
    const result = formatTime('2024-01-15T10:30:45Z');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatTimeShort', () => {
  it('returns empty string for empty input', () => {
    expect(formatTimeShort('')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(formatTimeShort(undefined as unknown as string)).toBe('');
  });

  it('returns "Invalid Date" for unparseable date string', () => {
    expect(formatTimeShort('not-a-date')).toBe('Invalid Date');
  });

  it('returns a time string for a valid ISO timestamp', () => {
    const result = formatTimeShort('2024-01-15T10:30:45Z');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatSecs', () => {
  it('formats zero seconds', () => {
    expect(formatSecs(0)).toBe('0s');
  });

  it('formats seconds only when under 60', () => {
    expect(formatSecs(45)).toBe('45s');
    expect(formatSecs(1)).toBe('1s');
    expect(formatSecs(59)).toBe('59s');
  });

  it('formats whole minutes without seconds', () => {
    expect(formatSecs(60)).toBe('1m');
    expect(formatSecs(120)).toBe('2m');
    expect(formatSecs(3600)).toBe('60m');
  });

  it('formats minutes and seconds', () => {
    expect(formatSecs(61)).toBe('1m 1s');
    expect(formatSecs(125)).toBe('2m 5s');
    expect(formatSecs(90)).toBe('1m 30s');
  });

  it('rounds fractional seconds', () => {
    expect(formatSecs(60.4)).toBe('1m');
    expect(formatSecs(60.6)).toBe('1m 1s');
  });

  it('handles negative values', () => {
    // Math.floor(-5/60) = -1, s = Math.round(-5%60) = -5, s>0 is false → returns '-1m'
    expect(formatSecs(-5)).toBe('-1m');
  });
});

describe('formatDuration', () => {
  it('formats a plain seconds string', () => {
    expect(formatDuration('45s')).toBe('45s');
    expect(formatDuration('125s')).toBe('2m 5s');
    expect(formatDuration('60s')).toBe('1m');
  });

  it('returns raw string if format does not match', () => {
    expect(formatDuration('2m 5s')).toBe('2m 5s');
    expect(formatDuration('')).toBe('');
    expect(formatDuration('1.5s')).toBe('1.5s');
    expect(formatDuration('abc')).toBe('abc');
  });

  it('formats 0s', () => {
    expect(formatDuration('0s')).toBe('0s');
  });
});

describe('formatDateKey', () => {
  it('returns "Unknown" for empty input', () => {
    expect(formatDateKey('')).toBe('Unknown');
  });

  it('returns "Unknown" for undefined input', () => {
    expect(formatDateKey(undefined as unknown as string)).toBe('Unknown');
  });

  it('returns "Invalid Date" for unparseable date string (no throw)', () => {
    expect(formatDateKey('not-a-date')).toBe('Invalid Date');
  });

  it('returns a date string for a valid ISO timestamp', () => {
    const result = formatDateKey('2024-01-15T10:30:45Z');
    expect(typeof result).toBe('string');
    expect(result).not.toBe('Unknown');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for empty input', () => {
    expect(relativeTime('')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(relativeTime(undefined as unknown as string)).toBe('');
  });

  it('returns "just now" for timestamps less than 1 minute ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:30Z'));
    expect(relativeTime('2024-01-15T10:00:00Z')).toBe('just now');
  });

  it('returns minutes ago for timestamps 1–59 minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:05:00Z'));
    expect(relativeTime('2024-01-15T10:00:00Z')).toBe('5m ago');
  });

  it('returns 1m ago for exactly 1 minute ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:01:00Z'));
    expect(relativeTime('2024-01-15T10:00:00Z')).toBe('1m ago');
  });

  it('returns hours ago for timestamps 1–23 hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T13:00:00Z'));
    expect(relativeTime('2024-01-15T10:00:00Z')).toBe('3h ago');
  });

  it('returns 1h ago for exactly 60 minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T11:00:00Z'));
    expect(relativeTime('2024-01-15T10:00:00Z')).toBe('1h ago');
  });

  it('returns days ago for timestamps 24+ hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-17T10:00:00Z'));
    expect(relativeTime('2024-01-15T10:00:00Z')).toBe('2d ago');
  });

  it('returns 1d ago for exactly 24 hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-16T10:00:00Z'));
    expect(relativeTime('2024-01-15T10:00:00Z')).toBe('1d ago');
  });

  it('returns "NaNd ago" for unparseable date (NaN propagates through arithmetic)', () => {
    expect(relativeTime('not-a-date')).toBe('NaNd ago');
  });
});

describe('formatTokenCount', () => {
  it('returns raw number string for values under 1000', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1)).toBe('1');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats thousands with one decimal and k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(15200)).toBe('15.2k');
    expect(formatTokenCount(999999)).toBe('1000.0k');
  });

  it('formats millions with one decimal and M suffix', () => {
    expect(formatTokenCount(1_000_000)).toBe('1.0M');
    expect(formatTokenCount(1_500_000)).toBe('1.5M');
    expect(formatTokenCount(2_345_678)).toBe('2.3M');
  });

  it('handles boundary between k and M', () => {
    expect(formatTokenCount(999_999)).toBe('1000.0k');
    expect(formatTokenCount(1_000_000)).toBe('1.0M');
  });
});

describe('parseDurationSeconds', () => {
  it('returns null for empty string', () => {
    expect(parseDurationSeconds('')).toBeNull();
  });

  it('returns null for unrecognized format', () => {
    expect(parseDurationSeconds('abc')).toBeNull();
    expect(parseDurationSeconds('1h')).toBeNull();
    expect(parseDurationSeconds('1m')).toBeNull();
  });

  it('parses milliseconds format (e.g. 500ms)', () => {
    expect(parseDurationSeconds('500ms')).toBeCloseTo(0.5);
    expect(parseDurationSeconds('1500ms')).toBeCloseTo(1.5);
    expect(parseDurationSeconds('0ms')).toBeCloseTo(0);
    expect(parseDurationSeconds('250.5ms')).toBeCloseTo(0.2505);
  });

  it('parses seconds format (e.g. 1.5s)', () => {
    expect(parseDurationSeconds('0s')).toBeCloseTo(0);
    expect(parseDurationSeconds('1s')).toBeCloseTo(1);
    expect(parseDurationSeconds('45s')).toBeCloseTo(45);
    expect(parseDurationSeconds('1.5s')).toBeCloseTo(1.5);
  });

  it('parses mixed minutes+seconds format (e.g. 2m 30s)', () => {
    expect(parseDurationSeconds('1m 0s')).toBeCloseTo(60);
    expect(parseDurationSeconds('2m 30s')).toBeCloseTo(150);
    expect(parseDurationSeconds('1m30s')).toBeCloseTo(90);
    expect(parseDurationSeconds('0m 5s')).toBeCloseTo(5);
  });

  it('parses plain numeric string as seconds', () => {
    expect(parseDurationSeconds('0')).toBeCloseTo(0);
    expect(parseDurationSeconds('42')).toBeCloseTo(42);
    expect(parseDurationSeconds('3.14')).toBeCloseTo(3.14);
  });
});
