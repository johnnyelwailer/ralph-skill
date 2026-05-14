import type { Database } from "bun:sqlite";
import type { EventEnvelope, EventStore } from "@aloop/core";
import type { EventWriter } from "../events/append-and-project.ts";
import type { Projector } from "./projector.ts";
import { runProjector } from "./projector.ts";

export type TriggerEngineDeps = {
  readonly db: Database;
  readonly store: EventStore;
  readonly events: EventWriter;
  readonly projectors: readonly Projector[];
};

export type RefreshProjectionTarget = {
  readonly projection_name: string;
  readonly scope_kind?: "project" | "workspace" | "artifact" | "global";
  readonly scope_id?: string | null;
};

function scopeMatchesEventScope(
  eventScope: { kind: string; id: string | null | undefined },
  targetScope: { kind?: string; id?: string | null | undefined } | undefined,
): boolean {
  if (!targetScope) return true;
  if (targetScope.kind && eventScope.kind !== targetScope.kind) return false;
  if (targetScope.id !== undefined && eventScope.id !== targetScope.id) return false;
  return true;
}

function filterEventsByScope(
  events: AsyncIterable<EventEnvelope>,
  targetScope: { kind?: string; id?: string | null | undefined } | undefined,
): AsyncIterable<EventEnvelope> {
  if (!targetScope || (!targetScope.kind && !targetScope.id)) return events;

  return (async function* () {
    for await (const event of events) {
      const eventScope = (event.data as Record<string, unknown>).__scope as
        | { kind: string; id: string | null | undefined }
        | undefined;
      if (!eventScope) {
        const project_id = (event.data as Record<string, unknown>).project_id as string | undefined;
        if (targetScope.kind === "project" && targetScope.id !== undefined && project_id === targetScope.id) {
          yield event;
        }
        continue;
      }
      if (scopeMatchesEventScope(eventScope, targetScope)) {
        yield event;
      }
    }
  })();
}

export async function executeRefreshProjection(
  deps: TriggerEngineDeps,
  target: RefreshProjectionTarget,
): Promise<{ refreshed: number }> {
  const { db, store, projectors } = deps;

  const matchingProjectors = projectors.filter((p) => {
    if (target.projection_name === "*") return true;
    return p.name === target.projection_name;
  });

  if (matchingProjectors.length === 0) {
    return { refreshed: 0 };
  }

  const scopeFilter = target.scope_kind
    ? { kind: target.scope_kind, id: target.scope_id }
    : undefined;

  const scopeTarget = target.scope_kind
    ? { kind: target.scope_kind, id: target.scope_id }
    : undefined;

  let total = 0;

  for (const projector of matchingProjectors) {
    const rawEvents = store.read();
    const events = filterEventsByScope(rawEvents, scopeTarget);
    const count = await runProjector(db, projector, events);
    total += count;
  }

  return { refreshed: total };
}

export async function emitTriggerFired(
  events: EventWriter,
  trigger_id: string,
  action_kind: string,
): Promise<void> {
  await events.append("trigger.fired", {
    trigger_id,
    action_kind,
    fired_at: new Date().toISOString(),
  });
}

export async function emitTriggerFailed(
  events: EventWriter,
  trigger_id: string,
  action_kind: string,
  error: string,
): Promise<void> {
  await events.append("trigger.failed", {
    trigger_id,
    action_kind,
    error,
    failed_at: new Date().toISOString(),
  });
}

export function parseDurationToMs(duration: string): number | null {
  const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseInt(match[4] || "0", 10);
  return (days * 86400000) + (hours * 3600000) + (minutes * 60000) + (seconds * 1000);
}

export function getNextFireTime(schedule: string, lastFiredAt: string | null): Date | null {
  const intervalMs = parseDurationToMs(schedule);
  if (intervalMs === null) return null;

  if (!lastFiredAt) {
    return new Date(Date.now() + intervalMs);
  }

  const last = new Date(lastFiredAt).getTime();
  const now = Date.now();

  if (last > now) {
    return new Date(last + intervalMs);
  }

  const elapsed = now - last;
  const fireCount = Math.floor(elapsed / intervalMs);
  const nextFire = last + ((fireCount + 1) * intervalMs);
  return new Date(nextFire);
}