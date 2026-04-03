import { describe, it, expect } from 'vitest';
import { parseLogLine } from './AppView';

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
