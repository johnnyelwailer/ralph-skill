import { describe, expect, it } from 'vitest';
import { toSession } from './sessionHelpers';

describe('toSession', () => {
  const base = { session_id: 's-1', state: 'running', phase: 'build', iteration: 3 };

  it('extracts projectName from project_root path (trailing slash)', () => {
    const result = toSession({ ...base, project_root: '/projects/myapp/' }, 'fallback', true);
    expect(result.projectName).toBe('myapp');
  });

  it('extracts projectName from project_root path (no trailing slash)', () => {
    const result = toSession({ ...base, project_root: '/projects/myapp' }, 'fallback', true);
    expect(result.projectName).toBe('myapp');
  });

  it('extracts projectName from project_root with backslash separators', () => {
    const result = toSession({ ...base, project_root: 'C:\\Users\\projects\\myapp\\' }, 'fallback', true);
    expect(result.projectName).toBe('myapp');
  });

  it('uses project_name when provided (does not fallback to project_root)', () => {
    const result = toSession({ ...base, project_name: 'my-project', project_root: '/projects/other' }, 'fallback', true);
    expect(result.projectName).toBe('my-project');
  });

  it('derives projectName from fallback when no project_root or project_name', () => {
    const result = toSession({ ...base }, 'my-session-id', true);
    expect(result.projectName).toBe('my-session');
  });

  it('uses full fallback when fallback has no hyphens', () => {
    const result = toSession({ ...base }, 'simple', true);
    expect(result.projectName).toBe('simple');
  });

  it('returns fallback as projectName when fallback is empty and no root', () => {
    const result = toSession({ ...base }, '', true);
    expect(result.projectName).toBe('');
  });

  it('extracts id from session_id', () => {
    const result = toSession({ ...base, session_id: 'abc-123' }, 'fallback', false);
    expect(result.id).toBe('abc-123');
  });

  it('falls back to id param when session_id absent', () => {
    const result = toSession({ state: 'running' }, 'fallback-id', false);
    expect(result.id).toBe('fallback-id');
  });

  it('extracts name from session_name when session_id and name absent', () => {
    const source = { state: 'running', session_name: 'My Session' };
    const result = toSession(source, 'fallback', false);
    expect(result.name).toBe('My Session');
  });

  it('falls back to session_id for name when name absent', () => {
    const result = toSession({ ...base }, 'fallback', false);
    expect(result.name).toBe('s-1');
  });

  it('sets isActive correctly', () => {
    expect(toSession(base, 'fb', true).isActive).toBe(true);
    expect(toSession(base, 'fb', false).isActive).toBe(false);
  });

  it('defaults status to unknown', () => {
    const result = toSession({}, 'fb', false);
    expect(result.status).toBe('unknown');
  });

  it('defaults elapsed to --', () => {
    const result = toSession({}, 'fb', false);
    expect(result.elapsed).toBe('--');
  });

  it('extracts stuckCount as number', () => {
    const result = toSession({ ...base, stuck_count: 5 }, 'fb', false);
    expect(result.stuckCount).toBe(5);
  });

  it('defaults stuckCount to 0 for non-number values', () => {
    const result = toSession({ ...base, stuck_count: 'bad' }, 'fb', false);
    expect(result.stuckCount).toBe(0);
  });

  it('extracts branch, startedAt, endedAt, provider, workDir', () => {
    const source = {
      ...base,
      branch: 'main',
      started_at: '2026-01-01T00:00:00Z',
      ended_at: '2026-01-01T01:00:00Z',
      provider: 'claude',
      work_dir: '/tmp/work',
    };
    const result = toSession(source, 'fb', false);
    expect(result.branch).toBe('main');
    expect(result.startedAt).toBe('2026-01-01T00:00:00Z');
    expect(result.endedAt).toBe('2026-01-01T01:00:00Z');
    expect(result.provider).toBe('claude');
    expect(result.workDir).toBe('/tmp/work');
  });

  it('uses alternate keys for phase and elapsed when primary absent', () => {
    const source = { session_id: 's-1', state: 'running', mode: 'review', elapsed_time: '5m' };
    const result = toSession(source, 'fb', false);
    expect(result.phase).toBe('review');
    expect(result.elapsed).toBe('5m');
  });
});
