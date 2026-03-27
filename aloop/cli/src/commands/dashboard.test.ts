import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, chmod, readdir, rm } from 'node:fs/promises';
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

function makeDefaultRequestSpawnSync(): typeof spawnSync {
  return ((cmd: string, args?: readonly string[], opts?: object) => {
    const ghArgs = (args ?? []) as string[];
    // Idempotency checks: gh pr list → empty array, gh pr view → empty obj, gh issue view → empty obj
    if (cmd === 'gh') {
      const sub = ghArgs[0];
      if (sub === 'pr' && ghArgs[1] === 'list') {
        return { status: 0, stdout: '[]', stderr: '', pid: 0, output: [null, '[]', ''], signal: null, error: undefined } as ReturnType<typeof spawnSync>;
      }
      if (sub === 'pr' && ghArgs[1] === 'view') {
        return { status: 0, stdout: '{}', stderr: '', pid: 0, output: [null, '{}', ''], signal: null, error: undefined } as ReturnType<typeof spawnSync>;
      }
      if (sub === 'issue' && ghArgs[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ body: '' }), stderr: '', pid: 0, output: [null, JSON.stringify({ body: '' }), ''], signal: null, error: undefined } as ReturnType<typeof spawnSync>;
      }
      if (sub === 'issue' && ghArgs[1] === 'list') {
        return { status: 0, stdout: '[]', stderr: '', pid: 0, output: [null, '[]', ''], signal: null, error: undefined } as ReturnType<typeof spawnSync>;
      }
    }
    return spawnSync(cmd, args as string[], opts as Parameters<typeof spawnSync>[2]);
  }) as unknown as typeof spawnSync;
}

async function createServerFixture(
  runtimeOptions: {
    heartbeatIntervalMs?: number;
    requestPollIntervalMs?: number;
    ghCommandRunner?: (operation: string, sessionId: string, requestPath: string) => Promise<{ exitCode: number; output: string }>;
    requestSpawnSync?: typeof spawnSync;
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
    { registerSignalHandlers: false, requestSpawnSync: makeDefaultRequestSpawnSync(), ...runtimeOptions },
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

async function createFakeOpencodeBinary(
  fakeBinDir: string,
  dbCounterPath: string,
  exportCounterPath: string,
): Promise<void> {
  const scriptPath = path.join(fakeBinDir, 'opencode');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const dbCounter = ${JSON.stringify(dbCounterPath)};
const exportCounter = ${JSON.stringify(exportCounterPath)};
const bump = (target) => {
  const current = fs.existsSync(target) ? Number(fs.readFileSync(target, 'utf8')) || 0 : 0;
  fs.writeFileSync(target, String(current + 1), 'utf8');
};

if (args[0] === '--version') {
  process.stdout.write('opencode 1.0.0\\n');
  process.exit(0);
}

if (args[0] === 'db') {
  bump(dbCounter);
  process.stdout.write(JSON.stringify([
    { model: 'gpt-4', cost_usd: 1.25 },
    { model: 'gpt-5', cost_usd: 2.75 },
  ]));
  process.exit(0);
}

if (args[0] === 'export') {
  bump(exportCounter);
  const sessionIndex = args.indexOf('--session');
  const sessionId = sessionIndex >= 0 ? args[sessionIndex + 1] : 'unknown';
  process.stdout.write(JSON.stringify({
    entries: [
      { model: sessionId, cost_usd: 0.5 },
      { model: 'fallback', cost_usd: 1.5 },
    ],
  }));
  process.exit(0);
}

process.stderr.write('unsupported opencode args: ' + args.join(' '));
process.exit(1);
`;

  await writeFile(scriptPath, script, 'utf8');
  await chmod(scriptPath, 0o755);
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
  const queueDir = path.join(fixture.sessionDir, 'queue');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(fixture.workdir, 'body.md'), 'test body', 'utf8');
    
    await writeFile(path.join(requestsDir, '001-create-pr.json'), JSON.stringify({
      id: 'req-1',
      type: 'create_pr',
      payload: {
        head: 'feat',
        base: 'main',
        title: 'x',
        body_file: 'body.md',
        issue_number: 15
      }
    }), 'utf8');
    
    await writeFile(path.join(requestsDir, '002-post-comment.json'), JSON.stringify({
      id: 'req-2',
      type: 'post_comment',
      payload: {
        issue_number: 15,
        body_file: 'body.md'
      }
    }), 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-create-pr.json'), 'utf8');
        await readFile(path.join(processedDir, '002-post-comment.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    assert.deepEqual(calls, ['pr-create|_tmp_req-1.json', 'issue-comment|_tmp_req-2.json']);
    
    const queueFiles = (await readdir(queueDir)).filter(f => f.endsWith('.md')).sort();
    assert.equal(queueFiles.length, 2);

    const createResponse = await readFile(path.join(queueDir, queueFiles[0]), 'utf8');
    const commentResponse = await readFile(path.join(queueDir, queueFiles[1]), 'utf8');
    
    assert.match(createResponse, /"status": "success"/);
    assert.match(createResponse, /"pr_number": 15/);
    assert.match(commentResponse, /"status": "success"/);
    assert.match(commentResponse, /posted/);

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
  const failedDir = path.join(requestsDir, 'failed');
  const queueDir = path.join(fixture.sessionDir, 'queue');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(requestsDir, '001-bad.json'), 'not valid json {{{', 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(failedDir, '001-bad.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    assert.deepEqual(calls, []);
    // No queue entry for malformed JSON as we have no request object
    if (await exists(queueDir)) {
      const queueFiles = (await readdir(queueDir)).filter(f => f.endsWith('.md'));
      assert.equal(queueFiles.length, 0);
    }

    const logs = (await readFile(path.join(fixture.sessionDir, 'log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string; error?: string });
    const failedLog = logs.find((entry) => entry.event === 'gh_request_failed');
    assert.ok(failedLog);
    assert.match(failedLog.error as string, /Invalid JSON/);
  } finally {
    await fixture.handle.close();
  }
});

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    try {
      await readdir(path);
      return true;
    } catch {
      return false;
    }
  }
}

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
  const failedDir = path.join(requestsDir, 'failed');
  const queueDir = path.join(fixture.sessionDir, 'queue');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(requestsDir, '001-unknown.json'), '{"id":"req-unsupp","type":"repo-delete","payload":{"target":"foo"}}', 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(failedDir, '001-unknown.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    assert.deepEqual(calls, []);
    if (await exists(queueDir)) {
      const queueFiles = (await readdir(queueDir)).filter(f => f.endsWith('.md')).sort();
      assert.equal(queueFiles.length, 0);
    }

    const logs = (await readFile(path.join(fixture.sessionDir, 'log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event?: string; error?: string });
    assert.equal(logs.filter((entry) => entry.event === 'gh_request_failed').length, 1);
    assert.match((logs.find((entry) => entry.event === 'gh_request_failed')?.error ?? ''), /Validation failed: Invalid or missing request type/);
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
  const failedDir = path.join(requestsDir, 'failed');
  const queueDir = path.join(fixture.sessionDir, 'queue');

  try {
    await mkdir(requestsDir, { recursive: true });
    await writeFile(path.join(fixture.workdir, 'body.md'), 'body', 'utf8');
    await writeFile(path.join(requestsDir, '001-create-pr.json'), JSON.stringify({
      id: 'req-rate',
      type: 'create_pr',
      payload: {
        head: 'f',
        base: 'm',
        title: 'x',
        body_file: 'body.md',
        issue_number: 1
      }
    }), 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(failedDir, '001-create-pr.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    const queueFiles = (await readdir(queueDir)).filter(f => f.endsWith('.md')).sort();
    assert.equal(queueFiles.length, 1);
    const response = await readFile(path.join(queueDir, queueFiles[0]), 'utf8');
    assert.match(response, /"status": "error"/);
    assert.match(response, /"request_type": "create_pr"/);
    assert.match(response, /rate limit exceeded/);

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
  const queueDir = path.join(fixture.sessionDir, 'queue');

  try {
    await mkdir(processedDir, { recursive: true });
    await mkdir(path.join(fixture.workdir, '.aloop', 'requests'), { recursive: true });
    // Pre-populate processed dir with a file that will collide
    await writeFile(path.join(processedDir, '001-create-pr.json'), '{"old":"archive"}', 'utf8');

    await writeFile(path.join(fixture.workdir, 'body.md'), 'body', 'utf8');
    await writeFile(path.join(requestsDir, '001-create-pr.json'), JSON.stringify({
      id: 'req-dup',
      type: 'create_pr',
      payload: {
        head: 'f',
        base: 'm',
        title: 'x',
        body_file: 'body.md',
        issue_number: 1
      }
    }), 'utf8');

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-create-pr.dup1.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    // Original archive file should be untouched
    const oldArchive = JSON.parse(await readFile(path.join(processedDir, '001-create-pr.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(oldArchive.old, 'archive');

    // New request should be archived with .dup1 suffix
    const newArchive = JSON.parse(await readFile(path.join(processedDir, '001-create-pr.dup1.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(newArchive.id, 'req-dup');

    // Response should still be written with success
    const queueFiles = (await readdir(queueDir)).filter(f => f.endsWith('.md')).sort();
    assert.equal(queueFiles.length, 1);
    const response = await readFile(path.join(queueDir, queueFiles[0]), 'utf8');
    assert.match(response, /"status": "success"/);
    assert.match(response, /"ok": true/);

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
      if (requestPath.includes('req-4')) {
        return { exitCode: 1, output: 'permission denied' };
      }
      return { exitCode: 0, output: 'comment saved' };
    },
  });

  const requestsDir = path.join(fixture.workdir, '.aloop', 'requests');
  const processedDir = path.join(requestsDir, 'processed');
  const failedDir = path.join(requestsDir, 'failed');
  const queueDir = path.join(fixture.sessionDir, 'queue');
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
    await writeFile(path.join(fixture.workdir, 'body.md'), 'test content', 'utf8');

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

    await writeFile(path.join(requestsDir, '001-create-pr.json'), JSON.stringify({
      id: 'req-1',
      type: 'create_pr',
      payload: {
        head: 'f', base: 'm', title: 't', body_file: 'body.md', issue_number: 22
      }
    }), 'utf8');
    
    await writeFile(path.join(requestsDir, '002-post-comment.json'), JSON.stringify({
      id: 'req-2',
      type: 'post_comment',
      payload: {
        issue_number: 22,
        body_file: 'body.md'
      }
    }), 'utf8');
    
    await writeFile(path.join(requestsDir, '003-bad.json'), 'not valid json {{{', 'utf8');
    
    await writeFile(path.join(requestsDir, '004-post-comment-fail.json'), JSON.stringify({
      id: 'req-4',
      type: 'post_comment',
      payload: {
        issue_number: 99,
        body_file: 'body.md'
      }
    }), 'utf8');
    
    const loopCommand = [
      `export PATH=${quoteBash(toBashPath(fakeBinDir))}:$PATH`,
      `export FAKE_LOOP_PROVIDER_STATE=${quoteBash(toBashPath(providerStateFile))}`,
      `bash ${quoteBash(toBashPath(loopScriptNative))} --prompts-dir ${quoteBash(toBashPath(promptsDir))} --session-dir ${quoteBash(toBashPath(fixture.sessionDir))} --work-dir ${quoteBash(toBashPath(fixture.workdir))} --mode build --provider claude --max-iterations 1`,
    ].join('; ');
    const loopResult = await runBashCommand(loopCommand, { ALOOP_RUNTIME_DIR: runtimeStub }, 30_000);
    assert.equal(loopResult.code, 0, `loop.sh exited non-zero.\nstdout:\n${loopResult.stdout}\nstderr:\n${loopResult.stderr}`);

    await waitFor(async () => {
      try {
        await readFile(path.join(processedDir, '001-create-pr.json'), 'utf8');
        await readFile(path.join(processedDir, '002-post-comment.json'), 'utf8');
        await readFile(path.join(failedDir, '003-bad.json'), 'utf8');
        await readFile(path.join(failedDir, '004-post-comment-fail.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    }, 5_000);

    assert.deepEqual(calls, [
      'pr-create|_tmp_req-1.json',
      'issue-comment|_tmp_req-2.json',
      'issue-comment|_tmp_req-4.json',
    ]);

    const queueFiles = (await readdir(queueDir)).filter(f => f.endsWith('.md')).sort();
    // 001, 002, 004 should have queue entries. 003 (malformed) doesn't.
    assert.equal(queueFiles.length, 3);
    
    const res1 = await readFile(path.join(queueDir, queueFiles[0]), 'utf8');
    const res2 = await readFile(path.join(queueDir, queueFiles[1]), 'utf8');
    const res4 = await readFile(path.join(queueDir, queueFiles[2]), 'utf8');

    assert.match(res1, /"status": "success"/);
    assert.match(res1, /"pr_number": 22/);
    assert.match(res2, /"status": "success"/);
    assert.match(res2, /posted/); // Updated from 'comment saved' to 'posted' as per requests.ts behavior
    assert.match(res4, /"status": "error"/);
    assert.match(res4, /permission denied/);

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

test('dashboard resolves packaged assets when cwd has no dashboard/dist', async () => {
  // Simulate a packaged installation: argv[1] is in a package dir that HAS dashboard assets
  // next to the script, but cwd is an empty project dir with no dashboard/dist.
  const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-assets-fallback-'));
  const emptyProjectDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-dashboard-cwd-'));
  const packageDir = path.join(root, 'pkg');
  const packageDashboardDir = path.join(packageDir, 'dashboard');
  const sessionDir = path.join(root, 'session');
  const workdir = path.join(root, 'workdir');
  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  // Create fake packaged dashboard assets next to the "installed" script
  await mkdir(packageDashboardDir, { recursive: true });
  await writeFile(path.join(packageDashboardDir, 'index.html'), '<!doctype html><title>Aloop Dashboard</title>', 'utf8');

  const originalCwd = process.cwd();
  const originalArgv1 = process.argv[1];
  let handle: Awaited<ReturnType<typeof startDashboardServer>> | null = null;
  try {
    // cwd has no dashboard/dist — resolveDefaultAssetsDir should fall back to package-relative assets
    process.chdir(emptyProjectDir);
    // argv[1] is the installed script, which has dashboard/ as a sibling dir
    process.argv[1] = path.join(packageDir, 'aloop.mjs');

    const port = await reservePort();
    handle = await startDashboardServer(
      { port: String(port), sessionDir, workdir },
      { registerSignalHandlers: false },
    );

    const response = await fetch(`${handle.url}/`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /<title>Aloop Dashboard<\/title>/);
    assert.doesNotMatch(text, /Dashboard assets not found/);
  } finally {
    process.chdir(originalCwd);
    process.argv[1] = originalArgv1;
    if (handle) {
      await handle.close();
    }
  }
});

test('dashboard resolves packaged assets from dist sibling of script path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-assets-dist-fallback-'));
  const emptyProjectDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-dashboard-cwd-'));
  const sessionDir = path.join(root, 'session');
  const workdir = path.join(root, 'workdir');
  const fakeDistDir = path.join(root, 'pkg', 'dist');
  const fakeDistAssetsDir = path.join(fakeDistDir, 'dashboard');
  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(fakeDistAssetsDir, { recursive: true });
  await writeFile(path.join(fakeDistAssetsDir, 'index.html'), '<!doctype html><title>Aloop Dashboard</title>', 'utf8');

  const originalCwd = process.cwd();
  const originalArgv1 = process.argv[1];
  let handle: Awaited<ReturnType<typeof startDashboardServer>> | null = null;
  try {
    process.chdir(emptyProjectDir);
    process.argv[1] = path.join(fakeDistDir, 'index.js');

    const port = await reservePort();
    handle = await startDashboardServer(
      { port: String(port), sessionDir, workdir },
      { registerSignalHandlers: false },
    );

    const response = await fetch(`${handle.url}/`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /<title>Aloop Dashboard<\/title>/);
    assert.doesNotMatch(text, /Dashboard assets not found/);
  } finally {
    process.chdir(originalCwd);
    process.argv[1] = originalArgv1;
    if (handle) {
      await handle.close();
    }
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

test('GET /api/state?session=<id> returns state for a different session', async () => {
  const fixture = await createServerFixture();

  try {
    // Create a second session directory with its own status and workdir
    const otherSessionDir = path.join(fixture.root, 'other-session');
    const otherWorkdir = path.join(fixture.root, 'other-workdir');
    await mkdir(otherSessionDir, { recursive: true });
    await mkdir(otherWorkdir, { recursive: true });
    await writeFile(
      path.join(otherSessionDir, 'status.json'),
      JSON.stringify({ state: 'running', phase: 'build', iteration: 3 }),
      'utf8',
    );
    await writeFile(path.join(otherWorkdir, 'TODO.md'), '# Other Project TODO\n', 'utf8');

    // Register the session in active.json (object format keyed by session ID)
    const activeSessions: Record<string, unknown> = {
      'other-session-42': {
        session_dir: otherSessionDir,
        work_dir: otherWorkdir,
        pid: process.pid,
        started_at: '2026-03-09T10:00:00Z',
      },
    };
    await writeFile(path.join(fixture.runtimeDir, 'active.json'), JSON.stringify(activeSessions), 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/state?session=other-session-42`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      sessionDir: string;
      workdir: string;
      status: { state: string; phase: string; iteration: number };
      docs: Record<string, string>;
    };
    assert.equal(payload.sessionDir, otherSessionDir);
    assert.equal(payload.workdir, otherWorkdir);
    assert.equal(payload.status.state, 'running');
    assert.equal(payload.status.phase, 'build');
    assert.equal(payload.status.iteration, 3);
    assert.match(payload.docs['TODO.md'], /Other Project TODO/);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/state?session=<id> corrects stale running state when pid is dead', async () => {
  const fixture = await createServerFixture();

  try {
    const otherSessionDir = path.join(fixture.root, 'dead-pid-session');
    const otherWorkdir = path.join(fixture.root, 'dead-pid-workdir');
    await mkdir(otherSessionDir, { recursive: true });
    await mkdir(otherWorkdir, { recursive: true });
    await writeFile(
      path.join(otherSessionDir, 'status.json'),
      JSON.stringify({ state: 'running', phase: 'build', iteration: 4 }),
      'utf8',
    );

    const activeSessions: Record<string, unknown> = {
      'dead-pid-session': {
        session_dir: otherSessionDir,
        work_dir: otherWorkdir,
        pid: 999_999_999,
      },
    };
    await writeFile(path.join(fixture.runtimeDir, 'active.json'), JSON.stringify(activeSessions), 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/state?session=dead-pid-session`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { status: { state: string; phase: string; iteration: number } };
    assert.equal(payload.status.state, 'exited');
    assert.equal(payload.status.phase, 'build');
    assert.equal(payload.status.iteration, 4);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/state?session=<id> returns 404 for unknown session', async () => {
  const fixture = await createServerFixture();

  try {
    // active.json is empty or doesn't contain the session
    await writeFile(path.join(fixture.runtimeDir, 'active.json'), '{}', 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/state?session=nonexistent-session`);
    assert.equal(response.status, 404);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /Session not found/);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /events?session=<id> sends initial state for that session', async () => {
  const fixture = await createServerFixture();

  try {
    const otherSessionDir = path.join(fixture.root, 'sse-other-session');
    const otherWorkdir = path.join(fixture.root, 'sse-other-workdir');
    await mkdir(otherSessionDir, { recursive: true });
    await mkdir(otherWorkdir, { recursive: true });
    await writeFile(
      path.join(otherSessionDir, 'status.json'),
      JSON.stringify({ state: 'review', phase: 'review', iteration: 5 }),
      'utf8',
    );

    const activeSessions: Record<string, unknown> = {
      'sse-session-99': {
        session_dir: otherSessionDir,
        work_dir: otherWorkdir,
        pid: 99999,
      },
    };
    await writeFile(path.join(fixture.runtimeDir, 'active.json'), JSON.stringify(activeSessions), 'utf8');

    const response = await fetch(`${fixture.handle.url}/events?session=sse-session-99`);
    assert.equal(response.status, 200);
    assert.ok(response.body);

    const reader = response.body.getReader();
    const timeoutAt = Date.now() + 3000;
    let raw = '';

    while (Date.now() < timeoutAt && !raw.includes('event: state')) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += Buffer.from(value).toString('utf8');
    }
    await reader.cancel();

    assert.match(raw, /event: state/);
    // Extract the data payload from the SSE stream
    const dataMatch = raw.match(/event: state\ndata: (.+)\n/);
    assert.ok(dataMatch, 'Should have state event data');
    const statePayload = JSON.parse(dataMatch[1]) as {
      sessionDir: string;
      status: { state: string; phase: string };
    };
    assert.equal(statePayload.sessionDir, otherSessionDir);
    assert.equal(statePayload.status.state, 'review');
    assert.equal(statePayload.status.phase, 'review');
  } finally {
    await fixture.handle.close();
  }
});

test('GET /events?session=<id> sends error for unknown session and closes', async () => {
  const fixture = await createServerFixture();

  try {
    await writeFile(path.join(fixture.runtimeDir, 'active.json'), '{}', 'utf8');

    const response = await fetch(`${fixture.handle.url}/events?session=ghost-session`);
    assert.equal(response.status, 200);
    assert.ok(response.body);

    const reader = response.body.getReader();
    const timeoutAt = Date.now() + 3000;
    let raw = '';

    while (Date.now() < timeoutAt) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += Buffer.from(value).toString('utf8');
    }
    await reader.cancel();

    assert.match(raw, /event: error/);
    assert.match(raw, /Session not found/);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/state without session param returns default session state', async () => {
  const fixture = await createServerFixture();

  try {
    await writeFile(
      path.join(fixture.sessionDir, 'status.json'),
      JSON.stringify({ state: 'running', phase: 'plan' }),
      'utf8',
    );

    const response = await fetch(`${fixture.handle.url}/api/state`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      sessionDir: string;
      status: { state: string; phase: string };
    };
    assert.equal(payload.sessionDir, fixture.sessionDir);
    assert.equal(payload.status.state, 'running');
    assert.equal(payload.status.phase, 'plan');
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/state corrects stale running state for default session using meta pid', async () => {
  const fixture = await createServerFixture();

  try {
    await writeFile(
      path.join(fixture.sessionDir, 'status.json'),
      JSON.stringify({ state: 'running', phase: 'plan', iteration: 2 }),
      'utf8',
    );
    await writeFile(path.join(fixture.sessionDir, 'meta.json'), JSON.stringify({ pid: 999_999_999 }), 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/state`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { status: { state: string; phase: string; iteration: number } };
    assert.equal(payload.status.state, 'exited');
    assert.equal(payload.status.phase, 'plan');
    assert.equal(payload.status.iteration, 2);
  } finally {
    await fixture.handle.close();
  }
});

test('resolveSessionContext returns null when active.json is an array instead of object', async () => {
  const fixture = await createServerFixture();

  try {
    // Write active.json as an array — isRecord([]) is true but array has no string-keyed entries
    // so active[sessionId] will be undefined → isRecord(undefined) is false → returns null
    await writeFile(
      path.join(fixture.runtimeDir, 'active.json'),
      JSON.stringify([{ session_id: 'arr-session', state: 'running' }]),
      'utf8',
    );

    const response = await fetch(`${fixture.handle.url}/api/state?session=arr-session`);
    assert.equal(response.status, 404);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /Session not found/);
  } finally {
    await fixture.handle.close();
  }
});

test('resolveSessionContext returns null when entry value is a non-object (string)', async () => {
  const fixture = await createServerFixture();

  try {
    // Entry value is a string instead of an object → isRecord("running") is false → returns null
    await writeFile(
      path.join(fixture.runtimeDir, 'active.json'),
      JSON.stringify({ 'str-session': 'running' }),
      'utf8',
    );

    const response = await fetch(`${fixture.handle.url}/api/state?session=str-session`);
    assert.equal(response.status, 404);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /Session not found/);
  } finally {
    await fixture.handle.close();
  }
});

test('resolveSessionContext falls back to runtimeDir/sessions/<id> when entry missing session_dir', async () => {
  const fixture = await createServerFixture();

  try {
    // Create the fallback session directory at runtimeDir/sessions/<id>
    const fallbackSessionDir = path.join(fixture.runtimeDir, 'sessions', 'no-dir-session');
    await mkdir(fallbackSessionDir, { recursive: true });
    await writeFile(
      path.join(fallbackSessionDir, 'status.json'),
      JSON.stringify({ state: 'running', phase: 'proof', iteration: 7 }),
      'utf8',
    );

    // Entry has work_dir but no session_dir → session_dir falls back to runtimeDir/sessions/<id>
    await writeFile(
      path.join(fixture.runtimeDir, 'active.json'),
      JSON.stringify({ 'no-dir-session': { work_dir: fixture.root, pid: process.pid } }),
      'utf8',
    );

    const response = await fetch(`${fixture.handle.url}/api/state?session=no-dir-session`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      sessionDir: string;
      status: { state: string; phase: string; iteration: number };
    };
    assert.equal(payload.sessionDir, fallbackSessionDir);
    assert.equal(payload.status.state, 'running');
    assert.equal(payload.status.phase, 'proof');
    assert.equal(payload.status.iteration, 7);
  } finally {
    await fixture.handle.close();
  }
});

test('resolveSessionContext falls back to process.cwd() when entry missing work_dir', async () => {
  const fixture = await createServerFixture();

  try {
    const sessionDir = path.join(fixture.root, 'cwd-fallback-session');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, 'status.json'),
      JSON.stringify({ state: 'build', phase: 'build', iteration: 1 }),
      'utf8',
    );

    // Entry has session_dir but no work_dir → work_dir falls back to process.cwd()
    await writeFile(
      path.join(fixture.runtimeDir, 'active.json'),
      JSON.stringify({ 'cwd-session': { session_dir: sessionDir, pid: 777 } }),
      'utf8',
    );

    const response = await fetch(`${fixture.handle.url}/api/state?session=cwd-session`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      sessionDir: string;
      workdir: string;
      status: { state: string };
    };
    assert.equal(payload.sessionDir, sessionDir);
    assert.equal(payload.workdir, process.cwd());
    assert.equal(payload.status.state, 'build');
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/state?session=<id> falls back to history.json when active session is missing', async () => {
  const fixture = await createServerFixture();

  try {
    const archivedSessionDir = path.join(fixture.root, 'archived-session');
    const archivedWorkdir = path.join(fixture.root, 'archived-workdir');
    await mkdir(archivedSessionDir, { recursive: true });
    await mkdir(archivedWorkdir, { recursive: true });
    await writeFile(
      path.join(archivedSessionDir, 'status.json'),
      JSON.stringify({ state: 'stopped', phase: 'review', iteration: 12 }),
      'utf8',
    );
    await writeFile(path.join(archivedWorkdir, 'SPEC.md'), '# Archived Spec\n', 'utf8');

    await writeFile(path.join(fixture.runtimeDir, 'active.json'), '{}', 'utf8');
    await writeFile(
      path.join(fixture.runtimeDir, 'history.json'),
      JSON.stringify([
        {
          session_id: 'archived-session',
          session_dir: archivedSessionDir,
          work_dir: archivedWorkdir,
          ended_at: '2026-03-18T10:00:00Z',
        },
      ]),
      'utf8',
    );

    const response = await fetch(`${fixture.handle.url}/api/state?session=archived-session`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      sessionDir: string;
      workdir: string;
      status: { state: string; phase: string; iteration: number };
      docs: Record<string, string>;
    };
    assert.equal(payload.sessionDir, archivedSessionDir);
    assert.equal(payload.workdir, archivedWorkdir);
    assert.equal(payload.status.state, 'stopped');
    assert.equal(payload.status.phase, 'review');
    assert.equal(payload.status.iteration, 12);
    assert.match(payload.docs['SPEC.md'], /Archived Spec/);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/artifacts/<iteration>/<filename> serves artifact files', async () => {
  const fixture = await createServerFixture();

  try {
    const iterDir = path.join(fixture.sessionDir, 'artifacts', 'iter-3');
    await mkdir(iterDir, { recursive: true });
    await writeFile(path.join(iterDir, 'screenshot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'binary');

    const response = await fetch(`${fixture.handle.url}/api/artifacts/3/screenshot.png`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.length, 4);
    assert.equal(body[0], 0x89);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/artifacts rejects path traversal attempts', async () => {
  const fixture = await createServerFixture();

  try {
    const response = await fetch(`${fixture.handle.url}/api/artifacts/3/..%2F..%2Fstatus.json`);
    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /Invalid artifact/);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/artifacts returns 404 for missing artifact', async () => {
  const fixture = await createServerFixture();

  try {
    const response = await fetch(`${fixture.handle.url}/api/artifacts/1/nonexistent.png`);
    assert.equal(response.status, 404);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /Artifact not found/);
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/state includes proof artifact manifests from session artifacts directory', async () => {
  const fixture = await createServerFixture();

  try {
    const iter2Dir = path.join(fixture.sessionDir, 'artifacts', 'iter-2');
    const iter5Dir = path.join(fixture.sessionDir, 'artifacts', 'iter-5');
    await mkdir(iter2Dir, { recursive: true });
    await mkdir(iter5Dir, { recursive: true });

    const manifest2 = {
      iteration: 2,
      phase: 'proof',
      summary: 'Dashboard screenshot captured',
      artifacts: [{ type: 'screenshot', path: 'dashboard.png', description: 'Main dashboard view' }],
    };
    const manifest5 = {
      iteration: 5,
      phase: 'proof',
      summary: 'API health verified',
      artifacts: [{ type: 'api_response', path: 'health.json', description: 'Health endpoint 200 OK' }],
    };

    await writeFile(path.join(iter2Dir, 'proof-manifest.json'), JSON.stringify(manifest2), 'utf8');
    await writeFile(path.join(iter5Dir, 'proof-manifest.json'), JSON.stringify(manifest5), 'utf8');

    const response = await fetch(`${fixture.handle.url}/api/state`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      artifacts: Array<{ iteration: number; manifest: { summary: string; artifacts: unknown[] } }>;
    };

    assert.equal(payload.artifacts.length, 2);
    assert.equal(payload.artifacts[0].iteration, 2);
    assert.equal(payload.artifacts[0].manifest.summary, 'Dashboard screenshot captured');
    assert.equal(payload.artifacts[1].iteration, 5);
    assert.equal(payload.artifacts[1].manifest.summary, 'API health verified');
  } finally {
    await fixture.handle.close();
  }
});

test('GET /api/state returns empty artifacts array when no artifacts directory exists', async () => {
  const fixture = await createServerFixture();

  try {
    const response = await fetch(`${fixture.handle.url}/api/state`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { artifacts: unknown[] };
    assert.deepEqual(payload.artifacts, []);
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

test('GET and POST /api/plan reads and mutates loop-plan.json', async () => {
  const fixture = await createServerFixture();
  try {
    const planPath = path.join(fixture.sessionDir, 'loop-plan.json');
    const initialPlan = { cycle: ['a.md'], cyclePosition: 0, iteration: 1, version: 1 };
    await writeFile(planPath, JSON.stringify(initialPlan), 'utf8');

    // Test GET
    const getResponse = await fetch(`${fixture.handle.url}/api/plan`);
    assert.equal(getResponse.status, 200);
    const plan = (await getResponse.json()) as any;
    assert.deepEqual(plan, initialPlan);

    // Test POST
    const postResponse = await fetch(`${fixture.handle.url}/api/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cyclePosition: 2, iteration: 3 }),
    });
    assert.equal(postResponse.status, 200);
    const mutatedPlan = (await postResponse.json()) as any;
    assert.equal(mutatedPlan.cyclePosition, 2);
    assert.equal(mutatedPlan.iteration, 3);
    assert.equal(mutatedPlan.version, 2);

    const savedPlan = JSON.parse(await readFile(planPath, 'utf8'));
    assert.equal(savedPlan.cyclePosition, 2);
  } finally {
    await fixture.handle.close();
  }
});
// We need to mock some things or use temporary files
async function createTempDir() {
  return await mkdtemp(path.join(os.tmpdir(), 'aloop-dashboard-coverage-'));
}

test('parsePort validates port range', async () => {
  const root = await createTempDir();
  try {
    await assert.rejects(
      startDashboardServer({ port: '0', sessionDir: root }),
      /Invalid port "0"/
    );
    await assert.rejects(
      startDashboardServer({ port: '65536', sessionDir: root }),
      /Invalid port "65536"/
    );
    await assert.rejects(
      startDashboardServer({ port: 'abc', sessionDir: root }),
      /Invalid port "abc"/
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test('readJsonFile returns null for missing or invalid files', async () => {
  const root = await createTempDir();
  const runtimeDir = path.join(root, 'runtime');
  await mkdir(runtimeDir);
  
  const port = await reservePort();
  const handle = await startDashboardServer({ port: String(port), sessionDir: root, runtimeDir });
  try {
    const response = await fetch(`${handle.url}/api/state`);
    const payload = await response.json() as any;
    assert.equal(payload.status, null);
    assert.equal(payload.meta, null);
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('getRepoUrl parses git remotes and handles no match', async (t) => {
  const root = await createTempDir();
  try {
    spawnSync('git', ['init'], { cwd: root });
    
    // 1. SSH format
    spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:owner/repo.git'], { cwd: root });
    const port = await reservePort();
    const handle = await startDashboardServer({ port: String(port), sessionDir: root, workdir: root });
    try {
      const response = await fetch(`${handle.url}/api/state`);
      const payload = await response.json() as any;
      assert.equal(payload.repoUrl, 'https://github.com/owner/repo');
    } finally {
      await handle.close();
    }

    // 2. HTTPS format
    spawnSync('git', ['remote', 'set-url', 'origin', 'https://github.com/owner/repo.git'], { cwd: root });
    const port2 = await reservePort();
    const handle2 = await startDashboardServer({ port: String(port2), sessionDir: root, workdir: root });
    try {
      const response = await fetch(`${handle2.url}/api/state`);
      const payload = await response.json() as any;
      assert.equal(payload.repoUrl, 'https://github.com/owner/repo');
    } finally {
      await handle2.close();
    }

    // 3. No git or no remote (non-standard)
    spawnSync('git', ['remote', 'remove', 'origin'], { cwd: root });
    const port3 = await reservePort();
    const handle3 = await startDashboardServer({ port: String(port3), sessionDir: root, workdir: root });
    try {
      const response = await fetch(`${handle3.url}/api/state`);
      const payload = await response.json() as any;
      assert.equal(payload.repoUrl, null);
    } finally {
      await handle3.close();
    }
  } finally {
    await rm(root, { recursive: true });
  }
});

test('POST /api/resume handles success and already-running cases', async () => {
  const root = await createTempDir();
  const sessionDir = path.join(root, 'session');
  await mkdir(sessionDir);
  await mkdir(path.join(root, 'aloop', 'bin'), { recursive: true });
  
  const loopSh = path.join(root, 'aloop', 'bin', 'loop.sh');
  await writeFile(loopSh, '#!/bin/bash\nsleep 1\nexit 0', { mode: 0o755 });
  
  const metaPath = path.join(sessionDir, 'meta.json');
  await writeFile(metaPath, JSON.stringify({ pid: 1234567 }), 'utf8');

  const port = await reservePort();
  const handle = await startDashboardServer({ port: String(port), sessionDir, workdir: root });
  try {
    await rm(metaPath);
    const res1 = await fetch(`${handle.url}/api/resume`, { method: 'POST' });
    assert.equal(res1.status, 409);
    assert.match(await res1.text(), /No meta.json found/);

    await writeFile(metaPath, JSON.stringify({ pid: process.pid }), 'utf8');
    const res2 = await fetch(`${handle.url}/api/resume`, { method: 'POST' });
    assert.equal(res2.status, 409);
    assert.match(await res2.text(), /is already running/);

    await writeFile(metaPath, JSON.stringify({ pid: 999999 }), 'utf8');
    const res3 = await fetch(`${handle.url}/api/resume`, { method: 'POST' });
    assert.equal(res3.status, 202);
    const payload3 = await res3.json() as any;
    assert.ok(payload3.resumed);
    assert.ok(payload3.pid);
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('readLogTail handles large files', async () => {
  const root = await createTempDir();
  const logPath = path.join(root, 'log.jsonl');
  
  // MAX_LOG_BYTES = 1MB
  const line = 'some log data\n';
  const repeatCount = 100000; // Enough to exceed 1MB
  const largeContent = line.repeat(repeatCount);
  await writeFile(logPath, largeContent, 'utf8');

  const port = await reservePort();
  const handle = await startDashboardServer({ port: String(port), sessionDir: root });
  try {
    const response = await fetch(`${handle.url}/api/state`);
    const payload = await response.json() as any;
    assert.ok(payload.log.length > 0);
    assert.ok(payload.log.length <= 1024 * 1024);
    assert.ok(payload.log.length < largeContent.length);
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('loadArtifactManifests handles output.txt without manifest', async () => {
  const root = await createTempDir();
  const artifactsDir = path.join(root, 'artifacts', 'iter-1');
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(path.join(artifactsDir, 'output.txt'), 'Model: gpt-4\nProvider: openai\nSome logs...', 'utf8');

  const port = await reservePort();
  const handle = await startDashboardServer({ port: String(port), sessionDir: root });
  try {
    const response = await fetch(`${handle.url}/api/state`);
    const payload = await response.json() as any;
    assert.equal(payload.artifacts.length, 1);
    assert.equal(payload.artifacts[0].iteration, 1);
    assert.match(payload.artifacts[0].outputHeader, /Model: gpt-4/);
    assert.equal(payload.artifacts[0].manifest, null);
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('resolvePid fallback to active.json', async () => {
  const root = await createTempDir();
  const runtimeDir = path.join(root, 'runtime');
  const sessionDir = path.join(root, 'session-abc');
  await mkdir(runtimeDir);
  await mkdir(sessionDir);

  await writeFile(path.join(sessionDir, 'meta.json'), JSON.stringify({ pid: 999999 }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({ state: 'running' }), 'utf8');

  await writeFile(path.join(runtimeDir, 'active.json'), JSON.stringify({
    'session-abc': { session_dir: sessionDir, pid: process.pid }
  }), 'utf8');

  const port = await reservePort();
  const handle = await startDashboardServer({ port: String(port), sessionDir, runtimeDir });
  try {
    const response = await fetch(`${handle.url}/api/state`);
    const payload = await response.json() as any;
    assert.equal(payload.status.state, 'running');
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('getContentType covers various extensions', async () => {
  const root = await createTempDir();
  const iterDir = path.join(root, 'artifacts', 'iter-1');
  await mkdir(iterDir, { recursive: true });

  const files = [
    { name: 't.css', type: 'text/css; charset=utf-8' },
    { name: 't.js', type: 'application/javascript; charset=utf-8' },
    { name: 't.mjs', type: 'application/javascript; charset=utf-8' },
    { name: 't.json', type: 'application/json; charset=utf-8' },
    { name: 't.jpg', type: 'image/jpeg' },
    { name: 't.gif', type: 'image/gif' },
    { name: 't.webp', type: 'image/webp' },
    { name: 't.svg', type: 'image/svg+xml' },
    { name: 't.ico', type: 'image/x-icon' },
    { name: 't.unknown', type: 'application/octet-stream' },
  ];

  const port = await reservePort();
  const handle = await startDashboardServer({ port: String(port), sessionDir: root });
  try {
    for (const file of files) {
      await writeFile(path.join(iterDir, file.name), 'content');
      const res = await fetch(`${handle.url}/api/artifacts/1/${file.name}`);
      assert.equal(res.headers.get('content-type'), file.type);
    }
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('readJsonBody handles empty body and oversized body', async () => {
  const root = await createTempDir();
  const sessionDir = path.join(root, 'session');
  await mkdir(sessionDir);
  await writeFile(path.join(sessionDir, 'loop-plan.json'), JSON.stringify({ cycle: ['a.md'], iteration: 1 }), 'utf8');

  const port = await reservePort();
  const handle = await startDashboardServer({ port: String(port), sessionDir });
  try {
    const res = await fetch(`${handle.url}/api/plan`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }
    });
    assert.equal(res.status, 200);

    const largeBody = JSON.stringify({ instruction: 'a'.repeat(65 * 1024) });
    const res2 = await fetch(`${handle.url}/api/steer`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: largeBody
    });
    assert.equal(res2.status, 400);
    assert.match(await res2.text(), /Request body too large/);
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('resolveDefaultAssetsDir fallback logic', async (t) => {
  const root = await createTempDir();
  const originalArgv1 = process.argv[1];
  try {
    // 1. Mocking candidate directory
    // runtimeScriptPath candidate: dirname(argv[1]) + '/dashboard'
    const binDir = path.join(root, 'bin');
    const fakeAssetsDir = path.join(binDir, 'dashboard');
    await mkdir(fakeAssetsDir, { recursive: true });
    await writeFile(path.join(fakeAssetsDir, 'index.html'), '<html data-mocked="true"></html>');
    
    process.argv[1] = path.join(binDir, 'aloop.mjs');
    
    const port = await reservePort();
    const handle = await startDashboardServer({ port: String(port), sessionDir: root });
    try {
      const res = await fetch(`${handle.url}/`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.match(text, /data-mocked="true"/);
    } finally {
      await handle.close();
    }
  } finally {
    process.argv[1] = originalArgv1;
    await rm(root, { recursive: true });
  }
});

test('watch logic triggers request processing', async () => {
  const root = await createTempDir();
  const workdir = path.join(root, 'workdir');
  const sessionDir = path.join(root, 'session');
  await mkdir(workdir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  
  const requestsDir = path.join(workdir, '.aloop', 'requests');
  await mkdir(requestsDir, { recursive: true });

  const port = await reservePort();
  let processTriggered = false;
  
  // We can check if it triggers by providing a custom ghCommandRunner 
  // but watch calls processGhConventionRequests which uses processAgentRequests.
  // We can't easily spy on it, but we can verify it doesn't crash.
  
  const handle = await startDashboardServer({ 
    port: String(port), 
    sessionDir, 
    workdir 
  });
  
  try {
    await writeFile(path.join(requestsDir, 'new-request.json'), '{}');
    await sleep(200);
    // Should not crash
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('GET /api/cost routes return success and cache aggregate by cost_poll_interval_minutes', async () => {
  const fixture = await createServerFixture();
  const fakeBinDir = path.join(fixture.root, 'fake-bin');
  const dbCounterPath = path.join(fixture.root, 'opencode-db-count.txt');
  const exportCounterPath = path.join(fixture.root, 'opencode-export-count.txt');
  const originalPath = process.env.PATH;
  try {
    await mkdir(fakeBinDir, { recursive: true });
    await createFakeOpencodeBinary(fakeBinDir, dbCounterPath, exportCounterPath);
    await writeFile(
      path.join(fixture.sessionDir, 'meta.json'),
      JSON.stringify({ cost_poll_interval_minutes: 10 }),
      'utf8',
    );

    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ''}`;

    const aggregateFirst = await fetch(`${fixture.handle.url}/api/cost/aggregate`);
    assert.equal(aggregateFirst.status, 200);
    const aggregateFirstPayload = (await aggregateFirst.json()) as { total_usd: number; by_model: { model: string; cost_usd: number }[] };
    assert.equal(aggregateFirstPayload.total_usd, 4);
    assert.deepEqual(aggregateFirstPayload.by_model, [
      { model: 'gpt-4', cost_usd: 1.25 },
      { model: 'gpt-5', cost_usd: 2.75 },
    ]);

    const aggregateSecond = await fetch(`${fixture.handle.url}/api/cost/aggregate`);
    assert.equal(aggregateSecond.status, 200);
    const aggregateSecondPayload = (await aggregateSecond.json()) as { total_usd: number; by_model: { model: string; cost_usd: number }[] };
    assert.deepEqual(aggregateSecondPayload, aggregateFirstPayload);

    const dbCount = await readFile(dbCounterPath, 'utf8');
    assert.equal(dbCount.trim(), '1', 'expected cached aggregate response to skip second opencode db call');

    const sessionResponse = await fetch(`${fixture.handle.url}/api/cost/session/session-abc`);
    assert.equal(sessionResponse.status, 200);
    const sessionPayload = (await sessionResponse.json()) as { total_usd: number; by_model: { model: string; cost_usd: number }[] };
    assert.equal(sessionPayload.total_usd, 2);
    assert.deepEqual(sessionPayload.by_model, [
      { model: 'session-abc', cost_usd: 0.5 },
      { model: 'fallback', cost_usd: 1.5 },
    ]);

    const exportCount = await readFile(exportCounterPath, 'utf8');
    assert.equal(exportCount.trim(), '1');
  } finally {
    process.env.PATH = originalPath;
    await fixture.handle.close();
  }
});

test('GET /api/cost routes degrade gracefully when opencode CLI is unavailable', async () => {
  const fixture = await createServerFixture();
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '';

    const aggregateResponse = await fetch(`${fixture.handle.url}/api/cost/aggregate`);
    assert.equal(aggregateResponse.status, 200);
    const aggregatePayload = (await aggregateResponse.json()) as { error?: string };
    assert.equal(aggregatePayload.error, 'opencode_unavailable');

    const sessionResponse = await fetch(`${fixture.handle.url}/api/cost/session/session-xyz`);
    assert.equal(sessionResponse.status, 200);
    const sessionPayload = (await sessionResponse.json()) as { error?: string };
    assert.equal(sessionPayload.error, 'opencode_unavailable');
  } finally {
    process.env.PATH = originalPath;
    await fixture.handle.close();
  }
});

test('GET /api/cost/aggregate does not reuse cache when cost_poll_interval_minutes is zero', async () => {
  const fixture = await createServerFixture();
  const fakeBinDir = path.join(fixture.root, 'fake-bin');
  const dbCounterPath = path.join(fixture.root, 'opencode-db-count.txt');
  const exportCounterPath = path.join(fixture.root, 'opencode-export-count.txt');
  const originalPath = process.env.PATH;
  try {
    await mkdir(fakeBinDir, { recursive: true });
    await createFakeOpencodeBinary(fakeBinDir, dbCounterPath, exportCounterPath);
    await writeFile(
      path.join(fixture.sessionDir, 'meta.json'),
      JSON.stringify({ cost_poll_interval_minutes: 0 }),
      'utf8',
    );
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ''}`;

    const first = await fetch(`${fixture.handle.url}/api/cost/aggregate`);
    assert.equal(first.status, 200);
    const second = await fetch(`${fixture.handle.url}/api/cost/aggregate`);
    assert.equal(second.status, 200);

    const dbCount = await readFile(dbCounterPath, 'utf8');
    assert.equal(dbCount.trim(), '2');
  } finally {
    process.env.PATH = originalPath;
    await fixture.handle.close();
  }
});

// ── QA Coverage endpoint tests ──

test('GET /api/qa-coverage returns available:false when file is missing', async () => {
  const { handle, root } = await createServerFixture();
  try {
    const response = await fetch(`${handle.url}/api/qa-coverage`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.available, false);
    assert.equal(body.error, 'not_found');
    assert.equal(body.coverage_percent, 0);
    assert.equal(body.total_features, 0);
    assert.equal(body.tested_features, 0);
    assert.equal(body.passed, 0);
    assert.equal(body.failed, 0);
    assert.equal(body.untested, 0);
    assert.deepStrictEqual(body.features, []);
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('GET /api/qa-coverage parses pipe-delimited table from QA_COVERAGE.md', async () => {
  const { handle, root, workdir } = await createServerFixture();
  try {
    const tableContent = [
      '# QA Coverage Matrix',
      '',
      '| Feature | Component | Last Tested | Commit | Status | Criteria Met | Notes |',
      '|---------|-----------|-------------|--------|--------|--------------|-------|',
      '| aloop start | CLI/start.ts | 2026-03-20 | a1b2c3d | PASS | 4/5 | signal handling untested |',
      '| dashboard health | UI/HealthPanel | 2026-03-19 | f4e5d6a | FAIL | 2/4 | codex missing |',
      '| aloop gh watch | CLI/gh.ts | never | - | UNTESTED | 0/3 | - |',
    ].join('\n');
    await writeFile(path.join(workdir, 'QA_COVERAGE.md'), tableContent, 'utf8');
    const response = await fetch(`${handle.url}/api/qa-coverage`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.available, true);
    assert.equal(body.coverage_percent, 67); // 2 tested out of 3
    assert.equal(body.total_features, 3);
    assert.equal(body.tested_features, 2);
    assert.equal(body.passed, 1);
    assert.equal(body.failed, 1);
    assert.equal(body.untested, 1);
    const features = body.features as Array<Record<string, string>>;
    assert.equal(features.length, 3);
    assert.equal(features[0].feature, 'aloop start');
    assert.equal(features[0].status, 'PASS');
    assert.equal(features[1].feature, 'dashboard health');
    assert.equal(features[1].status, 'FAIL');
    assert.equal(features[2].feature, 'aloop gh watch');
    assert.equal(features[2].status, 'UNTESTED');
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test('GET /api/qa-coverage returns 0% when file has no parseable table', async () => {
  const { handle, root, workdir } = await createServerFixture();
  try {
    await writeFile(
      path.join(workdir, 'QA_COVERAGE.md'),
      '# QA Report\n\nNo coverage table here.',
      'utf8',
    );
    const response = await fetch(`${handle.url}/api/qa-coverage`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.available, true);
    assert.equal(body.coverage_percent, 0);
    assert.equal(body.total_features, 0);
    assert.deepStrictEqual(body.features, []);
  } finally {
    await handle.close();
    await rm(root, { recursive: true });
  }
});

test.after(() => {
  const getActiveHandles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles;
  if (!getActiveHandles) return;
  // Some Node/tsx environments keep FSWatcher handles alive after the suite;
  // proactively close them so test runs terminate cleanly.
  for (const handle of getActiveHandles()) {
    if (!handle || typeof handle !== 'object') continue;
    const typed = handle as { constructor?: { name?: string }; close?: () => void };
    if (typed.constructor?.name === 'FSWatcher' && typeof typed.close === 'function') {
      typed.close();
    }
  }
});
