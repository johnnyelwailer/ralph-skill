import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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

async function createServerFixture() {
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
    { registerSignalHandlers: false },
  );

  return { root, sessionDir, workdir, assetsDir, runtimeDir, handle };
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
