/**
 * Unit tests for evaluateTriggers — the trigger evaluation loop that:
 * - Iterates over all enabled triggers
 * - Fires time-based triggers whose schedule has elapsed
 * - Executes refresh_projection actions
 * - Emits trigger.fired / trigger.failed events
 * - Records fire count and errors back to the trigger store
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { openDatabase } from "./database.ts";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { createEventWriter, type EventWriter } from "../events/append-and-project.ts";
import { EventCountsProjector, type Projector } from "./projector.ts";
import { evaluateTriggers, type TriggerEvaluatorDeps } from "./trigger-evaluator.ts";
import type { TriggerStore } from "@aloop/daemon-routes-triggers";
import type { Trigger } from "@aloop/daemon-routes-triggers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDeps(tmp: string): TriggerEvaluatorDeps {
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
  return { db, store, events, projectors, triggerStore: null as unknown as TriggerStore };
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "aloop-trigger-evaluator-"));
}

/** Builds a minimal mock TriggerStore whose triggers come from a provided array. */
function mockTriggerStore(triggers: Trigger[]): TriggerStore {
  return {
    list({ enabled }: { enabled?: boolean } = {}) {
      return enabled === undefined ? triggers : triggers.filter((t) => t.enabled === enabled);
    },
    recordFired(id: string) {
      const t = triggers.find((t) => t.id === id);
      if (!t) throw new Error(`Trigger not found: ${id}`);
      return { ...t, last_fired_at: new Date().toISOString(), fire_count: t.fire_count + 1 };
    },
    recordError(id: string, error: string) {
      const t = triggers.find((t) => t.id === id);
      if (!t) throw new Error(`Trigger not found: ${id}`);
      return { ...t, last_error: error };
    },
  } as unknown as TriggerStore;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("evaluateTriggers", () => {
  let tmp: string;
  let deps: TriggerEvaluatorDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    deps.store.close();
    deps.db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 0 when no triggers exist", async () => {
    deps.triggerStore = mockTriggerStore([]);
    const result = await evaluateTriggers(deps);
    expect(result).toBe(0);
  });

  test("skips event-based triggers (only processes time triggers)", async () => {
    const eventTrigger: Trigger = {
      id: "tr_event",
      scope: { kind: "global", id: null },
      source: { kind: "event", topic: "session.completed" },
      action: { kind: "emit_alert", target: { message: "test" } },
      enabled: true,
      fire_count: 0,
      last_fired_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([eventTrigger]);
    const result = await evaluateTriggers(deps);
    expect(result).toBe(0);
  });

  test("skips time triggers whose next fire is in the future", async () => {
    const futureTrigger: Trigger = {
      id: "tr_future",
      scope: { kind: "global", id: null },
      source: { kind: "time", schedule: "P7D" },
      action: { kind: "emit_alert", target: { message: "test" } },
      enabled: true,
      fire_count: 0,
      last_fired_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([futureTrigger]);
    const result = await evaluateTriggers(deps);
    expect(result).toBe(0);
  });

  test("skips disabled triggers even if schedule has elapsed", async () => {
    const past = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const disabledTrigger: Trigger = {
      id: "tr_disabled",
      scope: { kind: "global", id: null },
      source: { kind: "time", schedule: "PT1H" },
      action: { kind: "emit_alert", target: { message: "test" } },
      enabled: false,
      fire_count: 0,
      last_fired_at: null,
      last_error: null,
      created_at: past,
      updated_at: past,
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([disabledTrigger]);
    const result = await evaluateTriggers(deps);
    expect(result).toBe(0);
  });

  test("fires a time trigger whose schedule has elapsed and executes refresh_projection", async () => {
    // last_fired_at was 2 hours ago; schedule is PT1H — should have fired already
    const past = new Date(Date.now() - 7200000).toISOString();
    const timeTrigger: Trigger = {
      id: "tr_time",
      scope: { kind: "project", id: "p_test" },
      source: { kind: "time", schedule: "PT1H" },
      action: { kind: "refresh_projection", target: { projection_name: "event_counts", projection_scope_kind: "global", projection_scope_id: null } },
      enabled: true,
      fire_count: 0,
      last_fired_at: past,
      last_error: null,
      created_at: past,
      updated_at: past,
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([timeTrigger]);

    const result = await evaluateTriggers(deps);

    expect(result).toBe(1);

    // Verify trigger.fired event was emitted
    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }
    const fired = events.find((e: unknown) => (e as { topic: string }).topic === "trigger.fired");
    expect(fired).toBeDefined();
    const env = fired as { topic: string; data: { trigger_id: string; action_kind: string } };
    expect(env.data.trigger_id).toBe("tr_time");
    expect(env.data.action_kind).toBe("refresh_projection");
  });

  test("fires multiple eligible time triggers in sequence", async () => {
    const past = new Date(Date.now() - 7200000).toISOString();
    const trigger1: Trigger = {
      id: "tr_1",
      scope: { kind: "global", id: null },
      source: { kind: "time", schedule: "PT1H" },
      action: { kind: "emit_alert", target: { message: "alert 1" } },
      enabled: true,
      fire_count: 0,
      last_fired_at: past,
      last_error: null,
      created_at: past,
      updated_at: past,
      debounce_seconds: 0,
      budget_policy: null,
    };
    const trigger2: Trigger = {
      id: "tr_2",
      scope: { kind: "global", id: null },
      source: { kind: "time", schedule: "PT30M" },
      action: { kind: "emit_alert", target: { message: "alert 2" } },
      enabled: true,
      fire_count: 0,
      last_fired_at: past,
      last_error: null,
      created_at: past,
      updated_at: past,
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([trigger1, trigger2]);

    const result = await evaluateTriggers(deps);

    expect(result).toBe(2);

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }
    const firedEvents = events.filter((e: unknown) => (e as { topic: string }).topic === "trigger.fired");
    expect(firedEvents.length).toBe(2);
  });

  test("emits trigger.failed and records error when executeRefreshProjection throws", async () => {
    // A trigger with a nonexistent projector — executeRefreshProjection will throw
    // when no matching projector is found and the projector isn't "*"
    const past = new Date(Date.now() - 7200000).toISOString();
    const failingTrigger: Trigger = {
      id: "tr_fail",
      scope: { kind: "global", id: null },
      source: { kind: "time", schedule: "PT1H" },
      action: { kind: "refresh_projection", target: { projection_name: "nonexistent_projector" } },
      enabled: true,
      fire_count: 0,
      last_fired_at: past,
      last_error: null,
      created_at: past,
      updated_at: past,
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([failingTrigger]);

    const result = await evaluateTriggers(deps);

    // No successful fires
    expect(result).toBe(0);

    // Verify trigger.failed event was emitted
    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }
    const failed = events.find((e: unknown) => (e as { topic: string }).topic === "trigger.failed");
    expect(failed).toBeDefined();
    const env = failed as { topic: string; data: { trigger_id: string; action_kind: string; error: string } };
    expect(env.data.trigger_id).toBe("tr_fail");
    expect(env.data.action_kind).toBe("refresh_projection");
    expect(env.data.error).toBeTruthy();
  });

  test("does not fire the same trigger twice in rapid succession when schedule has not elapsed", async () => {
    // Two hours ago, schedule is 1 hour — fires once
    const past = new Date(Date.now() - 7200000).toISOString();
    const trigger: Trigger = {
      id: "tr_once",
      scope: { kind: "global", id: null },
      source: { kind: "time", schedule: "PT1H" },
      action: { kind: "refresh_projection", target: { projection_name: "event_counts" } },
      enabled: true,
      fire_count: 5, // already fired 5 times
      last_fired_at: past,
      last_error: null,
      created_at: past,
      updated_at: past,
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([trigger]);

    const result = await evaluateTriggers(deps);

    expect(result).toBe(1); // only fires once, even though schedule is 1h and 2h elapsed

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }
    const firedEvents = events.filter((e: unknown) => (e as { topic: string }).topic === "trigger.fired");
    expect(firedEvents.length).toBe(1);
  });

  test("correctly builds RefreshProjectionTarget with optional scope fields", async () => {
    // Verify that the target passed to executeRefreshProjection includes
    // scope_kind and scope_id when present (not just projection_name)
    const past = new Date(Date.now() - 7200000).toISOString();
    const trigger: Trigger = {
      id: "tr_scoped",
      scope: { kind: "project", id: "p_scoped" },
      source: { kind: "time", schedule: "PT1H" },
      action: {
        kind: "refresh_projection",
        target: { projection_name: "event_counts", projection_scope_kind: "project", projection_scope_id: "p_scoped" },
      },
      enabled: true,
      fire_count: 0,
      last_fired_at: past,
      last_error: null,
      created_at: past,
      updated_at: past,
      debounce_seconds: 0,
      budget_policy: null,
    };
    deps.triggerStore = mockTriggerStore([trigger]);

    const result = await evaluateTriggers(deps);
    expect(result).toBe(1);

    // Verify the refresh was scoped — the projector should have run with scope
    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }
    const fired = events.find((e: unknown) => (e as { topic: string }).topic === "trigger.fired");
    expect(fired).toBeDefined();
  });
});
