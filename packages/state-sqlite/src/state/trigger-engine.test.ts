import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { openDatabase } from "./database.ts";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { createEventWriter, type EventWriter } from "../events/append-and-project.ts";
import { EventCountsProjector, type Projector } from "./projector.ts";
import {
  executeRefreshProjection,
  emitTriggerFired,
  emitTriggerFailed,
  emitTriggerSkipped,
  parseDurationToMs,
  getNextFireTime,
  type TriggerEngineDeps,
  type RefreshProjectionTarget,
} from "./trigger-engine.ts";

function makeDeps(tmp: string): TriggerEngineDeps {
  const dbPath = join(tmp, "db.sqlite");
  const logPath = join(tmp, "log.jsonl");
  const { db } = openDatabase(dbPath);
  const store = new JsonlEventStore(logPath);
  const projectors: readonly Projector[] = [new EventCountsProjector()];
  const events = createEventWriter({
    db,
    store,
    projectors,
    nextId: () => `evt_${Math.random().toString(36).slice(2, 10)}`,
  });
  return { db, store, projectors, events };
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "aloop-trigger-engine-"));
}

describe("executeRefreshProjection", () => {
  let tmp: string;
  let deps: TriggerEngineDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    deps.store.close();
    deps.db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("throws when no projectors match", async () => {
    await expect(executeRefreshProjection(deps, { projection_name: "nonexistent" })).rejects.toThrow(
      'No projector found for projection_name="nonexistent"',
    );
  });

  test("refreshes all projectors when name is '*'", async () => {
    const result = await executeRefreshProjection(deps, { projection_name: "*" });
    expect(result.refreshed).toBeGreaterThanOrEqual(0);
  });

  test("refreshes a named projector", async () => {
    const result = await executeRefreshProjection(deps, { projection_name: "event_counts" });
    expect(result.refreshed).toBe(0);
  });

  test("refreshes projector with events", async () => {
    await deps.events.append("test.topic", { key: "value1" });
    await deps.events.append("test.topic", { key: "value2" });

    const result = await executeRefreshProjection(deps, { projection_name: "event_counts" });
    expect(result.refreshed).toBe(2);
  });
});

describe("emitTriggerFired", () => {
  let tmp: string;
  let deps: TriggerEngineDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    deps.store.close();
    deps.db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("emits trigger.fired event", async () => {
    await emitTriggerFired(deps.events, "tr_abc123", "refresh_projection");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const fired = events.find((e: unknown) => (e as { topic: string }).topic === "trigger.fired");
    expect(fired).toBeDefined();
    const env = fired as { topic: string; data: { trigger_id: string; action_kind: string; fired_at: string } };
    expect(env.data.trigger_id).toBe("tr_abc123");
    expect(env.data.action_kind).toBe("refresh_projection");
    expect(env.data.fired_at).toBeString();
  });
});

describe("emitTriggerFailed", () => {
  let tmp: string;
  let deps: TriggerEngineDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    deps.store.close();
    deps.db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("emits trigger.failed event", async () => {
    await emitTriggerFailed(deps.events, "tr_abc123", "refresh_projection", "projection not found");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const failed = events.find((e: unknown) => (e as { topic: string }).topic === "trigger.failed");
    expect(failed).toBeDefined();
    const env = failed as {
      topic: string;
      data: { trigger_id: string; action_kind: string; error: string; failed_at: string };
    };
    expect(env.data.trigger_id).toBe("tr_abc123");
    expect(env.data.action_kind).toBe("refresh_projection");
    expect(env.data.error).toBe("projection not found");
    expect(env.data.failed_at).toBeString();
  });
});

describe("emitTriggerSkipped", () => {
  let tmp: string;
  let deps: TriggerEngineDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    deps.store.close();
    deps.db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("emits trigger.skipped event with reason and details", async () => {
    await emitTriggerSkipped(deps.events, "tr_abc123", "debounce_active", {
      next_fire_at: "2025-01-01T00:00:00.000Z",
    });

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const skipped = events.find((e: unknown) => (e as { topic: string }).topic === "trigger.skipped");
    expect(skipped).toBeDefined();
    const env = skipped as {
      topic: string;
      data: { trigger_id: string; reason: string; details: Record<string, unknown>; skipped_at: string };
    };
    expect(env.data.trigger_id).toBe("tr_abc123");
    expect(env.data.reason).toBe("debounce_active");
    expect(env.data.details).toEqual({ next_fire_at: "2025-01-01T00:00:00.000Z" });
    expect(env.data.skipped_at).toBeString();
  });

  test("emits trigger.skipped event without details", async () => {
    await emitTriggerSkipped(deps.events, "tr_xyz789", "disabled");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const skipped = events.find((e: unknown) => (e as { topic: string }).topic === "trigger.skipped");
    expect(skipped).toBeDefined();
    const env = skipped as {
      topic: string;
      data: { trigger_id: string; reason: string; details?: Record<string, unknown>; skipped_at: string };
    };
    expect(env.data.trigger_id).toBe("tr_xyz789");
    expect(env.data.reason).toBe("disabled");
    expect(env.data.details).toBeUndefined();
    expect(env.data.skipped_at).toBeString();
  });
});

describe("parseDurationToMs", () => {
  test("parses P7D (7 days)", () => {
    expect(parseDurationToMs("P7D")).toBe(7 * 86400000);
  });

  test("parses PT1H (1 hour)", () => {
    expect(parseDurationToMs("PT1H")).toBe(3600000);
  });

  test("parses PT30M (30 minutes)", () => {
    expect(parseDurationToMs("PT30M")).toBe(1800000);
  });

  test("parses P1DT2H (1 day 2 hours)", () => {
    expect(parseDurationToMs("P1DT2H")).toBe(86400000 + 7200000);
  });

  test("parses PT5M (5 minutes)", () => {
    expect(parseDurationToMs("PT5M")).toBe(300000);
  });

  test("returns null for invalid format", () => {
    expect(parseDurationToMs("invalid")).toBeNull();
  });
});

describe("getNextFireTime", () => {
  test("returns future time when lastFiredAt is null", () => {
    const result = getNextFireTime("PT1H", null);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  test("returns now when elapsed time >= schedule interval", () => {
    const past = new Date(Date.now() - 7200000).toISOString();
    const result = getNextFireTime("PT1H", past);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("returns null for invalid schedule", () => {
    const result = getNextFireTime("invalid", null);
    expect(result).toBeNull();
  });
});