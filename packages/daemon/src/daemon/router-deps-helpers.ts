import type { InMemoryProviderHealthStore } from "@aloop/provider";
import {
  type MetricsDeps,
  type MetricsAggregatesDeps,
} from "@aloop/daemon-routes";
import type { Database } from "bun:sqlite";
import type { SchedulerService } from "@aloop/scheduler";
import { DEFAULT_SCHEDULER_PROBES } from "@aloop/scheduler-gates";

export function createMetricsDeps(input: {
  readonly scheduler: Pick<SchedulerService, "currentLimits" | "listPermits">;
  readonly providerHealth: InMemoryProviderHealthStore;
}): MetricsDeps {
  return {
    scheduler: input.scheduler as MetricsDeps["scheduler"],
    providerHealth: input.providerHealth,
    systemSample: DEFAULT_SCHEDULER_PROBES.systemSample,
  };
}

export function createMetricsAggregatesDeps(input: { readonly db: Database }): MetricsAggregatesDeps {
  return { db: input.db };
}
