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
import type { EventWriter, ProjectRegistry, SessionRegistry, WorkspaceRegistry } from "@aloop/state-sqlite";
import { handleDaemon as handleDaemonRoute } from "../routes/daemon.ts";
import { join } from "node:path";

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
};

export function makeRouterDeps(input: MakeRouterDepsInput): RouterDeps {
  const sessionsDir = () => join(input.config.paths().stateDir, "sessions");
  return {
    handleDaemon: (req, pathname) =>
      handleDaemonRoute(req, { startedAt: input.startedAt, config: input.config, scheduler: input.scheduler, registry: input.registry, sessionsDir }, pathname),
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
  };
}
