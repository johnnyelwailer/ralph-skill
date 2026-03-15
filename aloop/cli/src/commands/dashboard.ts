import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { processAgentRequests } from '../lib/requests.js';

interface DashboardOptions {
  port: string;
  sessionDir?: string;
  workdir?: string;
  assetsDir?: string;
  runtimeDir?: string;
}

interface ArtifactManifest {
  iteration: number;
  manifest: unknown;
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
  artifacts: ArtifactManifest[];
}

interface SessionContext {
  sessionDir: string;
  workdir: string;
  pid?: number | null;
}

interface DashboardServerHandle {
  close: () => Promise<void>;
  port: number;
  url: string;
}

interface DashboardRuntimeOptions {
  registerSignalHandlers?: boolean;
  heartbeatIntervalMs?: number;
  requestPollIntervalMs?: number;
  ghCommandRunner?: GhCommandRunner;
}

const DOC_FILES = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
const MAX_LOG_BYTES = 128 * 1024;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_REQUEST_POLL_INTERVAL_MS = 1_000;
const GH_REQUEST_TYPES = new Set([
  'create_issues',
  'update_issue',
  'close_issue',
  'create_pr',
  'merge_pr',
  'dispatch_child',
  'steer_child',
  'stop_child',
  'post_comment',
  'query_issues',
  'spec_backfill',
  // legacy names
  'pr-create',
  'pr-comment',
  'issue-comment',
  'issue-create',
  'issue-close',
  'pr-merge',
  'branch-delete',
]);

interface GhCommandRunnerResult {
  exitCode: number;
  output: string;
}

type GhCommandRunner = (operation: string, sessionId: string, requestPath: string) => Promise<GhCommandRunnerResult>;

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

async function loadArtifactManifests(sessionDir: string): Promise<ArtifactManifest[]> {
  const artifactsDir = path.join(sessionDir, 'artifacts');
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(artifactsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const iterDirs = entries
    .filter((entry) => entry.isDirectory() && /^iter-\d+$/.test(entry.name))
    .sort((a, b) => {
      const numA = Number.parseInt(a.name.slice(5), 10);
      const numB = Number.parseInt(b.name.slice(5), 10);
      return numA - numB;
    });

  const results: ArtifactManifest[] = [];
  for (const dir of iterDirs) {
    const manifestPath = path.join(artifactsDir, dir.name, 'proof-manifest.json');
    const manifest = await readJsonFile(manifestPath);
    if (manifest !== null) {
      const iteration = Number.parseInt(dir.name.slice(5), 10);
      results.push({ iteration, manifest });
    }
  }
  return results;
}

async function resolveSessionContext(runtimeDir: string, sessionId: string): Promise<SessionContext | null> {
  const activeSessionsPath = path.join(runtimeDir, 'active.json');
  const active = await readJsonFile(activeSessionsPath);
  if (!isRecord(active)) {
    return null;
  }
  const entry = active[sessionId];
  if (!isRecord(entry)) {
    return null;
  }
  const sessionDir =
    typeof entry.session_dir === 'string'
      ? entry.session_dir
      : path.join(runtimeDir, 'sessions', sessionId);
  const workdir = typeof entry.work_dir === 'string' ? entry.work_dir : process.cwd();
  const pid = typeof entry.pid === 'number' && Number.isInteger(entry.pid) && entry.pid > 0
    ? entry.pid
    : null;
  return { sessionDir, workdir, pid };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function withLivenessCorrectedState(status: unknown | null, pid: number | null): unknown | null {
  if (!isRecord(status) || status.state !== 'running' || pid === null) {
    return status;
  }
  if (isProcessAlive(pid)) {
    return status;
  }
  return {
    ...status,
    state: 'exited',
  };
}

async function loadStateForContext(
  ctx: SessionContext,
  runtimeDir: string,
): Promise<DashboardState> {
  const statusPath = path.join(ctx.sessionDir, 'status.json');
  const metaPath = path.join(ctx.sessionDir, 'meta.json');
  const logPath = path.join(ctx.sessionDir, 'log.jsonl');
  const activeSessionsPath = path.join(runtimeDir, 'active.json');
  const recentSessionsPath = path.join(runtimeDir, 'history.json');

  const [status, meta, log, activeSessions, recentSessions, docsEntries, artifacts] = await Promise.all([
    readJsonFile(statusPath),
    readJsonFile(metaPath),
    readLogTail(logPath),
    readJsonArrayFile(activeSessionsPath),
    readJsonArrayFile(recentSessionsPath),
    Promise.all(
      DOC_FILES.map(async (docFile) => {
        const content = await readTextFile(path.join(ctx.workdir, docFile));
        return [docFile, content] as const;
      }),
    ),
    loadArtifactManifests(ctx.sessionDir),
  ]);
  const pid = ctx.pid ?? extractPid(meta);
  const correctedStatus = withLivenessCorrectedState(status, pid);

  return {
    sessionDir: ctx.sessionDir,
    workdir: ctx.workdir,
    runtimeDir,
    updatedAt: new Date().toISOString(),
    status: correctedStatus,
    log,
    docs: Object.fromEntries(docsEntries),
    activeSessions,
    recentSessions,
    artifacts,
  };
}

function normalizeProcessOutput(stdout: string, stderr: string): string {
  return [stdout, stderr].map((value) => value.trim()).filter((value) => value.length > 0).join('\n').trim();
}

async function defaultGhCommandRunner(operation: string, sessionId: string, requestPath: string): Promise<GhCommandRunnerResult> {
  try {
    const result = spawnSync('aloop', ['gh', operation, '--session', sessionId, '--request', requestPath], {
      encoding: 'utf8',
    });
    return {
      exitCode: result.status ?? 1,
      output: normalizeProcessOutput(String(result.stdout ?? ''), String(result.stderr ?? '')),
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: (error as Error).message,
    };
  }
}

function getGhArchivePath(processedDir: string, fileName: string, existingFiles: Set<string>): string {
  const destination = path.join(processedDir, fileName);
  if (!existingFiles.has(destination.toLowerCase())) {
    existingFiles.add(destination.toLowerCase());
    return destination;
  }

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let suffix = 1;
  while (true) {
    const candidate = path.join(processedDir, `${base}.dup${suffix}${ext}`);
    if (!existingFiles.has(candidate.toLowerCase())) {
      existingFiles.add(candidate.toLowerCase());
      return candidate;
    }
    suffix += 1;
  }
}

async function writeSessionLogEntry(logPath: string, event: string, data: Record<string, unknown>): Promise<void> {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };
  await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function processGhConventionRequests(
  workdir: string,
  sessionId: string,
  logPath: string,
  ghCommandRunner: GhCommandRunner,
): Promise<void> {
  const aloopDir = path.join(workdir, '.aloop');
  const sessionDir = path.dirname(logPath);
  
  await processAgentRequests({
    workdir,
    sessionId,
    aloopDir,
    sessionDir,
    logPath,
    ghCommandRunner
  });
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
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
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
  const requestPollIntervalMs = Math.max(250, runtimeOptions.requestPollIntervalMs ?? DEFAULT_REQUEST_POLL_INTERVAL_MS);
  const port = parsePort(options.port);
  const sessionDir = path.resolve(options.sessionDir ?? process.cwd());
  const workdir = path.resolve(options.workdir ?? process.cwd());
  const assetsDir = path.resolve(options.assetsDir ?? (await resolveDefaultAssetsDir()));
  const runtimeDir = path.resolve(options.runtimeDir ?? path.join(os.homedir(), '.aloop'));
  const ghCommandRunner = runtimeOptions.ghCommandRunner ?? defaultGhCommandRunner;
  const sessionId = path.basename(sessionDir);

  const statusPath = path.join(sessionDir, 'status.json');
  const logPath = path.join(sessionDir, 'log.jsonl');
  const metaPath = path.join(sessionDir, 'meta.json');
  const activeSessionsPath = path.join(runtimeDir, 'active.json');
  const recentSessionsPath = path.join(runtimeDir, 'history.json');
  const steeringPath = path.join(workdir, 'STEERING.md');
  const requestsDir = path.join(workdir, '.aloop', 'requests');
  const normalizedRequestsDir = path.normalize(requestsDir).toLowerCase();
  const docPaths = DOC_FILES.map((name) => path.join(workdir, name));
  const watchedFiles = new Set(
    [statusPath, logPath, activeSessionsPath, recentSessionsPath, ...docPaths].map((value) =>
      path.normalize(value).toLowerCase(),
    ),
  );

  const defaultContext: SessionContext = { sessionDir, workdir };
  const clients = new Map<ServerResponse, SessionContext>();
  const watchers = new Map<string, FSWatcher>();

  const loadState = async (): Promise<DashboardState> => {
    return loadStateForContext(defaultContext, runtimeDir);
  };

  const normalizedGlobalFiles = new Set(
    [activeSessionsPath, recentSessionsPath].map((value) => path.normalize(value).toLowerCase()),
  );

  let publishPending = false;
  let publishTimer: NodeJS.Timeout | null = null;
  let globalChangeDetected = false;

  const sendToClients = (event: string, payload: string) => {
    for (const [client] of clients) {
      try {
        sendSseEvent(client, event, payload);
      } catch {
        clients.delete(client);
        client.destroy();
      }
    }
  };

  const sendToDefaultSessionClients = (event: string, payload: string) => {
    for (const [client, ctx] of clients) {
      if (ctx.sessionDir !== defaultContext.sessionDir) {
        continue;
      }
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
    const isGlobal = globalChangeDetected;
    globalChangeDetected = false;
    try {
      if (isGlobal) {
        // Global file changed (active.json/history.json) — notify all clients with their session state
        const contextPayloads = new Map<string, string>();
        for (const [client, ctx] of clients) {
          const key = ctx.sessionDir;
          let payload = contextPayloads.get(key);
          if (payload === undefined) {
            const state = ctx === defaultContext
              ? await loadState()
              : await loadStateForContext(ctx, runtimeDir);
            payload = toStateEventPayload(state);
            contextPayloads.set(key, payload);
          }
          try {
            sendSseEvent(client, 'state', payload);
          } catch {
            clients.delete(client);
            client.destroy();
          }
        }
      } else {
        // Notify all connected clients — each gets state for their own session context
        const contextPayloads = new Map<string, string>();
        for (const [client, ctx] of clients) {
          const key = ctx.sessionDir;
          let payload = contextPayloads.get(key);
          if (payload === undefined) {
            const state = ctx === defaultContext
              ? await loadState()
              : await loadStateForContext(ctx, runtimeDir);
            payload = toStateEventPayload(state);
            contextPayloads.set(key, payload);
          }
          try {
            sendSseEvent(client, 'state', payload);
          } catch {
            clients.delete(client);
            client.destroy();
          }
        }
      }
    } catch (error) {
      console.warn(`dashboard: failed to publish state: ${(error as Error).message}`);
    }
  };

  const schedulePublish = (changedPath?: string) => {
    if (changedPath && normalizedGlobalFiles.has(changedPath)) {
      globalChangeDetected = true;
    }
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

  let requestProcessingActive = false;
  let requestProcessingQueued = false;
  const runRequestProcessing = () => {
    if (requestProcessingActive) {
      requestProcessingQueued = true;
      return;
    }
    requestProcessingActive = true;
    void processGhConventionRequests(workdir, sessionId, logPath, ghCommandRunner)
      .catch((error) => {
        console.warn(`dashboard: failed to process GH convention requests: ${(error as Error).message}`);
      })
      .finally(() => {
        requestProcessingActive = false;
        if (requestProcessingQueued) {
          requestProcessingQueued = false;
          runRequestProcessing();
        }
      });
  };
  runRequestProcessing();
  const requestPollTimer = setInterval(() => {
    runRequestProcessing();
  }, requestPollIntervalMs);
  requestPollTimer.unref();

  const watchPaths = [sessionDir, workdir, runtimeDir, requestsDir];
  for (const target of watchPaths) {
    try {
      const watcher = watch(target, (_eventType, filename) => {
        if (!filename) {
          return;
        }
        const changed = path.normalize(path.join(target, filename.toString())).toLowerCase();
        if (changed === normalizedRequestsDir || changed.startsWith(`${normalizedRequestsDir}${path.sep}`)) {
          runRequestProcessing();
        }
        if (watchedFiles.has(changed) || changed.endsWith('.md')) {
          schedulePublish(changed);
        }
      });
      watchers.set(target, watcher);
    } catch (error) {
      if (target === requestsDir && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      console.warn(`dashboard: unable to watch ${target}: ${(error as Error).message}`);
    }
  }

  const server = createServer((request, response) => {
    const handleRequest = async () => {
      const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (requestUrl.pathname === '/api/state' && request.method === 'GET') {
        const targetSessionId = requestUrl.searchParams.get('session');
        if (targetSessionId) {
          const ctx = await resolveSessionContext(runtimeDir, targetSessionId);
          if (!ctx) {
            writeJson(response, 404, { error: `Session not found: ${targetSessionId}` });
            return;
          }
          const state = await loadStateForContext(ctx, runtimeDir);
          writeJson(response, 200, state);
          return;
        }
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

        const targetSessionId = requestUrl.searchParams.get('session');
        let clientContext = defaultContext;
        if (targetSessionId) {
          const ctx = await resolveSessionContext(runtimeDir, targetSessionId);
          if (!ctx) {
            sendSseEvent(
              response,
              'error',
              JSON.stringify({ message: `Session not found: ${targetSessionId}` }),
            );
            response.end();
            return;
          }
          clientContext = ctx;
        }

        clients.set(response, clientContext);
        try {
          const initialState = clientContext === defaultContext
            ? await loadState()
            : await loadStateForContext(clientContext, runtimeDir);
          sendSseEvent(response, 'state', toStateEventPayload(initialState));
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

      const artifactMatch = requestUrl.pathname.match(/^\/api\/artifacts\/(\d+)\/(.+)$/);
      if (artifactMatch && request.method === 'GET') {
        const iteration = artifactMatch[1];
        const filename = artifactMatch[2];
        // Reject path traversal attempts
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
          writeJson(response, 400, { error: 'Invalid artifact filename.' });
          return;
        }
        const artifactPath = path.join(sessionDir, 'artifacts', `iter-${iteration}`, filename);
        const resolvedPath = path.resolve(artifactPath);
        const allowedPrefix = path.resolve(path.join(sessionDir, 'artifacts')) + path.sep;
        if (!resolvedPath.startsWith(allowedPrefix)) {
          writeJson(response, 400, { error: 'Invalid artifact path.' });
          return;
        }
        if (!(await fileExists(resolvedPath))) {
          writeJson(response, 404, { error: 'Artifact not found.' });
          return;
        }
        const content = await fs.readFile(resolvedPath);
        response.writeHead(200, {
          'Content-Type': getContentType(resolvedPath),
          'Cache-Control': 'no-cache',
        });
        response.end(content);
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
      clearInterval(requestPollTimer);

      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();

      for (const [client] of clients) {
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
