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
  ArtifactRegistry,
  WorkspaceRegistry,
  SchedulerMetricsProjector,
  WorkspaceProjector,
  type Database,
  type EventWriter,
} from "@aloop/state-sqlite";
import { createOpencodeAdapter, type OpencodeRunTurn as OpencodeSdkRunTurn } from "@aloop/provider-opencode";
import { createOpencodeCliAdapter, type OpencodeRunTurn as OpencodeCliRunTurn } from "@aloop/provider-opencode-cli";
import { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import type { ConfigStore } from "@aloop/daemon-config";

export type DaemonInfra = {
  readonly db: Database;
  readonly registry: ProjectRegistry;
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly permits: PermitRegistry;
  readonly artifactRegistry: ArtifactRegistry;
  readonly eventStore: JsonlEventStore;
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
  readonly idempotencyStore: ReturnType<typeof createIdempotencyStore>;
};

export function createDaemonInfra(options: {
  dbPath: string;
  logFile: string;
  opencodeSdkRunTurn?: OpencodeSdkRunTurn;
  opencodeCliRunTurn?: OpencodeCliRunTurn;
}): DaemonInfra {
  const { db } = openDatabase(options.dbPath);
  const registry = new ProjectRegistry(db);
  const workspaceRegistry = new WorkspaceRegistry(db);
  const permits = new PermitRegistry(db);
  const artifactRegistry = new ArtifactRegistry(db);
  const eventStore = new JsonlEventStore(options.logFile);
  const events = createEventWriter({
    db,
    store: eventStore,
    projectors: [new EventCountsProjector(), new PermitProjector(), new SchedulerMetricsProjector(), new WorkspaceProjector()],
    nextId: makeIdGenerator(),
  });
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(createOpencodeAdapter({ ...(options.opencodeSdkRunTurn ? { runTurn: options.opencodeSdkRunTurn } : {}) }));
  providerRegistry.register(createOpencodeCliAdapter({ ...(options.opencodeCliRunTurn ? { runTurn: options.opencodeCliRunTurn } : {}) }));
  const providerHealth = new InMemoryProviderHealthStore(providerRegistry.list().map((adapter) => adapter.id));
  const idempotencyStore = createIdempotencyStore(db);
  return { db, registry, workspaceRegistry, permits, artifactRegistry, eventStore, events, providerRegistry, providerHealth, idempotencyStore };
}

export function buildCooldownMultipliers(config: ConfigStore): ReadonlyMap<string, number> {
  const tuning = config.daemon().providerTuning ?? {};
  const entries: [string, number][] = Object.entries(tuning).map(([providerId, tune]) => {
    const raw = (tune as Record<string, unknown>).cooldown_multiplier;
    const clamped = typeof raw === "number" ? Math.min(4.0, Math.max(0.5, raw)) : 1.0;
    return [providerId, clamped];
  });
  return new Map(entries);
}
