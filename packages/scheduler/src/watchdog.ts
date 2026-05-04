import type { EventWriter } from "@aloop/state-sqlite";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import type { BurnRateSample } from "@aloop/scheduler-gates";

export type RunningWatchdog = {
  stop(): void;
};

export type StartSchedulerWatchdogInput = {
  tickIntervalSeconds(): number;
  expirePermits(): Promise<number>;
  detectStuckSessions?(
    sessionsDir: string,
    stuckThresholdSeconds: number,
    events: EventWriter,
    now?: () => number,
  ): Promise<number>;
  refreshProviderHealth?(
    providerRegistry: ProviderRegistry,
    providerHealth: InMemoryProviderHealthStore,
    events: EventWriter,
  ): Promise<number>;
  /**
   * Tick active research monitors and create research runs for any that are due.
   */
  tickIncubationMonitors?(
    db: unknown,
    events: EventWriter,
    now?: () => string,
  ): Promise<number>;
  /**
   * Proactively scan active sessions for burn-rate threshold violations.
   */
  watchSessionBurnRates?(
    sessionsDir: string,
    events: EventWriter,
    burnRateProbe: (sessionId: string) => BurnRateSample | Promise<BurnRateSample | null> | null,
    maxTokensSinceCommit: number,
    minCommitsPerHour: number,
  ): Promise<number>;
  sessionsDir?: string;
  stuckThresholdSeconds?: number;
  providerRegistry?: ProviderRegistry;
  providerHealth?: InMemoryProviderHealthStore;
  events?: EventWriter;
  quotaPollIntervalSeconds?: number;
  /** Injected at startup so tickIncubationMonitors can access the DB. */
  db?: unknown;
  burnRateProbe?: (sessionId: string) => BurnRateSample | Promise<BurnRateSample | null> | null;
  maxTokensSinceCommit?: number;
  minCommitsPerHour?: number;
};

export function startSchedulerWatchdog(input: StartSchedulerWatchdogInput): RunningWatchdog {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let lastQuotaPollAt = 0;

  const scheduleTick = (): void => {
    if (stopped) return;
    const delayMs = Math.max(1000, input.tickIntervalSeconds() * 1000);
    timer = setTimeout(async () => {
      try {
        await input.expirePermits();
        if (
          input.detectStuckSessions &&
          input.sessionsDir &&
          input.stuckThresholdSeconds !== undefined &&
          input.events
        ) {
          await input.detectStuckSessions(
            input.sessionsDir,
            input.stuckThresholdSeconds,
            input.events,
          );
        }
        if (
          input.refreshProviderHealth &&
          input.providerRegistry &&
          input.providerHealth &&
          input.events &&
          input.quotaPollIntervalSeconds !== undefined
        ) {
          const now = Date.now();
          if (now - lastQuotaPollAt >= input.quotaPollIntervalSeconds * 1000) {
            lastQuotaPollAt = now;
            await input.refreshProviderHealth(
              input.providerRegistry,
              input.providerHealth,
              input.events,
            );
          }
        }
        if (input.tickIncubationMonitors && input.db && input.events) {
          await input.tickIncubationMonitors(input.db, input.events);
        }
        if (
          input.watchSessionBurnRates &&
          input.sessionsDir &&
          input.events &&
          input.burnRateProbe &&
          input.maxTokensSinceCommit !== undefined &&
          input.minCommitsPerHour !== undefined
        ) {
          await input.watchSessionBurnRates(
            input.sessionsDir,
            input.events,
            input.burnRateProbe,
            input.maxTokensSinceCommit,
            input.minCommitsPerHour,
          );
        }
      } catch {
        // errors are swallowed
      } finally {
        scheduleTick();
      }
    }, delayMs);
  };

  scheduleTick();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
