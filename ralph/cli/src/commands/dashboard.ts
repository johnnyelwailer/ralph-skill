import { createServer, type ServerResponse } from 'node:http';
import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface DashboardOptions {
  port: string;
  sessionDir?: string;
  workdir?: string;
  assetsDir?: string;
}

interface DashboardState {
  sessionDir: string;
  workdir: string;
  updatedAt: string;
  status: unknown | null;
  log: string;
  docs: Record<string, string>;
}

const DOC_FILES = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
const MAX_LOG_BYTES = 128 * 1024;

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${value}". Expected a number between 1 and 65535.`);
  }
  return port;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

export async function dashboardCommand(options: DashboardOptions) {
  const port = parsePort(options.port);
  const sessionDir = path.resolve(options.sessionDir ?? process.cwd());
  const workdir = path.resolve(options.workdir ?? process.cwd());
  const assetsDir = path.resolve(options.assetsDir ?? (await resolveDefaultAssetsDir()));

  const statusPath = path.join(sessionDir, 'status.json');
  const logPath = path.join(sessionDir, 'log.jsonl');
  const docPaths = DOC_FILES.map((name) => path.join(workdir, name));
  const watchedFiles = new Set([statusPath, logPath, ...docPaths].map((value) => path.normalize(value).toLowerCase()));

  const clients = new Set<ServerResponse>();
  const watchers = new Map<string, FSWatcher>();

  const loadState = async (): Promise<DashboardState> => {
    const [status, log, docsEntries] = await Promise.all([
      readJsonFile(statusPath),
      readLogTail(logPath),
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
      updatedAt: new Date().toISOString(),
      status,
      log,
      docs: Object.fromEntries(docsEntries),
    };
  };

  let publishPending = false;
  const publishState = async () => {
    publishPending = false;
    const statePayload = toStateEventPayload(await loadState());
    for (const client of clients) {
      sendSseEvent(client, 'state', statePayload);
    }
  };

  const schedulePublish = () => {
    if (publishPending) {
      return;
    }
    publishPending = true;
    setTimeout(() => {
      void publishState();
    }, 75);
  };

  const watchPaths = [sessionDir, workdir];
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

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (requestUrl.pathname === '/api/state' && request.method === 'GET') {
      const state = await loadState();
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(state));
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
      sendSseEvent(response, 'state', toStateEventPayload(await loadState()));
      request.on('close', () => {
        clients.delete(response);
      });
      return;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Not found' }));
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
  });

  const shutdown = () => {
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    for (const client of clients) {
      client.end();
    }
    server.close();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  server.listen(port, () => {
    console.log(`Launching real-time progress dashboard on port ${port}...`);
    console.log(`Session dir: ${sessionDir}`);
    console.log(`Workdir: ${workdir}`);
    console.log(`Assets dir: ${assetsDir}`);
  });
}
