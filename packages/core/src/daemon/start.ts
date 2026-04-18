import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { acquireLock, releaseLock } from "./lock.ts";
import { resolveDaemonPaths, type DaemonPaths } from "../paths.ts";
import { startHttp, type RunningHttp } from "../server/http.ts";
import { startSocket, type RunningSocket } from "../server/socket.ts";
import { openDatabase, type Database } from "../state/database.ts";
import { ProjectRegistry } from "../state/projects.ts";

export type StartDaemonOptions = {
  port?: number;
  hostname?: string;
  paths?: DaemonPaths;
  /** Override database path. Defaults to <stateDir>/db.sqlite; pass ":memory:" for tests. */
  dbPath?: string;
};

export type RunningDaemon = {
  paths: DaemonPaths;
  http: RunningHttp;
  socket: RunningSocket;
  db: Database;
  registry: ProjectRegistry;
  startedAt: number;
  stop(): Promise<void>;
};

export async function startDaemon(opts: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const paths = opts.paths ?? resolveDaemonPaths();
  const port = opts.port ?? 7777;
  const hostname = opts.hostname ?? "127.0.0.1";
  const dbPath = opts.dbPath ?? join(paths.stateDir, "db.sqlite");

  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.stateDir, { recursive: true });

  const lock = acquireLock(paths.pidFile);
  if (!lock.ok) {
    throw new Error(
      `aloopd is already running (pid ${lock.pid}). pid file: ${paths.pidFile}`,
    );
  }

  const startedAt = Date.now();
  let http: RunningHttp | undefined;
  let socket: RunningSocket | undefined;

  const { db } = openDatabase(dbPath);
  const registry = new ProjectRegistry(db);
  const routerDeps = { startedAt, registry };

  try {
    http = startHttp({ hostname, port, deps: routerDeps });
    socket = startSocket({ path: paths.socketFile, deps: routerDeps });
  } catch (err) {
    // Unwind anything that did start, then release the lock so a retry can bind.
    await http?.stop().catch(() => {});
    await socket?.stop().catch(() => {});
    db.close();
    releaseLock(paths.pidFile);
    throw err;
  }

  return {
    paths,
    http,
    socket,
    db,
    registry,
    startedAt,
    async stop() {
      await http!.stop();
      await socket!.stop();
      db.close();
      releaseLock(paths.pidFile);
    },
  };
}
