import { describe, expect, it } from 'vitest';
import { latestQaCoverageRefreshSignal, toSession } from './log-session';

describe('latestQaCoverageRefreshSignal', () => {
  it('returns null for empty string input', () => {
    expect(latestQaCoverageRefreshSignal('')).toBeNull();
  });

  it('skips malformed JSON lines and returns null when no valid entries', () => {
    const log = ['not json at all', '{broken', '   '].join('\n');
    expect(latestQaCoverageRefreshSignal(log)).toBeNull();
  });

  it('returns null for iteration_complete with non-QA phase', () => {
    const line = JSON.stringify({ event: 'iteration_complete', phase: 'build', timestamp: '2026-04-14T10:00:00Z', iteration: 1 });
    expect(latestQaCoverageRefreshSignal(line)).toBeNull();
  });

  it('returns signal string for iteration_complete with qa phase', () => {
    const line = JSON.stringify({ event: 'iteration_complete', phase: 'qa', timestamp: '2026-04-14T10:00:00Z', iteration: 5 });
    const result = latestQaCoverageRefreshSignal(line);
    expect(result).not.toBeNull();
    expect(result).toContain('2026-04-14T10:00:00Z');
    expect(result).toContain('5');
  });
});

describe('toSession', () => {
  it('derives projectName from project_root when project_name is absent', () => {
    const session = toSession({ project_root: '/home/user/my-project' }, 'fallback', true);
    expect(session.projectName).toBe('my-project');
  });

  it('uses project_name when present', () => {
    const session = toSession({ project_name: 'my-app', project_root: '/home/user/other' }, 'fallback', false);
    expect(session.projectName).toBe('my-app');
  });

  it('falls back to fallback-derived name when no project_root or project_name', () => {
    const session = toSession({}, 'session-abc-123', false);
    // fallback.split('-').slice(0, -1).join('-') = 'session-abc'
    expect(session.projectName).toBe('session-abc');
  });
});
