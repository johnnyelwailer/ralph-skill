import { mkdirSync } from "node:fs";
import { acquireLock, releaseLock } from "./lock.ts";
import { resolveDaemonPaths, type DaemonPaths } from "../paths.ts";
import { startHttp, type RunningHttp } from "../server/http.ts";
import { startSocket, type RunningSocket } from "../server/socket.ts";

export type StartDaemonOptions = {
  port?: number;
  hostname?: string;
  paths?: DaemonPaths;
};

export type RunningDaemon = {
  paths: DaemonPaths;
  http: RunningHttp;
  socket: RunningSocket;
  startedAt: number;
  stop(): Promise<void>;
};

export async function startDaemon(opts: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const paths = opts.paths ?? resolveDaemonPaths();
  const port = opts.port ?? 7777;
  const hostname = opts.hostname ?? "127.0.0.1";

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

  try {
    http = startHttp({ hostname, port, startedAt });
    socket = startSocket({ path: paths.socketFile, startedAt });
  } catch (err) {
    // Unwind anything that did start, then release the lock so a retry can bind.
    await http?.stop().catch(() => {});
    await socket?.stop().catch(() => {});
    releaseLock(paths.pidFile);
    throw err;
  }

  return {
    paths,
    http,
    socket,
    startedAt,
    async stop() {
      await http!.stop();
      await socket!.stop();
      releaseLock(paths.pidFile);
    },
  };
}
