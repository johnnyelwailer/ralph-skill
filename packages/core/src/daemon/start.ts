import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { acquireLock, releaseLock } from "./lock.ts";
import { resolveDaemonPaths, type DaemonPaths } from "../paths.ts";
import { startHttp, type RunningHttp } from "../server/http.ts";
import { startSocket, type RunningSocket } from "../server/socket.ts";
import { openDatabase, type Database } from "../state/database.ts";
import { ProjectRegistry } from "../state/projects.ts";
import { loadDaemonConfig, type DaemonConfig } from "../config/daemon.ts";
import { loadOverridesConfig, type OverridesConfig } from "../config/overrides.ts";
import type { ConfigStore } from "../config/store.ts";
import { createConfigStore } from "../config/store.ts";

export type StartDaemonOptions = {
  /** Override the HTTP port from daemon.yml. Pass 0 for an ephemeral port. */
  port?: number;
  /** Override the HTTP bind address from daemon.yml. */
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
  config: ConfigStore;
  startedAt: number;
  stop(): Promise<void>;
};

export async function startDaemon(opts: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const paths = opts.paths ?? resolveDaemonPaths();
  const dbPath = opts.dbPath ?? join(paths.stateDir, "db.sqlite");

  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.stateDir, { recursive: true });

  // Load daemon.yml and overrides.yml. Either missing → typed defaults
  // (per CONSTITUTION §III.14, defaults are explicit named constants).
  const daemonResult = loadDaemonConfig(paths.daemonConfigFile);
  if (!daemonResult.ok) {
    throw new Error(
      `daemon.yml invalid (${paths.daemonConfigFile}):\n  ${daemonResult.errors.join("\n  ")}`,
    );
  }
  const overridesResult = loadOverridesConfig(paths.overridesFile);
  if (!overridesResult.ok) {
    throw new Error(
      `overrides.yml invalid (${paths.overridesFile}):\n  ${overridesResult.errors.join("\n  ")}`,
    );
  }

  const config = createConfigStore({
    daemon: daemonResult.value,
    overrides: overridesResult.value,
    paths,
  });

  // CLI/option overrides win over daemon.yml at startup. The listener
  // hostname/port cannot hot-reload (require restart per daemon.md §Upgrade);
  // keep them on the immutable startup path.
  const hostname = opts.hostname ?? config.daemon().http.bind;
  const port = opts.port ?? config.daemon().http.port;

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
  const routerDeps = { startedAt, registry, config };

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
    config,
    startedAt,
    async stop() {
      await http!.stop();
      await socket!.stop();
      db.close();
      releaseLock(paths.pidFile);
    },
  };
}

export type { DaemonConfig, OverridesConfig };
