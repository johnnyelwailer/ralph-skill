import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface DashboardOptions {
  port: string;
  sessionDir?: string;
  workdir?: string;
  assetsDir?: string;
  runtimeDir?: string;
}

interface DashboardState {
  sessionDir: string;
  workdir: string;
  runtimeDir: string;
  updatedAt: string;
  status: unknown | null;
  log: string;
  docs: Record<string, string>;
  activeSessions: unknown[];
  recentSessions: unknown[];
}

interface DashboardServerHandle {
  close: () => Promise<void>;
  port: number;
  url: string;
}

interface DashboardRuntimeOptions {
  registerSignalHandlers?: boolean;
  heartbeatIntervalMs?: number;
}

const DOC_FILES = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
const MAX_LOG_BYTES = 128 * 1024;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${value}". Expected a number between 1 and 65535.`);
  }
  return port;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readJsonArrayFile(filePath: string): Promise<unknown[]> {
  const value = await readJsonFile(filePath);
  return Array.isArray(value) ? value : [];
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readLogTail(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    const start = Math.max(0, buffer.length - MAX_LOG_BYTES);
    return buffer.subarray(start).toString('utf8');
  } catch {
    return '';
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function resolveDefaultAssetsDir(): Promise<string> {
  const runtimeScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : path.join(process.cwd(), 'dist', 'index.js');
  const runtimeDistDir = path.dirname(runtimeScriptPath);
  const installAssetsDir = path.join(runtimeDistDir, 'dashboard');
  const devAssetsDir = path.join(process.cwd(), 'dashboard', 'dist');

  if (await fileExists(path.join(installAssetsDir, 'index.html'))) {
    return installAssetsDir;
  }

  return devAssetsDir;
}

function toStateEventPayload(state: DashboardState): string {
  return JSON.stringify(state);
}

function sendSseEvent(response: ServerResponse, event: string, payload: string) {
  response.write(`event: ${event}\n`);
  for (const line of payload.split('\n')) {
    response.write(`data: ${line}\n`);
  }
  response.write('\n');
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function extractPid(meta: unknown): number | null {
  if (!isRecord(meta)) {
    return null;
  }
  const pid = meta.pid;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return pid;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;

  await new Promise<void>((resolve, reject) => {
    request.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (tooLarge) {
        return;
      }
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(new Error(`Request body too large (max ${MAX_BODY_BYTES} bytes).`));
        return;
      }
      resolve();
    });
    request.on('error', (error) => reject(error));
  });

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) {
    return {};
  }

  return JSON.parse(raw);
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

export async function startDashboardServer(
  options: DashboardOptions,
  runtimeOptions: DashboardRuntimeOptions = {},
): Promise<DashboardServerHandle> {
  const registerSignalHandlers = runtimeOptions.registerSignalHandlers ?? true;
  const heartbeatIntervalMs = Math.max(250, runtimeOptions.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
  const port = parsePort(options.port);
  const sessionDir = path.resolve(options.sessionDir ?? process.cwd());
  const workdir = path.resolve(options.workdir ?? process.cwd());
  const assetsDir = path.resolve(options.assetsDir ?? (await resolveDefaultAssetsDir()));
  const runtimeDir = path.resolve(options.runtimeDir ?? path.join(os.homedir(), '.aloop'));

  const statusPath = path.join(sessionDir, 'status.json');
  const logPath = path.join(sessionDir, 'log.jsonl');
  const metaPath = path.join(sessionDir, 'meta.json');
  const activeSessionsPath = path.join(runtimeDir, 'active.json');
  const recentSessionsPath = path.join(runtimeDir, 'history.json');
  const steeringPath = path.join(workdir, 'STEERING.md');
  const docPaths = DOC_FILES.map((name) => path.join(workdir, name));
  const watchedFiles = new Set(
    [statusPath, logPath, activeSessionsPath, recentSessionsPath, ...docPaths].map((value) =>
      path.normalize(value).toLowerCase(),
    ),
  );

  const clients = new Set<ServerResponse>();
  const watchers = new Map<string, FSWatcher>();

  const loadState = async (): Promise<DashboardState> => {
    const [status, log, activeSessions, recentSessions, docsEntries] = await Promise.all([
      readJsonFile(statusPath),
      readLogTail(logPath),
      readJsonArrayFile(activeSessionsPath),
      readJsonArrayFile(recentSessionsPath),
      Promise.all(
        DOC_FILES.map(async (docFile) => {
          const content = await readTextFile(path.join(workdir, docFile));
          return [docFile, content] as const;
        }),
      ),
    ]);

    return {
      sessionDir,
      workdir,
      runtimeDir,
      updatedAt: new Date().toISOString(),
      status,
      log,
      docs: Object.fromEntries(docsEntries),
      activeSessions,
      recentSessions,
    };
  };

  let publishPending = false;
  let publishTimer: NodeJS.Timeout | null = null;

  const sendToClients = (event: string, payload: string) => {
    for (const client of clients) {
      try {
        sendSseEvent(client, event, payload);
      } catch {
        clients.delete(client);
        client.destroy();
      }
    }
  };

  const publishState = async () => {
    publishPending = false;
    publishTimer = null;
    try {
      const statePayload = toStateEventPayload(await loadState());
      sendToClients('state', statePayload);
    } catch (error) {
      console.warn(`dashboard: failed to publish state: ${(error as Error).message}`);
    }
  };

  const schedulePublish = () => {
    if (publishPending) {
      return;
    }
    publishPending = true;
    publishTimer = setTimeout(() => {
      void publishState();
    }, 75);
  };

  const heartbeatTimer = setInterval(() => {
    const heartbeatPayload = JSON.stringify({ timestamp: new Date().toISOString() });
    sendToClients('heartbeat', heartbeatPayload);
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();

  const watchPaths = [sessionDir, workdir, runtimeDir];
  for (const target of watchPaths) {
    try {
      const watcher = watch(target, (_eventType, filename) => {
        if (!filename) {
          return;
        }
        const changed = path.normalize(path.join(target, filename.toString())).toLowerCase();
        if (watchedFiles.has(changed) || changed.endsWith('.md')) {
          schedulePublish();
        }
      });
      watchers.set(target, watcher);
    } catch (error) {
      console.warn(`dashboard: unable to watch ${target}: ${(error as Error).message}`);
    }
  }

  const server = createServer((request, response) => {
    const handleRequest = async () => {
      const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (requestUrl.pathname === '/api/state' && request.method === 'GET') {
        const state = await loadState();
        writeJson(response, 200, state);
        return;
      }

      if (requestUrl.pathname === '/events' && request.method === 'GET') {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        response.write(': connected\n\n');
        clients.add(response);
        try {
          sendSseEvent(response, 'state', toStateEventPayload(await loadState()));
        } catch (error) {
          sendSseEvent(
            response,
            'error',
            JSON.stringify({ message: `Failed to load initial state: ${(error as Error).message}` }),
          );
        }
        request.on('close', () => {
          clients.delete(response);
        });
        return;
      }

      if (requestUrl.pathname === '/api/steer') {
        if (request.method !== 'POST') {
          writeJson(response, 405, { error: 'Method not allowed. Use POST /api/steer.' });
          return;
        }

        let parsedBody: unknown;
        try {
          parsedBody = await readJsonBody(request);
        } catch (error) {
          writeJson(response, 400, { error: `Invalid request body: ${(error as Error).message}` });
          return;
        }

        if (!isRecord(parsedBody)) {
          writeJson(response, 400, { error: 'Request body must be a JSON object.' });
          return;
        }

        const instruction = parsedBody.instruction;
        if (typeof instruction !== 'string' || instruction.trim().length === 0) {
          writeJson(response, 400, { error: 'Field "instruction" is required and must be a non-empty string.' });
          return;
        }

        const overwrite = parsedBody.overwrite;
        if (overwrite !== undefined && typeof overwrite !== 'boolean') {
          writeJson(response, 400, { error: 'Field "overwrite" must be a boolean when provided.' });
          return;
        }

        const affectsCompletedWork = parsedBody.affects_completed_work;
        if (
          affectsCompletedWork !== undefined &&
          affectsCompletedWork !== 'yes' &&
          affectsCompletedWork !== 'no' &&
          affectsCompletedWork !== 'unknown'
        ) {
          writeJson(response, 400, {
            error: 'Field "affects_completed_work" must be one of: yes, no, unknown.',
          });
          return;
        }

        if ((await fileExists(steeringPath)) && overwrite !== true) {
          writeJson(response, 409, {
            error: 'A steering instruction is already queued. Resubmit with overwrite=true to replace it.',
          });
          return;
        }

        const commit = typeof parsedBody.commit === 'string' && parsedBody.commit.trim().length > 0 ? parsedBody.commit.trim() : 'unknown';
        const steeringDoc = buildSteeringDocument(
          instruction.trim(),
          (affectsCompletedWork as 'yes' | 'no' | 'unknown' | undefined) ?? 'unknown',
          commit,
        );

        await fs.writeFile(steeringPath, steeringDoc, 'utf8');
        writeJson(response, 201, {
          queued: true,
          path: steeringPath,
        });
        return;
      }

      if (requestUrl.pathname === '/api/stop') {
        if (request.method !== 'POST') {
          writeJson(response, 405, { error: 'Method not allowed. Use POST /api/stop.' });
          return;
        }

        let parsedBody: unknown;
        try {
          parsedBody = await readJsonBody(request);
        } catch (error) {
          writeJson(response, 400, { error: `Invalid request body: ${(error as Error).message}` });
          return;
        }

        if (!isRecord(parsedBody)) {
          writeJson(response, 400, { error: 'Request body must be a JSON object.' });
          return;
        }

        const force = parsedBody.force;
        if (force !== undefined && typeof force !== 'boolean') {
          writeJson(response, 400, { error: 'Field "force" must be a boolean when provided.' });
          return;
        }

        const signal = force === true ? 'SIGKILL' : 'SIGTERM';
        const meta = await readJsonFile(metaPath);
        const pid = extractPid(meta);

        if (pid === null) {
          writeJson(response, 409, {
            error: `Cannot stop session without a valid pid in ${metaPath}.`,
          });
          return;
        }

        if (pid === process.pid) {
          writeJson(response, 409, { error: 'Refusing to stop dashboard process PID.' });
          return;
        }

        try {
          process.kill(pid, signal);
        } catch (error) {
          const typedError = error as NodeJS.ErrnoException;
          if (typedError.code === 'ESRCH') {
            writeJson(response, 409, { error: `Process ${pid} is not running.` });
            return;
          }
          if (typedError.code === 'EPERM') {
            writeJson(response, 403, { error: `Permission denied when signaling process ${pid}.` });
            return;
          }
          throw error;
        }

        const existingStatus = await readJsonFile(statusPath);
        const nextStatus = isRecord(existingStatus) ? { ...existingStatus } : {};
        nextStatus.state = 'stopping';
        nextStatus.updated_at = new Date().toISOString();
        await fs.writeFile(statusPath, JSON.stringify(nextStatus), 'utf8');

        writeJson(response, 202, {
          stopping: true,
          pid,
          signal,
        });
        return;
      }

      if (requestUrl.pathname.startsWith('/api/')) {
        writeJson(response, 404, { error: 'Not found' });
        return;
      }

      const requestPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const normalizedRequestPath = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const assetPath = path.resolve(assetsDir, `.${normalizedRequestPath}`);

      if (assetPath.startsWith(assetsDir) && (await fileExists(assetPath))) {
        const content = await fs.readFile(assetPath);
        response.writeHead(200, { 'Content-Type': getContentType(assetPath), 'Cache-Control': 'no-cache' });
        response.end(content);
        return;
      }

      const indexPath = path.join(assetsDir, 'index.html');
      if (await fileExists(indexPath)) {
        const indexContent = await fs.readFile(indexPath);
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        response.end(indexContent);
        return;
      }

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        `<!doctype html><html><body><h1>Aloop Dashboard</h1><p>Dashboard assets not found at <code>${assetsDir}</code>.</p></body></html>`,
      );
    };

    void handleRequest().catch((error) => {
      if (response.headersSent) {
        try {
          sendSseEvent(response, 'error', JSON.stringify({ message: `Internal server error: ${(error as Error).message}` }));
        } catch {
          // Ignore secondary stream write failures while unwinding request errors.
        } finally {
          response.end();
        }
        return;
      }
      writeJson(response, 500, {
        error: `Internal server error: ${(error as Error).message}`,
      });
    });
  });

  let closed = false;
  let shutdownPromise: Promise<void> | null = null;

  const onSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal);
  };

  const shutdown = async (_reason?: string) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      if (closed) {
        return;
      }
      closed = true;

      if (registerSignalHandlers) {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      }

      if (publishTimer) {
        clearTimeout(publishTimer);
        publishTimer = null;
      }
      clearInterval(heartbeatTimer);

      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();

      for (const client of clients) {
        client.end();
      }
      clients.clear();

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    })();

    return shutdownPromise;
  };

  if (registerSignalHandlers) {
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('error', onError);
      reject(error);
    };

    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    close: shutdown,
    port: boundPort,
    url: `http://127.0.0.1:${boundPort}`,
  };
}

export async function dashboardCommand(options: DashboardOptions) {
  const sessionDir = path.resolve(options.sessionDir ?? process.cwd());
  const workdir = path.resolve(options.workdir ?? process.cwd());
  const assetsDir = path.resolve(options.assetsDir ?? (await resolveDefaultAssetsDir()));
  const handle = await startDashboardServer({ ...options, assetsDir, sessionDir, workdir });

  console.log(`Launching real-time progress dashboard on port ${handle.port}...`);
  console.log(`Session dir: ${sessionDir}`);
  console.log(`Workdir: ${workdir}`);
  console.log(`Assets dir: ${assetsDir}`);
}
