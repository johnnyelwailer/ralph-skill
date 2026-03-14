import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ghCommand, ghExecutor, ghStartCommandWithDeps } from './gh.js';

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
    labels: ['aloop/auto'],
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

test('ghCommand denies orchestrator issue-close without aloop/auto target validation', async (t) => {
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
    assert.match(String(entries[0].reason), /aloop\/auto/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-close with aloop/auto-scoped target labels', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-close',
    repo: 'test/repo',
    issue_number: 42,
    target_labels: ['aloop/auto'],
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

test('ghCommand allows orchestrator comment operations with aloop/auto-scoped targets', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: '', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 42,
    target_labels: ['aloop/auto'],
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

test('ghCommand denies orchestrator issue-comment when aloop/auto is only in request labels', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-comment',
    repo: 'test/repo',
    issue_number: 42,
    labels: ['aloop/auto'],
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
    assert.match(String(entries[0].reason), /aloop\/auto/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand denies orchestrator pr-comment without aloop/auto-scoped target validation', async (t) => {
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
    assert.match(String(entries[0].reason), /aloop\/auto/i);
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
    target_labels: ['aloop/auto'],
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
    target_labels: ['aloop/auto'],
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
    target_labels: ['aloop/auto'],
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

test('ghCommand denies orchestrator issue-create without aloop/auto label', async (t) => {
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
    assert.match(String(entries[0].reason), /aloop\/auto/i);
  } finally {
    fs.rmSync(fixture.tmpHome, { recursive: true, force: true });
  }
});

test('ghCommand allows orchestrator issue-create with aloop/auto label', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});
  t.mock.method(ghExecutor, 'exec', async () => ({ stdout: 'https://github.com/test/repo/issues/7\n', stderr: '' }));

  fs.writeFileSync(fixture.requestFile, JSON.stringify({
    type: 'issue-create',
    repo: 'test/repo',
    labels: ['aloop/auto'],
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

test('ghCommand allows orchestrator issue-create when labels is a string containing aloop/auto', async (t) => {
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
    labels: 'aloop/auto',
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
