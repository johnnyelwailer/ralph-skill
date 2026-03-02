import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveHomeDir(explicitHomeDir) {
  return path.resolve(explicitHomeDir ?? os.homedir()).replace(/[\\/]+$/, '');
}

async function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Read active sessions from ~/.aloop/active.json.
 * Returns an object mapping session-id → session entry (or empty object).
 */
export async function readActiveSessions(homeDir) {
  const activePath = path.join(homeDir, '.aloop', 'active.json');
  const data = await readJsonFile(activePath);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return data;
}

/**
 * Read status.json for a session.
 * Returns null if not found.
 */
export async function readSessionStatus(sessionDir) {
  const statusPath = path.join(sessionDir, 'status.json');
  return readJsonFile(statusPath);
}

/**
 * Read all provider health files from ~/.aloop/health/.
 * Returns an object mapping provider-name → health data.
 */
export async function readProviderHealth(homeDir) {
  const healthDir = path.join(homeDir, '.aloop', 'health');
  if (!existsSync(healthDir)) return {};

  let files;
  try {
    files = await readdir(healthDir);
  } catch {
    return {};
  }

  const health = {};
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const provider = file.slice(0, -5);
    const data = await readJsonFile(path.join(healthDir, file));
    if (data) health[provider] = data;
  }
  return health;
}

/**
 * List active sessions with their status information.
 * Returns an array of session info objects.
 */
export async function listActiveSessions(homeDir) {
  const active = await readActiveSessions(homeDir);
  const sessions = [];

  for (const [sessionId, entry] of Object.entries(active)) {
    const sessionDir = entry.session_dir ?? path.join(homeDir, '.aloop', 'sessions', sessionId);
    const status = await readSessionStatus(sessionDir);
    sessions.push({
      session_id: sessionId,
      pid: entry.pid ?? null,
      work_dir: entry.work_dir ?? null,
      started_at: entry.started_at ?? null,
      provider: entry.provider ?? status?.provider ?? null,
      mode: entry.mode ?? null,
      state: status?.state ?? 'unknown',
      phase: status?.phase ?? null,
      iteration: status?.iteration ?? null,
      stuck_count: status?.stuck_count ?? 0,
      updated_at: status?.updated_at ?? null,
    });
  }

  return sessions;
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/F'], { encoding: 'utf8' });
    return result.status === 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop a session by session ID.
 * Kills the PID, updates status.json to stopped, removes from active.json,
 * and appends an entry to history.json.
 *
 * Returns { success, reason } where reason is set if not successful.
 */
export async function stopSession(homeDir, sessionId) {
  const active = await readActiveSessions(homeDir);
  const entry = active[sessionId];

  if (!entry) {
    return { success: false, reason: `Session not found: ${sessionId}` };
  }

  const sessionDir = entry.session_dir ?? path.join(homeDir, '.aloop', 'sessions', sessionId);
  const pid = entry.pid ?? null;

  // Kill process if alive
  if (pid && isProcessAlive(pid)) {
    killProcess(pid);
  }

  // Update status.json
  const statusPath = path.join(sessionDir, 'status.json');
  const status = (await readJsonFile(statusPath)) ?? {};
  status.state = 'stopped';
  status.updated_at = new Date().toISOString();
  if (existsSync(sessionDir)) {
    await writeJsonFile(statusPath, status);
  }

  // Remove from active.json
  delete active[sessionId];
  const activePath = path.join(homeDir, '.aloop', 'active.json');
  await writeJsonFile(activePath, active);

  // Append to history.json
  const historyPath = path.join(homeDir, '.aloop', 'history.json');
  const history = (await readJsonFile(historyPath)) ?? [];
  history.push({
    session_id: sessionId,
    work_dir: entry.work_dir ?? null,
    started_at: entry.started_at ?? null,
    ended_at: status.updated_at,
    state: 'stopped',
    iterations: status.iteration ?? null,
    provider: entry.provider ?? status.provider ?? null,
    mode: entry.mode ?? null,
    pid,
  });
  await writeJsonFile(historyPath, history);

  return { success: true };
}
