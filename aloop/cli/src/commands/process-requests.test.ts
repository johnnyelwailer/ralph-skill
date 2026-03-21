import { describe, it } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { formatReviewCommentHistory, getDirectorySizeBytes, pruneLargeV8CacheDir, processRequestsCommand } from './process-requests.js';

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

async function makeOrchestratorSession(prefix: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(root, 'home');
  const sessionId = 'orch-session';
  const sessionDir = path.join(homeDir, '.aloop', 'sessions', sessionId);
  await mkdir(path.join(sessionDir, 'requests'), { recursive: true });
  await mkdir(path.join(sessionDir, 'prompts'), { recursive: true });
  await mkdir(path.join(homeDir, '.aloop', '.cache'), { recursive: true });

  const state = {
    spec_file: 'SPEC.md',
    trunk_branch: 'agent/trunk',
    concurrency_cap: 1,
    current_wave: 1,
    plan_only: false,
    issues: [] as any[],
    completed_waves: [] as number[],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await writeFile(path.join(sessionDir, 'orchestrator.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await writeFile(path.join(sessionDir, 'meta.json'), `${JSON.stringify({ provider: 'claude' }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), `${JSON.stringify({ state: 'starting', mode: 'orchestrate', iteration: 0 }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(sessionDir, 'loop-plan.json'), JSON.stringify({ iteration: 7 }), 'utf8');
  return { homeDir, sessionDir };
}

test('processRequestsCommand updates orchestrator status to running with iteration', async () => {
  const { homeDir, sessionDir } = await makeOrchestratorSession('aloop-process-requests-running-');
  await processRequestsCommand({ homeDir, sessionDir });
  const status = JSON.parse(await readFile(path.join(sessionDir, 'status.json'), 'utf8'));
  assert.equal(status.mode, 'orchestrate');
  assert.equal(status.state, 'running');
  assert.equal(status.iteration, 7);
  assert.equal(status.provider, 'claude');
  assert.ok(typeof status.updated_at === 'string' && status.updated_at.length > 0);
});

test('processRequestsCommand marks completed when all issues are done', async () => {
  const { homeDir, sessionDir } = await makeOrchestratorSession('aloop-process-requests-completed-');
  const statePath = path.join(sessionDir, 'orchestrator.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.current_wave = 1;
  state.completed_waves = [1];
  state.issues = [
    {
      number: 42,
      title: 'Done issue',
      wave: 1,
      state: 'merged',
      child_session: null,
      pr_number: 100,
      depends_on: [],
      status: 'Done',
    },
  ];
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  await processRequestsCommand({ homeDir, sessionDir });
  const status = JSON.parse(await readFile(path.join(sessionDir, 'status.json'), 'utf8'));
  assert.equal(status.state, 'completed');
  assert.equal(status.iteration, 7);
});
