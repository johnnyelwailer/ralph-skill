import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { steerCommand } from './steer.js';

async function setupHome(prefix: string): Promise<{ homeDir: string; sessionDir: string; workdir: string; sessionId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(root, 'home');
  const sessionId = 'test-session-001';
  const sessionDir = path.join(homeDir, '.aloop', 'sessions', sessionId);
  const workdir = path.join(sessionDir, 'worktree');
  const promptsDir = path.join(sessionDir, 'prompts');

  await mkdir(workdir, { recursive: true });
  await mkdir(promptsDir, { recursive: true });

  // Write active.json with one session
  const activeDir = path.join(homeDir, '.aloop');
  await mkdir(activeDir, { recursive: true });
  await writeFile(
    path.join(activeDir, 'active.json'),
    JSON.stringify({
      [sessionId]: {
        session_dir: sessionDir,
        work_dir: workdir,
        pid: 12345,
        started_at: new Date().toISOString(),
      },
    }),
    'utf8',
  );

  return { homeDir, sessionDir, workdir, sessionId };
}

test('steer writes STEERING.md and queue file for single active session', async () => {
  const { homeDir, sessionDir, workdir, sessionId } = await setupHome('steer-basic-');

  // Capture console output
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    await steerCommand('focus on tests', { homeDir, output: 'json' });
  } finally {
    console.log = origLog;
  }

  // Check STEERING.md was written
  const steeringPath = path.join(workdir, 'STEERING.md');
  assert.ok(existsSync(steeringPath), 'STEERING.md should exist');
  const steeringContent = await readFile(steeringPath, 'utf8');
  assert.match(steeringContent, /# Steering Instruction/);
  assert.match(steeringContent, /focus on tests/);
  assert.match(steeringContent, /\*\*Affects completed work:\*\* unknown/);

  // Check queue file was written
  const queueDir = path.join(sessionDir, 'queue');
  assert.ok(existsSync(queueDir), 'queue dir should exist');
  const queueFiles = await readdir(queueDir);
  assert.equal(queueFiles.length, 1, 'should have one queue file');
  assert.match(queueFiles[0], /steering\.md$/);
  const queueContent = await readFile(path.join(queueDir, queueFiles[0]), 'utf8');
  assert.match(queueContent, /agent: steer/);

  // Check JSON output
  const output = JSON.parse(logs[0]);
  assert.equal(output.success, true);
  assert.equal(output.session, sessionId);
  assert.equal(output.queued, true);
});

test('steer uses PROMPT_steer.md template when available', async () => {
  const { homeDir, sessionDir, workdir } = await setupHome('steer-template-');

  // Write a steer template
  await writeFile(
    path.join(sessionDir, 'prompts', 'PROMPT_steer.md'),
    '---\nagent: steer\nreasoning: medium\n---\n\nYou are the steering agent. Read STEERING.md and adjust the plan.',
    'utf8',
  );

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    await steerCommand('change direction', { homeDir, output: 'json' });
  } finally {
    console.log = origLog;
  }

  // Queue file should contain both template content AND the user's steering instruction
  const queueDir = path.join(sessionDir, 'queue');
  const queueFiles = await readdir(queueDir);
  const queueContent = await readFile(path.join(queueDir, queueFiles[0]), 'utf8');
  assert.match(queueContent, /You are the steering agent/);
  assert.match(queueContent, /change direction/);

  // STEERING.md should still have the instruction
  const steeringContent = await readFile(path.join(workdir, 'STEERING.md'), 'utf8');
  assert.match(steeringContent, /change direction/);
});

test('steer with explicit session ID', async () => {
  const { homeDir, sessionId } = await setupHome('steer-explicit-');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    await steerCommand('do something', { homeDir, session: sessionId, output: 'json' });
  } finally {
    console.log = origLog;
  }

  const output = JSON.parse(logs[0]);
  assert.equal(output.success, true);
  assert.equal(output.session, sessionId);
});

test('steer fails for nonexistent session', async () => {
  const { homeDir } = await setupHome('steer-nosession-');

  const logs: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (msg: string) => logs.push(msg);
  console.error = (msg: string) => logs.push(msg);

  const origExit = process.exit;
  let exitCode: number | undefined;
  process.exit = ((code: number) => { exitCode = code; }) as never;

  try {
    await steerCommand('do something', { homeDir, session: 'nonexistent', output: 'json' });
  } finally {
    console.log = origLog;
    console.error = origError;
    process.exit = origExit;
  }

  assert.equal(exitCode, 1);
  const output = JSON.parse(logs[0]);
  assert.equal(output.success, false);
  assert.match(output.error, /not found/);
});

test('steer fails when no active sessions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'steer-empty-'));
  const homeDir = path.join(root, 'home');
  await mkdir(path.join(homeDir, '.aloop'), { recursive: true });
  await writeFile(path.join(homeDir, '.aloop', 'active.json'), '{}', 'utf8');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  const origExit = process.exit;
  let exitCode: number | undefined;
  process.exit = ((code: number) => { exitCode = code; }) as never;

  try {
    await steerCommand('do something', { homeDir, output: 'json' });
  } finally {
    console.log = origLog;
    process.exit = origExit;
  }

  assert.equal(exitCode, 1);
  const output = JSON.parse(logs[0]);
  assert.equal(output.success, false);
  assert.match(output.error, /No active sessions/);
});

test('steer rejects when STEERING.md exists without --overwrite', async () => {
  const { homeDir, workdir } = await setupHome('steer-conflict-');

  // Pre-create STEERING.md
  await writeFile(path.join(workdir, 'STEERING.md'), '# Existing steering', 'utf8');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  const origExit = process.exit;
  let exitCode: number | undefined;
  process.exit = ((code: number) => { exitCode = code; }) as never;

  try {
    await steerCommand('new instruction', { homeDir, output: 'json' });
  } finally {
    console.log = origLog;
    process.exit = origExit;
  }

  assert.equal(exitCode, 1);
  const output = JSON.parse(logs[0]);
  assert.equal(output.success, false);
  assert.match(output.error, /already queued/);
});

test('steer succeeds with --overwrite when STEERING.md exists', async () => {
  const { homeDir, workdir } = await setupHome('steer-overwrite-');

  // Pre-create STEERING.md
  await writeFile(path.join(workdir, 'STEERING.md'), '# Old steering', 'utf8');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    await steerCommand('updated instruction', { homeDir, overwrite: true, output: 'json' });
  } finally {
    console.log = origLog;
  }

  const output = JSON.parse(logs[0]);
  assert.equal(output.success, true);

  const content = await readFile(path.join(workdir, 'STEERING.md'), 'utf8');
  assert.match(content, /updated instruction/);
});

test('steer with affects-completed-work flag', async () => {
  const { homeDir, workdir } = await setupHome('steer-affects-');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    await steerCommand('rework the auth module', { homeDir, affectsCompletedWork: 'yes', output: 'json' });
  } finally {
    console.log = origLog;
  }

  const content = await readFile(path.join(workdir, 'STEERING.md'), 'utf8');
  assert.match(content, /\*\*Affects completed work:\*\* yes/);
});

test('steer uses fallback paths when session_dir and work_dir are omitted from active.json', async () => {
  const { homeDir, sessionDir, workdir, sessionId } = await setupHome('steer-fallback-paths-');

  // Overwrite active.json to omit session_dir and work_dir
  await writeFile(
    path.join(homeDir, '.aloop', 'active.json'),
    JSON.stringify({
      [sessionId]: {
        pid: 12345,
        started_at: new Date().toISOString(),
      },
    }),
    'utf8',
  );

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    await steerCommand('fallback instruction', { homeDir, output: 'json' });
  } finally {
    console.log = origLog;
  }

  // Check STEERING.md was written to the default fallback path
  const steeringPath = path.join(workdir, 'STEERING.md');
  assert.ok(existsSync(steeringPath), 'STEERING.md should exist at fallback path');
  const steeringContent = await readFile(steeringPath, 'utf8');
  assert.match(steeringContent, /fallback instruction/);

  // Check queue file was written to the default fallback path
  const queueDir = path.join(sessionDir, 'queue');
  assert.ok(existsSync(queueDir), 'queue dir should exist');
  const queueFiles = await readdir(queueDir);
  assert.equal(queueFiles.length, 1, 'should have one queue file');
});
