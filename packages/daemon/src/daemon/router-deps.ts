import type { ConfigStore } from "@aloop/daemon-config";
import type { RouterDeps } from "@aloop/daemon-http";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import { handleProviders as handleProvidersRoute, handleScheduler as handleSchedulerRoute } from "@aloop/daemon-routes";
import type { SchedulerService } from "@aloop/scheduler";
import type { EventWriter, ProjectRegistry } from "@aloop/state-sqlite";
import { handleDaemon as handleDaemonRoute } from "../routes/daemon.ts";

export type MakeRouterDepsInput = {
  readonly registry: ProjectRegistry;
  readonly scheduler: SchedulerService;
  readonly startedAt: number;
  readonly config: ConfigStore;
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
};

export function makeRouterDeps(input: MakeRouterDepsInput): RouterDeps {
  return {
    registry: input.registry,
    handleDaemon: (req, pathname) =>
      handleDaemonRoute(req, { startedAt: input.startedAt, config: input.config }, pathname),
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
  };
}
