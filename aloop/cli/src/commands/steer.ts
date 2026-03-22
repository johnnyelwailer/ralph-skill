import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveHomeDir, readActiveSessions } from './session.js';
import { writeQueueOverride, queueSteeringPrompt } from '../lib/plan.js';
import type { OutputMode } from './status.js';

export interface SteerCommandOptions {
  homeDir?: string;
  session?: string;
  affectsCompletedWork?: string;
  overwrite?: boolean;
  output?: OutputMode;
}

function buildSteeringDocument(instruction: string, affectsCompletedWork: 'yes' | 'no' | 'unknown', commit: string): string {
  const timestamp = new Date().toISOString();
  return [
    '# Steering Instruction',
    '',
    `**Commit:** ${commit}`,
    `**Timestamp:** ${timestamp}`,
    `**Affects completed work:** ${affectsCompletedWork}`,
    '',
    '## Instruction',
    '',
    instruction,
    '',
  ].join('\n');
}

function fail(outputMode: string, msg: string): never {
  if (outputMode === 'json') {
    console.log(JSON.stringify({ success: false, error: msg }));
  } else {
    console.error(msg);
  }
  return process.exit(1) as never;
}

export async function steerCommand(instruction: string, options: SteerCommandOptions = {}) {
  const outputMode = options.output || 'text';
  const homeDir = resolveHomeDir(options.homeDir);
  const active = await readActiveSessions(homeDir);
  const sessionIds = Object.keys(active);

  // Resolve session
  let sessionId: string;
  if (options.session) {
    if (!active[options.session]) {
      return fail(outputMode, `Session not found: ${options.session}`);
    }
    sessionId = options.session;
  } else if (sessionIds.length === 1) {
    sessionId = sessionIds[0];
  } else if (sessionIds.length === 0) {
    return fail(outputMode, 'No active sessions. Start a session first with `aloop start`.');
  } else {
    return fail(outputMode, `Multiple active sessions. Specify one with --session: ${sessionIds.join(', ')}`);
  }

  const entry = active[sessionId];
  const sessionDir = entry.session_dir ?? path.join(homeDir, '.aloop', 'sessions', sessionId);
  const workdir = entry.work_dir ?? path.join(sessionDir, 'worktree');
  const steeringPath = path.join(workdir, '.aloop', 'STEERING.md');

  // Check for existing steering if overwrite not set
  if (existsSync(steeringPath) && !options.overwrite) {
    return fail(outputMode, 'A steering instruction is already queued. Use --overwrite to replace it.');
  }

  const affectsCompletedWork = (options.affectsCompletedWork as 'yes' | 'no' | 'unknown') ?? 'unknown';
  const steeringDoc = buildSteeringDocument(instruction.trim(), affectsCompletedWork, 'cli');

  // Write STEERING.md to workdir .aloop/ subfolder
  await mkdir(path.join(workdir, '.aloop'), { recursive: true });
  await writeFile(steeringPath, steeringDoc, 'utf8');

  // Write queue override
  const promptsDir = path.join(sessionDir, 'prompts');
  const queuePath = await queueSteeringPrompt(
    sessionDir,
    promptsDir,
    steeringDoc
  );

  if (outputMode === 'json') {
    console.log(JSON.stringify({ success: true, session: sessionId, queued: true, path: queuePath, steeringPath }));
  } else {
    console.log(`Steering instruction queued for session ${sessionId}.`);
  }
}
