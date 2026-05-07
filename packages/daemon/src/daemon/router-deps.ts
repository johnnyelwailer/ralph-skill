import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { ConfigStore } from "@aloop/daemon-config";
import type { RouterDeps } from "@aloop/daemon-http";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import { handleProviders as handleProvidersRoute } from "@aloop/daemon-routes-providers";
import { handleSetup as handleSetupRoute } from "@aloop/daemon-routes-setup";
import { handleTriggers as handleTriggersRoute, TriggerStore } from "@aloop/daemon-routes-triggers";
import {
  handleMetrics as handleMetricsRoute,
  handleMetricsAggregates as handleMetricsAggregatesRoute,
} from "@aloop/daemon-routes";
import {
  handleProjects as handleProjectsRoute,
  handleScheduler as handleSchedulerRoute,
  handleSessions as handleSessionsRoute,
  handleEvents as handleEventsRoute,
  handleWorkspaces as handleWorkspacesRoute,
} from "@aloop/daemon-routes";
import { handleArtifacts as handleArtifactsRoute, type ArtifactsDeps } from "@aloop/daemon-routes-artifacts";
import { handleTurns as handleTurnsRoute, type TurnsDeps } from "@aloop/daemon-routes-turns";
import type { ArtifactRegistry, EventWriter, IdempotencyStore, ProjectRegistry, WorkspaceRegistry } from "@aloop/state-sqlite";
import type { SchedulerService } from "@aloop/scheduler";
import { handleDaemon as handleDaemonRoute } from "../routes/daemon.ts";
import { handleIncubation as handleIncubationRoute, type IncubationDeps } from "@aloop/daemon-routes-incubation";
import { handleComposer as handleComposerRoute, type ComposerDeps } from "@aloop/daemon-routes-composer";
import { createMetricsDeps, createMetricsAggregatesDeps, createSessionSetup } from "./router-deps-helpers.ts";

export type MakeRouterDepsInput = {
  readonly registry: ProjectRegistry;
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly scheduler: SchedulerService;
  readonly startedAt: number;
  readonly config: ConfigStore;
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
  readonly artifactRegistry: ArtifactRegistry;
  readonly idempotencyStore: IdempotencyStore;
  readonly cooldownMultipliers?: ReadonlyMap<string, number>;
  readonly db: Database;
};

export function makeRouterDeps(input: MakeRouterDepsInput): RouterDeps {
  const metricsDeps = createMetricsDeps({
    scheduler: input.scheduler,
    providerHealth: input.providerHealth,
  });
  const metricsAggregatesDeps = createMetricsAggregatesDeps({ db: input.db });
  const { sessionsDir, setupStore, sessionRunner } = createSessionSetup({
    config: input.config,
    registry: input.registry,
    scheduler: input.scheduler,
    providerRegistry: input.providerRegistry,
    events: input.events,
  });

  return {
    handleDaemon: (req, pathname) =>
      handleDaemonRoute(req, {
        startedAt: input.startedAt,
        config: input.config,
        scheduler: input.scheduler,
        registry: input.registry,
        sessionsDir,
      }, pathname),
    handleMetrics: (req, pathname) => handleMetricsRoute(req, metricsDeps, pathname),
    handleMetricsAggregates: (req, pathname) => handleMetricsAggregatesRoute(req, metricsAggregatesDeps, pathname),
    handleProjects: (req, pathname) =>
      handleProjectsRoute(req, {
        registry: input.registry,
        sessionsDir: () => join(input.config.paths().stateDir, "sessions"),
        idempotencyStore: input.idempotencyStore,
      }, pathname),
    handleProviders: (req, pathname) =>
      handleProvidersRoute(req, {
        config: input.config,
        events: input.events,
        providerRegistry: input.providerRegistry,
        providerHealth: input.providerHealth,
        cooldownMultipliers: input.cooldownMultipliers,
      }, pathname),
    handleScheduler: (req, pathname) =>
      handleSchedulerRoute(req, { scheduler: input.scheduler }, pathname),
    handleSessions: (req, pathname) =>
      handleSessionsRoute(req, {
        sessionsDir,
        events: input.events,
        idempotencyStore: input.idempotencyStore,
        runSession: (sessionId) => sessionRunner.run(sessionId),
      }, pathname),
    handleArtifacts: (req, pathname) =>
      handleArtifactsRoute(req, {
        registry: input.artifactRegistry,
        artifactsDir: () => join(input.config.paths().home, "artifacts"),
      }, pathname),
    handleTurns: (req, pathname) =>
      handleTurnsRoute(req, {
        sessionsDir: () => join(input.config.paths().stateDir, "sessions"),
      }, pathname),
    handleEvents: (req, pathname) =>
      handleEventsRoute(req, {
        logFile: () => input.config.paths().logFile,
        sessionsDir: () => join(input.config.paths().stateDir, "sessions"),
      }, pathname),
    handleSetup: (req, pathname) =>
      handleSetupRoute(req, {
        store: setupStore,
        eventsDir: join(input.config.paths().stateDir, "setup_runs"),
      }, pathname, {
        archive: (id: string) => input.registry.archive(id),
        purge: (id: string) => input.registry.purge(id),
        get: (id: string) => input.registry.get(id),
      }, join(input.config.paths().stateDir, "sessions")),
    handleWorkspaces: (req, pathname) =>
      handleWorkspacesRoute(req, {
        workspaceRegistry: input.workspaceRegistry,
        projectRegistry: input.registry,
        sessionsDir: () => join(input.config.paths().stateDir, "sessions"),
      }, pathname),
    handleTriggers: (req, pathname) =>
      handleTriggersRoute(req, {
        store: new TriggerStore({ triggersDir: join(input.config.paths().stateDir, "triggers") }),
      }, pathname),
    handleIncubation: (req, pathname) =>
      handleIncubationRoute(req, {
        db: input.db,
        sessionsDir: () => join(input.config.paths().stateDir, "sessions"),
      }, pathname),
    handleComposer: (req, pathname) =>
      handleComposerRoute(req, { db: input.db }, pathname),
  };
}
