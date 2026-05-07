import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { JsonlEventStore } from "@aloop/state-sqlite";
import { resolveDaemonPaths } from "@aloop/daemon-config";
import { startHttp, startSocket, type RunningHttp, type RunningSocket } from "@aloop/daemon-http";
import { SchedulerService, startSchedulerWatchdog, type RunningWatchdog } from "@aloop/scheduler";
import { makeSchedulerConfig } from "./scheduler-config.ts";
import { createProviderQuotaProbe } from "./provider-probes.ts";
import { makeRouterDeps } from "./router-deps.ts";
import { loadInitialConfig } from "./start-config.ts";
import { acquireLock, releaseLock } from "./lock.ts";
import { createDaemonInfra, buildCooldownMultipliers } from "./start-infra.ts";
import {
  detectStuckSessions,
  refreshProviderHealth,
  recoverCrashedSessions,
} from "@aloop/scheduler";
import type { ConfigStore, DaemonConfig, DaemonPaths, OverridesConfig } from "@aloop/daemon-config";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import type { OpencodeRunTurn as OpencodeSdkRunTurn } from "@aloop/provider-opencode";
import type { OpencodeRunTurn as OpencodeCliRunTurn } from "@aloop/provider-opencode-cli";
import type { Database, EventWriter, IdempotencyStore } from "@aloop/state-sqlite";
import type { ProjectRegistry } from "@aloop/state-sqlite";

export type StartDaemonOptions = {
  port?: number;
  hostname?: string;
  paths?: DaemonPaths;
  dbPath?: string;
  opencodeSdkRunTurn?: OpencodeSdkRunTurn;
  opencodeCliRunTurn?: OpencodeCliRunTurn;
  opencodeRunTurn?: OpencodeSdkRunTurn;
};

export type RunningDaemon = {
  paths: DaemonPaths;
  http: RunningHttp;
  socket: RunningSocket;
  db: Database;
  registry: ProjectRegistry;
  config: ConfigStore;
  events: EventWriter;
  scheduler: SchedulerService;
  providerRegistry: ProviderRegistry;
  providerHealth: InMemoryProviderHealthStore;
  idempotencyStore: ReturnType<typeof import("@aloop/state-sqlite").createIdempotencyStore>;
  startedAt: number;
  stop(): Promise<void>;
};

export async function startDaemon(opts: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const paths = opts.paths ?? resolveDaemonPaths();
  const dbPath = opts.dbPath ?? join(paths.stateDir, "db.sqlite");
  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.stateDir, { recursive: true });
  const config = loadInitialConfig(paths);
  const hostname = opts.hostname ?? config.daemon().http.bind;
  const port = opts.port ?? config.daemon().http.port;
  const lock = acquireLock(paths.pidFile);
  if (!lock.ok) throw new Error(`aloopd is already running (pid ${lock.pid}). pid file: ${paths.pidFile}`);

  const startedAt = Date.now();
  let http: RunningHttp | undefined;
  let socket: RunningSocket | undefined;
  let watchdog: RunningWatchdog | undefined;

  const infra = createDaemonInfra({
    dbPath,
    logFile: paths.logFile,
    opencodeSdkRunTurn: opts.opencodeSdkRunTurn ?? opts.opencodeRunTurn,
    opencodeCliRunTurn: opts.opencodeCliRunTurn,
  });
  const { db, registry, workspaceRegistry, artifactRegistry, eventStore, events, providerRegistry, providerHealth, idempotencyStore } = infra;

  const scheduler = new SchedulerService(infra.permits, makeSchedulerConfig(config, events), events, {
    providerQuota: createProviderQuotaProbe(providerHealth),
  });
  const routerDeps = makeRouterDeps({
    registry, workspaceRegistry, scheduler, startedAt, config, events,
    providerRegistry, providerHealth, artifactRegistry, idempotencyStore,
    cooldownMultipliers: buildCooldownMultipliers(config), db,
  });

  const sessionsDir = join(paths.stateDir, "sessions");
  await recoverCrashedSessions(sessionsDir, events);

  try {
    http = startHttp({ hostname, port, deps: routerDeps });
    socket = startSocket({ path: paths.socketFile, deps: routerDeps });
    watchdog = startSchedulerWatchdog({
      tickIntervalSeconds: () => config.daemon().watchdog.tickIntervalSeconds,
      expirePermits: () => scheduler.expirePermits(),
      detectStuckSessions,
      refreshProviderHealth,
      sessionsDir,
      stuckThresholdSeconds: config.daemon().watchdog.stuckThresholdSeconds,
      quotaPollIntervalSeconds: config.daemon().watchdog.quotaPollIntervalSeconds,
      providerRegistry,
      providerHealth,
      events,
    });
  } catch (err) {
    await providerRegistry.disposeAll().catch(() => {});
    await http?.stop().catch(() => {});
    await socket?.stop().catch(() => {});
    await eventStore?.close().catch(() => {});
    watchdog?.stop();
    db.close();
    releaseLock(paths.pidFile);
    throw err;
  }

  return {
    paths, http, socket, db, registry, config, events, scheduler,
    providerRegistry, providerHealth, idempotencyStore, startedAt,
    async stop() {
      watchdog?.stop();
      await providerRegistry.disposeAll().catch(() => {});
      await http!.stop();
      await socket!.stop();
      await eventStore!.close();
      db.close();
      releaseLock(paths.pidFile);
    },
  };
}

export type { DaemonConfig, OverridesConfig };
