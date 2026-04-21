/**
 * Daemon-level configuration types and defaults. Source: ~/.aloop/daemon.yml.
 *
 * Every default is explicit and named (DAEMON_DEFAULTS) per CONSTITUTION
 * §III.14 — no silent fallbacks.
 *
 * Future milestones consume more of this surface. Adding a knob here
 * without a consumer is acceptable IF it's documented in
 * docs/spec/daemon.md or docs/spec/self-improvement.md (tunable knobs).
 */
export type DaemonConfig = {
  readonly http: {
    readonly bind: string;
    readonly port: number;
    readonly autostart: boolean;
  };
  readonly scheduler: {
    readonly concurrencyCap: number;
    readonly permitTtlDefaultSeconds: number;
    readonly permitTtlMaxSeconds: number;
    readonly systemLimits: {
      readonly cpuMaxPct: number;
      readonly memMaxPct: number;
      readonly loadMax: number;
    };
    readonly burnRate: {
      readonly maxTokensSinceCommit: number;
      readonly minCommitsPerHour: number;
    };
  };
  readonly watchdog: {
    readonly tickIntervalSeconds: number;
    readonly stuckThresholdSeconds: number;
    readonly quotaPollIntervalSeconds: number;
  };
  readonly retention: {
    readonly completedSessionsDays: number;
    readonly interruptedSessionsDays: number;
    readonly abandonedSetupDays: number;
  };
  readonly logging: {
    readonly level: "debug" | "info" | "warn" | "error";
  };
};

export const DAEMON_DEFAULTS: DaemonConfig = {
  http: { bind: "127.0.0.1", port: 7777, autostart: true },
  scheduler: {
    concurrencyCap: 3,
    permitTtlDefaultSeconds: 600,
    permitTtlMaxSeconds: 3600,
    systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
    burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 },
  },
  watchdog: {
    tickIntervalSeconds: 15,
    stuckThresholdSeconds: 600,
    quotaPollIntervalSeconds: 60,
  },
  retention: {
    completedSessionsDays: 30,
    interruptedSessionsDays: 90,
    abandonedSetupDays: 14,
  },
  logging: { level: "info" },
};
