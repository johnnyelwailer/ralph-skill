import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  readActiveSessions,
  readProviderHealth,
  stopSession,
} from './session.mjs';

async function makeHomeDir(prefix) {
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
  process.kill = ((pid, signal) => {
    if (signal === 0) return true;
    throw new Error('EPERM');
  });

  try {
    const result = await stopSession(homeDir, sessionId);
    assert.equal(result.success, false);
    assert.match(result.reason, /Failed to stop session process/);
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
