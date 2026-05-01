import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventWriter } from "@aloop/state-sqlite";
import type { InMemoryProviderHealthStore } from "@aloop/provider";
import type { ProviderRegistry } from "@aloop/provider";
import type { ProviderAdapter } from "@aloop/provider";

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
};