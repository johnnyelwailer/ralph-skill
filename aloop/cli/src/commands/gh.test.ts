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
