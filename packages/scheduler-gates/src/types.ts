export type SchedulerLimits = {
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

export type ProviderOverrides = {
  readonly allow: readonly string[] | null;
  readonly deny: readonly string[] | null;
  readonly force: string | null;
};
