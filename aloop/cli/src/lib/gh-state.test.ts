import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parsePositiveInteger,
  parsePositiveIntegerOption,
  extractPositiveIntegers,
  extractRepoFromIssueUrl,
  normalizeWatchIssueEntry,
  normalizeWatchState,
  createEmptyWatchState,
  loadWatchState,
  saveWatchState,
  watchEntryFromStartResult,
  getRunningTrackedCount,
  setWatchEntry,
  enqueueIssue,
  removeTrackedIssue,
  readSessionState,
  refreshWatchState,
  ghLoopRuntime,
  GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
  type GhWatchIssueEntry,
  type GhWatchState,
  type GhStartResult,
} from './gh-state.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-state-test-'));
}

function makeEntry(overrides: Partial<GhWatchIssueEntry> = {}): GhWatchIssueEntry {
  const now = new Date().toISOString();
  return {
    issue_number: 1,
    session_id: 'sess-1',
    branch: 'agent/issue-1',
    repo: 'owner/repo',
    pr_number: null,
    pr_url: null,
    status: 'running',
    completion_state: null,
    completion_finalized: false,
    created_at: now,
    updated_at: now,
    feedback_iteration: 0,
    max_feedback_iterations: GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: [],
    processed_issue_comment_ids: [],
    processed_run_ids: [],
    last_ci_failure_signature: null,
    last_ci_failure_summary: null,
    same_ci_failure_count: 0,
    ...overrides,
  };
}

function makeStartResult(overrides: Partial<GhStartResult> = {}): GhStartResult {
  return {
    issue: { number: 42, title: 'Test issue', url: 'https://github.com/owner/repo/issues/42', repo: 'owner/repo' },
    session: {
      id: 'sess-42',
      dir: '/tmp/sess-42',
      prompts_dir: '/tmp/sess-42/prompts',
      work_dir: '/tmp/sess-42/worktree',
      branch: 'agent/issue-42',
      worktree: true,
      pid: 1234,
    },
    base_branch: 'agent/main',
    pr: null,
    issue_comment_posted: false,
    completion_state: null,
    pending_completion: true,
    warnings: [],
    ...overrides,
  };
}

// ─── parsePositiveInteger ────────────────────────────────────────────────────

test('parsePositiveInteger returns number for positive integer input', () => {
  assert.equal(parsePositiveInteger(1), 1);
  assert.equal(parsePositiveInteger(42), 42);
  assert.equal(parsePositiveInteger(100), 100);
});

test('parsePositiveInteger returns number for positive integer string', () => {
  assert.equal(parsePositiveInteger('1'), 1);
  assert.equal(parsePositiveInteger('42'), 42);
});

test('parsePositiveInteger returns undefined for zero', () => {
  assert.equal(parsePositiveInteger(0), undefined);
  assert.equal(parsePositiveInteger('0'), undefined);
});

test('parsePositiveInteger returns undefined for negative numbers', () => {
  assert.equal(parsePositiveInteger(-1), undefined);
  assert.equal(parsePositiveInteger('-5'), undefined);
});

test('parsePositiveInteger returns undefined for non-numeric strings', () => {
  assert.equal(parsePositiveInteger('abc'), undefined);
  assert.equal(parsePositiveInteger(''), undefined);
  assert.equal(parsePositiveInteger('1.5'), undefined);
});

test('parsePositiveInteger returns undefined for non-integer numbers', () => {
  assert.equal(parsePositiveInteger(1.5), undefined);
});

test('parsePositiveInteger returns undefined for null/undefined/object', () => {
  assert.equal(parsePositiveInteger(null), undefined);
  assert.equal(parsePositiveInteger(undefined), undefined);
  assert.equal(parsePositiveInteger({}), undefined);
});

// ─── parsePositiveIntegerOption ─────────────────────────────────────────────

test('parsePositiveIntegerOption returns fallback for undefined', () => {
  assert.equal(parsePositiveIntegerOption(undefined, 5, 'test'), 5);
});

test('parsePositiveIntegerOption returns fallback for null', () => {
  assert.equal(parsePositiveIntegerOption(null, 7, 'test'), 7);
});

test('parsePositiveIntegerOption returns fallback for empty string', () => {
  assert.equal(parsePositiveIntegerOption('', 3, 'test'), 3);
});

test('parsePositiveIntegerOption parses valid string', () => {
  assert.equal(parsePositiveIntegerOption('10', 5, 'test'), 10);
});

test('parsePositiveIntegerOption parses valid number', () => {
  assert.equal(parsePositiveIntegerOption(8, 5, 'test'), 8);
});

test('parsePositiveIntegerOption throws for invalid value', () => {
  assert.throws(() => parsePositiveIntegerOption('abc', 5, 'myOption'), /myOption/);
  assert.throws(() => parsePositiveIntegerOption('0', 5, 'myOption'), /myOption/);
  assert.throws(() => parsePositiveIntegerOption(-1, 5, 'myOption'), /myOption/);
});

// ─── extractPositiveIntegers ─────────────────────────────────────────────────

test('extractPositiveIntegers returns empty array for non-array', () => {
  assert.deepEqual(extractPositiveIntegers(null), []);
  assert.deepEqual(extractPositiveIntegers('abc'), []);
  assert.deepEqual(extractPositiveIntegers(42), []);
});

test('extractPositiveIntegers filters out non-positive values', () => {
  assert.deepEqual(extractPositiveIntegers([1, 0, -1, 'abc', 2, null]), [1, 2]);
});

test('extractPositiveIntegers handles string numbers', () => {
  assert.deepEqual(extractPositiveIntegers(['3', '0', '7']), [3, 7]);
});

// ─── extractRepoFromIssueUrl ─────────────────────────────────────────────────

test('extractRepoFromIssueUrl parses github.com URL', () => {
  assert.equal(
    extractRepoFromIssueUrl('https://github.com/owner/repo/issues/42'),
    'owner/repo',
  );
});

test('extractRepoFromIssueUrl parses GitHub Enterprise URL', () => {
  assert.equal(
    extractRepoFromIssueUrl('https://github.example.com/org/project/issues/1'),
    'org/project',
  );
});

test('extractRepoFromIssueUrl returns null for invalid URL', () => {
  assert.equal(extractRepoFromIssueUrl('not-a-url'), null);
  assert.equal(extractRepoFromIssueUrl('https://github.com/owner/issues/1'), null);
});

// ─── normalizeWatchIssueEntry ────────────────────────────────────────────────

test('normalizeWatchIssueEntry returns null for non-object inputs', () => {
  assert.equal(normalizeWatchIssueEntry(null), null);
  assert.equal(normalizeWatchIssueEntry('string'), null);
  assert.equal(normalizeWatchIssueEntry([1, 2]), null);
});

test('normalizeWatchIssueEntry returns null if issue_number is missing or invalid', () => {
  assert.equal(normalizeWatchIssueEntry({}), null);
  assert.equal(normalizeWatchIssueEntry({ issue_number: 0 }), null);
  assert.equal(normalizeWatchIssueEntry({ issue_number: 'abc' }), null);
});

test('normalizeWatchIssueEntry normalizes minimal valid entry', () => {
  const result = normalizeWatchIssueEntry({ issue_number: 5 });
  assert.ok(result);
  assert.equal(result.issue_number, 5);
  assert.equal(result.status, 'queued');
  assert.equal(result.feedback_iteration, 0);
  assert.equal(result.max_feedback_iterations, GH_FEEDBACK_DEFAULT_MAX_ITERATIONS);
  assert.deepEqual(result.processed_comment_ids, []);
  assert.equal(result.same_ci_failure_count, 0);
});

test('normalizeWatchIssueEntry preserves valid status values', () => {
  for (const status of ['running', 'queued', 'completed', 'stopped'] as const) {
    const result = normalizeWatchIssueEntry({ issue_number: 1, status });
    assert.ok(result);
    assert.equal(result.status, status);
  }
});

test('normalizeWatchIssueEntry falls back to queued for unknown status', () => {
  const result = normalizeWatchIssueEntry({ issue_number: 1, status: 'unknown' });
  assert.ok(result);
  assert.equal(result.status, 'queued');
});

test('normalizeWatchIssueEntry preserves valid fields', () => {
  const result = normalizeWatchIssueEntry({
    issue_number: 7,
    session_id: 'sess-7',
    branch: 'agent/issue-7',
    repo: 'org/proj',
    pr_number: 99,
    pr_url: 'https://github.com/org/proj/pull/99',
    status: 'running',
    feedback_iteration: 2,
    max_feedback_iterations: 10,
    processed_comment_ids: [1, 2, 3],
    same_ci_failure_count: 1,
  });
  assert.ok(result);
  assert.equal(result.session_id, 'sess-7');
  assert.equal(result.repo, 'org/proj');
  assert.equal(result.pr_number, 99);
  assert.equal(result.feedback_iteration, 2);
  assert.equal(result.max_feedback_iterations, 10);
  assert.deepEqual(result.processed_comment_ids, [1, 2, 3]);
  assert.equal(result.same_ci_failure_count, 1);
});

// ─── normalizeWatchState ─────────────────────────────────────────────────────

test('normalizeWatchState returns empty state for invalid input', () => {
  assert.deepEqual(normalizeWatchState(null), createEmptyWatchState());
  assert.deepEqual(normalizeWatchState('bad'), createEmptyWatchState());
  assert.deepEqual(normalizeWatchState([]), createEmptyWatchState());
});

test('normalizeWatchState preserves valid issues and queue', () => {
  const raw = {
    version: 1,
    issues: {
      '5': { issue_number: 5, status: 'running' },
    },
    queue: [],
  };
  const result = normalizeWatchState(raw);
  assert.ok(result.issues['5']);
  assert.equal(result.issues['5'].issue_number, 5);
});

test('normalizeWatchState deduplicates queue between explicit queue and queued issues', () => {
  const raw = {
    version: 1,
    issues: {
      '10': { issue_number: 10, status: 'queued' },
    },
    queue: [10],
  };
  const result = normalizeWatchState(raw);
  assert.equal(result.queue.filter((n) => n === 10).length, 1);
});

test('normalizeWatchState adds queued issues missing from queue', () => {
  const raw = {
    version: 1,
    issues: {
      '20': { issue_number: 20, status: 'queued' },
    },
    queue: [],
  };
  const result = normalizeWatchState(raw);
  assert.ok(result.queue.includes(20));
});

// ─── createEmptyWatchState ───────────────────────────────────────────────────

test('createEmptyWatchState returns correct structure', () => {
  const state = createEmptyWatchState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.issues, {});
  assert.deepEqual(state.queue, []);
});

// ─── loadWatchState / saveWatchState ─────────────────────────────────────────

test('loadWatchState returns empty state if file does not exist', () => {
  const tmpDir = makeTmpDir();
  try {
    const state = loadWatchState(tmpDir);
    assert.deepEqual(state, createEmptyWatchState());
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('saveWatchState writes file and loadWatchState reads it back', () => {
  const tmpDir = makeTmpDir();
  try {
    const state: GhWatchState = {
      version: 1,
      issues: {
        '3': makeEntry({ issue_number: 3, status: 'completed' }),
      },
      queue: [],
    };
    saveWatchState(tmpDir, state);
    const loaded = loadWatchState(tmpDir);
    assert.equal(loaded.issues['3']?.issue_number, 3);
    assert.equal(loaded.issues['3']?.status, 'completed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadWatchState returns empty state for invalid JSON', () => {
  const tmpDir = makeTmpDir();
  try {
    const watchFile = path.join(tmpDir, '.aloop', 'watch.json');
    fs.mkdirSync(path.dirname(watchFile), { recursive: true });
    fs.writeFileSync(watchFile, 'not valid json', 'utf8');
    const state = loadWatchState(tmpDir);
    assert.deepEqual(state, createEmptyWatchState());
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── watchEntryFromStartResult ───────────────────────────────────────────────

test('watchEntryFromStartResult creates running entry when pending_completion=true', () => {
  const result = makeStartResult({ pending_completion: true });
  const entry = watchEntryFromStartResult(result);
  assert.equal(entry.issue_number, 42);
  assert.equal(entry.session_id, 'sess-42');
  assert.equal(entry.branch, 'agent/issue-42');
  assert.equal(entry.repo, 'owner/repo');
  assert.equal(entry.status, 'running');
  assert.equal(entry.completion_finalized, false);
  assert.equal(entry.feedback_iteration, 0);
});

test('watchEntryFromStartResult creates completed entry when pending_completion=false', () => {
  const result = makeStartResult({ pending_completion: false, completion_state: 'exited' });
  const entry = watchEntryFromStartResult(result);
  assert.equal(entry.status, 'completed');
  assert.equal(entry.completion_finalized, true);
  assert.equal(entry.completion_state, 'exited');
});

test('watchEntryFromStartResult copies pr data from start result', () => {
  const result = makeStartResult({ pr: { number: 55, url: 'https://github.com/owner/repo/pull/55' } });
  const entry = watchEntryFromStartResult(result);
  assert.equal(entry.pr_number, 55);
  assert.equal(entry.pr_url, 'https://github.com/owner/repo/pull/55');
});

// ─── getRunningTrackedCount ──────────────────────────────────────────────────

test('getRunningTrackedCount counts only running entries', () => {
  const state = createEmptyWatchState();
  state.issues['1'] = makeEntry({ issue_number: 1, status: 'running' });
  state.issues['2'] = makeEntry({ issue_number: 2, status: 'running' });
  state.issues['3'] = makeEntry({ issue_number: 3, status: 'queued' });
  state.issues['4'] = makeEntry({ issue_number: 4, status: 'completed' });
  assert.equal(getRunningTrackedCount(state), 2);
});

test('getRunningTrackedCount returns 0 for empty state', () => {
  assert.equal(getRunningTrackedCount(createEmptyWatchState()), 0);
});

// ─── setWatchEntry ───────────────────────────────────────────────────────────

test('setWatchEntry stores entry and removes from queue', () => {
  const state = createEmptyWatchState();
  state.queue = [5, 6, 7];
  const entry = makeEntry({ issue_number: 6, status: 'running' });
  setWatchEntry(state, entry);
  assert.ok(state.issues['6']);
  assert.equal(state.issues['6'].status, 'running');
  assert.deepEqual(state.queue, [5, 7]);
});

// ─── enqueueIssue ────────────────────────────────────────────────────────────

test('enqueueIssue adds new issue to queue and issues', () => {
  const state = createEmptyWatchState();
  enqueueIssue(state, { number: 10, title: 'Issue 10', url: 'https://github.com/owner/repo/issues/10' });
  assert.ok(state.issues['10']);
  assert.equal(state.issues['10'].status, 'queued');
  assert.ok(state.queue.includes(10));
});

test('enqueueIssue does not add running issue to queue', () => {
  const state = createEmptyWatchState();
  state.issues['10'] = makeEntry({ issue_number: 10, status: 'running' });
  enqueueIssue(state, { number: 10, title: 'Issue 10', url: 'https://github.com/owner/repo/issues/10' });
  assert.equal(state.issues['10'].status, 'running');
  assert.equal(state.queue.includes(10), false);
});

test('enqueueIssue does not add completed issue to queue', () => {
  const state = createEmptyWatchState();
  state.issues['10'] = makeEntry({ issue_number: 10, status: 'completed' });
  enqueueIssue(state, { number: 10, title: 'Issue 10', url: 'https://github.com/owner/repo/issues/10' });
  assert.equal(state.issues['10'].status, 'completed');
  assert.equal(state.queue.includes(10), false);
});

test('enqueueIssue deduplicates: does not add duplicate to queue', () => {
  const state = createEmptyWatchState();
  enqueueIssue(state, { number: 11, title: 'Issue 11', url: 'https://github.com/owner/repo/issues/11' });
  enqueueIssue(state, { number: 11, title: 'Issue 11', url: 'https://github.com/owner/repo/issues/11' });
  assert.equal(state.queue.filter((n) => n === 11).length, 1);
});

test('enqueueIssue extracts repo from issue URL', () => {
  const state = createEmptyWatchState();
  enqueueIssue(state, { number: 12, title: 'Issue 12', url: 'https://github.com/myorg/myrepo/issues/12' });
  assert.equal(state.issues['12']?.repo, 'myorg/myrepo');
});

// ─── removeTrackedIssue ──────────────────────────────────────────────────────

test('removeTrackedIssue removes from issues and queue', () => {
  const state = createEmptyWatchState();
  state.issues['5'] = makeEntry({ issue_number: 5, status: 'queued' });
  state.queue = [5, 6];
  removeTrackedIssue(state, 5);
  assert.equal(state.issues['5'], undefined);
  assert.deepEqual(state.queue, [6]);
});

test('removeTrackedIssue is a no-op for unknown issue', () => {
  const state = createEmptyWatchState();
  state.queue = [1];
  removeTrackedIssue(state, 99);
  assert.deepEqual(state.queue, [1]);
});

// ─── readSessionState ────────────────────────────────────────────────────────

test('readSessionState returns null if file does not exist', () => {
  const tmpDir = makeTmpDir();
  try {
    const result = readSessionState(tmpDir, 'nonexistent-session');
    assert.equal(result, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readSessionState returns state string from status.json', () => {
  const tmpDir = makeTmpDir();
  try {
    const sessionDir = path.join(tmpDir, '.aloop', 'sessions', 'sess-abc');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'exited' }), 'utf8');
    const result = readSessionState(tmpDir, 'sess-abc');
    assert.equal(result, 'exited');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readSessionState returns null for invalid JSON', () => {
  const tmpDir = makeTmpDir();
  try {
    const sessionDir = path.join(tmpDir, '.aloop', 'sessions', 'sess-xyz');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'status.json'), 'not json', 'utf8');
    const result = readSessionState(tmpDir, 'sess-xyz');
    assert.equal(result, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readSessionState returns null when state field is missing', () => {
  const tmpDir = makeTmpDir();
  try {
    const sessionDir = path.join(tmpDir, '.aloop', 'sessions', 'sess-nf');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ other: 'value' }), 'utf8');
    const result = readSessionState(tmpDir, 'sess-nf');
    assert.equal(result, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── refreshWatchState ───────────────────────────────────────────────────────

test('refreshWatchState keeps entry as running when session is active', async (t) => {
  const tmpDir = makeTmpDir();
  try {
    const state = createEmptyWatchState();
    // refreshWatchState skips queued entries; start with running status
    state.issues['1'] = makeEntry({ issue_number: 1, session_id: 'sess-1', status: 'running' });

    t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => [
      { session_id: 'sess-1', iteration: 1 },
    ]);

    await refreshWatchState(tmpDir, state);
    assert.equal(state.issues['1']?.status, 'running');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('refreshWatchState marks entry as completed when session is exited', async (t) => {
  const tmpDir = makeTmpDir();
  try {
    const sessionDir = path.join(tmpDir, '.aloop', 'sessions', 'sess-done');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'exited' }), 'utf8');

    const state = createEmptyWatchState();
    state.issues['2'] = makeEntry({ issue_number: 2, session_id: 'sess-done', status: 'running' });

    t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);

    await refreshWatchState(tmpDir, state);
    assert.equal(state.issues['2']?.status, 'completed');
    assert.equal(state.issues['2']?.completion_state, 'exited');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('refreshWatchState marks entry as stopped when session state is stopped', async (t) => {
  const tmpDir = makeTmpDir();
  try {
    const sessionDir = path.join(tmpDir, '.aloop', 'sessions', 'sess-stop');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'stopped' }), 'utf8');

    const state = createEmptyWatchState();
    state.issues['3'] = makeEntry({ issue_number: 3, session_id: 'sess-stop', status: 'running' });

    t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);

    await refreshWatchState(tmpDir, state);
    assert.equal(state.issues['3']?.status, 'stopped');
    assert.equal(state.issues['3']?.completion_state, 'stopped');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('refreshWatchState removes non-queued entries from queue', async (t) => {
  const tmpDir = makeTmpDir();
  try {
    const state = createEmptyWatchState();
    state.issues['4'] = makeEntry({ issue_number: 4, session_id: 'sess-4', status: 'running' });
    state.queue = [4]; // stale entry in queue

    t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => [
      { session_id: 'sess-4', iteration: 1 },
    ]);

    await refreshWatchState(tmpDir, state);
    assert.equal(state.queue.includes(4), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('refreshWatchState returns active sessions map', async (t) => {
  const tmpDir = makeTmpDir();
  try {
    const state = createEmptyWatchState();

    t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => [
      { session_id: 'sess-a', iteration: 2 },
    ]);

    const result = await refreshWatchState(tmpDir, state);
    assert.ok(result.has('sess-a'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
