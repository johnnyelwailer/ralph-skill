import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { makeIdGenerator } from "@aloop/core";
import {
  createEventWriter,
  EventCountsProjector,
  JsonlEventStore,
  openDatabase,
  PermitProjector,
  PermitRegistry,
  ProjectRegistry,
  SessionRegistry,
  TurnRegistry,
  WorkspaceRegistry,
  ComposerTurnRegistry,
  ArtifactRegistry,
  SchedulerMetricsProjector,
  WorkspaceProjector,
  type Database,
  type EventWriter,
} from "@aloop/state-sqlite";
import { resolveDaemonPaths } from "@aloop/daemon-config";
import { startHttp, startSocket, type RunningHttp, type RunningSocket } from "@aloop/daemon-http";
import { createOpencodeAdapter } from "@aloop/provider-opencode";
import { createOpencodeCliAdapter } from "@aloop/provider-opencode-cli";
import { acquireLock, releaseLock } from "./lock.ts";
import { SchedulerService, startSchedulerWatchdog, type RunningWatchdog } from "@aloop/scheduler";
import { makeSchedulerConfig } from "./scheduler-config.ts";
import { createProviderQuotaProbe } from "./provider-probes.ts";
import { makeRouterDeps } from "./router-deps.ts";
import { loadInitialConfig } from "./start-config.ts";
import type { ConfigStore, DaemonConfig, DaemonPaths, OverridesConfig } from "@aloop/daemon-config";
import { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import type { OpencodeRunTurn as OpencodeSdkRunTurn } from "@aloop/provider-opencode";
import type { OpencodeRunTurn as OpencodeCliRunTurn } from "@aloop/provider-opencode-cli";

export type StartDaemonOptions = {
  /** Override the HTTP port from daemon.yml. Pass 0 for an ephemeral port. */
  port?: number;
  /** Override the HTTP bind address from daemon.yml. */
  hostname?: string;
  paths?: DaemonPaths;
  /** Override database path. Defaults to <stateDir>/db.sqlite; pass ":memory:" for tests. */
  dbPath?: string;
  /** Override the OpenCode SDK runTurn implementation. */
  opencodeSdkRunTurn?: OpencodeSdkRunTurn;
  /** Override the OpenCode CLI runTurn implementation. */
  opencodeCliRunTurn?: OpencodeCliRunTurn;
};

export type RunningDaemon = {
  paths: DaemonPaths;
  http: RunningHttp;
  socket: RunningSocket;
  db: Database;
  registry: ProjectRegistry;
  workspaceRegistry: WorkspaceRegistry;
  sessionRegistry: SessionRegistry;
  config: ConfigStore;
  events: EventWriter;
  scheduler: SchedulerService;
  providerRegistry: ProviderRegistry;
  providerHealth: InMemoryProviderHealthStore;
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
  if (!lock.ok) {
    throw new Error(
      `aloopd is already running (pid ${lock.pid}). pid file: ${paths.pidFile}`,
    );
  }
  const startedAt = Date.now();
  let http: RunningHttp | undefined;
  let socket: RunningSocket | undefined;
  let eventStore: JsonlEventStore | undefined;
  let watchdog: RunningWatchdog | undefined;
  const { db } = openDatabase(dbPath);
  const registry = new ProjectRegistry(db);
  const workspaceRegistry = new WorkspaceRegistry(db);
  const sessionRegistry = new SessionRegistry(db);
  const turnRegistry = new TurnRegistry(db);
  const composerRegistry = new ComposerTurnRegistry(db);
  const artifactRegistry = new ArtifactRegistry(db);
  const permits = new PermitRegistry(db);
  eventStore = new JsonlEventStore(paths.logFile);
  const events = createEventWriter({
    db,
    store: eventStore,
    projectors: [new EventCountsProjector(), new PermitProjector(), new SchedulerMetricsProjector(), new WorkspaceProjector()],
    nextId: makeIdGenerator(),
  });
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(createOpencodeAdapter(opts.opencodeSdkRunTurn ? { runTurn: opts.opencodeSdkRunTurn } : {}));
  providerRegistry.register(createOpencodeCliAdapter(opts.opencodeCliRunTurn ? { runTurn: opts.opencodeCliRunTurn } : {}));
  const providerHealth = new InMemoryProviderHealthStore(providerRegistry.list().map((adapter) => adapter.id));
  const scheduler = new SchedulerService(permits, makeSchedulerConfig(config, events), events, { providerQuota: createProviderQuotaProbe(providerHealth) });
  const routerDeps = makeRouterDeps({
    db,
    registry,
    workspaceRegistry,
    sessionRegistry,
    turnRegistry,
    composerRegistry,
    artifactRegistry,
    scheduler,
    startedAt,
    config,
    events,
    providerRegistry,
    providerHealth,
  });
  try {
    http = startHttp({ hostname, port, deps: routerDeps });
    socket = startSocket({ path: paths.socketFile, deps: routerDeps });
    watchdog = startSchedulerWatchdog({
      tickIntervalSeconds: () => config.daemon().watchdog.tickIntervalSeconds,
      expirePermits: () => scheduler.expirePermits(),
    });
  } catch (err) {
    await http?.stop().catch(() => {});
    await socket?.stop().catch(() => {});
    await eventStore?.close().catch(() => {});
    watchdog?.stop();
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
    workspaceRegistry,
    sessionRegistry,
    config,
    events,
    scheduler,
    providerRegistry,
    providerHealth,
    startedAt,
    async stop() {
      watchdog?.stop();
      await http!.stop();
      await socket!.stop();
      await providerRegistry.disposeAll();
      await eventStore!.close();
      db.close();
      releaseLock(paths.pidFile);
    },
  };
}

export type { DaemonConfig, OverridesConfig };
