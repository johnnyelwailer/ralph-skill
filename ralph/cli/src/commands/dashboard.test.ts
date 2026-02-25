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

  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await writeFile(path.join(assetsDir, 'index.html'), '<!doctype html><p>ok</p>', 'utf8');

  const port = await reservePort();
  const handle = await startDashboardServer(
    { port: String(port), sessionDir, workdir, assetsDir },
    { registerSignalHandlers: false },
  );

  return { root, sessionDir, workdir, assetsDir, handle };
}

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

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('child process did not exit after stop request')), 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const status = JSON.parse(await readFile(path.join(fixture.sessionDir, 'status.json'), 'utf8')) as { state?: string };
    assert.equal(status.state, 'stopping');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    await fixture.handle.close();
  }
});
