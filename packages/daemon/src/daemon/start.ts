import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { makeIdGenerator } from "@aloop/core";
import {
  createEventWriter,
  createIdempotencyStore,
  EventCountsProjector,
  JsonlEventStore,
  openDatabase,
  PermitProjector,
  PermitRegistry,
  ProjectRegistry,
  type Database,
  type EventWriter,
  ArtifactRegistry,
  WorkspaceRegistry,
} from "@aloop/state-sqlite";
import { resolveDaemonPaths } from "@aloop/daemon-config";
import { startHttp, startSocket, type RunningHttp, type RunningSocket } from "@aloop/daemon-http";
import { createOpencodeAdapter } from "@aloop/provider-opencode";
import { acquireLock, releaseLock } from "./lock.ts";
import { SchedulerService, startSchedulerWatchdog, type RunningWatchdog } from "@aloop/scheduler";
import { makeSchedulerConfig } from "./scheduler-config.ts";
import { createProviderQuotaProbe } from "./provider-probes.ts";
import { makeRouterDeps } from "./router-deps.ts";
import { loadInitialConfig } from "./start-config.ts";
import {
  detectStuckSessions,
  refreshProviderHealth,
  recoverCrashedSessions,
} from "@aloop/scheduler";
import type { ConfigStore, DaemonConfig, DaemonPaths, OverridesConfig } from "@aloop/daemon-config";
import { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";

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
  events: EventWriter;
  scheduler: SchedulerService;
  providerRegistry: ProviderRegistry;
  providerHealth: InMemoryProviderHealthStore;
  idempotencyStore: ReturnType<typeof createIdempotencyStore>;
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
  const permits = new PermitRegistry(db);
  const artifactRegistry = new ArtifactRegistry(db);
  eventStore = new JsonlEventStore(paths.logFile);
  const events = createEventWriter({
    db,
    store: eventStore,
    projectors: [new EventCountsProjector(), new PermitProjector()],
    nextId: makeIdGenerator(),
  });
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(createOpencodeAdapter());
  const providerHealth = new InMemoryProviderHealthStore(providerRegistry.list().map((adapter) => adapter.id));
  const scheduler = new SchedulerService(permits, makeSchedulerConfig(config, events), events, { providerQuota: createProviderQuotaProbe(providerHealth) });
  const idempotencyStore = createIdempotencyStore(db);
  const routerDeps = makeRouterDeps({
    registry,
    workspaceRegistry,
    scheduler,
    startedAt,
    config,
    events,
    providerRegistry,
    providerHealth,
    artifactRegistry,
    idempotencyStore,
    cooldownMultipliers: buildCooldownMultipliers(config),
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
    config,
    events,
    scheduler,
    providerRegistry,
    providerHealth,
    idempotencyStore,
    startedAt,
    async stop() {
      watchdog?.stop();
      await http!.stop();
      await socket!.stop();
      await eventStore!.close();
      db.close();
      releaseLock(paths.pidFile);
    },
  };
}

export type { DaemonConfig, OverridesConfig };

/**
 * Build a ReadonlyMap of providerId → cooldownMultiplier from daemon config.
 * Reads `provider_tuning.<id>.cooldown_multiplier` entries; absent providers
 * default to 1.0 (no multiplier). Values are clamped to [0.5, 4.0] per spec.
 */
function buildCooldownMultipliers(config: ConfigStore): ReadonlyMap<string, number> {
  const tuning = config.daemon().providerTuning ?? {};
  const entries: [string, number][] = Object.entries(tuning).map(([providerId, tune]) => {
    const raw = (tune as Record<string, unknown>).cooldown_multiplier;
    const clamped = typeof raw === "number" ? Math.min(4.0, Math.max(0.5, raw)) : 1.0;
    return [providerId, clamped];
  });
  return new Map(entries);
}
