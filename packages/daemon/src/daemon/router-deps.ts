import { handleComposer } from "@aloop/daemon-routes-composer";
import { handleArtifacts } from "@aloop/daemon-routes-artifacts";
import { handleTriggers, TriggerStore } from "@aloop/daemon-routes-triggers";
import { handleSetup, SetupStore } from "@aloop/daemon-routes-setup";
import { handleEvents } from "@aloop/daemon-routes";
import { handleMetricsAggregates } from "@aloop/daemon-routes";
import { createMetricsAggregatesDeps } from "./router-deps-helpers.ts";
import type { ConfigStore } from "@aloop/daemon-config";
import type { RouterDeps } from "@aloop/daemon-http";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import { handleProviders as handleProvidersRoute } from "@aloop/daemon-routes-providers";
import {
  handleProjects as handleProjectsRoute,
  handleScheduler as handleSchedulerRoute,
  handleWorkspaces as handleWorkspacesRoute,
  handleSessions as handleSessionsRoute,
} from "@aloop/daemon-routes";
import type { SchedulerService } from "@aloop/scheduler";
import type { ComposerTurnRegistry, EventWriter, ProjectRegistry, SessionRegistry, WorkspaceRegistry, ArtifactRegistry, Database, TurnRegistry } from "@aloop/state-sqlite";
import { handleDaemon as handleDaemonRoute } from "../routes/daemon.ts";
import { handleTurns } from "@aloop/daemon-routes-turns";
import { join } from "node:path";

export type MakeRouterDepsInput = {
  readonly db: Database;
  readonly registry: ProjectRegistry;
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly sessionRegistry: SessionRegistry;
  readonly turnRegistry: TurnRegistry;
  readonly composerRegistry: ComposerTurnRegistry;
  readonly artifactRegistry: ArtifactRegistry;
  readonly scheduler: SchedulerService;
  readonly startedAt: number;
  readonly config: ConfigStore;
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
};

export function makeRouterDeps(input: MakeRouterDepsInput): RouterDeps {
  const sessionsDir = () => join(input.config.paths().stateDir, "sessions");
  const artifactsDir = () => join(input.config.paths().stateDir, "artifacts");
  const triggersDir = () => join(input.config.paths().stateDir, "triggers");
  const triggerStore = new TriggerStore({ triggersDir: triggersDir() });
  const setupStore = new SetupStore({ stateDir: input.config.paths().stateDir });
  const metricsAggregatesDeps = createMetricsAggregatesDeps({ db: input.db });
  return {
    handleDaemon: (req, pathname) =>
      handleDaemonRoute(req, { startedAt: input.startedAt, config: input.config, scheduler: input.scheduler, registry: input.registry, sessionsDir }, pathname),
    handleMetrics: (req, pathname) =>
      handleMetricsAggregates(req, metricsAggregatesDeps, pathname),
    handleProjects: (req, pathname) =>
      handleProjectsRoute(
        req,
        {
          registry: input.registry,
          sessionsDir,
        },
        pathname,
      ),
    handleWorkspaces: (req, pathname) =>
      handleWorkspacesRoute(
        req,
        {
          registry: input.workspaceRegistry,
          projectRegistry: input.registry,
        },
        pathname,
      ),
    handleProviders: (req, pathname) =>
      handleProvidersRoute(
        req,
        {
          config: input.config,
          events: input.events,
          providerRegistry: input.providerRegistry,
          providerHealth: input.providerHealth,
        },
        pathname,
      ),
    handleScheduler: (req, pathname) =>
      handleSchedulerRoute(
        req,
        {
          scheduler: input.scheduler,
        },
        pathname,
      ),
    handleSessions: (req, pathname) =>
      handleSessionsRoute(
        req,
        {
          sessions: input.sessionRegistry,
          projects: input.registry,
          sessionsDir,
        },
        pathname,
      ),
    handleComposer: (req, pathname) =>
      handleComposer(req, { registry: input.composerRegistry, events: input.events, logFile: () => input.config.paths().logFile }, pathname),
    handleArtifacts: (req, pathname) =>
      handleArtifacts(req, { registry: input.artifactRegistry, artifactsDir }, pathname),
    handleTriggers: (req, pathname) =>
      handleTriggers(req, { store: triggerStore }, pathname),
    handleSetup: (req, pathname) =>
      handleSetup(req, { store: setupStore, eventsDir: input.config.paths().stateDir }, pathname),
    handleEvents: (req, pathname) =>
      handleEvents(req, { logFile: () => input.config.paths().logFile, sessionsDir }, pathname),
    handleTurns: (req, pathname) =>
      handleTurns(req, { turns: input.turnRegistry, sessionsDir }, pathname),
  };
}
