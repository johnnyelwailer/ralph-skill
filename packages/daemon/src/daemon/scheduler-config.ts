import type { ConfigStore } from "@aloop/daemon-config";
import { type EventWriter } from "@aloop/state-sqlite";
import { updateSchedulerLimits } from "@aloop/scheduler-limits";
import { type SchedulerConfigView } from "@aloop/scheduler";

export function makeSchedulerConfig(
  config: ConfigStore,
  events: EventWriter,
): SchedulerConfigView {
  return {
    scheduler: () => config.daemon().scheduler,
    overrides: () => config.overrides(),
    updateLimits: (rawPatch: Record<string, unknown>) =>
      updateSchedulerLimits(config, events, rawPatch),
  };
}
