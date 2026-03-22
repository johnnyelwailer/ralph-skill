import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  listActiveSessions,
  readActiveSessions,
  readSessionStatus,
  readProviderHealth,
  resolveHomeDir,
  stopSession,
} from './session.js';

async function makeHomeDir(prefix: string) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(tempRoot, 'home');
  await mkdir(path.join(homeDir, '.aloop'), { recursive: true });
  return { tempRoot, homeDir };
}

test('readActiveSessions returns empty object for malformed active.json', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-active-malformed-');
  const activePath = path.join(homeDir, '.aloop', 'active.json');
  await writeFile(activePath, '{"oops":', 'utf8');

  const active = await readActiveSessions(homeDir);
  assert.deepEqual(active, {});
});

test('readActiveSessions returns empty object for non-object payloads', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-active-array-');
  const activePath = path.join(homeDir, '.aloop', 'active.json');
  await writeFile(activePath, '[]', 'utf8');

  const active = await readActiveSessions(homeDir);
  assert.deepEqual(active, {});
});

test('readSessionStatus returns null for malformed status.json', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-status-malformed-');
  const sessionDir = path.join(homeDir, '.aloop', 'sessions', 's1');
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sessionDir, 'status.json'), '{"state"', 'utf8');

  const status = await readSessionStatus(sessionDir);
  assert.equal(status, null);
});

test('resolveHomeDir trims trailing separators and falls back to os.homedir', () => {
  const explicit = resolveHomeDir('C:\\temp\\demo\\\\');
  assert.equal(explicit, path.resolve('C:\\temp\\demo'));

  const implicit = resolveHomeDir();
  assert.equal(implicit, path.resolve(os.homedir()).replace(/[\\/]+$/, ''));
});

test('readProviderHealth returns empty object when health path is not readable as a directory', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-health-readdir-fail-');
  const healthDir = path.join(homeDir, '.aloop', 'health');
  await writeFile(healthDir, 'not-a-directory', 'utf8');

  const health = await readProviderHealth(homeDir);
  assert.deepEqual(health, {});
});

test('readProviderHealth ignores malformed and non-json files', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-health-malformed-');
  const healthDir = path.join(homeDir, '.aloop', 'health');
  await mkdir(healthDir, { recursive: true });
  await writeFile(path.join(healthDir, 'claude.json'), '{"status":"healthy"', 'utf8');
  await writeFile(path.join(healthDir, 'codex.json'), JSON.stringify({ status: 'cooldown' }), 'utf8');
  await writeFile(path.join(healthDir, 'README.txt'), 'ignored', 'utf8');

  const health = await readProviderHealth(homeDir);
  assert.equal(Object.prototype.hasOwnProperty.call(health, 'claude'), false);
  assert.equal(health.codex.status, 'cooldown');
  assert.equal(Object.prototype.hasOwnProperty.call(health, 'README'), false);
});

test('listActiveSessions merges active/session data with sensible fallbacks', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-list-');
  const aloopDir = path.join(homeDir, '.aloop');
  const sessionOne = 'one';
  const sessionOneDir = path.join(aloopDir, 'sessions', sessionOne);
  await mkdir(sessionOneDir, { recursive: true });
  await writeFile(path.join(sessionOneDir, 'status.json'), JSON.stringify({
    state: 'running',
    phase: 'build',
    iteration: 7,
    stuck_count: 2,
    updated_at: '2026-01-01T00:00:00.000Z',
    provider: 'claude',
  }), 'utf8');

  const sessionTwo = 'two';
  const sessionTwoDir = path.join(aloopDir, 'sessions', sessionTwo);
  await mkdir(sessionTwoDir, { recursive: true });
  await writeFile(path.join(sessionTwoDir, 'status.json'), '{"state"', 'utf8');

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    [sessionOne]: {
      pid: 123,
      session_dir: sessionOneDir,
      work_dir: '/repo',
      started_at: '2026-01-01T00:00:00.000Z',
      provider: 'codex',
      mode: 'plan-build-review',
    },
    [sessionTwo]: {
      pid: null,
      session_dir: sessionTwoDir,
    },
  }), 'utf8');

  const sessions = await listActiveSessions(homeDir);
  assert.equal(sessions.length, 2);

  const one = sessions.find((s) => s.session_id === sessionOne)!;
  assert.equal(one.provider, 'codex');
  assert.equal(one.state, 'running');
  assert.equal(one.phase, 'build');
  assert.equal(one.iteration, 7);
  assert.equal(one.stuck_count, 2);

  const two = sessions.find((s) => s.session_id === sessionTwo)!;
  assert.equal(two.provider, null);
  assert.equal(two.state, 'unknown');
  assert.equal(two.stuck_count, 0);
});

test('stopSession returns failure when session id is missing from active map', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-stop-missing-');
  await writeFile(path.join(homeDir, '.aloop', 'active.json'), JSON.stringify({}), 'utf8');

  const result = await stopSession(homeDir, 'does-not-exist');
  assert.equal(result.success, false);
  assert.match(result.reason || '', /Session not found/);
});

test('stopSession returns already stopped when session is stopped but not active', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-stop-already-stopped-');
  const aloopDir = path.join(homeDir, '.aloop');
  const sessionId = 'already-stopped';
  const sessionDir = path.join(aloopDir, 'sessions', sessionId);

  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({}), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    state: 'stopped',
    updated_at: '2026-01-01T00:00:00.000Z',
  }), 'utf8');

  const result = await stopSession(homeDir, sessionId);
  assert.equal(result.success, false);
  assert.match(result.reason || '', /Session already stopped/);
});

test('stopSession skips status write when session directory does not exist', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-stop-no-dir-');
  const aloopDir = path.join(homeDir, '.aloop');
  const sessionId = 'no-dir';
  const missingSessionDir = path.join(aloopDir, 'sessions', sessionId);

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    [sessionId]: {
      session_dir: missingSessionDir,
      work_dir: '/repo',
      started_at: '2026-01-01T00:00:00.000Z',
      mode: 'build',
    },
  }), 'utf8');
  await writeFile(path.join(aloopDir, 'history.json'), '{"oops"', 'utf8');

  const result = await stopSession(homeDir, sessionId);
  assert.equal(result.success, true);
  assert.equal(existsSync(path.join(missingSessionDir, 'status.json')), false);

  const active = JSON.parse(await readFile(path.join(aloopDir, 'active.json'), 'utf8'));
  assert.deepEqual(active, {});

  const history = JSON.parse(await readFile(path.join(aloopDir, 'history.json'), 'utf8'));
  assert.equal(history.length, 1);
  assert.equal(history[0].session_id, sessionId);
  assert.equal(history[0].provider, null);
});

test('stopSession uses non-windows kill path and writes stopped state/history', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-stop-linux-success-');
  const aloopDir = path.join(homeDir, '.aloop');
  const sessionId = 'linux-success';
  const sessionDir = path.join(aloopDir, 'sessions', sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    [sessionId]: {
      pid: 333333,
      session_dir: sessionDir,
      work_dir: '/repo',
      started_at: '2026-01-01T00:00:00.000Z',
      mode: 'build',
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    state: 'running',
    provider: 'gemini',
    iteration: 3,
  }), 'utf8');

  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalKill = process.kill;
  Object.defineProperty(process, 'platform', { value: 'linux' });
  process.kill = ((pid: number, signal?: string | number) => {
    if (pid !== 333333) throw new Error('Unexpected pid');
    if (signal === 0 || signal === 'SIGTERM') return true;
    throw new Error('Unexpected signal');
  }) as any;

  try {
    const result = await stopSession(homeDir, sessionId);
    assert.equal(result.success, true);
  } finally {
    process.kill = originalKill;
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  }

  const status = JSON.parse(await readFile(path.join(sessionDir, 'status.json'), 'utf8'));
  assert.equal(status.state, 'stopped');
  assert.ok(status.updated_at);

  const history = JSON.parse(await readFile(path.join(aloopDir, 'history.json'), 'utf8'));
  assert.equal(history.length, 1);
  assert.equal(history[0].provider, 'gemini');
});

test('stopSession continues when pid is stale and isProcessAlive throws', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-stop-stale-pid-');
  const aloopDir = path.join(homeDir, '.aloop');
  const sessionId = 'stale-pid';
  const sessionDir = path.join(aloopDir, 'sessions', sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    [sessionId]: {
      pid: 987654,
      session_dir: sessionDir,
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    state: 'running',
  }), 'utf8');

  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalKill = process.kill;
  Object.defineProperty(process, 'platform', { value: 'linux' });
  process.kill = ((pid: number, signal?: string | number) => {
    if (pid === 987654 && signal === 0) throw new Error('ESRCH');
    throw new Error('Unexpected signal');
  }) as any;

  try {
    const result = await stopSession(homeDir, sessionId);
    assert.equal(result.success, true);
  } finally {
    process.kill = originalKill;
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  }

  const status = JSON.parse(await readFile(path.join(sessionDir, 'status.json'), 'utf8'));
  assert.equal(status.state, 'stopped');
});

test('stopSession uses Windows taskkill path when platform is win32', { skip: process.platform !== 'win32' }, async () => {
  const { homeDir } = await makeHomeDir('aloop-session-stop-win-success-');
  const aloopDir = path.join(homeDir, '.aloop');
  const sessionId = 'win-success';
  const sessionDir = path.join(aloopDir, 'sessions', sessionId);
  await mkdir(sessionDir, { recursive: true });

  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: false,
  });

  try {
    await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
      [sessionId]: {
        pid: child.pid,
        session_dir: sessionDir,
        work_dir: '/repo',
        started_at: '2026-01-01T00:00:00.000Z',
        provider: 'codex',
        mode: 'build',
      },
    }), 'utf8');
    await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
      state: 'running',
      iteration: 1,
    }), 'utf8');

    const result = await stopSession(homeDir, sessionId);
    assert.equal(result.success, true);
  } finally {
    try {
      if (child.pid !== undefined) {
        process.kill(child.pid, 0);
        process.kill(child.pid, 'SIGKILL');
      }
    } catch {
      // ignore: child is already dead
    }
  }

  const active = JSON.parse(await readFile(path.join(aloopDir, 'active.json'), 'utf8'));
  assert.deepEqual(active, {});
});

test('stopSession returns failure when process kill fails and leaves state unchanged', async () => {
  const { homeDir } = await makeHomeDir('aloop-session-stop-kill-fail-');
  const aloopDir = path.join(homeDir, '.aloop');
  const sessionId = 'perm-denied';
  const sessionDir = path.join(aloopDir, 'sessions', sessionId);
  await mkdir(sessionDir, { recursive: true });

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    [sessionId]: {
      pid: 424242,
      session_dir: sessionDir,
      work_dir: '/proj',
      started_at: new Date().toISOString(),
      provider: 'codex',
      mode: 'build',
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    state: 'running',
    iteration: 5,
  }), 'utf8');

  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalKill = process.kill;
  Object.defineProperty(process, 'platform', { value: 'linux' });
  process.kill = ((pid: number, signal?: string | number) => {
    if (signal === 0) return true;
    throw new Error('EPERM');
  }) as any;

  try {
    const result = await stopSession(homeDir, sessionId);
    assert.equal(result.success, false);
    assert.match(result.reason || '', /Failed to stop session process/);
  } finally {
    process.kill = originalKill;
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  }

  const active = JSON.parse(await readFile(path.join(aloopDir, 'active.json'), 'utf8'));
  assert.ok(active[sessionId]);

  const status = JSON.parse(await readFile(path.join(sessionDir, 'status.json'), 'utf8'));
  assert.equal(status.state, 'running');

  const historyPath = path.join(aloopDir, 'history.json');
  assert.equal(existsSync(historyPath), false);
});
