import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ghCommand } from './gh.js';

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

test('ghCommand allows child-loop pr-comment only on child-created PRs', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});

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

test('ghCommand allows orchestrator comment operations with aloop/auto-scoped targets', async (t) => {
  const fixture = createFixture();
  t.mock.method(console, 'log', () => {});

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
