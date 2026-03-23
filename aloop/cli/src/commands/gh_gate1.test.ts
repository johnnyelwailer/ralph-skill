import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ghCommand,
  ghExecutor,
  ghLoopRuntime,
  GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
  buildGhArgs,
  evaluatePolicy,
  type GhWatchIssueEntry,
  type GhWatchIssueStatus,
} from './gh.js';

function writeWatchState(tmpHome: string, payload: Record<string, unknown>): string {
  const watchFile = path.join(tmpHome, '.aloop', 'watch.json');
  fs.mkdirSync(path.dirname(watchFile), { recursive: true });
  fs.writeFileSync(watchFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return watchFile;
}

function readWatchState(tmpHome: string): Record<string, unknown> {
  const watchFile = path.join(tmpHome, '.aloop', 'watch.json');
  return JSON.parse(fs.readFileSync(watchFile, 'utf8')) as Record<string, unknown>;
}

function buildWatchEntry(overrides: Partial<{
  issue_number: number;
  session_id: string | null;
  branch: string | null;
  repo: string | null;
  pr_number: number | null;
  pr_url: string | null;
  status: GhWatchIssueStatus;
  completion_state: string | null;
  completion_finalized: boolean;
}> = {}): GhWatchIssueEntry {
  return {
    issue_number: overrides.issue_number ?? 42,
    session_id: overrides.session_id ?? 'sess-42',
    branch: overrides.branch ?? 'agent/issue-42',
    repo: overrides.repo ?? 'test/repo',
    pr_number: overrides.pr_number ?? null,
    pr_url: overrides.pr_url ?? null,
    status: overrides.status ?? 'completed',
    completion_state: overrides.completion_state ?? 'exited',
    completion_finalized: overrides.completion_finalized ?? false,
    created_at: '2026-03-14T12:00:00Z',
    updated_at: '2026-03-14T12:00:00Z',
    feedback_iteration: 0,
    max_feedback_iterations: GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: [],
    processed_issue_comment_ids: [],
    processed_run_ids: [],
  };
}

test('gh watch --once DOES NOT mark completion_finalized=true if finalizeWatchEntry fails', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-gate1-fixed-'));

  writeWatchState(tmpHome, {
    version: 1,
    issues: {
      '42': buildWatchEntry({
        status: 'completed',
        completion_state: 'exited',
        completion_finalized: false,
      }),
    },
    queue: [],
  });

  // Mock ghExecutor.exec to fail for finalization steps
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return { stdout: '[]', stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'create') {
      throw new Error('GH PR CREATE FAIL');
    }
    if (args[0] === 'issue' && args[1] === 'comment') {
      throw new Error('GH ISSUE COMMENT FAIL');
    }
    return { stdout: '[]', stderr: '' };
  });

  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);
  t.mock.method(console, 'log', () => {});

  try {
    await ghCommand.parseAsync([
      'watch', '--once',
      '--home-dir', tmpHome,
    ], { from: 'user' });

    const state = readWatchState(tmpHome) as { issues: Record<string, { completion_finalized: boolean }> };
    
    // FIXED BEHAVIOR: It remains false
    assert.equal(state.issues['42'].completion_finalized, false, 'Fixed: completion_finalized should be false when finalization failed');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh watch --once marks completion_finalized=true if finalizeWatchEntry succeeds', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-gate1-success-'));

  writeWatchState(tmpHome, {
    version: 1,
    issues: {
      '42': buildWatchEntry({
        status: 'completed',
        completion_state: 'exited',
        completion_finalized: false,
      }),
    },
    queue: [],
  });

  // Mock ghExecutor.exec to succeed
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return { stdout: '[]', stderr: '' };
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      return { stdout: JSON.stringify({ title: 'Issue 42' }), stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'create') {
      return { stdout: 'https://github.com/test/repo/pull/51', stderr: '' };
    }
    return { stdout: '[]', stderr: '' };
  });

  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);
  t.mock.method(console, 'log', () => {});

  try {
    await ghCommand.parseAsync([
      'watch', '--once',
      '--home-dir', tmpHome,
    ], { from: 'user' });

    const state = readWatchState(tmpHome) as { issues: Record<string, { completion_finalized: boolean }> };
    
    assert.equal(state.issues['42'].completion_finalized, true, 'Success: completion_finalized should be true when finalization succeeded');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

const basePolicy = { repo: 'test/repo', childCreatedPrNumbers: [51] };

// --- pr-review policy tests ---

test('evaluatePolicy: pr-review allowed for orchestrator', () => {
  const result = evaluatePolicy('pr-review', 'orchestrator', { pr_number: 51 }, basePolicy);
  assert.equal(result.allowed, true);
  assert.equal(result.enforced?.repo, 'test/repo');
  assert.equal(result.enforced?.pr_number, 51);
});

test('evaluatePolicy: pr-review denied for child-loop', () => {
  const result = evaluatePolicy('pr-review', 'child-loop', { pr_number: 51 }, basePolicy);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? '', /not allowed for child-loop/);
});

test('evaluatePolicy: pr-review denied for orchestrator when pr_number missing', () => {
  const result = evaluatePolicy('pr-review', 'orchestrator', {}, basePolicy);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? '', /pr_number/);
});

// --- resolve-review-thread policy tests ---

test('evaluatePolicy: resolve-review-thread allowed for child-loop on own PR', () => {
  const result = evaluatePolicy('resolve-review-thread', 'child-loop', { pr_number: 51 }, basePolicy);
  assert.equal(result.allowed, true);
  assert.equal(result.enforced?.repo, 'test/repo');
});

test('evaluatePolicy: resolve-review-thread denied for child-loop on foreign PR', () => {
  const result = evaluatePolicy('resolve-review-thread', 'child-loop', { pr_number: 99 }, basePolicy);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? '', /out of scope/);
});

test('evaluatePolicy: resolve-review-thread denied for child-loop when pr_number missing', () => {
  const result = evaluatePolicy('resolve-review-thread', 'child-loop', {}, basePolicy);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? '', /pr_number/);
});

test('evaluatePolicy: resolve-review-thread allowed for orchestrator', () => {
  const result = evaluatePolicy('resolve-review-thread', 'orchestrator', { pr_number: 51 }, basePolicy);
  assert.equal(result.allowed, true);
  assert.equal(result.enforced?.repo, 'test/repo');
});

// --- buildGhArgs shape tests ---

test('buildGhArgs: pr-review produces correct args shape with comments array', () => {
  const enforced = { repo: 'test/repo', pr_number: 51 };
  const payload = {
    pr_number: 51,
    body: 'Review summary',
    comments: [
      { path: 'src/foo.ts', line: 10, body: 'Fix this', suggestion: 'const x = 1;' },
      { path: 'src/bar.ts', line: 20, body: 'Another issue' },
    ],
  };
  const args = buildGhArgs('pr-review', payload, enforced);
  assert.equal(args[0], 'api');
  assert.equal(args[1], 'repos/test/repo/pulls/51/reviews');
  assert.equal(args[2], '--method');
  assert.equal(args[3], 'POST');
  assert.ok(args.includes('-f'));
  assert.ok(args.includes('event=COMMENT'));
  assert.ok(args.includes('body=Review summary'));
  // comments array entries
  assert.ok(args.includes('comments[][path]=src/foo.ts'));
  assert.ok(args.includes('comments[][line]=10'));
  // suggestion should be wrapped in fences
  const bodyArg = args.find((a) => a.startsWith('comments[][body]=Fix this'));
  assert.ok(bodyArg !== undefined, 'body arg with suggestion block should exist');
  assert.ok(bodyArg?.includes('```suggestion'), 'suggestion fences should be included');
  assert.ok(bodyArg?.includes('const x = 1;'), 'suggestion code should be included');
  // second comment without suggestion
  assert.ok(args.includes('comments[][path]=src/bar.ts'));
  assert.ok(args.includes('comments[][line]=20'));
  assert.ok(args.includes('comments[][body]=Another issue'));
});

test('buildGhArgs: resolve-review-thread produces graphql mutation args', () => {
  const enforced = { repo: 'test/repo' };
  const payload = { pr_number: 51, thread_id: 'PRRT_kwDOABC123' };
  const args = buildGhArgs('resolve-review-thread', payload, enforced);
  assert.equal(args[0], 'api');
  assert.equal(args[1], 'graphql');
  assert.equal(args[2], '-f');
  assert.ok(args[3]?.startsWith('query=mutation'), 'query should be a mutation');
  assert.ok(args[3]?.includes('resolveReviewThread'), 'should call resolveReviewThread');
  assert.ok(args[3]?.includes('PRRT_kwDOABC123'), 'should include thread_id');
});
