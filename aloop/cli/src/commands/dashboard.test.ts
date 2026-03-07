import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startDashboardServer } from './dashboard.js';

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate test port.'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function createServerFixture(
  runtimeOptions: {
    heartbeatIntervalMs?: number;
    requestPollIntervalMs?: number;
    ghCommandRunner?: (operation: string, sessionId: string, requestPath: string) => Promise<{ exitCode: number; output: string }>;
  } = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-dashboard-'));
  const sessionDir = path.join(root, 'session');
  const workdir = path.join(root, 'workdir');
  const assetsDir = path.join(root, 'assets');
  const runtimeDir = path.join(root, 'runtime');

  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(path.join(assetsDir, 'index.html'), '<!doctype html><p>ok</p>', 'utf8');

  const port = await reservePort();
  const handle = await startDashboardServer(
    { port: String(port), sessionDir, workdir, assetsDir, runtimeDir },
    { registerSignalHandlers: false, ...runtimeOptions },
  );

  return { root, sessionDir, workdir, assetsDir, runtimeDir, handle };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return;
    }
    await sleep(50);
  }
  throw new Error('Timed out waiting for condition.');
}

function toBashPath(nativePath: string): string {
  if (process.platform !== 'win32') {
    return nativePath;
  }

  const normalized = nativePath.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (driveMatch) {
    return `/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
  }
  return normalized;
}

function quoteBash(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

async function runBashCommand(command: string, envOverrides: NodeJS.ProcessEnv = {}, timeoutMs = 20_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], {
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

test('GET /api/state includes active and recent sessions from runtime state files', async () => {
  const fixture = await createServerFixture();

  try {
    const activeSessions = [{ session_id: 'session-one', project_name: 'proj-a', state: 'running', iterations: 2 }];
    const recentSessions = [{ session_id: 'session-zero', project_name: 'proj-a', state: 'completed', iterations: 9 }];
    await writeFile(path.join(fixture.runtimeDir, 'active.json'), JSON.stringify(activeSessions), 'utf8');
    await writeFile(path.join(fixture.runtimeDir, 'history.json'), JSON.stringify(recentSessions), 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/state`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      runtimeDir: string;
      activeSessions: unknown[];
      recentSessions: unknown[];
    };

    assert.equal(payload.runtimeDir, fixture.runtimeDir);
    assert.deepEqual(payload.activeSessions, activeSessions);
    assert.deepEqual(payload.recentSessions, recentSessions);
  } finally {
    await fixture.handle.close();
  }
});

test('host monitor processes GH convention requests outside loop runtime', async () => {
  const calls: string[] = [];
  const fixture = await createServerFixture({
    requestPollIntervalMs: 50,
    ghCommandRunner: async (operation, _sessionId, requestPath) => {
      calls.push(`${operation}|${path.basename(requestPath)}`);
      if (operation === 'pr-create') {
        return { exitCode: 0, output: '{"pr_number":15}' };
      }
      return { exitCode: 0, output: 'commented' };
    },
  });

  const requestsDir = path.join(fixture.workdir, '.aloop', 'requests');
  const processedDir = path.join(requestsDir, 'processed');
  const responsesDir = path.join(fixture.workdir, '.aloop', 'responses');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(requestsDir, '002-pr-comment.json'), '{"type":"pr-comment","pr_number":15}', 'utf8');
    await writeFile(path.join(requestsDir, '001-pr-create.json'), '{"type":"pr-create","title":"x"}', 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-pr-create.json'), 'utf8');
        await readFile(path.join(processedDir, '002-pr-comment.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    assert.deepEqual(calls, ['pr-create|001-pr-create.json', 'pr-comment|002-pr-comment.json']);
    const createResponse = JSON.parse(await readFile(path.join(responsesDir, '001-pr-create.json'), 'utf8')) as Record<string, unknown>;
    const commentResponse = JSON.parse(await readFile(path.join(responsesDir, '002-pr-comment.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(createResponse.status, 'success');
    assert.equal(commentResponse.status, 'success');
    assert.deepEqual(createResponse.gh, { pr_number: 15 });
    assert.equal(commentResponse.gh, 'commented');

    const logs = (await readFile(path.join(fixture.sessionDir, 'log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string });
    assert.equal(logs.filter((entry) => entry.event === 'gh_request_processed').length, 2);
  } finally {
    await fixture.handle.close();
  }
});

test('GH request processor writes error response for malformed JSON request', async () => {
  const calls: string[] = [];
  const fixture = await createServerFixture({
    requestPollIntervalMs: 50,
    ghCommandRunner: async (operation, _sessionId, requestPath) => {
      calls.push(`${operation}|${path.basename(requestPath)}`);
      return { exitCode: 0, output: '{}' };
    },
  });

  const requestsDir = path.join(fixture.workdir, '.aloop', 'requests');
  const processedDir = path.join(requestsDir, 'processed');
  const responsesDir = path.join(fixture.workdir, '.aloop', 'responses');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(requestsDir, '001-bad.json'), 'not valid json {{{', 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-bad.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    assert.deepEqual(calls, []);
    const response = JSON.parse(await readFile(path.join(responsesDir, '001-bad.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(response.status, 'error');
    assert.equal(typeof response.error, 'string');
    assert.equal(typeof response.processed_at, 'string');

    const logs = (await readFile(path.join(fixture.sessionDir, 'log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string });
    assert.equal(logs.filter((entry) => entry.event === 'gh_request_failed').length, 1);
  } finally {
    await fixture.handle.close();
  }
});

test('GH request processor writes error response for unsupported request type', async () => {
  const calls: string[] = [];
  const fixture = await createServerFixture({
    requestPollIntervalMs: 50,
    ghCommandRunner: async (operation, _sessionId, requestPath) => {
      calls.push(`${operation}|${path.basename(requestPath)}`);
      return { exitCode: 0, output: '{}' };
    },
  });

  const requestsDir = path.join(fixture.workdir, '.aloop', 'requests');
  const processedDir = path.join(requestsDir, 'processed');
  const responsesDir = path.join(fixture.workdir, '.aloop', 'responses');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(requestsDir, '001-unknown.json'), '{"type":"repo-delete","target":"foo"}', 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-unknown.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    assert.deepEqual(calls, []);
    const response = JSON.parse(await readFile(path.join(responsesDir, '001-unknown.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(response.status, 'error');
    assert.equal(response.type, 'repo-delete');
    assert.match(response.error as string, /Unsupported request type/);

    const logs = (await readFile(path.join(fixture.sessionDir, 'log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string });
    assert.equal(logs.filter((entry) => entry.event === 'gh_request_failed').length, 1);
  } finally {
    await fixture.handle.close();
  }
});

test('GH request processor writes error response when aloop gh returns non-zero exit code', async () => {
  const fixture = await createServerFixture({
    requestPollIntervalMs: 50,
    ghCommandRunner: async () => {
      return { exitCode: 1, output: 'rate limit exceeded' };
    },
  });

  const requestsDir = path.join(fixture.workdir, '.aloop', 'requests');
  const processedDir = path.join(requestsDir, 'processed');
  const responsesDir = path.join(fixture.workdir, '.aloop', 'responses');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(requestsDir, '001-pr-create.json'), '{"type":"pr-create","title":"x"}', 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-pr-create.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    const response = JSON.parse(await readFile(path.join(responsesDir, '001-pr-create.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(response.status, 'error');
    assert.equal(response.type, 'pr-create');
    assert.match(response.error as string, /failed with exit code 1/);
    assert.match(response.error as string, /rate limit exceeded/);

    const logs = (await readFile(path.join(fixture.sessionDir, 'log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string });
    assert.equal(logs.filter((entry) => entry.event === 'gh_request_failed').length, 1);
    assert.equal(logs.filter((entry) => entry.event === 'gh_request_processed').length, 0);
  } finally {
    await fixture.handle.close();
  }
});

test('GH request processor handles archive collision with duplicate file names', async () => {
  const fixture = await createServerFixture({
    requestPollIntervalMs: 50,
    ghCommandRunner: async () => {
      return { exitCode: 0, output: '{"ok":true}' };
    },
  });

  const requestsDir = path.join(fixture.workdir, '.aloop', 'requests');
  const processedDir = path.join(requestsDir, 'processed');
  const responsesDir = path.join(fixture.workdir, '.aloop', 'responses');

  try {
    await mkdir(processedDir, { recursive: true });
    // Pre-populate processed dir with a file that will collide
    await writeFile(path.join(processedDir, '001-pr-create.json'), '{"old":"archive"}', 'utf8');

    await writeFile(path.join(requestsDir, '001-pr-create.json'), '{"type":"pr-create","title":"new"}', 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-pr-create.dup1.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    // Original archive file should be untouched
    const oldArchive = JSON.parse(await readFile(path.join(processedDir, '001-pr-create.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(oldArchive.old, 'archive');

    // New request should be archived with .dup1 suffix
    const newArchive = JSON.parse(await readFile(path.join(processedDir, '001-pr-create.dup1.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(newArchive.type, 'pr-create');

    // Response should still be written with success
    const response = JSON.parse(await readFile(path.join(responsesDir, '001-pr-create.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(response.status, 'success');
    assert.deepEqual(response.gh, { ok: true });

    const logs = (await readFile(path.join(fixture.sessionDir, 'log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string });
    assert.equal(logs.filter((entry) => entry.event === 'gh_request_processed').length, 1);
  } finally {
    await fixture.handle.close();
  }
});

test('host monitor processes requests while loop.sh runtime path executes', async (t) => {
  const bashCheck = spawnSync('bash', ['-lc', 'exit 0'], { encoding: 'utf8' });
  if (bashCheck.status !== 0) {
    t.skip('bash is not available in PATH');
    return;
  }

  const calls: string[] = [];
  const fixture = await createServerFixture({
    requestPollIntervalMs: 50,
    ghCommandRunner: async (operation, _sessionId, requestPath) => {
      calls.push(`${operation}|${path.basename(requestPath)}`);
      if (operation === 'pr-create') {
        return { exitCode: 0, output: '{"pr_number":22}' };
      }
      if (operation === 'pr-comment') {
        return { exitCode: 0, output: 'comment saved' };
      }
      return { exitCode: 1, output: 'permission denied' };
    },
  });

  const requestsDir = path.join(fixture.workdir, '.aloop', 'requests');
  const processedDir = path.join(requestsDir, 'processed');
  const responsesDir = path.join(fixture.workdir, '.aloop', 'responses');
  const promptsDir = path.join(fixture.root, 'prompts');
  const fakeBinDir = path.join(fixture.root, 'fake-bin');
  const providerStateFile = path.join(fixture.root, 'provider-state.txt');
  const runtimeStub = path.join(fixture.root, 'runtime-stub');
  const loopScriptNative = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/loop.sh');

  try {
    await mkdir(requestsDir, { recursive: true });
    await mkdir(promptsDir, { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(runtimeStub, { recursive: true });

    await writeFile(path.join(fixture.workdir, 'TODO.md'), '- [ ] Build something\n', 'utf8');
    await writeFile(path.join(promptsDir, 'PROMPT_build.md'), '# Building Mode\nBuild the task.\n', 'utf8');

    await writeFile(
      path.join(fakeBinDir, 'claude'),
      [
        '#!/bin/bash',
        'STATE_FILE="${FAKE_LOOP_PROVIDER_STATE:-}"',
        'if [ -n "$STATE_FILE" ]; then',
        '  COUNT=0',
        '  if [ -f "$STATE_FILE" ]; then',
        '    COUNT="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"',
        '  fi',
        '  COUNT=$((COUNT + 1))',
        '  printf \'%s\\n\' "$COUNT" > "$STATE_FILE"',
        'fi',
        'TODO_FILE="${PWD}/TODO.md"',
        'if [ -f "$TODO_FILE" ]; then',
        '  sed -i \'s/- \\[ \\]/- [x]/g\' "$TODO_FILE" 2>/dev/null || true',
        'fi',
        'echo "fake claude ok"',
      ].join('\n'),
      'utf8',
    );
    await chmod(path.join(fakeBinDir, 'claude'), 0o755);

    await writeFile(path.join(requestsDir, '002-pr-comment.json'), '{"type":"pr-comment","pr_number":22}', 'utf8');
    await writeFile(path.join(requestsDir, '001-pr-create.json'), '{"type":"pr-create","title":"demo"}', 'utf8');
    await writeFile(path.join(requestsDir, '003-bad.json'), 'not valid json {{{', 'utf8');
    await writeFile(path.join(requestsDir, '004-issue-comment.json'), '{"type":"issue-comment","issue_number":9}', 'utf8');

    const loopCommand = [
      `export PATH=${quoteBash(toBashPath(fakeBinDir))}:$PATH`,
      `export FAKE_LOOP_PROVIDER_STATE=${quoteBash(toBashPath(providerStateFile))}`,
      `bash ${quoteBash(toBashPath(loopScriptNative))} --prompts-dir ${quoteBash(toBashPath(promptsDir))} --session-dir ${quoteBash(toBashPath(fixture.sessionDir))} --work-dir ${quoteBash(toBashPath(fixture.workdir))} --mode build --provider claude --max-iterations 1`,
    ].join('; ');
    const loopResult = await runBashCommand(loopCommand, { ALOOP_RUNTIME_DIR: runtimeStub }, 30_000);
    assert.equal(loopResult.code, 0, `loop.sh exited non-zero.\nstdout:\n${loopResult.stdout}\nstderr:\n${loopResult.stderr}`);

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-pr-create.json'), 'utf8');
        await readFile(path.join(processedDir, '002-pr-comment.json'), 'utf8');
        await readFile(path.join(processedDir, '003-bad.json'), 'utf8');
        await readFile(path.join(processedDir, '004-issue-comment.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    }, 5_000);

    assert.deepEqual(calls, [
      'pr-create|001-pr-create.json',
      'pr-comment|002-pr-comment.json',
      'issue-comment|004-issue-comment.json',
    ]);

    const createResponse = JSON.parse(await readFile(path.join(responsesDir, '001-pr-create.json'), 'utf8')) as Record<string, unknown>;
    const commentResponse = JSON.parse(await readFile(path.join(responsesDir, '002-pr-comment.json'), 'utf8')) as Record<string, unknown>;
    const malformedResponse = JSON.parse(await readFile(path.join(responsesDir, '003-bad.json'), 'utf8')) as Record<string, unknown>;
    const failedResponse = JSON.parse(await readFile(path.join(responsesDir, '004-issue-comment.json'), 'utf8')) as Record<string, unknown>;

    assert.equal(createResponse.status, 'success');
    assert.deepEqual(createResponse.gh, { pr_number: 22 });
    assert.equal(commentResponse.status, 'success');
    assert.equal(commentResponse.gh, 'comment saved');
    assert.equal(malformedResponse.status, 'error');
    assert.equal(typeof malformedResponse.error, 'string');
    assert.equal(failedResponse.status, 'error');
    assert.match(String(failedResponse.error), /failed with exit code 1/);
    assert.match(String(failedResponse.error), /permission denied/);

    const providerCallCount = Number.parseInt((await readFile(providerStateFile, 'utf8')).trim(), 10);
    assert.ok(Number.isFinite(providerCallCount) && providerCallCount >= 1);
  } finally {
    await fixture.handle.close();
  }
});

test('POST /api/steer validates input and writes STEERING.md', async () => {
  const fixture = await createServerFixture();

  try {
    const invalidJsonResponse = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(invalidJsonResponse.status, 400);

    const missingInstructionResponse = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ affects_completed_work: 'no' }),
    });
    assert.equal(missingInstructionResponse.status, 400);

    const validResponse = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: 'Shift to implement API controls first.', affects_completed_work: 'no' }),
    });
    assert.equal(validResponse.status, 201);

    const steeringDoc = await readFile(path.join(fixture.workdir, 'STEERING.md'), 'utf8');
    assert.match(steeringDoc, /# Steering Instruction/);
    assert.match(steeringDoc, /Shift to implement API controls first\./);
    assert.match(steeringDoc, /\*\*Affects completed work:\*\* no/);

    const conflictResponse = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: 'Another instruction.' }),
    });
    assert.equal(conflictResponse.status, 409);
  } finally {
    await fixture.handle.close();
  }
});

test('API method guards return 405 for /api/steer and /api/stop', async () => {
  const fixture = await createServerFixture();

  try {
    const steerResponse = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'GET',
    });
    assert.equal(steerResponse.status, 405);

    const stopResponse = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'GET',
    });
    assert.equal(stopResponse.status, 405);
  } finally {
    await fixture.handle.close();
  }
});

test('POST /api/stop validates payload and reports missing pid', async () => {
  const fixture = await createServerFixture();

  try {
    const invalidPayloadResponse = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force: 'yes' }),
    });
    assert.equal(invalidPayloadResponse.status, 400);

    const missingPidResponse = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(missingPidResponse.status, 409);
  } finally {
    await fixture.handle.close();
  }
});

test('POST /api/steer rejects oversized request bodies', async () => {
  const fixture = await createServerFixture();

  try {
    const oversizedInstruction = 'x'.repeat(70 * 1024);
    const response = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: oversizedInstruction }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /Invalid request body: Request body too large/);
  } finally {
    await fixture.handle.close();
  }
});

test('POST /api/stop signals pid from meta.json and updates status.json', async () => {
  const fixture = await createServerFixture();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: false,
  });

  try {
    await writeFile(path.join(fixture.sessionDir, 'meta.json'), JSON.stringify({ pid: child.pid }), 'utf8');
    await writeFile(path.join(fixture.sessionDir, 'status.json'), JSON.stringify({ state: 'running' }), 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 202);
    const payload = (await response.json()) as { stopping: boolean; pid: number; signal: string };
    assert.equal(payload.stopping, true);
    assert.equal(payload.pid, child.pid);
    assert.equal(payload.signal, 'SIGTERM');

    const status = JSON.parse(await readFile(path.join(fixture.sessionDir, 'status.json'), 'utf8')) as { state?: string };
    assert.equal(status.state, 'stopping');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    await fixture.handle.close();
  }
});

test('POST /api/steer supports overwrite: true', async () => {
  const fixture = await createServerFixture();

  try {
    await writeFile(path.join(fixture.workdir, 'STEERING.md'), 'existing', 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: 'New instruction', overwrite: true }),
    });

    assert.equal(response.status, 201);
    const content = await readFile(path.join(fixture.workdir, 'STEERING.md'), 'utf8');
    assert.match(content, /New instruction/);
  } finally {
    await fixture.handle.close();
  }
});

test('POST /api/stop supports force: true', async () => {
  const fixture = await createServerFixture();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });

  try {
    await writeFile(path.join(fixture.sessionDir, 'meta.json'), JSON.stringify({ pid: child.pid }), 'utf8');
    const response = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });

    assert.equal(response.status, 202);
    const payload = (await response.json()) as { signal: string };
    assert.equal(payload.signal, 'SIGKILL');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    await fixture.handle.close();
  }
});

test('POST /api/stop handles ESRCH and EPERM errors', async (t) => {
  const fixture = await createServerFixture();

  // Test ESRCH
  const killMock = t.mock.method(process, 'kill', () => {
    const err = new Error('not running') as NodeJS.ErrnoException;
    err.code = 'ESRCH';
    throw err;
  });

  try {
    await writeFile(path.join(fixture.sessionDir, 'meta.json'), JSON.stringify({ pid: 12345 }), 'utf8');
    const response = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 409);
    assert.match(((await response.json()) as { error: string }).error, /not running/);

    // Test EPERM
    killMock.mock.mockImplementation(() => {
      const err = new Error('denied') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });

    const response2 = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response2.status, 403);
    assert.match(((await response2.json()) as { error: string }).error, /Permission denied/);
  } finally {
    await fixture.handle.close();
  }
});

test('resolveDefaultAssetsDir fallback logic', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-assets-fallback-'));
  const sessionDir = path.join(root, 'session');
  const workdir = path.join(root, 'workdir');
  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });

  const port = await reservePort();
  const handle = await startDashboardServer(
    { port: String(port), sessionDir, workdir },
    { registerSignalHandlers: false },
  );

  try {
    const response = await fetch(`${handle.url}/`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /(Dashboard assets not found|<title>Aloop Dashboard<\/title>)/);
  } finally {
    await handle.close();
  }
});

test('POST /api/stop refuses to stop dashboard itself', async () => {
  const fixture = await createServerFixture();

  try {
    await writeFile(path.join(fixture.sessionDir, 'meta.json'), JSON.stringify({ pid: process.pid }), 'utf8');
    const response = await fetch(`${fixture.handle.url}/api/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 409);
    assert.match(((await response.json()) as { error: string }).error, /Refusing to stop dashboard/);
  } finally {
    await fixture.handle.close();
  }
});

test('POST /api/steer validates affects_completed_work and overwrite types', async () => {
  const fixture = await createServerFixture();

  try {
    const invalidAffectsResponse = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: 'test', affects_completed_work: 'maybe' }),
    });
    assert.equal(invalidAffectsResponse.status, 400);

    const invalidOverwriteResponse = await fetch(`${fixture.handle.url}/api/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: 'test', overwrite: 'yes' }),
    });
    assert.equal(invalidOverwriteResponse.status, 400);
  } finally {
    await fixture.handle.close();
  }
});

test('Unknown API endpoints return 404', async () => {
  const fixture = await createServerFixture();

  try {
    const response = await fetch(`${fixture.handle.url}/api/unknown`);
    assert.equal(response.status, 404);
  } finally {
    await fixture.handle.close();
  }
});

test('SSE stream includes heartbeat events', async () => {
  const fixture = await createServerFixture({ heartbeatIntervalMs: 250 });

  try {
    const response = await fetch(`${fixture.handle.url}/events`);
    assert.equal(response.status, 200);
    assert.ok(response.body);

    const reader = response.body.getReader();
    const timeoutAt = Date.now() + 3000;
    let raw = '';

    while (Date.now() < timeoutAt && !raw.includes('event: heartbeat')) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      raw += Buffer.from(value).toString('utf8');
    }

    await reader.cancel();
    assert.match(raw, /event: heartbeat/);
  } finally {
    await fixture.handle.close();
  }
});

test('watch-triggered publish failures are guarded and do not crash the server', async (t) => {
  const fixture = await createServerFixture();
  const originalStringify = JSON.stringify;

  const stringifyMock = t.mock.method(JSON, 'stringify', (...args: Parameters<typeof JSON.stringify>) => {
    const [value] = args;
    if (value && typeof value === 'object' && 'updatedAt' in (value as Record<string, unknown>)) {
      throw new Error('simulated publish failure');
    }
    return originalStringify(...args);
  });

  let unhandledRejection = false;
  const onUnhandledRejection = () => {
    unhandledRejection = true;
  };
  process.once('unhandledRejection', onUnhandledRejection);

  try {
    const response = await fetch(`${fixture.handle.url}/events`);
    assert.equal(response.status, 200);

    await writeFile(path.join(fixture.workdir, 'TODO.md'), '# changed', 'utf8');
    await sleep(250);

    stringifyMock.mock.restore();

    const health = await fetch(`${fixture.handle.url}/api/state`);
    assert.equal(health.status, 200);
    assert.equal(unhandledRejection, false);
  } finally {
    process.removeListener('unhandledRejection', onUnhandledRejection);
    await fixture.handle.close();
  }
});
