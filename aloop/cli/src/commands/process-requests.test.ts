import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { formatReviewCommentHistory, getDirectorySizeBytes, pruneLargeV8CacheDir } from './process-requests.js';
import { processCrResultFiles, type CrResultDeps } from './cr-pipeline.js';
import type { OrchestratorIssue } from './orchestrate.js';

describe('process-requests V8 cache helpers', () => {
  it('getDirectorySizeBytes sums nested file sizes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-size-'));
    try {
      await mkdir(path.join(root, 'nested'), { recursive: true });
      await writeFile(path.join(root, 'a.bin'), Buffer.alloc(1024));
      await writeFile(path.join(root, 'nested', 'b.bin'), Buffer.alloc(2048));

      const total = await getDirectorySizeBytes(root);
      assert.equal(total, 3072);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir does not prune when below threshold', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-small-'));
    try {
      await writeFile(path.join(root, 'cache.bin'), Buffer.alloc(2048));

      const result = await pruneLargeV8CacheDir(root, 10 * 1024);
      assert.equal(result.pruned, false);
      assert.equal(result.sizeBytes, 2048);
      assert.equal(existsSync(root), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir removes cache dir when above threshold', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-large-'));
    try {
      await writeFile(path.join(root, 'cache.bin'), Buffer.alloc(4096));

      const result = await pruneLargeV8CacheDir(root, 1024);
      assert.equal(result.pruned, true);
      assert.equal(result.sizeBytes, 4096);
      assert.equal(existsSync(root), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir is a no-op when directory is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-missing-'));
    const missing = path.join(root, 'missing');
    try {
      const result = await pruneLargeV8CacheDir(missing, 1);
      assert.deepEqual(result, { sizeBytes: 0, pruned: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('formatReviewCommentHistory', () => {
  it('formats comments with author and timestamp attribution', () => {
    const formatted = formatReviewCommentHistory([
      { author: { login: 'copilot' }, createdAt: '2026-03-22T08:00:00Z', body: 'Please fix X.' },
      { author: { login: 'pj' }, createdAt: '2026-03-22T08:30:00Z', body: 'Fixed in latest commit.' },
    ]);

    assert.equal(
      formatted,
      '### @copilot at 2026-03-22T08:00:00Z\n\nPlease fix X.\n\n---\n\n### @pj at 2026-03-22T08:30:00Z\n\nFixed in latest commit.\n',
    );
  });

  it('skips comments with empty bodies and falls back to unknown author', () => {
    const formatted = formatReviewCommentHistory([
      { author: { login: null }, createdAt: null, body: '  ' },
      { author: null, createdAt: undefined, body: 'Looks good now.' },
    ]);

    assert.equal(formatted, '### @unknown\n\nLooks good now.\n');
  });
});

// ── Helpers for CR tests ──

function makeIssue(overrides: Partial<OrchestratorIssue> & { number: number }): OrchestratorIssue {
  return {
    title: `Issue ${overrides.number}`,
    wave: 1,
    state: 'pending',
    child_session: null,
    pr_number: null,
    depends_on: [],
    blocked_on_human: false,
    processed_comment_ids: [],
    dor_validated: false,
    is_change_request: true,
    cr_spec_updated: false,
    ...overrides,
  } as OrchestratorIssue;
}

function makeCrResultFile(issueNumber: number, tmpDir: string): { filePath: string; result: object } {
  const result = {
    issue_number: issueNumber,
    summary: 'Add queue priority section',
    spec_changes: [
      { file: 'SPEC.md', section: 'Queue Priority', action: 'add', content: '## Queue Priority\n\nHigher priority items run first.', rationale: 'New feature' },
    ],
  };
  const filePath = path.join(tmpDir, `cr-analysis-result-${issueNumber}.json`);
  return { filePath, result };
}

function makeMockDeps(overrides: Partial<CrResultDeps> = {}): CrResultDeps & {
  writtenFiles: Record<string, string>;
  ghCalls: string[][];
  gitCalls: string[][];
  archivedFiles: string[];
} {
  const writtenFiles: Record<string, string> = {};
  const ghCalls: string[][] = [];
  const gitCalls: string[][] = [];
  const archivedFiles: string[] = [];

  const deps: CrResultDeps & { writtenFiles: Record<string, string>; ghCalls: string[][]; gitCalls: string[][]; archivedFiles: string[] } = {
    existsSync: (p) => p in writtenFiles,
    readFile: async (p) => writtenFiles[p] ?? '',
    writeFile: async (p, data) => { writtenFiles[p] = data; },
    unlink: async (p) => { delete writtenFiles[p]; },
    execGh: async (args) => { ghCalls.push(args); return { stdout: '', stderr: '' }; },
    execGit: (args) => { gitCalls.push(args); },
    archiveFile: async (_rDir, fp) => { archivedFiles.push(fp); },
    writtenFiles,
    ghCalls,
    gitCalls,
    archivedFiles,
    ...overrides,
  };
  return deps;
}

describe('processCrResultFiles — autonomous path', () => {
  it('applies spec changes, commits, and sets cr_spec_updated', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-auto-'));
    try {
      const issue = makeIssue({ number: 42 });
      const { filePath, result } = makeCrResultFile(42, tmpDir);
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'autonomous', '/project', 'owner/repo', 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, true);
      assert.equal((issue as any).cr_spec_updated, true);
      // Spec file should be updated
      assert.ok(deps.writtenFiles['/project/SPEC.md']?.includes('Queue Priority'), 'SPEC.md should contain the new section');
      // Git add, commit, push should be called
      assert.ok(deps.gitCalls.some(c => c.includes('add')), 'git add expected');
      assert.ok(deps.gitCalls.some(c => c.includes('commit')), 'git commit expected');
      assert.ok(deps.gitCalls.some(c => c.includes('push')), 'git push expected');
      // No GH calls in autonomous mode
      assert.equal(deps.ghCalls.length, 0);
      // File should be archived
      assert.ok(deps.archivedFiles.includes(filePath));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not set cr_spec_updated when issue not found', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-notfound-'));
    try {
      const issue = makeIssue({ number: 99 });
      const { filePath, result } = makeCrResultFile(42, tmpDir); // wrong issue number
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'autonomous', '/project', 'owner/repo', 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, false);
      assert.equal((issue as any).cr_spec_updated, false);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('processCrResultFiles — non-autonomous path', () => {
  it('posts GH comment, adds blocked-on-human label, sets blocked_on_human', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-nonauto-'));
    try {
      const issue = makeIssue({ number: 42 });
      const { filePath, result } = makeCrResultFile(42, tmpDir);
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'balanced', '/project', 'owner/repo', 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, true);
      assert.equal((issue as any).blocked_on_human, true);
      // cr_spec_updated must remain false
      assert.equal((issue as any).cr_spec_updated, false);
      // Should post comment on GH issue
      const commentCall = deps.ghCalls.find(c => c.includes('comment') && c.includes('42'));
      assert.ok(commentCall, 'Expected issue comment gh call');
      // Should add blocked-on-human label
      const labelCall = deps.ghCalls.find(c => c.includes('edit') && c.includes('aloop/blocked-on-human'));
      assert.ok(labelCall, 'Expected label add gh call');
      // No git calls
      assert.equal(deps.gitCalls.length, 0);
      // File archived
      assert.ok(deps.archivedFiles.includes(filePath));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not make GH calls when repo is null', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-norepo-'));
    try {
      const issue = makeIssue({ number: 42 });
      const { filePath, result } = makeCrResultFile(42, tmpDir);
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'cautious', '/project', null, 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, true);
      assert.equal((issue as any).blocked_on_human, true);
      assert.equal(deps.ghCalls.length, 0, 'No GH calls when repo is null');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
