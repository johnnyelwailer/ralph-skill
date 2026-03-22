import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ghCommand,
  ghExecutor,
  ghLoopRuntime,
  ghStartCommandWithDeps,
  collectNewFeedback,
  hasFeedback,
  buildFeedbackSteering,
  markFeedbackProcessed,
  buildCiFailureSignature,
  fetchPrCheckRuns,
  GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
  normalizeWatchIssueEntry,
  normalizeWatchState,
  loadWatchState,
  parsePositiveIntegerOption,
  enqueueIssue,
  parseGhIssueList,
  readSessionState,
  refreshWatchState,
  fetchMatchingIssues,
  fetchPrReviewComments,
  fetchPrIssueComments,
  fetchFailedCheckLogs,
  finalizeWatchEntry,
  runGhWatchCycle,
  ghWatchCommand,
  ghStatusCommand,
  selectUsableGhBinary,
  includesAloopTrackingLabel,
  buildGhArgs,
  parseGhOutput,
  executeGhOperation,
  evaluatePolicy,
  formatGhStatusRows,
  ghStopCommand,
  extractRepoFromIssueUrl,
  type PrReviewComment,
  type PrCheckRun,
  type PrFeedback,
  type GhWatchIssueEntry,
  type GhWatchIssueStatus,
} from './gh.js';

type GhFixture = {
  tmpHome: string;
  sessionDir: string;
  requestFile: string;
};

function createFixture(): GhFixture {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-test-'));
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'test-session');
  fs.mkdirSync(sessionDir, { recursive: true });

  const configFile = path.join(sessionDir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({
    repo: 'test/repo',
    issue_number: 42,
    created_pr_numbers: [15, 18],
  }), 'utf8');

  const requestFile = path.join(tmpHome, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'test/repo',
    labels: ['aloop'],
  }), 'utf8');

  return { tmpHome, sessionDir, requestFile };
}

function readLogEntries(sessionDir: string): Array<Record<string, unknown>> {
  const logFile = path.join(sessionDir, 'log.jsonl');
  const lines = fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean);
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

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

function buildStartResult(issueNumber: number, sessionId: string, status: 'running' | 'completed' = 'running') {
  return {
    issue: {
      number: issueNumber,
      title: `Issue ${issueNumber}`,
      url: `https://github.com/test/repo/issues/${issueNumber}`,
      repo: 'test/repo',
    },
    session: {
      id: sessionId,
      dir: `/tmp/${sessionId}`,
      prompts_dir: `/tmp/${sessionId}/prompts`,
      work_dir: `/tmp/${sessionId}/worktree`,
      branch: `agent/issue-${issueNumber}`,
      worktree: true,
      pid: 1234,
    },
    base_branch: 'agent/main' as const,
    pr: null,
    issue_comment_posted: false,
    completion_state: status === 'completed' ? 'exited' : null,
    pending_completion: status !== 'completed',
    warnings: [],
  };
}

test('ghCommand allows child-loop to create PRs and logs gh_operation', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: 'https://github.com/test/repo/pull/42\n', stderr: '' }));

  try {
    await ghCommand.parseAsync([
      'pr-create',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'child-loop',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const logFile = path.join(fixture.sessionDir, 'log.jsonl');
    assert.equal(fs.existsSync(logFile), true);
    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'pr-create');
    assert.equal(entries[0].role, 'child-loop');
    assert.equal(entries[0].result, 'success');
    assert.equal((entries[0].enforced as { base?: string }).base, 'agent/trunk');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop from merging PRs and logs gh_operation_denied', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-merge',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const logFile = path.join(fixture.sessionDir, 'log.jsonl');
    assert.equal(fs.existsSync(logFile), true);
    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.equal(entries[0].type, 'pr-merge');
    assert.equal(entries[0].role, 'child-loop');
    assert.match(String(entries[0].reason), /not allowed/);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator to merge PRs', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  try {
    await ghCommand.parseAsync([
      'pr-merge',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const logFile = path.join(fixture.sessionDir, 'log.jsonl');
    assert.equal(fs.existsSync(logFile), true);
    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal((entries[0].enforced as { merge_method?: string }).merge_method, 'squash');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies request with mismatched repo', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  // Overwrite request file with a mismatched repo
  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'wrong/repo',
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const logFile = path.join(fixture.sessionDir, 'log.jsonl');
    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /Mismatched repo/);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies operations targeting main branch', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'test/repo',
    base: 'main',
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /targeting main/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows child-loop issue-comment only on assigned issue', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 42,
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-comment',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'child-loop',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal((entries[0].enforced as { issue_number?: number }).issue_number, 42);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop issue-comment outside assigned issue scope', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 99,
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /assigned issue/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop issue-comment with non-numeric issue_number', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 'forty-two',
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /requires numeric issue_number/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop issue-comment when assigned issue scope is missing in config', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(path.join(fixture.sessionDir, 'config.json'), JSON.stringify({
    repo: 'test/repo',
  }), 'utf8');

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 42,
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /missing assigned issue scope/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows child-loop pr-comment only on child-created PRs', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-comment',
    repo: 'test/repo',
    pr_number: 18,
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'pr-comment',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'child-loop',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal((entries[0].enforced as { pr_number?: number }).pr_number, 18);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop pr-comment for PR outside child scope', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-comment',
    repo: 'test/repo',
    pr_number: 21,
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /created by this session/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop pr-comment with non-numeric pr_number', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-comment',
    repo: 'test/repo',
    pr_number: 'fifteen',
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /requires numeric pr_number/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop pr-comment when created_pr_numbers is not an array', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(path.join(fixture.sessionDir, 'config.json'), JSON.stringify({
    repo: 'test/repo',
    issue_number: 42,
    created_pr_numbers: '15',
  }), 'utf8');

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-comment',
    repo: 'test/repo',
    pr_number: 15,
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /created by this session/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies orchestrator issue-close without aloop target validation', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-close',
    repo: 'test/repo',
    issue_number: 42,
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-close',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'orchestrator',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /aloop/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-close with aloop-scoped target labels', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-close',
    repo: 'test/repo',
    issue_number: 42,
    target_labels: ['aloop'],
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-close',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-close');
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator comment operations with aloop-scoped targets', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 42,
    target_labels: ['aloop'],
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-comment',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-comment');
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies orchestrator issue-comment when aloop is only in request labels', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 42,
    labels: ['aloop'],
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'orchestrator',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /aloop/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies orchestrator pr-comment without aloop-scoped target validation', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-comment',
    repo: 'test/repo',
    pr_number: 15,
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-comment',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'orchestrator',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /aloop/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-label add for aloop/blocked-on-human', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  let capturedArgs: string[] | undefined;
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    capturedArgs = args;
    return { stdout: '', stderr: '' };
  });

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-label',
    repo: 'test/repo',
    issue_number: 42,
    label_action: 'add',
    label: 'aloop/blocked-on-human',
    target_labels: ['aloop'],
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-label',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    assert.deepStrictEqual(capturedArgs, [
      'issue', 'edit', '42', '--repo', 'test/repo', '--add-label', 'aloop/blocked-on-human'
    ]);

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-label');
    assert.equal((entries[0].enforced as { label_action?: string }).label_action, 'add');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-label remove for aloop/blocked-on-human', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  let capturedArgs: string[] | undefined;
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    capturedArgs = args;
    return { stdout: '', stderr: '' };
  });

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-label',
    repo: 'test/repo',
    issue_number: 42,
    label_action: 'remove',
    label: 'aloop/blocked-on-human',
    target_labels: ['aloop'],
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-label',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    assert.deepStrictEqual(capturedArgs, [
      'issue', 'edit', '42', '--repo', 'test/repo', '--remove-label', 'aloop/blocked-on-human'
    ]);

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-label');
    assert.equal((entries[0].enforced as { label_action?: string }).label_action, 'remove');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies orchestrator issue-label when label is not aloop/blocked-on-human', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-label',
    repo: 'test/repo',
    issue_number: 42,
    label_action: 'add',
    label: 'bug',
    target_labels: ['aloop'],
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-label',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'orchestrator',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /only permits aloop\/blocked-on-human/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-comments with --since and no request file', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  let capturedArgs: string[] | undefined;
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    capturedArgs = args;
    return {
      stdout: JSON.stringify([{ id: 123, body: 'hello' }]),
      stderr: '',
    };
  });

  try {
    await ghCommand.parseAsync([
      'issue-comments',
      '--session', 'test-session',
      '--since', '2026-03-14T11:00:00Z',
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    assert.deepStrictEqual(capturedArgs, [
      'api', 'repos/test/repo/issues/comments', '--method', 'GET', '-f', 'since=2026-03-14T11:00:00Z'
    ]);

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-comments');
    assert.equal(entries[0].request_file, undefined);
    assert.equal(entries[0].comment_count, 1);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand normalizes issue-comments output when GH API returns a non-array JSON payload', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({
    stdout: JSON.stringify({ id: 123, body: 'hello' }),
    stderr: '',
  }));

  try {
    await ghCommand.parseAsync([
      'issue-comments',
      '--session', 'test-session',
      '--since', '2026-03-14T11:00:00Z',
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-comments');
    assert.deepStrictEqual(entries[0].comments, []);
    assert.equal(entries[0].comment_count, 0);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand logs gh_operation_error when issue-comments output is invalid JSON', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);
  t.mock.method(ghExecutor, 'exec', async () => ({
    stdout: '{not valid json',
    stderr: '',
  }));

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-comments',
        '--session', 'test-session',
        '--since', '2026-03-14T11:00:00Z',
        '--role', 'orchestrator',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_error');
    assert.equal(entries[0].type, 'issue-comments');
    assert.match(String(entries[0].error), /Unexpected token|JSON|position/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies child-loop pr-comments listing', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-comments',
        '--session', 'test-session',
        '--since', '2026-03-14T11:00:00Z',
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /not allowed for child-loop role/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

// --- Missing request file ---

test('ghCommand exits non-zero when request file does not exist', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  const missingRequest = path.join(fixture.tmpHome, 'nonexistent.json');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'test-session',
        '--request', missingRequest,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

// --- Invalid request JSON ---

test('ghCommand exits non-zero when request file contains invalid JSON', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, '{not valid json!!!', 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

// --- Unknown role ---

test('ghCommand denies unknown role and logs gh_operation_denied', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'test/repo',
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'rogue-agent',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /Unknown role/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

// --- Denied operations (branch-delete is always rejected) ---

test('ghCommand denies branch-delete for child-loop', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'branch-delete',
    repo: 'test/repo',
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'branch-delete',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'child-loop',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /not allowed/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies branch-delete for orchestrator', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'branch-delete',
    repo: 'test/repo',
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'branch-delete',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'orchestrator',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /cleanup is manual/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

// --- Missing session config ---

test('ghCommand hard-fails when session config.json is missing', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-test-'));
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'no-config-session');
  fs.mkdirSync(sessionDir, { recursive: true });
  // Deliberately do NOT create config.json

  const requestFile = path.join(tmpHome, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'test/repo',
  }), 'utf8');

  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'no-config-session',
        '--request', requestFile,
        '--role', 'child-loop',
        '--home-dir', tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /Session config not found/i);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand creates missing session directory before denial logging', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-test-'));
  const sessionId = 'missing-session-dir';
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', sessionId);
  const requestFile = path.join(tmpHome, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'test/repo',
  }), 'utf8');

  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', sessionId,
        '--request', requestFile,
        '--role', 'child-loop',
        '--home-dir', tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    assert.equal(fs.existsSync(sessionDir), true);
    const logFile = path.join(sessionDir, 'log.jsonl');
    assert.equal(fs.existsSync(logFile), true);
    const entries = readLogEntries(sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /Session config not found/i);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

// --- Invalid session config: missing repo ---

test('ghCommand hard-fails when config.json is missing repo field', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-test-'));
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'bad-config-session');
  fs.mkdirSync(sessionDir, { recursive: true });

  fs.writeFileSync(path.join(sessionDir, 'config.json'), JSON.stringify({
    issue_number: 42,
  }), 'utf8');

  const requestFile = path.join(tmpHome, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'test/repo',
  }), 'utf8');

  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'bad-config-session',
        '--request', requestFile,
        '--role', 'child-loop',
        '--home-dir', tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /missing or invalid.*repo/i);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

// --- Invalid session config: malformed JSON ---

test('ghCommand hard-fails when config.json contains invalid JSON', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-test-'));
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'broken-config');
  fs.mkdirSync(sessionDir, { recursive: true });

  fs.writeFileSync(path.join(sessionDir, 'config.json'), '{{not json', 'utf8');

  const requestFile = path.join(tmpHome, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    type: 'pr-create',
    repo: 'test/repo',
  }), 'utf8');

  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'pr-create',
        '--session', 'broken-config',
        '--request', requestFile,
        '--role', 'child-loop',
        '--home-dir', tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

// --- Orchestrator issue-create label guards ---

test('ghCommand denies orchestrator issue-create without aloop label', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-create',
    repo: 'test/repo',
    labels: ['bug'],
  }), 'utf8');

  try {
    await assert.rejects(
      () => ghCommand.parseAsync([
        'issue-create',
        '--session', 'test-session',
        '--request', fixture.requestFile,
        '--role', 'orchestrator',
        '--home-dir', fixture.tmpHome,
      ], { from: 'user' }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation_denied');
    assert.match(String(entries[0].reason), /aloop/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-create with aloop label', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: 'https://github.com/test/repo/issues/7\n', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-create',
    repo: 'test/repo',
    labels: ['aloop'],
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-create',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-create');
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-create when labels is a string containing aloop', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  let capturedArgs: string[] | undefined;
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    capturedArgs = args;
    return { stdout: 'https://github.com/test/repo/issues/8\n', stderr: '' };
  });

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-create',
    repo: 'test/repo',
    labels: 'aloop',
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-create',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    assert.deepStrictEqual(capturedArgs, ['issue', 'create', '--repo', 'test/repo']);

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'gh_operation');
    assert.equal(entries[0].type, 'issue-create');
    assert.equal(entries[0].url, 'https://github.com/test/repo/issues/8');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

// --- enforced.repo assertions on allowed paths ---

test('ghCommand enforces session repo on allowed child-loop pr-create', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: 'https://github.com/test/repo/pull/10\n', stderr: '' }));

  try {
    await ghCommand.parseAsync([
      'pr-create',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'child-loop',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand enforces session repo on allowed orchestrator pr-merge', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  try {
    await ghCommand.parseAsync([
      'pr-merge',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
    assert.equal((entries[0].enforced as { merge_method?: string }).merge_method, 'squash');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand enforces session repo on allowed child-loop issue-comment', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 42,
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'issue-comment',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'child-loop',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand enforces session repo on allowed child-loop pr-comment', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'pr-comment',
    repo: 'test/repo',
    pr_number: 15,
  }), 'utf8');

  try {
    await ghCommand.parseAsync([
      'pr-comment',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'child-loop',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand enforces session repo on allowed orchestrator pr-create', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: 'https://github.com/test/repo/pull/5\n', stderr: '' }));

  try {
    await ghCommand.parseAsync([
      'pr-create',
      '--session', 'test-session',
      '--request', fixture.requestFile,
      '--role', 'orchestrator',
      '--home-dir', fixture.tmpHome,
    ], { from: 'user' });

    const entries = readLogEntries(fixture.sessionDir);
    assert.equal(entries.length, 1);
    assert.equal((entries[0].enforced as { repo?: string }).repo, 'test/repo');
    assert.equal((entries[0].enforced as { base?: string }).base, 'agent/trunk');
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghStartCommandWithDeps injects issue/spec context and prepares branch/session metadata', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-start-test-'));
  const promptsDir = path.join(tmpRoot, 'prompts');
  const sessionDir = path.join(tmpRoot, 'session');
  const specPath = path.join(tmpRoot, 'SPEC.slice.md');
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(promptsDir, 'PROMPT_plan.md'), '# Existing planner prompt\n', 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({ project_root: '/repo/root' }), 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'running' }), 'utf8');
  fs.writeFileSync(specPath, '# Additional spec context\n', 'utf8');

  const ghCalls: string[][] = [];
  const gitCalls: string[][] = [];
  let startOptions: { provider?: string; maxIterations?: string | number } = {};

  try {
    const result = await ghStartCommandWithDeps(
      { issue: '42', spec: specPath, provider: 'codex', max: '30', output: 'json' },
      {
        startSession: async (options: any) => {
          startOptions = options as { provider?: string; maxIterations?: string | number };
          return {
            session_id: 'sess-42',
            session_dir: sessionDir,
            prompts_dir: promptsDir,
            work_dir: path.join(sessionDir, 'worktree'),
            worktree: true,
            worktree_path: path.join(sessionDir, 'worktree'),
            branch: 'aloop/sess-42',
            provider: 'codex',
            mode: 'plan-build-review',
            launch_mode: 'start',
            max_iterations: 30,
            max_stuck: 3,
            pid: 1234,
            started_at: '2026-03-14T12:00:00.000Z',
            monitor_mode: 'none',
            monitor_auto_open: false,
            monitor_pid: null,
            dashboard_url: null,
            warnings: [],
          };
        },
        execGh: async (args: string[]) => {
          ghCalls.push(args);
          if (args[0] === 'issue' && args[1] === 'view') {
            return {
              stdout: JSON.stringify({
                number: 42,
                title: 'Fix auth flow',
                body: 'Implement auth handling for X',
                url: 'https://github.com/test/repo/issues/42',
                labels: [{ name: 'bug' }],
                comments: [{ author: { login: 'alice' }, body: 'Please include tests.' }],
              }),
              stderr: '',
            };
          }
          throw new Error(`Unexpected gh call: ${args.join(' ')}`);
        },
        execGit: async (args: string[]) => {
          gitCalls.push(args);
          if (args.includes('rev-parse')) {
            throw new Error('branch missing');
          }
          return { stdout: '', stderr: '' };
        },
        readFile: (filePath: string, encoding: BufferEncoding) => fs.readFileSync(filePath, encoding),
        writeFile: (filePath: string, content: string) => fs.writeFileSync(filePath, content, 'utf8'),
        existsSync: (filePath: string) => fs.existsSync(filePath),
        cwd: () => tmpRoot,
      } as any,
    );

    assert.equal(result.issue.number, 42);
    assert.equal(result.issue.repo, 'test/repo');
    assert.equal(result.pending_completion, true);
    assert.equal(result.base_branch, 'agent/main');
    assert.equal(startOptions.provider, 'codex');
    assert.equal(startOptions.maxIterations, '30');

    const updatedPrompt = fs.readFileSync(path.join(promptsDir, 'PROMPT_plan.md'), 'utf8');
    assert.match(updatedPrompt, /GitHub Issue Requirements/);
    assert.match(updatedPrompt, /Issue: #42/);
    assert.match(updatedPrompt, /Additional Spec Context/);
    assert.match(updatedPrompt, /# Additional spec context/);

    const updatedConfig = JSON.parse(fs.readFileSync(path.join(sessionDir, 'config.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(updatedConfig.repo, 'test/repo');
    assert.equal(updatedConfig.issue_number, 42);
    assert.deepStrictEqual(updatedConfig.created_pr_numbers, []);

    const updatedMeta = JSON.parse(fs.readFileSync(path.join(sessionDir, 'meta.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(updatedMeta.branch, 'agent/issue-42-fix-auth-flow');
    assert.equal(updatedMeta.gh_issue_number, 42);
    assert.equal(ghCalls.length, 1);
    assert.equal(gitCalls[0][2], 'branch');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('ghStartCommandWithDeps creates PR and issue summary comment when session already exited', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-start-finalize-'));
  const promptsDir = path.join(tmpRoot, 'prompts');
  const sessionDir = path.join(tmpRoot, 'session');
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(promptsDir, 'PROMPT_plan.md'), '# planner\n', 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({ project_root: '/repo/root' }), 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'exited' }), 'utf8');

  const ghCalls: string[][] = [];

  try {
    const result = await ghStartCommandWithDeps(
      { issue: 7, repo: 'octo/repo', output: 'json' },
      {
        startSession: async () => ({
          session_id: 'sess-7',
          session_dir: sessionDir,
          prompts_dir: promptsDir,
          work_dir: path.join(sessionDir, 'worktree'),
          worktree: true,
          worktree_path: path.join(sessionDir, 'worktree'),
          branch: 'aloop/sess-7',
          provider: 'claude',
          mode: 'plan-build-review',
          launch_mode: 'start',
          max_iterations: 50,
          max_stuck: 3,
          pid: 4321,
          started_at: '2026-03-14T12:00:00.000Z',
          monitor_mode: 'none',
          monitor_auto_open: false,
          monitor_pid: null,
          dashboard_url: null,
          warnings: [],
        }),
        execGh: async (args: string[]) => {
          ghCalls.push(args);
          if (args[0] === 'issue' && args[1] === 'view') {
            return {
              stdout: JSON.stringify({
                number: 7,
                title: 'Improve docs',
                body: 'Do docs work',
                url: 'https://github.com/octo/repo/issues/7',
                labels: [],
                comments: [],
              }),
              stderr: '',
            };
          }
          if (args[0] === 'pr' && args[1] === 'create') {
            return { stdout: 'https://github.com/octo/repo/pull/99\n', stderr: '' };
          }
          if (args[0] === 'issue' && args[1] === 'comment') {
            return { stdout: '', stderr: '' };
          }
          throw new Error(`Unexpected gh call: ${args.join(' ')}`);
        },
        execGit: async () => ({ stdout: '', stderr: '' }),
        readFile: (filePath: string, encoding: BufferEncoding) => fs.readFileSync(filePath, encoding),
        writeFile: (filePath: string, content: string) => fs.writeFileSync(filePath, content, 'utf8'),
        existsSync: (filePath: string) => fs.existsSync(filePath),
        cwd: () => tmpRoot,
      } as any,
    );

    assert.equal(result.pending_completion, false);
    assert.equal(result.issue_comment_posted, true);
    assert.equal(result.pr?.number, 99);
    assert.equal(result.pr?.url, 'https://github.com/octo/repo/pull/99');
    assert.equal(ghCalls.filter((args) => args[0] === 'pr' && args[1] === 'create').length, 1);
    assert.equal(ghCalls.filter((args) => args[0] === 'issue' && args[1] === 'comment').length, 1);

    const config = JSON.parse(fs.readFileSync(path.join(sessionDir, 'config.json'), 'utf8')) as Record<string, unknown>;
    assert.deepStrictEqual(config.created_pr_numbers, [99]);
    assert.deepStrictEqual(config.childCreatedPrNumbers, [99]);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('ghStartCommandWithDeps persists issue/session mapping in watch.json', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-watch-map-'));
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-start-watch-'));
  const promptsDir = path.join(tmpRoot, 'prompts');
  const sessionDir = path.join(tmpRoot, 'session');
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(promptsDir, 'PROMPT_plan.md'), '# planner\n', 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({ project_root: '/repo/root' }), 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'running' }), 'utf8');

  try {
    await ghStartCommandWithDeps(
      { issue: 55, repo: 'test/repo', homeDir: tmpHome, output: 'json' },
      {
        startSession: async () => ({
          session_id: 'sess-55',
          session_dir: sessionDir,
          prompts_dir: promptsDir,
          work_dir: path.join(sessionDir, 'worktree'),
          worktree: true,
          worktree_path: path.join(sessionDir, 'worktree'),
          branch: 'aloop/sess-55',
          provider: 'claude',
          mode: 'plan-build-review',
          launch_mode: 'start',
          max_iterations: 50,
          max_stuck: 3,
          pid: 4242,
          started_at: '2026-03-14T12:00:00.000Z',
          monitor_mode: 'none',
          monitor_auto_open: false,
          monitor_pid: null,
          dashboard_url: null,
          warnings: [],
        }),
        execGh: async (args: string[]) => {
          if (args[0] === 'issue' && args[1] === 'view') {
            return {
              stdout: JSON.stringify({
                number: 55,
                title: 'Add mapping',
                body: 'Track watch state',
                url: 'https://github.com/test/repo/issues/55',
                labels: [],
                comments: [],
              }),
              stderr: '',
            };
          }
          throw new Error(`Unexpected gh call: ${args.join(' ')}`);
        },
        execGit: async () => ({ stdout: '', stderr: '' }),
        readFile: (filePath: string, encoding: BufferEncoding) => fs.readFileSync(filePath, encoding),
        writeFile: (filePath: string, content: string) => fs.writeFileSync(filePath, content, 'utf8'),
        existsSync: (filePath: string) => fs.existsSync(filePath),
        cwd: () => tmpRoot,
      } as any,
    );

    const watchState = readWatchState(tmpHome) as { issues?: Record<string, { session_id?: string; status?: string }> };
    assert.equal(watchState.issues?.['55']?.session_id, 'sess-55');
    assert.equal(watchState.issues?.['55']?.status, 'running');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('gh status outputs tracked issue/session mappings from watch.json', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-status-watch-'));
  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => {
    output.push(String(line ?? ''));
  });
  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => ([
    {
      session_id: 'sess-44',
      pid: 999,
      work_dir: '/tmp/sess-44',
      started_at: '2026-03-14T12:00:00.000Z',
      provider: 'claude',
      mode: 'plan-build-review',
      state: 'running',
      phase: 'build',
      iteration: 7,
      stuck_count: 0,
      updated_at: '2026-03-14T12:10:00.000Z',
    },
  ]));

  writeWatchState(tmpHome, {
    version: 1,
    queue: [45],
    issues: {
      '44': {
        issue_number: 44,
        session_id: 'sess-44',
        branch: 'agent/issue-44',
        repo: 'test/repo',
        pr_number: null,
        pr_url: null,
        status: 'running',
        completion_state: null,
        created_at: '2026-03-14T12:00:00.000Z',
        updated_at: '2026-03-14T12:00:00.000Z',
      },
      '45': {
        issue_number: 45,
        session_id: null,
        branch: null,
        repo: 'test/repo',
        pr_number: null,
        pr_url: null,
        status: 'queued',
        completion_state: null,
        created_at: '2026-03-14T12:01:00.000Z',
        updated_at: '2026-03-14T12:01:00.000Z',
      },
    },
  });

  try {
    await ghCommand.parseAsync(['status', '--home-dir', tmpHome, '--output', 'text'], { from: 'user' });
    assert.match(output.join('\n'), /#44/);
    assert.match(output.join('\n'), /running/);
    assert.match(output.join('\n'), /#45/);
    assert.match(output.join('\n'), /queued/);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh stop --issue stops running mapped session and removes watch entry', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-stop-issue-'));
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'sess-42');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'running' }), 'utf8');
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => ([
    {
      session_id: 'sess-42',
      pid: 123,
      work_dir: '/tmp/sess-42',
      started_at: '2026-03-14T12:00:00.000Z',
      provider: 'claude',
      mode: 'plan-build-review',
      state: 'running',
      phase: 'build',
      iteration: 3,
      stuck_count: 0,
      updated_at: '2026-03-14T12:02:00.000Z',
    },
  ]));
  let stoppedSessionId: string | null = null;
  t.mock.method(ghLoopRuntime, 'stopSession', async (_homeDir: string, sessionId: string) => {
    stoppedSessionId = sessionId;
    return { success: true };
  });

  writeWatchState(tmpHome, {
    version: 1,
    queue: [],
    issues: {
      '42': {
        issue_number: 42,
        session_id: 'sess-42',
        branch: 'agent/issue-42',
        repo: 'test/repo',
        pr_number: null,
        pr_url: null,
        status: 'running',
        completion_state: null,
        created_at: '2026-03-14T12:00:00.000Z',
        updated_at: '2026-03-14T12:00:00.000Z',
      },
    },
  });

  try {
    await ghCommand.parseAsync(['stop', '--issue', '42', '--home-dir', tmpHome], { from: 'user' });
    assert.equal(stoppedSessionId, 'sess-42');
    const watchState = readWatchState(tmpHome) as { issues?: Record<string, unknown> };
    assert.equal(Boolean(watchState.issues?.['42']), false);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh watch --once starts up to max-concurrent and queues remaining issues', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-watch-once-'));
  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => {
    output.push(String(line ?? ''));
  });
  t.mock.method(ghExecutor, 'exec', async () => ({
    stdout: JSON.stringify([
      { number: 41, title: 'Issue 41', url: 'https://github.com/test/repo/issues/41' },
      { number: 42, title: 'Issue 42', url: 'https://github.com/test/repo/issues/42' },
    ]),
    stderr: '',
  }));
  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);
  t.mock.method(ghLoopRuntime, 'startIssue', async (options: { issue: string | number }) => buildStartResult(Number(options.issue), 'sess-41', 'running'));

  try {
    await ghCommand.parseAsync([
      'watch',
      '--once',
      '--max-concurrent', '1',
      '--home-dir', tmpHome,
      '--output', 'json',
    ], { from: 'user' });

    assert.equal(output.length > 0, true);
    const state = readWatchState(tmpHome) as { queue?: number[]; issues?: Record<string, { status?: string }> };
    assert.deepStrictEqual(state.queue, [42]);
    assert.equal(state.issues?.['41']?.status, 'running');
    assert.equal(state.issues?.['42']?.status, 'queued');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh watch --once reports a clean error and exits when gh issue listing fails', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-watch-fail-'));
  const output: string[] = [];
  const errors: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => {
    output.push(String(line ?? ''));
  });
  t.mock.method(console, 'error', (line?: unknown) => {
    errors.push(String(line ?? ''));
  });
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);
  t.mock.method(ghExecutor, 'exec', async () => {
    throw Object.assign(new Error('Command failed: gh issue list --state open'), {
      stderr: 'gh: blocked by aloop PATH hardening\n',
    });
  });

  try {
    await assert.rejects(
      () => ghCommand.parseAsync(['watch', '--once', '--home-dir', tmpHome], { from: 'user' }),
      /process\.exit:1/,
    );
    const combined = [...output, ...errors].join('\n');
    assert.match(combined, /gh watch failed: gh issue list failed: gh: blocked by aloop PATH hardening/i);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

// --- PR Feedback Loop Tests ---

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
  feedback_iteration: number;
  max_feedback_iterations: number;
  processed_comment_ids: number[];
  processed_issue_comment_ids: number[];
  processed_run_ids: number[];
  last_ci_failure_signature: string | null;
  last_ci_failure_summary: string | null;
  same_ci_failure_count: number;
}> = {}): GhWatchIssueEntry {
  return {
    issue_number: overrides.issue_number ?? 42,
    session_id: overrides.session_id ?? 'sess-42',
    branch: overrides.branch ?? 'agent/issue-42',
    repo: overrides.repo ?? 'test/repo',
    pr_number: overrides.pr_number ?? 51,
    pr_url: overrides.pr_url ?? 'https://github.com/test/repo/pull/51',
    status: overrides.status ?? 'completed',
    completion_state: overrides.completion_state ?? 'exited',
    completion_finalized: overrides.completion_finalized ?? false,
    created_at: '2026-03-14T12:00:00Z',
    updated_at: '2026-03-14T12:00:00Z',
    feedback_iteration: overrides.feedback_iteration ?? 0,
    max_feedback_iterations: overrides.max_feedback_iterations ?? GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: overrides.processed_comment_ids ?? [],
    processed_issue_comment_ids: overrides.processed_issue_comment_ids ?? [],
    processed_run_ids: overrides.processed_run_ids ?? [],
    last_ci_failure_signature: overrides.last_ci_failure_signature ?? null,
    last_ci_failure_summary: overrides.last_ci_failure_summary ?? null,
    same_ci_failure_count: overrides.same_ci_failure_count ?? 0,
  };
}

test('collectNewFeedback filters out already-processed comment and run IDs', () => {
  const entry = buildWatchEntry({
    processed_comment_ids: [100, 101],
    processed_run_ids: [200],
  });

  const comments: PrReviewComment[] = [
    { id: 100, body: 'old comment' },
    { id: 102, body: 'new comment' },
  ];
  const checkRuns: PrCheckRun[] = [
    { id: 200, name: 'build', status: 'completed', conclusion: 'failure' },
    { id: 201, name: 'lint', status: 'completed', conclusion: 'failure' },
    { id: 202, name: 'test', status: 'completed', conclusion: 'success' },
  ];

  const feedback = collectNewFeedback(entry, comments, [], checkRuns);
  assert.equal(feedback.new_comments.length, 1);
  assert.equal(feedback.new_comments[0].id, 102);
  assert.equal(feedback.failed_checks.length, 1);
  assert.equal(feedback.failed_checks[0].id, 201);
});

test('collectNewFeedback returns empty when all items already processed', () => {
  const entry = buildWatchEntry({
    processed_comment_ids: [100],
    processed_run_ids: [200],
  });

  const comments: PrReviewComment[] = [{ id: 100, body: 'old' }];
  const checkRuns: PrCheckRun[] = [{ id: 200, name: 'build', status: 'completed', conclusion: 'failure' }];

  const feedback = collectNewFeedback(entry, comments, [], checkRuns);
  assert.equal(hasFeedback(feedback), false);
});

test('collectNewFeedback ignores passing checks', () => {
  const entry = buildWatchEntry();
  const checkRuns: PrCheckRun[] = [
    { id: 300, name: 'build', status: 'completed', conclusion: 'success' },
    { id: 301, name: 'lint', status: 'in_progress', conclusion: null },
  ];

  const feedback = collectNewFeedback(entry, [], [], checkRuns);
  assert.equal(feedback.failed_checks.length, 0);
  assert.equal(hasFeedback(feedback), false);
});

test('collectNewFeedback filters issue comments by @aloop mention', () => {
  const entry = buildWatchEntry();

  const issueComments = [
    { id: 10, body: 'Just a regular comment', user: { login: 'user1' }, created_at: '2026-03-14T13:00:00Z' },
    { id: 11, body: 'Hey @aloop, please fix this', user: { login: 'user2' }, created_at: '2026-03-14T13:01:00Z' },
    { id: 12, body: '@ALOOP do something', user: { login: 'user3' }, created_at: '2026-03-14T13:02:00Z' },
    { id: 13, body: 'Another comment without mention', user: { login: 'user4' }, created_at: '2026-03-14T13:03:00Z' },
  ];

  const feedback = collectNewFeedback(entry, [], issueComments, []);

  assert.equal(feedback.new_issue_comments.length, 2);
  assert.equal(feedback.new_issue_comments[0].id, 11);
  assert.equal(feedback.new_issue_comments[1].id, 12);
});

test('collectNewFeedback filters out already processed issue comments even if they mention @aloop', () => {
  const entry = buildWatchEntry({
    processed_issue_comment_ids: [11],
  });

  const issueComments = [
    { id: 11, body: 'Hey @aloop, please fix this', user: { login: 'user2' }, created_at: '2026-03-14T13:01:00Z' },
    { id: 12, body: '@ALOOP do something new', user: { login: 'user3' }, created_at: '2026-03-14T13:02:00Z' },
  ];

  const feedback = collectNewFeedback(entry, [], issueComments, []);

  assert.equal(feedback.new_issue_comments.length, 1);
  assert.equal(feedback.new_issue_comments[0].id, 12);
});

test('hasFeedback returns true when there are new comments', () => {
  const feedback: PrFeedback = {
    new_comments: [{ id: 1, body: 'fix this' }],
    new_issue_comments: [],
    failed_checks: [],
  };
  assert.equal(hasFeedback(feedback), true);
});

test('hasFeedback returns true when there are failed checks', () => {
  const feedback: PrFeedback = {
    new_comments: [],
    new_issue_comments: [],
    failed_checks: [{ id: 1, name: 'build', status: 'completed', conclusion: 'failure' }],
  };
  assert.equal(hasFeedback(feedback), true);
});

test('buildFeedbackSteering formats review comments and CI failures', () => {
  const feedback: PrFeedback = {
    new_comments: [
      { id: 1, body: 'Please fix the null check', user: { login: 'reviewer1' }, path: 'src/main.ts', line: 42 },
      { id: 2, body: 'Needs error handling', user: { login: 'reviewer2' } },
    ],
    new_issue_comments: [],
    failed_checks: [
      { id: 10, name: 'build-and-test', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/test/repo/actions/runs/123' },
    ],
  };

  const steering = buildFeedbackSteering(feedback, 51);
  assert.match(steering, /PR #51/);
  assert.match(steering, /reviewer1/);
  assert.match(steering, /src\/main\.ts:42/);
  assert.match(steering, /Comment ID: 1/);
  assert.match(steering, /null check/);
  assert.match(steering, /referenc(?:e|ing) comment ID 1/i);
  assert.match(steering, /reviewer2/);
  assert.match(steering, /Comment ID: 2/);
  assert.match(steering, /error handling/);
  assert.match(steering, /Resolve each review comment individually/);
  assert.match(steering, /build-and-test/);
  assert.match(steering, /CI Failures/);
  assert.match(steering, /\[view\]/);
});

test('buildFeedbackSteering truncates logs over 200 lines', () => {
  const logLines = Array.from({ length: 250 }, (_, i) => `Line ${i + 1}`);
  const log = logLines.join('\n');

  const feedback: PrFeedback = {
    new_comments: [],
    new_issue_comments: [],
    failed_checks: [
      { id: 10, name: 'build', status: 'completed', conclusion: 'failure', log: log },
    ],
  };

  const steering = buildFeedbackSteering(feedback, 51);
  assert.match(steering, /Line 250/);
  assert.match(steering, /Line 51/);
  assert.doesNotMatch(steering, /Line 50\n/);
  assert.match(steering, /\.\.\. \(truncated\)/);
});

test('buildFeedbackSteering handles comments without path or user', () => {
  const feedback: PrFeedback = {
    new_comments: [{ id: 1, body: 'Some feedback' }],
    new_issue_comments: [],
    failed_checks: [],
  };

  const steering = buildFeedbackSteering(feedback, 10);
  assert.match(steering, /unknown/);
  assert.match(steering, /Comment ID: 1/);
  assert.match(steering, /Some feedback/);
  assert.match(steering, /referenc(?:e|ing) comment ID 1/i);
  assert.doesNotMatch(steering, /CI Failures/);
});

test('markFeedbackProcessed updates entry with processed IDs and increments iteration', () => {
  const entry = buildWatchEntry({
    processed_comment_ids: [100],
    processed_issue_comment_ids: [],
    processed_run_ids: [],
    feedback_iteration: 1,
  });

  const feedback: PrFeedback = {
    new_comments: [{ id: 102, body: 'fix' }, { id: 103, body: 'also fix' }],
    new_issue_comments: [],
    failed_checks: [{ id: 200, name: 'test', status: 'completed', conclusion: 'failure' }],
  };

  markFeedbackProcessed(entry, feedback);
  assert.deepStrictEqual(entry.processed_comment_ids, [100, 102, 103]);
  assert.deepStrictEqual(entry.processed_issue_comment_ids, []);
  assert.deepStrictEqual(entry.processed_run_ids, [200]);
  assert.equal(entry.feedback_iteration, 2);
});

test('markFeedbackProcessed does not duplicate already-tracked IDs', () => {
  const entry = buildWatchEntry({
    processed_comment_ids: [100],
    processed_issue_comment_ids: [],
    processed_run_ids: [200],
    feedback_iteration: 0,
  });

  const feedback: PrFeedback = {
    new_comments: [{ id: 100, body: 'already tracked' }],
    new_issue_comments: [],
    failed_checks: [{ id: 200, name: 'build', status: 'completed', conclusion: 'failure' }],
  };

  markFeedbackProcessed(entry, feedback);
  assert.deepStrictEqual(entry.processed_comment_ids, [100]);
  assert.deepStrictEqual(entry.processed_issue_comment_ids, []);
  assert.deepStrictEqual(entry.processed_run_ids, [200]);
  assert.equal(entry.feedback_iteration, 1);
});


test('watch.json normalizes feedback tracking fields from persisted state', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-feedback-persist-'));

  writeWatchState(tmpHome, {
    version: 1,
    issues: {
      '42': {
        issue_number: 42,
        session_id: 'sess-42',
        branch: 'agent/issue-42',
        repo: 'test/repo',
        pr_number: 51,
        pr_url: 'https://github.com/test/repo/pull/51',
        status: 'completed',
        completion_state: 'exited',
        created_at: '2026-03-14T12:00:00Z',
        updated_at: '2026-03-14T12:00:00Z',
        feedback_iteration: 2,
        max_feedback_iterations: 3,
        processed_comment_ids: [100, 101],
        processed_run_ids: [200],
      },
    },
    queue: [],
  });

  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => {
    output.push(String(line ?? ''));
  });
  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '[]', stderr: '' }));

  try {
    await ghCommand.parseAsync([
      'status',
      '--home-dir', tmpHome,
      '--output', 'json',
    ], { from: 'user' });

    const parsed = JSON.parse(output[0]) as { issues: Array<{ feedback_iteration: number; max_feedback_iterations: number; processed_comment_ids: number[] }> };
    assert.equal(parsed.issues[0].feedback_iteration, 2);
    assert.equal(parsed.issues[0].max_feedback_iterations, 3);
    assert.deepStrictEqual(parsed.issues[0].processed_comment_ids, [100, 101]);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh watch --once triggers feedback re-iteration for completed entry with PR and new comments', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-feedback-watch-'));

  // Pre-populate watch state with a completed entry that has a PR
  writeWatchState(tmpHome, {
    version: 1,
    issues: {
      '42': buildWatchEntry({ pr_number: 51 }),
    },
    queue: [],
  });

  // Create the session dir so feedback can write STEERING.md
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'sess-42');
  const worktreeDir = path.join(sessionDir, 'worktree');
  fs.mkdirSync(worktreeDir, { recursive: true });

  const ghCalls: string[][] = [];
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    ghCalls.push(args);
    // issue list → no new issues
    if (args[0] === 'issue' && args[1] === 'list') {
      return { stdout: '[]', stderr: '' };
    }
    // PR review comments (reviews endpoint)
    if (args[1]?.includes('/reviews')) {
      return { stdout: '[]', stderr: '' };
    }
    // PR review comments (comments endpoint)
    if (args[1]?.includes('/pulls/51/comments')) {
      return {
        stdout: JSON.stringify([
          { id: 500, body: 'Fix the null check here', user: { login: 'reviewer' }, path: 'src/app.ts', line: 10 },
        ]),
        stderr: '',
      };
    }
    // PR head SHA
    if (args[1]?.includes('/pulls/51') && args[5] === '.head.sha') {
      return { stdout: 'abc123', stderr: '' };
    }
    // Check runs → all passing
    if (args[1]?.includes('/check-runs')) {
      return { stdout: JSON.stringify({ check_runs: [] }), stderr: '' };
    }
    return { stdout: '{}', stderr: '' };
  });

  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);
  t.mock.method(ghLoopRuntime, 'startIssue', async () => buildStartResult(42, 'sess-42-fb1', 'running'));

  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => {
    output.push(String(line ?? ''));
  });

  try {
    await ghCommand.parseAsync([
      'watch', '--once',
      '--home-dir', tmpHome,
      '--output', 'json',
    ], { from: 'user' });

    // Verify STEERING.md was written
    const steeringPath = path.join(worktreeDir, 'STEERING.md');
    assert.ok(fs.existsSync(steeringPath), 'STEERING.md should be written to worktree');
    const steeringContent = fs.readFileSync(steeringPath, 'utf8');
    assert.match(steeringContent, /null check/);
    assert.match(steeringContent, /reviewer/);
    assert.match(steeringContent, /PR #51/);

    // Verify watch state updated
    const state = readWatchState(tmpHome) as {
      issues: Record<string, {
        status: string;
        feedback_iteration: number;
        processed_comment_ids: number[];
      }>;
    };
    assert.equal(state.issues['42'].status, 'running');
    assert.equal(state.issues['42'].feedback_iteration, 1);
    assert.deepStrictEqual(state.issues['42'].processed_comment_ids, [500]);

    // Verify summary includes feedback_resumed
    const summary = JSON.parse(output[0]) as { feedback_resumed: number[] };
    assert.deepStrictEqual(summary.feedback_resumed, [42]);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh watch --once skips feedback when max_feedback_iterations reached', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-feedback-max-'));

  writeWatchState(tmpHome, {
    version: 1,
    issues: {
      '42': buildWatchEntry({
        pr_number: 51,
        feedback_iteration: 5,
        max_feedback_iterations: 5,
      }),
    },
    queue: [],
  });

  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '[]', stderr: '' }));
  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);

  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => {
    output.push(String(line ?? ''));
  });

  try {
    await ghCommand.parseAsync([
      'watch', '--once',
      '--home-dir', tmpHome,
      '--output', 'json',
    ], { from: 'user' });

    const summary = JSON.parse(output[0]) as { feedback_resumed: number[] };
    assert.deepStrictEqual(summary.feedback_resumed, []);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh watch --once halts auto re-iteration on persistent identical CI failures', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-feedback-persist-ci-'));

  const failingCheck: PrCheckRun = {
    id: 900,
    name: 'build',
    status: 'completed',
    conclusion: 'failure',
    log: 'TypeError: expected value\nat src/main.ts:42',
  };
  const signature = buildCiFailureSignature([failingCheck]);
  assert.ok(signature);

  writeWatchState(tmpHome, {
    version: 1,
    issues: {
      '42': buildWatchEntry({
        pr_number: 51,
        last_ci_failure_signature: signature,
        same_ci_failure_count: 2,
      }),
    },
    queue: [],
  });

  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'sess-42');
  fs.mkdirSync(path.join(sessionDir, 'worktree'), { recursive: true });

  const issueComments: string[] = [];
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    if (args[0] === 'issue' && args[1] === 'list') return { stdout: '[]', stderr: '' };
    if (args[0] === 'api' && args[1]?.includes('/pulls/51/comments')) return { stdout: '[]', stderr: '' };
    if (args[0] === 'api' && args[1]?.includes('/issues/51/comments')) return { stdout: '[]', stderr: '' };
    if (args[0] === 'api' && args[1]?.includes('/pulls/51') && args.includes('.head.sha')) return { stdout: 'abcdef1', stderr: '' };
    if (args[0] === 'api' && args[1]?.includes('/check-runs')) {
      return { stdout: JSON.stringify({ check_runs: [{ id: 901, name: 'build', status: 'completed', conclusion: 'failure' }] }), stderr: '' };
    }
    if (args[0] === 'run' && args[1] === 'list') return { stdout: JSON.stringify([{ databaseId: 77 }]), stderr: '' };
    if (args[0] === 'run' && args[1] === 'view') return { stdout: 'TypeError: expected value\nat src/main.ts:42', stderr: '' };
    if (args[0] === 'issue' && args[1] === 'comment') {
      const bodyIndex = args.indexOf('--body');
      issueComments.push(bodyIndex >= 0 ? args[bodyIndex + 1] : '');
      return { stdout: '', stderr: '' };
    }
    return { stdout: '{}', stderr: '' };
  });
  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);
  const startCalls: unknown[] = [];
  t.mock.method(ghLoopRuntime, 'startIssue', async (...args: unknown[]) => {
    startCalls.push(args);
    return buildStartResult(42, 'sess-42-rerun', 'running');
  });

  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => output.push(String(line ?? '')));

  try {
    await ghCommand.parseAsync([
      'watch', '--once',
      '--home-dir', tmpHome,
      '--output', 'json',
    ], { from: 'user' });

    assert.equal(startCalls.length, 0, 'should not spawn another loop when CI error is unchanged');
    const state = readWatchState(tmpHome) as {
      issues: Record<string, { status: string; completion_state: string; same_ci_failure_count: number }>;
    };
    assert.equal(state.issues['42'].status, 'stopped');
    assert.equal(state.issues['42'].completion_state, 'persistent_ci_failure');
    assert.equal(state.issues['42'].same_ci_failure_count, 3);
    assert.equal(issueComments.length, 1);
    assert.match(issueComments[0], /Auto re-iteration halted/);

    const summary = JSON.parse(output[0]) as { feedback_resumed: number[] };
    assert.deepStrictEqual(summary.feedback_resumed, []);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gh status shows feedback iteration count for entries with feedback', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-feedback-status-'));

  writeWatchState(tmpHome, {
    version: 1,
    issues: {
      '42': buildWatchEntry({
        feedback_iteration: 2,
        max_feedback_iterations: 5,
      }),
    },
    queue: [],
  });

  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => {
    output.push(String(line ?? ''));
  });
  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);

  try {
    await ghCommand.parseAsync([
      'status',
      '--home-dir', tmpHome,
      '--output', 'text',
    ], { from: 'user' });

    const statusOutput = output.join('\n');
    assert.match(statusOutput, /2\/5/, 'Should show feedback iteration as 2/5');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('fetchPrCheckRuns calls gh run view --log-failed and ingests logs on failure', async (t) => {
  const repo = 'test/repo';
  const prNumber = 51;
  const sha = 'abcdef123';

  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    // 1. Get PR head SHA
    if (args.includes(`repos/${repo}/pulls/${prNumber}`)) {
      return { stdout: sha, stderr: '' };
    }
    // 2. Get check-runs for SHA
    if (args.includes(`repos/${repo}/commits/${sha}/check-runs`)) {
      return {
        stdout: JSON.stringify({
          check_runs: [
            { id: 100, name: 'build', status: 'completed', conclusion: 'failure' }
          ]
        }),
        stderr: ''
      };
    }
    // 3. List runs for commit
    if (args[0] === 'run' && args[1] === 'list') {
      return {
        stdout: JSON.stringify([{ databaseId: 12345 }]),
        stderr: ''
      };
    }
    // 4. View failed log
    if (args[0] === 'run' && args[1] === 'view' && args[2] === '12345') {
      assert.ok(args.includes('--log-failed'));
      return {
        stdout: 'Actual failure log content',
        stderr: ''
      };
    }
    return { stdout: '[]', stderr: '' };
  });

  const runs = await fetchPrCheckRuns(repo, prNumber);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].conclusion, 'failure');
  assert.equal(runs[0].log, 'Actual failure log content');
});

test('normalizeWatchIssueEntry and normalizeWatchState sanitize malformed persisted watch state', () => {
  assert.equal(normalizeWatchIssueEntry(null), null);

  const normalizedEntry = normalizeWatchIssueEntry({
    issue_number: '42',
    status: 'bogus',
    session_id: '  ',
    branch: 'feature/test',
    repo: 'test/repo',
    pr_number: '17',
    completion_state: '',
    completion_finalized: true,
    feedback_iteration: -2,
    max_feedback_iterations: '0',
    processed_comment_ids: [1, '2', 'oops'],
  });
  assert.ok(normalizedEntry);
  assert.equal(normalizedEntry?.issue_number, 42);
  assert.equal(normalizedEntry?.status, 'queued');
  assert.equal(normalizedEntry?.session_id, null);
  assert.equal(normalizedEntry?.pr_number, 17);
  assert.deepEqual(normalizedEntry?.processed_comment_ids, [1, 2]);
  assert.equal(normalizedEntry?.max_feedback_iterations, GH_FEEDBACK_DEFAULT_MAX_ITERATIONS);

  const state = normalizeWatchState({
    queue: ['7', 7, 9],
    issues: {
      '7': { issue_number: 7, status: 'queued' },
      '8': { issue_number: 8, status: 'running' },
      bad: { issue_number: 'nope' },
    },
  });
  assert.deepEqual(state.queue, [7, 9]);
  assert.equal(state.issues['7'].status, 'queued');
  assert.equal(state.issues['8'].status, 'running');
});

test('parsePositiveIntegerOption validates values and honors fallback', () => {
  assert.equal(parsePositiveIntegerOption(undefined, 5, '--max'), 5);
  assert.equal(parsePositiveIntegerOption('7', 5, '--max'), 7);
  assert.throws(() => parsePositiveIntegerOption('abc', 5, '--max'), /must be a positive integer/i);
});

test('enqueueIssue does not requeue running/completed entries and infers repo from URL', () => {
  const state = normalizeWatchState({ issues: {}, queue: [] });
  enqueueIssue(state, { number: 10, title: 'A', url: 'https://github.com/test/repo/issues/10' });
  enqueueIssue(state, { number: 10, title: 'A', url: 'https://github.com/test/repo/issues/10' });
  assert.deepEqual(state.queue, [10]);
  assert.equal(state.issues['10'].repo, 'test/repo');

  state.issues['10'].status = 'running';
  enqueueIssue(state, { number: 10, title: 'A', url: 'https://github.com/test/repo/issues/10' });
  assert.deepEqual(state.queue, [10]);
});

test('parseGhIssueList filters non-issue payloads', () => {
  assert.deepEqual(parseGhIssueList('{}'), []);
  const issues = parseGhIssueList(JSON.stringify([
    null,
    { number: 1, title: '', url: 'https://github.com/test/repo/issues/1' },
    { number: 2, title: 'Valid', url: 'https://github.com/test/repo/issues/2' },
  ]));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].number, 2);
});

test('policy and parser helpers cover denied and unknown operation branches', () => {
  const sessionPolicy = {
    repo: 'test/repo',
    assignedIssueNumber: 42,
    childCreatedPrNumbers: [15],
  };

  assert.equal(includesAloopTrackingLabel(undefined), false);
  assert.equal(includesAloopTrackingLabel(['foo', 'aloop']), true);

  const childUnknown = evaluatePolicy('mystery-op', 'child-loop', { repo: 'test/repo' }, sessionPolicy);
  assert.equal(childUnknown.allowed, false);
  assert.match(String(childUnknown.reason), /Unknown operation/i);

  const labelMissingTarget = evaluatePolicy('issue-label', 'orchestrator', { issue_number: 42 }, sessionPolicy);
  assert.equal(labelMissingTarget.allowed, false);
  assert.match(String(labelMissingTarget.reason), /aloop-scoped/i);

  const labelBadNumber = evaluatePolicy(
    'issue-label',
    'orchestrator',
    { target_labels: ['aloop'], issue_number: 'abc', label_action: 'add', label: 'aloop/blocked-on-human' },
    sessionPolicy,
  );
  assert.equal(labelBadNumber.allowed, false);
  assert.match(String(labelBadNumber.reason), /numeric issue_number/i);

  const labelBadAction = evaluatePolicy(
    'issue-label',
    'orchestrator',
    { target_labels: ['aloop'], issue_number: 42, label_action: 'replace', label: 'aloop/blocked-on-human' },
    sessionPolicy,
  );
  assert.equal(labelBadAction.allowed, false);
  assert.match(String(labelBadAction.reason), /label_action/i);

  const commentsMissingSince = evaluatePolicy('issue-comments', 'orchestrator', { since: '' }, sessionPolicy);
  assert.equal(commentsMissingSince.allowed, false);
  assert.match(String(commentsMissingSince.reason), /requires --since/i);

  const orchestratorUnknown = evaluatePolicy('weird-op', 'orchestrator', { repo: 'test/repo' }, sessionPolicy);
  assert.equal(orchestratorUnknown.allowed, false);
  assert.match(String(orchestratorUnknown.reason), /Unknown operation/i);

  assert.deepEqual(parseGhOutput('issue-comments', ''), { comments: [], comment_count: 0 });
  assert.throws(() => buildGhArgs('unknown-op', {}, { repo: 'test/repo' }), /Cannot build gh args/i);
});

test('formatGhStatusRows renders empty and populated states', () => {
  const empty = normalizeWatchState({ issues: {}, queue: [] });
  assert.equal(formatGhStatusRows(empty, new Map()), 'No GH-linked sessions.');

  const state = normalizeWatchState({
    issues: {
      '42': {
        issue_number: 42,
        status: 'queued',
        branch: null,
        pr_number: null,
        feedback_iteration: 1,
        max_feedback_iterations: 5,
      },
    },
    queue: [42],
  });
  const rows = formatGhStatusRows(state, new Map());
  assert.match(rows, /#42/);
  assert.match(rows, /\(queued\)/);
  assert.match(rows, /1\/5/);
});

test('ghStopCommand validates arguments, handles missing targets, and exits on failed stop', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-stop-branches-'));
  const output: string[] = [];
  t.mock.method(console, 'log', (line?: unknown) => output.push(String(line ?? '')));
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(() => ghStopCommand({ homeDir: tmpHome }), /requires either --issue/i);
    await assert.rejects(() => ghStopCommand({ homeDir: tmpHome, all: true, issue: '42' }), /either --issue or --all/i);
    await assert.rejects(() => ghStopCommand({ homeDir: tmpHome, issue: '999' }), /No GH-linked session found/i);

    writeWatchState(tmpHome, {
      version: 1,
      issues: {
        '42': {
          issue_number: 42,
          session_id: 'sess-42',
          branch: 'agent/issue-42',
          repo: 'test/repo',
          pr_number: null,
          pr_url: null,
          status: 'running',
          completion_state: null,
          completion_finalized: false,
          created_at: '2026-03-14T12:00:00.000Z',
          updated_at: '2026-03-14T12:00:00.000Z',
          feedback_iteration: 0,
          max_feedback_iterations: 5,
          processed_comment_ids: [],
          processed_issue_comment_ids: [],
          processed_run_ids: [],
        },
      },
      queue: [],
    });
    t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => []);
    t.mock.method(ghLoopRuntime, 'stopSession', async () => ({ success: false, reason: 'boom' }));

    await assert.rejects(() => ghStopCommand({ homeDir: tmpHome, all: true }), /process\.exit:1/);
    assert.match(output.join('\n'), /Failed to stop issue #42: boom/);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('loadWatchState returns empty state for missing/invalid files', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-load-watch-'));
  try {
    const missing = loadWatchState(tmpHome);
    assert.deepEqual(missing.queue, []);
    assert.deepEqual(missing.issues, {});

    const watchPath = path.join(tmpHome, '.aloop', 'watch.json');
    fs.mkdirSync(path.dirname(watchPath), { recursive: true });
    fs.writeFileSync(watchPath, '{broken', 'utf8');
    const invalid = loadWatchState(tmpHome);
    assert.deepEqual(invalid.queue, []);
    assert.deepEqual(invalid.issues, {});
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readSessionState handles missing and malformed status payloads', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-read-state-'));
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'sess-1');
  try {
    assert.equal(readSessionState(tmpHome, 'sess-1'), null);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify([]), 'utf8');
    assert.equal(readSessionState(tmpHome, 'sess-1'), null);
    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 5 }), 'utf8');
    assert.equal(readSessionState(tmpHome, 'sess-1'), null);
    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'exited' }), 'utf8');
    assert.equal(readSessionState(tmpHome, 'sess-1'), 'exited');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('refreshWatchState syncs running/completed/stopped statuses and queue', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-refresh-state-'));
  const state = normalizeWatchState({
    queue: [99, 100],
    issues: {
      '42': { issue_number: 42, session_id: 'active', status: 'running' },
      '43': { issue_number: 43, session_id: 'done', status: 'running' },
      '44': { issue_number: 44, session_id: 'halted', status: 'running' },
      '99': { issue_number: 99, status: 'queued' },
      '100': { issue_number: 100, status: 'completed' },
    },
  });
  const doneDir = path.join(tmpHome, '.aloop', 'sessions', 'done');
  const haltedDir = path.join(tmpHome, '.aloop', 'sessions', 'halted');
  fs.mkdirSync(doneDir, { recursive: true });
  fs.mkdirSync(haltedDir, { recursive: true });
  fs.writeFileSync(path.join(doneDir, 'status.json'), JSON.stringify({ state: 'exited' }), 'utf8');
  fs.writeFileSync(path.join(haltedDir, 'status.json'), JSON.stringify({ state: 'stopped' }), 'utf8');

  t.mock.method(ghLoopRuntime, 'listActiveSessions', async () => [
    { session_id: 'active', session_dir: '/tmp/a', work_dir: '/tmp/a', prompts_dir: '/tmp/a/prompts', pid: 1, state: 'running', completion_state: null, branch: 'agent/x', issue_number: 42, repo: 'test/repo', launch_mode: 'start', started_at: 'now', updated_at: 'now', iteration: 1, max_iterations: 30 },
  ] as any);

  try {
    await refreshWatchState(tmpHome, state);
    assert.equal(state.issues['42'].status, 'running');
    assert.equal(state.issues['43'].status, 'completed');
    assert.equal(state.issues['44'].status, 'stopped');
    assert.deepEqual(state.queue, [99]);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('fetchMatchingIssues applies filters and keeps valid issues only', async (t) => {
  let seenArgs: string[] = [];
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    seenArgs = args;
    return {
      stdout: JSON.stringify([
        { number: 7, title: 'Valid', url: 'https://github.com/test/repo/issues/7' },
        { number: 0, title: 'Invalid', url: 'https://github.com/test/repo/issues/0' },
      ]),
      stderr: '',
    };
  });

  const issues = await fetchMatchingIssues({
    label: ['aloop', ''],
    assignee: 'alice',
    milestone: 'M1',
    repo: 'test/repo',
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].number, 7);
  assert.ok(seenArgs.includes('--assignee'));
  assert.ok(seenArgs.includes('--milestone'));
  assert.ok(seenArgs.includes('--repo'));
});

test('selectUsableGhBinary skips PATH-hardening shim and picks next gh candidate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-bin-'));
  const blockedDir = path.join(root, 'blocked');
  const realDir = path.join(root, 'real');
  fs.mkdirSync(blockedDir, { recursive: true });
  fs.mkdirSync(realDir, { recursive: true });

  const blockedPath = path.join(blockedDir, 'gh');
  fs.writeFileSync(blockedPath, '#!/bin/sh\necho "gh: blocked by aloop PATH hardening" >&2\nexit 127\n', 'utf8');
  fs.chmodSync(blockedPath, 0o755);

  const realPath = path.join(realDir, 'gh');
  fs.writeFileSync(realPath, '#!/bin/sh\necho "gh version test"\n', 'utf8');
  fs.chmodSync(realPath, 0o755);

  try {
    const selected = selectUsableGhBinary(`${blockedDir}${path.delimiter}${realDir}`, 'linux');
    assert.equal(selected, realPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selectUsableGhBinary returns null for empty pathValue', () => {
  assert.equal(selectUsableGhBinary('', 'linux'), null);
  assert.equal(selectUsableGhBinary('   ', 'linux'), null);
});

test('selectUsableGhBinary returns null when no candidates found on PATH', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-empty-'));
  const emptyDir = path.join(root, 'empty');
  fs.mkdirSync(emptyDir, { recursive: true });

  try {
    const selected = selectUsableGhBinary(emptyDir, 'linux');
    assert.equal(selected, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selectUsableGhBinary returns null when only blocked shims exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-blocked-'));
  const blockedDir = path.join(root, 'blocked');
  fs.mkdirSync(blockedDir, { recursive: true });

  const blockedPath = path.join(blockedDir, 'gh');
  fs.writeFileSync(blockedPath, '#!/bin/sh\necho "gh: blocked by aloop PATH hardening" >&2\nexit 127\n', 'utf8');

  try {
    const selected = selectUsableGhBinary(blockedDir, 'linux');
    assert.equal(selected, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selectUsableGhBinary skips directories (not files)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-dir-'));
  const dirPath = path.join(root, 'gh');
  fs.mkdirSync(dirPath, { recursive: true });

  try {
    const selected = selectUsableGhBinary(root, 'linux');
    assert.equal(selected, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selectUsableGhBinary skips nonexistent paths', () => {
  const selected = selectUsableGhBinary('/nonexistent/path/dir1', 'linux');
  assert.equal(selected, null);
});

test('selectUsableGhBinary handles unreadable files gracefully', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-unreadable-'));
  const dir = path.join(root, 'bin');
  fs.mkdirSync(dir, { recursive: true });

  const unreadablePath = path.join(dir, 'gh');
  fs.writeFileSync(unreadablePath, 'small content', 'utf8');
  fs.chmodSync(unreadablePath, 0o000);

  try {
    // Even though file is unreadable, it's still a file > 1024 bytes won't trigger read,
    // but for small files the read may fail with EACCES — should be caught and file returned
    const selected = selectUsableGhBinary(dir, 'linux');
    // File exists and is a file, but small file read fails — the catch swallows the error
    // and the file is still returned (line 73: return fullPath is reached)
    assert.equal(selected, unreadablePath);
  } finally {
    fs.chmodSync(unreadablePath, 0o644);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selectUsableGhBinary checks Windows candidates on win32 platform', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-win-'));
  const dir = path.join(root, 'bin');
  fs.mkdirSync(dir, { recursive: true });

  const ghCmdPath = path.join(dir, 'gh.cmd');
  fs.writeFileSync(ghCmdPath, '@echo gh version', 'utf8');

  try {
    const selected = selectUsableGhBinary(dir, 'win32');
    assert.equal(selected, ghCmdPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ghExecutor.exec rethrows when PATH hardening blocks gh and no fallback binary exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-exec-no-fallback-'));
  const blockedDir = path.join(root, 'blocked');
  fs.mkdirSync(blockedDir, { recursive: true });

  const blockedGhPath = path.join(blockedDir, 'gh');
  fs.writeFileSync(blockedGhPath, '#!/bin/sh\necho "gh: blocked by aloop PATH hardening" >&2\nexit 127\n', 'utf8');
  fs.chmodSync(blockedGhPath, 0o755);

  const origPath = process.env.PATH;
  const origOriginalPath = process.env.ALOOP_ORIGINAL_PATH;
  try {
    process.env.PATH = blockedDir;
    process.env.ALOOP_ORIGINAL_PATH = '';
    await assert.rejects(
      () => ghExecutor.exec(['version']),
      /blocked by aloop PATH hardening/i,
    );
  } finally {
    if (origPath !== undefined) process.env.PATH = origPath;
    else delete process.env.PATH;
    if (origOriginalPath !== undefined) process.env.ALOOP_ORIGINAL_PATH = origOriginalPath;
    else delete process.env.ALOOP_ORIGINAL_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ghExecutor.exec falls back to real gh binary when PATH-hardening shim shadows it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-exec-fallback-'));
  const blockedDir = path.join(root, 'blocked');
  const realDir = path.join(root, 'real');
  fs.mkdirSync(blockedDir, { recursive: true });
  fs.mkdirSync(realDir, { recursive: true });

  const blockedGhPath = path.join(blockedDir, 'gh');
  fs.writeFileSync(blockedGhPath, '#!/bin/sh\necho "gh: blocked by aloop PATH hardening" >&2\nexit 127\n', 'utf8');
  fs.chmodSync(blockedGhPath, 0o755);

  const realGhPath = path.join(realDir, 'gh');
  fs.writeFileSync(realGhPath, '#!/bin/sh\necho "gh version 2.0.0"\n', 'utf8');
  fs.chmodSync(realGhPath, 0o755);

  const origPath = process.env.PATH;
  try {
    // Simulate hardened PATH: shim first, real gh second
    process.env.PATH = `${blockedDir}${path.delimiter}${realDir}`;
    const result = await ghExecutor.exec(['version']);
    assert.match(result.stdout, /gh version 2\.0\.0/);
  } finally {
    if (origPath !== undefined) process.env.PATH = origPath;
    else delete process.env.PATH;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ghExecutor.exec uses ALOOP_ORIGINAL_PATH as fallback when PATH has only shim', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-exec-origpath-'));
  const blockedDir = path.join(root, 'blocked');
  const realDir = path.join(root, 'real');
  fs.mkdirSync(blockedDir, { recursive: true });
  fs.mkdirSync(realDir, { recursive: true });

  const blockedGhPath = path.join(blockedDir, 'gh');
  fs.writeFileSync(blockedGhPath, '#!/bin/sh\necho "gh: blocked by aloop PATH hardening" >&2\nexit 127\n', 'utf8');
  fs.chmodSync(blockedGhPath, 0o755);

  const realGhPath = path.join(realDir, 'gh');
  fs.writeFileSync(realGhPath, '#!/bin/sh\necho "gh version 2.0.0"\n', 'utf8');
  fs.chmodSync(realGhPath, 0o755);

  const origPath = process.env.PATH;
  const origAloopPath = process.env.ALOOP_ORIGINAL_PATH;
  try {
    // PATH only has shim; real gh is in ALOOP_ORIGINAL_PATH
    process.env.PATH = blockedDir;
    process.env.ALOOP_ORIGINAL_PATH = realDir;
    const result = await ghExecutor.exec(['version']);
    assert.match(result.stdout, /gh version 2\.0\.0/);
  } finally {
    if (origPath !== undefined) process.env.PATH = origPath;
    else delete process.env.PATH;
    if (origAloopPath !== undefined) process.env.ALOOP_ORIGINAL_PATH = origAloopPath;
    else delete process.env.ALOOP_ORIGINAL_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failGhWatch emits JSON error when outputMode is json', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-watch-json-fail-'));
  const logs: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);
  t.mock.method(ghExecutor, 'exec', async () => {
    throw Object.assign(new Error('Command failed: gh issue list --state open'), {
      stderr: 'gh: blocked by aloop PATH hardening\n',
    });
  });

  try {
    await assert.rejects(
      () => ghCommand.parseAsync(['watch', '--once', '--home-dir', tmpHome, '--output', 'json'], { from: 'user' }),
      /process\.exit:1/,
    );
    assert.equal(logs.length > 0, true);
    const payload = JSON.parse(logs[0]) as { success: boolean; error: string };
    assert.equal(payload.success, false);
    assert.match(payload.error, /gh watch failed: gh issue list failed: gh: blocked by aloop PATH hardening/i);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('fetchPrReviewComments and fetchPrIssueComments normalize malformed API results', async (t) => {
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    if (args.join(' ').includes('/pulls/1/comments')) {
      return {
        stdout: JSON.stringify([{ id: 10, body: 'x', line: 2, path: 'a.ts', user: { login: 'u' } }, { id: 0, body: 'bad' }]),
        stderr: '',
      };
    }
    return {
      stdout: JSON.stringify([{ id: 20, body: '@aloop ping', user: { login: 'u2' } }, { id: 0 }]),
      stderr: '',
    };
  });

  const review = await fetchPrReviewComments('test/repo', 1);
  const issue = await fetchPrIssueComments('test/repo', 1);
  assert.equal(review.length, 1);
  assert.equal(review[0].id, 10);
  assert.equal(issue.length, 1);
  assert.equal(issue[0].id, 20);
});

test('fetchFailedCheckLogs handles nested and top-level failures safely', async (t) => {
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    if (args[0] === 'run' && args[1] === 'list') {
      return { stdout: JSON.stringify([{ databaseId: 10 }, { databaseId: 11 }]), stderr: '' };
    }
    if (args[0] === 'run' && args[1] === 'view' && args[2] === '10') {
      throw new Error('log unavailable');
    }
    if (args[0] === 'run' && args[1] === 'view' && args[2] === '11') {
      return { stdout: 'failure-log', stderr: '' };
    }
    throw new Error('unexpected');
  });

  const logs = await fetchFailedCheckLogs('test/repo', 'abc');
  assert.equal(logs.size, 1);
  assert.equal(logs.get(11), 'failure-log');
});

test('finalizeWatchEntry supports success and fallback failure paths', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-finalize-'));
  const sessionId = 'sess-finalize';
  const sessionDir = path.join(tmpHome, '.aloop', 'sessions', sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'config.json'), JSON.stringify({ created_pr_numbers: [1] }), 'utf8');

  const entry: GhWatchIssueEntry = {
    issue_number: 55,
    session_id: sessionId,
    branch: 'agent/issue-55',
    repo: 'test/repo',
    pr_number: null,
    pr_url: null,
    status: 'completed',
    completion_state: 'exited',
    completion_finalized: false,
    created_at: '2026-03-14T12:00:00.000Z',
    updated_at: '2026-03-14T12:00:00.000Z',
    feedback_iteration: 0,
    max_feedback_iterations: 5,
    processed_comment_ids: [],
    processed_issue_comment_ids: [],
    processed_run_ids: [],
  };

  let call = 0;
  t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
    call += 1;
    if (args[0] === 'issue' && args[1] === 'view') {
      return { stdout: JSON.stringify({ title: 'Finalize me' }), stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'create') {
      return { stdout: 'https://github.com/test/repo/pull/77', stderr: '' };
    }
    if (args[0] === 'issue' && args[1] === 'comment') {
      return { stdout: '', stderr: '' };
    }
    throw new Error(`unexpected args: ${args.join(' ')}`);
  });

  try {
    const success = await finalizeWatchEntry(entry, { homeDir: tmpHome, output: 'text' });
    assert.equal(success, true);
    assert.equal(entry.pr_number, 77);
    assert.ok(call >= 3);

    // Fallback path: pr create fails, pr list empty, finalization should fail.
    entry.pr_number = null;
    t.mock.method(ghExecutor, 'exec', async (args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return { stdout: JSON.stringify({ title: 'Finalize me' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'create') {
        throw new Error('create failed');
      }
      if (args[0] === 'pr' && args[1] === 'list') {
        return { stdout: '[]', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const failed = await finalizeWatchEntry(entry, { homeDir: tmpHome, output: 'text' });
    assert.equal(failed, false);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('ghStartCommandWithDeps throws when planner prompt is missing', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-start-missing-plan-'));
  const issuePayload = {
    number: 42,
    title: 'Missing planner prompt',
    body: 'Body',
    url: 'https://github.com/test/repo/issues/42',
    labels: [],
    comments: [],
  };

  try {
    await assert.rejects(
      () => ghStartCommandWithDeps(
        { issue: '42', homeDir: tmpRoot },
        {
          startSession: async () => ({
            session_id: 'sess-42',
            session_dir: path.join(tmpRoot, 'sessions', 'sess-42'),
            prompts_dir: path.join(tmpRoot, 'sessions', 'sess-42', 'prompts'),
            work_dir: path.join(tmpRoot, 'sessions', 'sess-42', 'worktree'),
            worktree_path: path.join(tmpRoot, 'sessions', 'sess-42', 'worktree'),
            branch: 'agent/issue-42',
            worktree: true,
            pid: 1234,
          } as any),
          execGh: async (args: string[]) => {
            if (args[0] === 'issue' && args[1] === 'view') {
              return { stdout: JSON.stringify(issuePayload), stderr: '' };
            }
            return { stdout: '', stderr: '' };
          },
          execGit: async () => ({ stdout: '', stderr: '' }),
          readFile: () => '',
          writeFile: () => {},
          existsSync: (filePath: string) => filePath.endsWith('config.json') || filePath.endsWith('meta.json') || filePath.endsWith('status.json'),
          cwd: () => tmpRoot,
        } as any,
      ),
      /Missing planner prompt/i,
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('ghStartCommandWithDeps keeps base branch main and warns when creating agent/main fails', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-start-main-warning-'));
  const planPrompt = path.join(tmpRoot, 'sessions', 'sess-43', 'prompts', 'PROMPT_plan.md');
  const files = new Map<string, string>([
    [planPrompt, '# plan'],
    [path.join(tmpRoot, 'sessions', 'sess-43', 'meta.json'), JSON.stringify({ project_root: tmpRoot })],
    [path.join(tmpRoot, 'sessions', 'sess-43', 'status.json'), JSON.stringify({ state: 'running' })],
    [path.join(tmpRoot, 'sessions', 'sess-43', 'config.json'), JSON.stringify({})],
  ]);

  try {
    const result = await ghStartCommandWithDeps(
      { issue: '43', homeDir: tmpRoot, projectRoot: tmpRoot },
      {
        startSession: async () => ({
          session_id: 'sess-43',
          session_dir: path.join(tmpRoot, 'sessions', 'sess-43'),
          prompts_dir: path.join(tmpRoot, 'sessions', 'sess-43', 'prompts'),
          work_dir: path.join(tmpRoot, 'sessions', 'sess-43', 'worktree'),
          worktree_path: path.join(tmpRoot, 'sessions', 'sess-43', 'worktree'),
          branch: 'agent/issue-43-different',
          worktree: true,
          pid: 4321,
        } as any),
        execGh: async (args: string[]) => {
          if (args[0] === 'issue' && args[1] === 'view') {
            return {
              stdout: JSON.stringify({
                number: 43,
                title: 'Cannot create agent main',
                body: '',
                url: 'https://github.com/test/repo/issues/43',
                labels: [],
                comments: [],
              }),
              stderr: '',
            };
          }
          return { stdout: '', stderr: '' };
        },
        execGit: async (args: string[]) => {
          const joined = args.join(' ');
          if (joined.includes('rev-parse --verify agent/main') || joined.includes('branch agent/main main')) {
            throw new Error('git failed');
          }
          return { stdout: '', stderr: '' };
        },
        readFile: (filePath: string) => files.get(filePath) ?? '',
        writeFile: (filePath: string, content: string) => void files.set(filePath, content),
        existsSync: (filePath: string) => files.has(filePath),
        cwd: () => tmpRoot,
      } as any,
    );
    assert.equal(result.base_branch, 'main');
    assert.equal(result.warnings.length > 0, true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('executeGhOperation covers missing request, gh execution errors, and parse errors with request_file', async (t) => {
  const fixture = createFixture();
  const errors: string[] = [];
  t.mock.method(console, 'error', (line?: unknown) => errors.push(String(line ?? '')));
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  try {
    await assert.rejects(
      () => executeGhOperation('pr-create', {
        session: 'test-session',
        role: 'child-loop',
        homeDir: fixture.tmpHome,
        request: '   ',
      }),
      /process\.exit:1/,
    );

    t.mock.method(ghExecutor, 'exec', async () => {
      throw Object.assign(new Error('gh failed'), { stderr: 'boom' });
    });
    await assert.rejects(
      () => executeGhOperation('pr-create', {
        session: 'test-session',
        role: 'child-loop',
        homeDir: fixture.tmpHome,
        request: fixture.requestFile,
      }),
      /process\.exit:1/,
    );

    t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '{broken', stderr: '' }));
    await assert.rejects(
      () => executeGhOperation('issue-comments', {
        session: 'test-session',
        role: 'orchestrator',
        homeDir: fixture.tmpHome,
        since: '2026-03-14T11:00:00Z',
        request: fixture.requestFile,
      }),
      /process\.exit:1/,
    );

    const entries = readLogEntries(fixture.sessionDir);
    const parseError = entries.find((entry) => entry.event === 'gh_operation_error' && entry.type === 'issue-comments');
    assert.equal(parseError?.request_file, path.basename(fixture.requestFile));
    assert.match(errors.join('\n'), /Request file not provided|gh_operation_error/);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('buildGhArgs supports pr-comments operation', () => {
  const args = buildGhArgs('pr-comments', {}, { repo: 'test/repo', since: '2026-03-14T00:00:00Z' });
  assert.deepEqual(args, ['api', 'repos/test/repo/pulls/comments', '--method', 'GET', '-f', 'since=2026-03-14T00:00:00Z']);
});

// --- extractRepoFromIssueUrl tests ---

test('extractRepoFromIssueUrl extracts repo from github.com URL', () => {
  assert.equal(extractRepoFromIssueUrl('https://github.com/org/repo/issues/42'), 'org/repo');
});

test('extractRepoFromIssueUrl extracts repo from GitHub Enterprise URL', () => {
  assert.equal(extractRepoFromIssueUrl('https://ghe.corp.com/org/repo/issues/42'), 'org/repo');
  assert.equal(extractRepoFromIssueUrl('https://github.example.com/org/repo/issues/1'), 'org/repo');
  assert.equal(extractRepoFromIssueUrl('https://git.internal.company.io/team/project/issues/99'), 'team/project');
});

test('extractRepoFromIssueUrl handles http URLs', () => {
  assert.equal(extractRepoFromIssueUrl('http://github.com/org/repo/issues/1'), 'org/repo');
  assert.equal(extractRepoFromIssueUrl('http://ghe.corp.com/org/repo/issues/5'), 'org/repo');
});

test('extractRepoFromIssueUrl returns null for non-issue URLs', () => {
  assert.equal(extractRepoFromIssueUrl('https://github.com/org/repo/pull/42'), null);
  assert.equal(extractRepoFromIssueUrl('https://github.com/org/repo'), null);
  assert.equal(extractRepoFromIssueUrl('not-a-url'), null);
  assert.equal(extractRepoFromIssueUrl(''), null);
});
