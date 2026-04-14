import { resolveHomeDir, readActiveSessions, stopSession, type SessionInfo } from './session.js';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { OutputMode } from './status.js';

export interface StopCommandOptions {
  homeDir?: string;
  output?: OutputMode;
}

async function stopOrchestratorChildren(homeDir: string, sessionId: string): Promise<void> {
  const active = await readActiveSessions(homeDir);
  const sessionDir = path.join(homeDir, '.aloop', 'sessions', sessionId);
  const orchestratorJsonPath = path.join(sessionDir, 'orchestrator.json');

  if (!existsSync(orchestratorJsonPath)) {
    return; // Not an orchestrator session
  }

  const state = JSON.parse(await readFile(orchestratorJsonPath, 'utf8'));
  const inProgressChildren = state.issues?.filter(
    (i: { state: string; child_session: string | null }) => i.state === 'in_progress' && i.child_session
  ) ?? [];

  if (inProgressChildren.length === 0) {
    return;
  }

  console.log(`Stopping ${inProgressChildren.length} active child loops...`);
  for (const issue of inProgressChildren) {
    if (issue.child_session) {
      console.log(`  Stopping child loop: ${issue.child_session}`);
      await stopSession(homeDir, issue.child_session);
    }
  }
}

export async function stopCommand(sessionId: string, options: StopCommandOptions = {}) {
  const outputMode = options.output || 'text';
  const homeDir = resolveHomeDir(options.homeDir);

  // Check if this is an orchestrator session - if so, stop children first
  await stopOrchestratorChildren(homeDir, sessionId);

  const result = await stopSession(homeDir, sessionId);

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exit(1);
    return;
  }

  if (!result.success) {
    console.error(result.reason);
    process.exit(1);
  }

  console.log(`Session ${sessionId} stopped.`);
}
