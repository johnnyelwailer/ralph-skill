import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database, EventWriter } from "@aloop/state-sqlite";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import type { BurnRateSample } from "@aloop/scheduler-gates";

export type SessionSummary = {
  readonly id: string;
  readonly project_id: string;
  readonly kind: string;
  readonly status: string;
  readonly workflow: string | null;
  readonly created_at: string;
  readonly issue?: number | null;
  readonly parent_session_id?: string | null;
  readonly max_iterations?: number | null;
  readonly notes?: string | null;
};

function loadSessionSummary(sessionDir: string): SessionSummary | null {
  const path = join(sessionDir, "session.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SessionSummary;
  } catch {
    return null;
  }
}

function saveSessionSummary(sessionDir: string, s: SessionSummary): void {
  writeFileSync(join(sessionDir, "session.json"), JSON.stringify(s), "utf-8");
}

export async function readLastLineOfLog(sessionDir: string): Promise<string | null> {
  const logPath = join(sessionDir, "log.jsonl");
  if (!existsSync(logPath)) return null;

  return new Promise((resolve) => {
    const lines: string[] = [];
    const rl = createInterface({
      input: createReadStream(logPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (line.trim().length > 0) lines.push(line);
    });

    rl.on("close", () => {
      resolve(lines.length > 0 ? lines[lines.length - 1]! : null);
    });

    rl.on("error", () => resolve(null));
  });
}

export function parseEventTimestamp(line: string): string | null {
  try {
    const envelope = JSON.parse(line) as { timestamp?: string };
    return envelope.timestamp ?? null;
  } catch {
    return null;
  }
}

export async function recoverCrashedSessions(
  sessionsDir: string,
  events: EventWriter,
): Promise<number> {
  if (!existsSync(sessionsDir)) return 0;

  let entries: string[];
  try {
    entries = readdirSync(sessionsDir);
  } catch {
    return 0;
  }

  let recovered = 0;
  for (const id of entries) {
    const sessionDir = join(sessionsDir, id);
    const summary = loadSessionSummary(sessionDir);
    if (!summary || summary.status !== "running") continue;

    const lastLine = await readLastLineOfLog(sessionDir);
    const lastEventAt = lastLine ? parseEventTimestamp(lastLine) ?? null : null;

    const updated: SessionSummary = { ...summary, status: "interrupted" };
    saveSessionSummary(sessionDir, updated);

    await events.append("session.interrupted", {
      session_id: summary.id,
      last_event_at: lastEventAt,
    });

    recovered++;
  }

  return recovered;
}

export async function detectStuckSessions(
  sessionsDir: string,
  stuckThresholdSeconds: number,
  events: EventWriter,
  now: () => number = () => Date.now(),
): Promise<number> {
  if (!existsSync(sessionsDir)) return 0;

  let entries: string[];
  try {
    entries = readdirSync(sessionsDir);
  } catch {
    return 0;
  }

  let stuck = 0;
  for (const id of entries) {
    const sessionDir = join(sessionsDir, id);
    const summary = loadSessionSummary(sessionDir);
    if (!summary || summary.status !== "running") continue;

    const lastLine = await readLastLineOfLog(sessionDir);
    if (!lastLine) continue;

    const lastEventAt = parseEventTimestamp(lastLine);
    if (!lastEventAt) continue;

    const lastEventMs = Date.parse(lastEventAt);
    if (!Number.isFinite(lastEventMs)) continue;

    const elapsedSeconds = (now() - lastEventMs) / 1000;
    if (elapsedSeconds >= stuckThresholdSeconds) {
      await events.append("session.stuck", {
        session_id: summary.id,
        last_event_at: lastEventAt,
        elapsed: Math.round(elapsedSeconds),
      });
      stuck++;
    }
  }

  return stuck;
}

export async function refreshProviderHealth(
  providerRegistry: ProviderRegistry,
  providerHealth: InMemoryProviderHealthStore,
  events: EventWriter,
): Promise<number> {
  const adapters = providerRegistry.list();
  let refreshed = 0;

  for (const adapter of adapters) {
    if (!adapter.capabilities.quotaProbe) continue;

    const probeQuota = adapter.probeQuota;
    if (!probeQuota) continue;

    try {
      const snapshot = await probeQuota("health-check");
      providerHealth.setQuota(adapter.id, {
        remaining: snapshot.remaining,
        resetsAt: snapshot.resetsAt,
      });
      await events.append("provider.quota", {
        provider_id: adapter.id,
        remaining: snapshot.remaining,
        total: snapshot.total,
        resets_at: snapshot.resetsAt,
        currency: snapshot.currency ?? "tokens",
        probed_at: snapshot.probedAt,
      });
      refreshed++;
    } catch {
      // Quota probe failed — health store is not updated; error is logged via event if needed
    }
  }

  return refreshed;
}

/**
 * Advance the `next_run_at` of a monitor based on its cadence.
 */
function advanceMonitorNextRun(
  cadence: { cron?: string } | string,
  currentNextRun: string,
): string {
  const msPerUnit: Record<string, number> = {
    hourly: 3_600_000,
    daily: 86_400_000,
    weekly: 604_800_000,
    monthly: 2_629_746_000,
  };
  const current = new Date(currentNextRun).getTime();
  if (typeof cadence === "string" && msPerUnit[cadence]) {
    return new Date(current + msPerUnit[cadence]!).toISOString();
  }
  // For cron cadence, advance by the smallest unit (hourly) as a safe approximation;
  // full cron resolution is not available without a cron library.
  return new Date(current + msPerUnit["hourly"]!).toISOString();
}

/**
 * Scan active research monitors and fire any whose `next_run_at` has passed.
 * Creates a research run for each due monitor and emits `incubation.monitor.update`.
 */
export async function tickIncubationMonitors(
  db: Database,
  events: EventWriter,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  const monitorReg = new ResearchMonitorRegistry(db);
  const runReg = new ResearchRunRegistry(db);

  const monitors = monitorReg.listActive();
  const currentTime = now();
  let fired = 0;

  for (const monitor of monitors) {
    if (monitor.next_run_at > currentTime) continue;

    // Create a research run for this monitor tick
    const runInput: CreateResearchRunInput = {
      item_id: monitor.item_id,
      mode: "source_synthesis",
      question: monitor.question,
      source_plan: monitor.source_plan,
      monitor_id: monitor.id,
    };
    const run = runReg.create(runInput);

    // Advance next_run_at
    const nextRun = advanceMonitorNextRun(monitor.cadence, monitor.next_run_at);
    monitorReg.updateNextRun(monitor.id, nextRun);

    await events.append("incubation.monitor.update", {
      monitor_id: monitor.id,
      research_run_id: run.id,
      item_id: monitor.item_id,
      next_run_at: nextRun,
      fired_at: now(),
    });

    fired++;
  }

  return fired;
}

/**
 * Scan active (running) sessions and proactively emit `scheduler.burn_rate_exceeded`
 * for any whose burn-rate probe indicates the threshold is already breached.
 */
export async function watchSessionBurnRates(
  sessionsDir: string,
  events: EventWriter,
  burnRateProbe: (sessionId: string) => BurnRateSample | Promise<BurnRateSample | null> | null,
  maxTokensSinceCommit: number,
  minCommitsPerHour: number,
): Promise<number> {
  if (!existsSync(sessionsDir)) return 0;

  let entries: string[];
  try {
    entries = readdirSync(sessionsDir);
  } catch {
    return 0;
  }

  let exceeded = 0;
  for (const id of entries) {
    const sessionDir = join(sessionsDir, id);
    const summary = loadSessionSummary(sessionDir);
    if (!summary || summary.status !== "running") continue;

    let sample: BurnRateSample | null | Promise<BurnRateSample | null> | null;
    try {
      sample = burnRateProbe(summary.id);
      if (sample instanceof Promise) sample = await sample;
    } catch {
      continue;
    }
    if (!sample) continue;

    const tokensExceeded = sample.tokensSinceLastCommit > maxTokensSinceCommit;
    const commitsExceeded = sample.commitsPerHour < minCommitsPerHour;
    if (!tokensExceeded && !commitsExceeded) continue;

    await events.append("scheduler.burn_rate_exceeded", {
      session_id: summary.id,
      ...(tokensExceeded
        ? { observed: sample.tokensSinceLastCommit, threshold: maxTokensSinceCommit, metric: "tokens_since_last_commit" }
        : { observed: sample.commitsPerHour, threshold: minCommitsPerHour, metric: "commits_per_hour" }),
    });
    exceeded++;
  }

  return exceeded;
}

export type WatchdogJobs = {
  detectStuckSessions(
    sessionsDir: string,
    stuckThresholdSeconds: number,
    events: EventWriter,
    now?: () => number,
  ): Promise<number>;
  recoverCrashedSessions(sessionsDir: string, events: EventWriter): Promise<number>;
  refreshProviderHealth(
    providerRegistry: ProviderRegistry,
    providerHealth: InMemoryProviderHealthStore,
    events: EventWriter,
  ): Promise<number>;
  /**
   * Scan active research monitors and fire any whose `next_run_at` has passed.
   * Creates a research run for each due monitor and emits `incubation.monitor.update`.
   */
  tickIncubationMonitors(
    db: Database,
    events: EventWriter,
    now?: () => string,
  ): Promise<number>;
  /**
   * Scan active sessions and proactively emit `scheduler.burn_rate_exceeded` for any
   * whose burn-rate probe indicates the threshold is already breached.
   * Unlike the gate-check at permit-acquire time, this catches sessions that have been
   * running a long time without requesting new permits.
   */
  watchSessionBurnRates(
    sessionsDir: string,
    events: EventWriter,
    burnRateProbe: (sessionId: string) => BurnRateSample | Promise<BurnRateSample | null> | null,
    maxTokensSinceCommit: number,
    minCommitsPerHour: number,
  ): Promise<number>;
};