import { join } from "node:path";
import type { ConfigStore } from "@aloop/daemon-config";
import type { ProviderRegistry, InMemoryProviderHealthStore } from "@aloop/provider";
import { handleSetup as handleSetupRoute, SetupStore } from "@aloop/daemon-routes-setup";
import {
  handleMetrics as handleMetricsRoute,
  handleMetricsAggregates as handleMetricsAggregatesRoute,
  type MetricsDeps,
  type MetricsAggregatesDeps,
} from "@aloop/daemon-routes";
import type { Database } from "bun:sqlite";
import type { SchedulerService } from "@aloop/scheduler";
import { DEFAULT_SCHEDULER_PROBES } from "@aloop/scheduler-gates";
import type { EventWriter, ProjectRegistry } from "@aloop/state-sqlite";
import { createContextRegistry, type ContextRegistry } from "@aloop/core";
import { createSessionRunner } from "./session-runner.ts";

export type SessionSetup = {
  readonly sessionsDir: () => string;
  readonly setupStore: SetupStore;
  readonly sessionRunner: ReturnType<typeof createSessionRunner>;
  /** Live context plugin registry. */
  readonly contextRegistry: ContextRegistry;
};

/** Default token budget when a context id has no configured budget. */
const DEFAULT_CONTEXT_BUDGET = 8000;

export function createSessionSetup(input: {
  readonly config: ConfigStore;
  readonly registry: ProjectRegistry;
  readonly scheduler: SchedulerService;
  readonly providerRegistry: ProviderRegistry;
  readonly events: EventWriter;
}): SessionSetup {
  const sessionsDir = () => join(input.config.paths().stateDir, "sessions");

  const contextRegistry = createContextRegistry();

  const resolveContextBudget = (contextId: string): number => {
    const cfg = input.config.daemon().contexts[contextId];
    return cfg?.budgetTokens ?? DEFAULT_CONTEXT_BUDGET;
  };

  return {
    sessionsDir,
    setupStore: new SetupStore({ stateDir: input.config.paths().stateDir }),
    contextRegistry,
    sessionRunner: createSessionRunner({
      registry: input.registry,
      scheduler: input.scheduler,
      providerRegistry: input.providerRegistry,
      events: input.events,
      sessionsDir,
      contextRegistry,
      resolveContextBudget,
    }),
  };
}

export function createMetricsDeps(input: {
  readonly scheduler: SchedulerService;
  readonly providerHealth: InMemoryProviderHealthStore;
}): MetricsDeps {
  return {
    scheduler: input.scheduler,
    providerHealth: input.providerHealth,
    systemSample: DEFAULT_SCHEDULER_PROBES.systemSample,
  };
}

export function createMetricsAggregatesDeps(input: { readonly db: Database }): MetricsAggregatesDeps {
  return { db: input.db };
}
