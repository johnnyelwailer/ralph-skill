import type { ConfigStore } from "@aloop/daemon-config";
import type { RouterDeps } from "@aloop/daemon-http";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import { handleProviders as handleProvidersRoute } from "@aloop/daemon-routes-providers";
import {
  handleProjects as handleProjectsRoute,
  handleScheduler as handleSchedulerRoute,
  handleWorkspaces as handleWorkspacesRoute,
  handleIncubation as handleIncubationRoute,
  handleSessions as handleSessionsRoute,
} from "@aloop/daemon-routes";
import type { SchedulerService } from "@aloop/scheduler";
import type { EventWriter, IncubationStore, ProjectRegistry, SessionRegistry, WorkspaceRegistry } from "@aloop/state-sqlite";
import { handleDaemon as handleDaemonRoute } from "../routes/daemon.ts";

export type MakeRouterDepsInput = {
  readonly registry: ProjectRegistry;
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly sessionRegistry: SessionRegistry;
  readonly scheduler: SchedulerService;
  readonly startedAt: number;
  readonly config: ConfigStore;
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
  readonly incubation: IncubationStore;
};

export function makeRouterDeps(input: MakeRouterDepsInput): RouterDeps {
  return {
    handleDaemon: (req, pathname) =>
      handleDaemonRoute(req, { startedAt: input.startedAt, config: input.config }, pathname),
    handleProjects: (req, pathname) =>
      handleProjectsRoute(
        req,
        {
          registry: input.registry,
        },
        pathname,
      ),
    handleWorkspaces: (req, pathname) =>
      handleWorkspacesRoute(
        req,
        {
          registry: input.workspaceRegistry,
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
    handleIncubation: (req, pathname) =>
      handleIncubationRoute(
        req,
        {
          store: input.incubation,
        },
        pathname,
      ),
    handleSessions: (req, pathname) =>
      handleSessionsRoute(
        req,
        {
          sessions: input.sessionRegistry,
          projects: input.registry,
        },
        pathname,
      ),
  };
}
