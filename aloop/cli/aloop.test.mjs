import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const repoRoot = path.resolve(import.meta.dirname, '..');
const cliRoot = path.resolve(import.meta.dirname);
const entrypoint = path.join(cliRoot, 'aloop.mjs');
const templatesDir = path.join(repoRoot, 'templates');

function runAloop(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: options.cwd ?? cliRoot,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function createWorkspaceFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-entrypoint-'));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  const docsDir = path.join(projectRoot, 'docs');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });
  await writeFile(path.join(projectRoot, 'SPEC.md'), '# spec\n', 'utf8');
  await writeFile(path.join(projectRoot, 'README.md'), '# readme\n', 'utf8');
  await writeFile(path.join(docsDir, 'SPEC.md'), '# docs spec\n', 'utf8');
  await writeFile(path.join(projectRoot, 'package.json'), '{"name":"fixture","scripts":{"test":"node -v"}}\n', 'utf8');
  return { root, projectRoot, homeDir };
}

function fixtureEnv(root) {
  return {
    ...process.env,
    GIT_CEILING_DIRECTORIES: root,
  };
}

test('aloop entrypoint shows help for no args and explicit --help', async () => {
  const noArgs = await runAloop([]);
  assert.equal(noArgs.code, 0);
  assert.match(noArgs.stdout, /Usage:\s+aloop <command>/i);

  const help = await runAloop(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Core Commands \(no-dependency\)/);
  assert.match(help.stdout, /Extended Commands \(requires build\)/);
});

test('aloop entrypoint runs discover scaffold and resolve', async () => {
  const { root, projectRoot, homeDir } = await createWorkspaceFixture();
  const env = fixtureEnv(root);

  const discoverText = await runAloop(['discover', '--project-root', projectRoot, '--home-dir', homeDir, '--output', 'text'], { env });
  assert.equal(discoverText.code, 0);
  assert.match(discoverText.stdout, /Workspace discovered at/);

  const discover = await runAloop(['discover', '--project-root', projectRoot, '--home-dir', homeDir, '--output', 'json'], { env });
  assert.equal(discover.code, 0);
  const discoverJson = JSON.parse(discover.stdout);
  assert.equal(discoverJson.project.root, projectRoot);

  const scaffold = await runAloop([
    'scaffold',
    '--project-root',
    projectRoot,
    '--home-dir',
    homeDir,
    '--spec-files',
    'SPEC.md',
    '--spec-files',
    'README.md',
    '--spec-files',
    'docs/SPEC.md',
    '--templates-dir',
    templatesDir,
    '--safety-rules',
    'Rule 1',
    '--safety-rules',
    'Rule 2',
    '--safety-rules',
    'Rule 3',
    '--output',
    'text',
  ], { env });
  assert.equal(scaffold.code, 0);
  assert.match(scaffold.stdout, /Scaffold complete for project hash:/);

  const scaffoldJson = await runAloop([
    'scaffold',
    '--project-root',
    projectRoot,
    '--home-dir',
    homeDir,
    '--templates-dir',
    templatesDir,
    '--output',
    'json',
  ], { env });
  assert.equal(scaffoldJson.code, 0);
  const scaffoldData = JSON.parse(scaffoldJson.stdout);
  assert.equal(scaffoldData.project_dir.endsWith(discoverJson.project.hash), true);

  const resolveText = await runAloop(['resolve', '--project-root', projectRoot, '--home-dir', homeDir, '--output', 'text'], { env });
  assert.equal(resolveText.code, 0);
  assert.match(resolveText.stdout, /Project:\s+/);
  assert.match(resolveText.stdout, /Project config:/);

  const resolveJson = await runAloop(['resolve', '--project-root', projectRoot, '--home-dir', homeDir, '--output', 'json'], { env });
  assert.equal(resolveJson.code, 0);
  const resolveData = JSON.parse(resolveJson.stdout);
  assert.equal(resolveData.project.root, projectRoot);
});

test('aloop entrypoint surfaces resolve misconfiguration and stop validation errors', async () => {
  const { root, projectRoot, homeDir } = await createWorkspaceFixture();
  const env = fixtureEnv(root);

  const resolve = await runAloop(['resolve', '--project-root', projectRoot, '--home-dir', homeDir], { env });
  assert.notEqual(resolve.code, 0);
  assert.match(resolve.stderr, /No Aloop configuration found/i);

  const stopWithoutId = await runAloop(['stop']);
  assert.notEqual(stopWithoutId.code, 0);
  assert.match(stopWithoutId.stderr, /session-id required/i);
});

test('aloop entrypoint runs status active and stop text/json paths', async () => {
  const { root, homeDir } = await createWorkspaceFixture();
  const env = fixtureEnv(root);
  const sessionId = 'sess-1';
  const secondSessionId = 'sess-2';
  const sessionDir = path.join(homeDir, '.aloop', 'sessions', sessionId);
  const secondSessionDir = path.join(homeDir, '.aloop', 'sessions', secondSessionId);
  const now = new Date();
  const nowIso = now.toISOString();
  const pastIso = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const futureIso = new Date(now.getTime() + 30 * 1000).toISOString();

  await writeJson(path.join(homeDir, '.aloop', 'active.json'), {
    [sessionId]: {
      session_dir: sessionDir,
      work_dir: path.join(homeDir, 'work'),
      provider: 'claude',
      mode: 'plan-build-review',
      started_at: pastIso,
    },
    [secondSessionId]: {
      session_dir: secondSessionDir,
      provider: 'codex',
      mode: 'plan-build-review',
      started_at: nowIso,
    },
  });
  await writeJson(path.join(sessionDir, 'status.json'), {
    state: 'running',
    phase: 'build',
    iteration: 2,
    updated_at: nowIso,
  });
  await writeJson(path.join(secondSessionDir, 'status.json'), {
    state: 'running',
    updated_at: nowIso,
  });
  await writeJson(path.join(homeDir, '.aloop', 'health', 'claude.json'), {
    status: 'healthy',
    last_success: futureIso,
  });
  await writeJson(path.join(homeDir, '.aloop', 'health', 'gemini.json'), {
    status: 'degraded',
    failure_reason: 'auth',
  });
  await writeJson(path.join(homeDir, '.aloop', 'health', 'copilot.json'), {
    status: 'cooldown',
    cooldown_until: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    consecutive_failures: 2,
  });

  const statusText = await runAloop(['status', '--home-dir', homeDir, '--output', 'text'], { env });
  assert.equal(statusText.code, 0);
  assert.match(statusText.stdout, /Active Sessions:/);
  assert.match(statusText.stdout, /Provider Health:/);

  const statusJson = await runAloop(['status', '--home-dir', homeDir, '--output', 'json'], { env });
  assert.equal(statusJson.code, 0);
  const statusParsed = JSON.parse(statusJson.stdout);
  assert.equal(statusParsed.sessions.length, 2);
  assert.equal(statusParsed.sessions[0].session_id, sessionId);
  assert.equal(statusParsed.health.claude.status, 'healthy');

  const activeText = await runAloop(['active', '--home-dir', homeDir, '--output', 'text'], { env });
  assert.equal(activeText.code, 0);
  assert.match(activeText.stdout, /sess-1 \(running\)/);

  const activeJson = await runAloop(['active', '--home-dir', homeDir, '--output', 'json'], { env });
  assert.equal(activeJson.code, 0);
  const activeParsed = JSON.parse(activeJson.stdout);
  assert.equal(activeParsed.length, 2);

  const stopJson = await runAloop(['stop', sessionId, '--home-dir', homeDir, '--output', 'json'], { env });
  assert.equal(stopJson.code, 0);
  const stopParsed = JSON.parse(stopJson.stdout);
  assert.equal(stopParsed.success, true);
  assert.equal(stopParsed.session_id, sessionId);

  const stopText = await runAloop(['stop', secondSessionId, '--home-dir', homeDir, '--output', 'text'], { env });
  assert.equal(stopText.code, 0);
  assert.match(stopText.stdout, /Stopped session: sess-2/);

  const activeAfterStop = await runAloop(['active', '--home-dir', homeDir, '--output', 'text'], { env });
  assert.equal(activeAfterStop.code, 0);
  assert.match(activeAfterStop.stdout, /No active sessions\./);

  const statusAfterStop = await runAloop(['status', '--home-dir', homeDir, '--output', 'text'], { env });
  assert.equal(statusAfterStop.code, 0);
  assert.match(statusAfterStop.stdout, /No active sessions\./);

  const stopMissingSession = await runAloop(['stop', 'missing-session', '--home-dir', homeDir, '--output', 'json'], { env });
  assert.notEqual(stopMissingSession.code, 0);
  assert.match(stopMissingSession.stderr, /Session not found/i);

  const history = JSON.parse(await readFile(path.join(homeDir, '.aloop', 'history.json'), 'utf8'));
  assert.equal(history.length, 2);
  assert.equal(history[0].session_id, sessionId);
});

test('aloop entrypoint supports debug-env command', async () => {
  const result = await runAloop(['debug-env']);
  assert.equal(result.code, 0);
  const env = JSON.parse(result.stdout);
  assert.ok(typeof env.PATH === 'string');
});

test('aloop entrypoint exercises status formatting edge cases and short help', async () => {
  const { root, homeDir } = await createWorkspaceFixture();
  const env = fixtureEnv(root);
  const now = Date.now();
  const sessionsDir = path.join(homeDir, '.aloop', 'sessions');
  const active = {
    unknownAge: { session_dir: path.join(sessionsDir, 'unknownAge') },
    secondsAge: { session_dir: path.join(sessionsDir, 'secondsAge'), started_at: new Date(now - 12 * 1000).toISOString() },
    minutesAge: { session_dir: path.join(sessionsDir, 'minutesAge'), started_at: new Date(now - 12 * 60 * 1000).toISOString() },
  };
  await writeJson(path.join(homeDir, '.aloop', 'active.json'), active);
  await writeJson(path.join(sessionsDir, 'unknownAge', 'status.json'), { state: 'running' });
  await writeJson(path.join(sessionsDir, 'secondsAge', 'status.json'), { state: 'running' });
  await writeJson(path.join(sessionsDir, 'minutesAge', 'status.json'), { state: 'running' });
  await writeJson(path.join(homeDir, '.aloop', 'health', 'copilot.json'), {
    status: 'cooldown',
    cooldown_until: new Date(now - 60 * 1000).toISOString(),
  });
  await writeJson(path.join(homeDir, '.aloop', 'health', 'gemini.json'), {
    status: 'degraded',
    failure_reason: 'network',
  });
  await writeJson(path.join(homeDir, '.aloop', 'health', 'claude.json'), {
    status: 'healthy',
  });

  const status = await runAloop(['status', '--home-dir', homeDir, '--output', 'text', '--verbose'], { env });
  assert.equal(status.code, 0);
  assert.match(status.stdout, /unknownAge/);
  assert.match(status.stdout, /secondsAge/);
  assert.match(status.stdout, /minutesAge/);

  const shortHelp = await runAloop(['-h']);
  assert.equal(shortHelp.code, 0);
  assert.match(shortHelp.stdout, /Usage:\s+aloop <command>/i);
});

test('aloop entrypoint delegates unknown commands when dist bundle exists', async () => {
  const delegated = await runAloop(['unknown-delegated-command']);
  assert.notEqual(delegated.code, 0);
  assert.match(delegated.stderr, /unknown command/i);
  assert.doesNotMatch(delegated.stderr, /bundle not found/i);
});

test('aloop entrypoint returns bundle-not-found error when dist is absent', async () => {
  const distDir = path.join(cliRoot, 'dist');
  const hiddenDistDir = path.join(cliRoot, `.dist-test-hide-${process.pid}`);
  await rename(distDir, hiddenDistDir);
  try {
    const result = await runAloop(['unknown-command'], {
      cwd: cliRoot,
      env: process.env,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /bundle not found/i);
  } finally {
    await rename(hiddenDistDir, distDir);
  }
});
