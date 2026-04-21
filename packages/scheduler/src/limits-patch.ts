type SchedulerLimitsPatch = {
  concurrencyCap?: unknown;
  permitTtlDefaultSeconds?: unknown;
  permitTtlMaxSeconds?: unknown;
  cpuMaxPct?: unknown;
  memMaxPct?: unknown;
  loadMax?: unknown;
  maxTokensSinceCommit?: unknown;
  minCommitsPerHour?: unknown;
};

export function normalizeLimitsPatch(
  rawPatch: Record<string, unknown>,
  errors: string[],
): SchedulerLimitsPatch {
  const patch: SchedulerLimitsPatch = {};
  const allowedTop = new Set([
    "concurrency_cap",
    "concurrencyCap",
    "permit_ttl_default_seconds",
    "permitTtlDefaultSeconds",
    "permit_ttl_max_seconds",
    "permitTtlMaxSeconds",
    "cpu_max_pct",
    "cpuMaxPct",
    "mem_max_pct",
    "memMaxPct",
    "load_max",
    "loadMax",
    "system_limits",
    "systemLimits",
    "burn_rate",
    "burnRate",
  ]);

  for (const key of Object.keys(rawPatch)) {
    if (!allowedTop.has(key)) errors.push(`unknown scheduler limits field: ${key}`);
  }
  if (errors.length > 0) return patch;

  patch.concurrencyCap = pick(rawPatch, "concurrency_cap", "concurrencyCap");
  patch.permitTtlDefaultSeconds = pick(
    rawPatch,
    "permit_ttl_default_seconds",
    "permitTtlDefaultSeconds",
  );
  patch.permitTtlMaxSeconds = pick(rawPatch, "permit_ttl_max_seconds", "permitTtlMaxSeconds");
  patch.cpuMaxPct = pick(rawPatch, "cpu_max_pct", "cpuMaxPct");
  patch.memMaxPct = pick(rawPatch, "mem_max_pct", "memMaxPct");
  patch.loadMax = pick(rawPatch, "load_max", "loadMax");

  const systemLimits = pick(rawPatch, "system_limits", "systemLimits");
  if (isMap(systemLimits)) {
    const allowedSystem = new Set([
      "cpu_max_pct",
      "cpuMaxPct",
      "mem_max_pct",
      "memMaxPct",
      "load_max",
      "loadMax",
    ]);
    for (const key of Object.keys(systemLimits)) {
      if (!allowedSystem.has(key)) errors.push(`unknown scheduler.system_limits field: ${key}`);
    }
    patch.cpuMaxPct = patch.cpuMaxPct ?? pick(systemLimits, "cpu_max_pct", "cpuMaxPct");
    patch.memMaxPct = patch.memMaxPct ?? pick(systemLimits, "mem_max_pct", "memMaxPct");
    patch.loadMax = patch.loadMax ?? pick(systemLimits, "load_max", "loadMax");
  } else if (systemLimits !== undefined) {
    errors.push("scheduler.system_limits: must be a mapping");
  }

  const burnRate = pick(rawPatch, "burn_rate", "burnRate");
  patch.maxTokensSinceCommit = pick(rawPatch, "max_tokens_since_commit", "maxTokensSinceCommit");
  patch.minCommitsPerHour = pick(rawPatch, "min_commits_per_hour", "minCommitsPerHour");
  if (isMap(burnRate)) {
    const allowedBurn = new Set([
      "max_tokens_since_commit",
      "maxTokensSinceCommit",
      "min_commits_per_hour",
      "minCommitsPerHour",
    ]);
    for (const key of Object.keys(burnRate)) {
      if (!allowedBurn.has(key)) errors.push(`unknown scheduler.burn_rate field: ${key}`);
    }
    patch.maxTokensSinceCommit =
      patch.maxTokensSinceCommit ??
      pick(burnRate, "max_tokens_since_commit", "maxTokensSinceCommit");
    patch.minCommitsPerHour =
      patch.minCommitsPerHour ?? pick(burnRate, "min_commits_per_hour", "minCommitsPerHour");
  } else if (burnRate !== undefined) {
    errors.push("scheduler.burn_rate: must be a mapping");
  }

  return patch;
}

function pick(raw: Record<string, unknown>, snake: string, camel: string): unknown {
  if (raw[snake] !== undefined) return raw[snake];
  return raw[camel];
}

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
