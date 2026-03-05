import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveHomeDir(explicitHomeDir?: string): string {
  return path.resolve(explicitHomeDir ?? os.homedir()).replace(/[\/]+$/, '');
}

async function readJsonFile(filePath: string): Promise<any> {
  if (!existsSync(filePath)) return null;
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: any): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function readActiveSessions(homeDir: string): Promise<Record<string, any>> {
  const activePath = path.join(homeDir, '.aloop', 'active.json');
  const data = await readJsonFile(activePath);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return data;
}

export async function readSessionStatus(sessionDir: string): Promise<any> {
  const statusPath = path.join(sessionDir, 'status.json');
  return readJsonFile(statusPath);
}

export async function readProviderHealth(homeDir: string): Promise<Record<string, any>> {
  const healthDir = path.join(homeDir, '.aloop', 'health');
  if (!existsSync(healthDir)) return {};

  let files: string[];
  try {
    files = await readdir(healthDir);
  } catch {
    return {};
  }

  const health: Record<string, any> = {};
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const provider = file.slice(0, -5);
    const data = await readJsonFile(path.join(healthDir, file));
    if (data) health[provider] = data;
  }
  return health;
}

export interface SessionInfo {
  session_id: string;
  pid: number | null;
  work_dir: string | null;
  started_at: string | null;
  provider: string | null;
  mode: string | null;
  state: string;
  phase: string | null;
  iteration: number | null;
  stuck_count: number;
  updated_at: string | null;
}

export async function listActiveSessions(homeDir: string): Promise<SessionInfo[]> {
  const active = await readActiveSessions(homeDir);
  const sessions: SessionInfo[] = [];

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

function isProcessAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid: number): boolean {
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

export async function stopSession(homeDir: string, sessionId: string): Promise<{ success: boolean; reason?: string }> {
  const active = await readActiveSessions(homeDir);
  const entry = active[sessionId];

  if (!entry) {
    return { success: false, reason: `Session not found: ${sessionId}` };
  }

  const sessionDir = entry.session_dir ?? path.join(homeDir, '.aloop', 'sessions', sessionId);
  const pid = entry.pid ?? null;

  // Kill process if alive
  if (pid && isProcessAlive(pid)) {
    if (!killProcess(pid)) {
      return { success: false, reason: `Failed to stop session process: ${pid}` };
    }
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
