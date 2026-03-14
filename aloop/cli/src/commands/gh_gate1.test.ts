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
