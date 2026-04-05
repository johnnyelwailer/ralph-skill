import { describe, it, expect } from 'vitest';
import {
  isImageArtifact,
  artifactUrl,
  slugify,
  parseManifest,
  findBaselineIterations,
} from './AppView';
import {
  numStr,
  toSession,
  formatSecs,
  relativeTime,
} from './lib/format';
import { stripAnsi } from './lib/ansi';

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

  it('tries multiple keys in order', () => {
    expect(numStr({ iterations: 10 }, ['iteration', 'iterations'])).toBe('10');
  });
});

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
    expect(s.status).toBe('running');
    expect(s.isActive).toBe(true);
    expect(s.stuckCount).toBe(2);
  });
});

describe('formatSecs', () => {
  it('formats seconds only', () => {
    expect(formatSecs(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatSecs(125)).toBe('2m 5s');
  });
});

describe('relativeTime', () => {
  it('returns "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe('just now');
  });
});

describe('stripAnsi', () => {
  it('strips ANSI color codes', () => {
    expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
  });
});

describe('isImageArtifact', () => {
  it('detects PNG files', () => {
    expect(isImageArtifact({ path: 'screenshot.png', type: 'file', description: '' })).toBe(true);
  });
});

describe('artifactUrl', () => {
  it('generates correct URL', () => {
    expect(artifactUrl(7, 'output.txt')).toBe('/api/artifacts/7/output.txt');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
});

describe('parseManifest', () => {
  it('parses full manifest with artifacts', () => {
    const manifest = {
      phase: 'build',
      summary: 'Added feature X',
      artifacts: [
        { type: 'screenshot', path: 'screen.png', description: 'Dashboard view' },
      ],
    };
    const result = parseManifest({ iteration: 3, manifest });
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('build');
  });
});

describe('findBaselineIterations', () => {
  const mkManifest = (iteration: number, paths: string[]) => ({
    iteration,
    phase: 'proof',
    summary: '',
    artifacts: paths.map((p) => ({ type: 'screenshot', path: p, description: '' })),
    outputHeader: ''
  });

  it('returns prior iterations with matching artifact path, newest first', () => {
    const manifests = [
      mkManifest(2, ['dashboard.png']),
      mkManifest(4, ['dashboard.png']),
      mkManifest(7, ['dashboard.png']),
    ];
    expect(findBaselineIterations('dashboard.png', 7, manifests as any[])).toEqual([4, 2]);
  });
});
