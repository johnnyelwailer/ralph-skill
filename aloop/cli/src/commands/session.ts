import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Re-export from the stable .mjs core
import * as sessionCore from '../../lib/session.mjs';

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

export const resolveHomeDir = sessionCore.resolveHomeDir as (explicitHomeDir?: string) => string;
export const readActiveSessions = sessionCore.readActiveSessions as (homeDir: string) => Promise<Record<string, any>>;
export const readSessionStatus = sessionCore.readSessionStatus as (sessionDir: string) => Promise<any>;
export const readProviderHealth = sessionCore.readProviderHealth as (homeDir: string) => Promise<Record<string, any>>;
export const listActiveSessions = sessionCore.listActiveSessions as (homeDir: string) => Promise<SessionInfo[]>;
export const stopSession = sessionCore.stopSession as (homeDir: string, sessionId: string) => Promise<{ success: boolean; reason?: string }>;
