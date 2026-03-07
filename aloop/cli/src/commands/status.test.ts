import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import {
  formatRelativeTime,
  formatHealthLine,
  renderStatus,
} from './status.js';

// --- Unit tests for formatting helpers ---

test('formatRelativeTime returns "unknown" for null/undefined', () => {
  assert.equal(formatRelativeTime(null), 'unknown');
  assert.equal(formatRelativeTime(undefined), 'unknown');
});

test('formatRelativeTime returns seconds for recent timestamps', () => {
  const recent = new Date(Date.now() - 30_000).toISOString();
  assert.match(formatRelativeTime(recent), /^\d+s ago$/);
});

test('formatRelativeTime returns minutes for older timestamps', () => {
  const fiveMin = new Date(Date.now() - 5 * 60_000).toISOString();
  assert.match(formatRelativeTime(fiveMin), /^\d+m ago$/);
});

test('formatRelativeTime returns hours for old timestamps', () => {
  const twoHours = new Date(Date.now() - 2 * 3600_000).toISOString();
  assert.match(formatRelativeTime(twoHours), /^\d+h ago$/);
});

test('formatRelativeTime returns "just now" for future timestamps', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(formatRelativeTime(future), 'just now');
});

test('formatHealthLine shows cooldown detail', () => {
  const line = formatHealthLine('claude', {
    status: 'cooldown',
    cooldown_until: new Date(Date.now() + 5 * 60_000).toISOString(),
    consecutive_failures: 3,
  });
  assert.match(line, /claude/);
  assert.match(line, /cooldown/);
  assert.match(line, /3 failures/);
  assert.match(line, /resumes in/);
});

test('formatHealthLine shows degraded detail', () => {
  const line = formatHealthLine('copilot', { status: 'degraded', failure_reason: 'auth' });
  assert.match(line, /degraded/);
  assert.match(line, /auth error/);
});

test('formatHealthLine shows healthy detail', () => {
  const lastSuccess = new Date(Date.now() - 120_000).toISOString();
  const line = formatHealthLine('claude', { status: 'healthy', last_success: lastSuccess });
  assert.match(line, /healthy/);
  assert.match(line, /last success/);
});

// --- Unit tests for renderStatus ---

test('renderStatus shows no-sessions message when empty', () => {
  const output = renderStatus([], {});
  assert.match(output, /No active sessions/);
});

test('renderStatus shows session details', () => {
  const sessions = [
    {
      session_id: 'test-123',
      pid: 1234,
      state: 'running',
      iteration: 2,
      phase: 'build',
      started_at: new Date().toISOString(),
      work_dir: '/tmp/work',
    },
  ];
  const output = renderStatus(sessions, {});
  assert.match(output, /test-123/);
  assert.match(output, /pid=1234/);
  assert.match(output, /running/);
  assert.match(output, /iter 2/);
  assert.match(output, /build/);
  assert.match(output, /workdir: \/tmp\/work/);
});

test('renderStatus includes provider health', () => {
  const health = { claude: { status: 'healthy', last_success: new Date().toISOString() } };
  const output = renderStatus([], health);
  assert.match(output, /Provider Health/);
  assert.match(output, /claude/);
  assert.match(output, /healthy/);
});

// --- CLI integration test for --watch ---

type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function runStatusCli(args: string[], homeDir: string): Promise<CliResult> {
  const entrypoint = path.resolve(process.cwd(), 'src/index.ts');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', entrypoint, 'status', '--home-dir', homeDir, ...args],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function makeHomeDir() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-status-test-'));
  const homeDir = path.join(tempRoot, 'home');
  await mkdir(path.join(homeDir, '.aloop'), { recursive: true });
  return homeDir;
}

test('status CLI runs without --watch and exits cleanly', async () => {
  const homeDir = await makeHomeDir();
  const result = await runStatusCli([], homeDir);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /No active sessions/);
});

test('status CLI --output json returns valid JSON', async () => {
  const homeDir = await makeHomeDir();
  const result = await runStatusCli(['--output', 'json'], homeDir);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed.sessions));
});

test('status CLI --watch produces output and exits on SIGINT', async () => {
  const homeDir = await makeHomeDir();
  const entrypoint = path.resolve(process.cwd(), 'src/index.ts');
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', entrypoint, 'status', '--home-dir', homeDir, '--watch'],
    { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  );

  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });

  // Wait for first render, then send SIGINT
  await new Promise<void>((resolve) => {
    const check = () => {
      if (stdout.includes('aloop status')) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });

  assert.match(stdout, /aloop status/);
  assert.match(stdout, /No active sessions/);

  // Kill the watch process
  child.kill('SIGINT');
  await new Promise<void>((resolve) => child.on('close', () => resolve()));
});
