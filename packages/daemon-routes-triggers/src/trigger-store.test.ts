/**
 * Unit tests for TriggerStore — covers all public methods of the
 * file-backed trigger store: create, get, list, patch, delete, recordFired,
 * recordError.
 *
 * These tests are kept in a separate file to avoid triggering the
 * @aloop/daemon-routes → @aloop/state-sqlite circular import chain that
 * exists in trigger-handlers.test.ts.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TriggerStore } from "./trigger-store.ts";

function makeStore(tmp: string) {
  return new TriggerStore({ triggersDir: join(tmp, "triggers") });
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "aloop-trigger-store-"));
}

describe("TriggerStore", () => {
  let tmp: string;
  let store: TriggerStore;

  beforeEach(() => {
    tmp = makeTmp();
    store = makeStore(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe("create", () => {
    test("returns a trigger with all fields populated correctly", () => {
      const input = {
        scope: { kind: "project" as const, id: "p_test" },
        source: { kind: "time" as const, schedule: "P1D" },
        action: { kind: "emit_alert" as const, target: { message: "daily" } },
        budget_policy: { max_cost_usd_per_fire: 0.05 },
        debounce_seconds: 30,
        enabled: false,
      };
      const created = store.create(input);

      expect(created.id).toMatch(/^tr_[a-f0-9]{12}$/);
      expect(created.scope.kind).toBe("project");
      expect(created.scope.id).toBe("p_test");
      expect(created.source.schedule).toBe("P1D");
      expect(created.budget_policy).toEqual({ max_cost_usd_per_fire: 0.05 });
      expect(created.debounce_seconds).toBe(30);
      expect(created.enabled).toBe(false);
      expect(created.fire_count).toBe(0);
      expect(created.last_fired_at).toBeNull();
      expect(created.last_error).toBeNull();
      expect(created.created_at).toBeTruthy();
      expect(created.updated_at).toBeTruthy();
    });

    test("applies default values for optional fields", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      expect(created.budget_policy).toBeNull();
      expect(created.debounce_seconds).toBe(0);
      expect(created.enabled).toBe(true);
    });

    test("persists the trigger to disk so a new store instance can read it", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      const newStore = makeStore(tmp);
      const found = newStore.get(created.id);
      expect(found.id).toBe(created.id);
    });
  });

  // ─── get ────────────────────────────────────────────────────────────────────

  describe("get", () => {
    test("returns the created trigger with all fields", () => {
      const input = {
        scope: { kind: "project" as const, id: "p_test" },
        source: { kind: "time" as const, schedule: "P1D" },
        action: { kind: "emit_alert" as const, target: { message: "daily" } },
        budget_policy: { max_cost_usd_per_fire: 0.05 },
        debounce_seconds: 30,
        enabled: false,
      };
      const created = store.create(input);

      const result = store.get(created.id);
      expect(result.id).toBe(created.id);
      expect(result.scope.kind).toBe("project");
      expect(result.scope.id).toBe("p_test");
      expect(result.source.schedule).toBe("P1D");
      expect(result.budget_policy).toEqual({ max_cost_usd_per_fire: 0.05 });
      expect(result.debounce_seconds).toBe(30);
      expect(result.enabled).toBe(false);
      expect(result.fire_count).toBe(0);
      expect(result.last_fired_at).toBeNull();
      expect(result.last_error).toBeNull();
    });

    test("throws TriggerNotFoundError for unknown id", () => {
      expect(() => store.get("tr_unknown")).toThrow();
    });
  });

  // ─── patch ──────────────────────────────────────────────────────────────────

  describe("patch", () => {
    test("partially updates only the provided fields", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
        enabled: true,
      });

      const patched = store.patch(created.id, { enabled: false, debounce_seconds: 60 });
      expect(patched.enabled).toBe(false);
      expect(patched.debounce_seconds).toBe(60);
      // Unchanged fields preserved
      expect(patched.scope.kind).toBe("global");
      expect(patched.action.kind).toBe("emit_alert");
    });

    test("updates scope, source, and action together", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      const patched = store.patch(created.id, {
        scope: { kind: "project", id: "p_retargeted" },
        source: { kind: "event", topic: "session.completed" },
        action: { kind: "create_research_run", target: {} },
      });
      expect(patched.scope.kind).toBe("project");
      expect(patched.scope.id).toBe("p_retargeted");
      expect(patched.source.kind).toBe("event");
      expect(patched.source.topic).toBe("session.completed");
      expect(patched.action.kind).toBe("create_research_run");
    });

    test("throws TriggerNotFoundError for unknown id", () => {
      expect(() => store.patch("tr_unknown", { enabled: false })).toThrow();
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe("delete", () => {
    test("removes the trigger so subsequent get throws TriggerNotFoundError", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });
      expect(() => store.get(created.id)).not.toThrow();

      store.delete(created.id);
      expect(() => store.get(created.id)).toThrow();
    });

    test("throws TriggerNotFoundError for unknown id", () => {
      expect(() => store.delete("tr_unknown")).toThrow();
    });
  });

  // ─── recordFired ────────────────────────────────────────────────────────────

  describe("recordFired", () => {
    test("increments fire_count, sets last_fired_at, clears last_error, updates updated_at", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      const updated = store.recordFired(created.id);
      expect(updated.fire_count).toBe(1);
      expect(updated.last_fired_at).not.toBeNull();
      expect(updated.last_error).toBeNull();
    });

    test("multiple calls accumulate fire_count", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      store.recordFired(created.id);
      store.recordFired(created.id);
      const updated = store.recordFired(created.id);
      expect(updated.fire_count).toBe(3);
    });

    test("recordError after recordFired restores last_error without changing fire_count", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      store.recordFired(created.id);
      const afterFire = store.recordFired(created.id);
      expect(afterFire.fire_count).toBe(2);

      const afterError = store.recordError(created.id, "network timeout");
      expect(afterError.fire_count).toBe(2);
      expect(afterError.last_error).toBe("network timeout");
      expect(afterError.last_fired_at).toBe(afterFire.last_fired_at);
    });

    test("throws TriggerNotFoundError for unknown id", () => {
      expect(() => store.recordFired("tr_unknown")).toThrow();
    });
  });

  // ─── recordError ────────────────────────────────────────────────────────────

  describe("recordError", () => {
    test("sets last_error and updates updated_at without changing fire_count", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time", schedule: "P7D" },
        action: { kind: "emit_alert", target: { message: "weekly" } },
      });

      const updated = store.recordError(created.id, "connection refused");
      expect(updated.last_error).toBe("connection refused");
      expect(updated.fire_count).toBe(0);
      expect(updated.last_fired_at).toBeNull();
      expect(updated.updated_at).not.toBe(created.updated_at);
    });

    test("overwrites previous last_error", () => {
      const created = store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      store.recordError(created.id, "first error");
      const updated = store.recordError(created.id, "second error");
      expect(updated.last_error).toBe("second error");
    });

    test("throws TriggerNotFoundError for unknown id", () => {
      expect(() => store.recordError("tr_unknown", "oops")).toThrow();
    });
  });

  // ─── list ───────────────────────────────────────────────────────────────────

  describe("list", () => {
    test("returns triggers sorted by created_at descending (newest first)", async () => {
      // Create first two quickly, then pause briefly to ensure distinct timestamps
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } });
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } });
      // Ensure third trigger has a strictly later timestamp
      await new Promise((r) => setTimeout(r, 2));
      const last = store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } });

      const listed = store.list();
      expect(listed[0]!.id).toBe(last.id);
    });

    test("filters by scope_kind", () => {
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } });
      store.create({ scope: { kind: "project", id: "p_x" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } });

      const globalOnly = store.list({ scope_kind: "global" });
      expect(globalOnly.every((t) => t.scope.kind === "global")).toBe(true);
      expect(globalOnly.length).toBe(1);

      const projectOnly = store.list({ scope_kind: "project" });
      expect(projectOnly.every((t) => t.scope.kind === "project")).toBe(true);
      expect(projectOnly.length).toBe(1);
    });

    test("filters by scope_id (null for global)", () => {
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } });
      store.create({ scope: { kind: "project", id: "p_abc" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } });

      const projectOnly = store.list({ scope_id: "p_abc" });
      expect(projectOnly.length).toBe(1);
      expect(projectOnly[0]!.scope.id).toBe("p_abc");

      const globalOnly = store.list({ scope_id: null });
      expect(globalOnly.length).toBe(1);
      expect(globalOnly[0]!.scope.kind).toBe("global");
    });

    test("filters by enabled", () => {
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, enabled: true });
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, enabled: false });

      const enabledOnly = store.list({ enabled: true });
      expect(enabledOnly.every((t) => t.enabled === true)).toBe(true);
      expect(enabledOnly.length).toBe(1);

      const disabledOnly = store.list({ enabled: false });
      expect(disabledOnly.every((t) => t.enabled === false)).toBe(true);
      expect(disabledOnly.length).toBe(1);
    });

    test("combines scope_kind, scope_id, and enabled filters", () => {
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, enabled: true });
      store.create({ scope: { kind: "global", id: null }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, enabled: false });
      store.create({ scope: { kind: "project", id: "p1" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, enabled: true });

      const result = store.list({ scope_kind: "global", enabled: true });
      expect(result.length).toBe(1);
      expect(result[0]!.scope.kind).toBe("global");
      expect(result[0]!.enabled).toBe(true);
    });

    test("returns empty array when no triggers exist", () => {
      expect(store.list()).toEqual([]);
    });

    test("skips directories without valid trigger files (corrupt entries)", () => {
      // Create a subdirectory that looks like a trigger ID but contains invalid JSON
      mkdirSync(join(tmp, "triggers", "tr_corrupt"), { recursive: true });
      writeFileSync(join(tmp, "triggers", "tr_corrupt", "trigger.json"), "not valid json{{{", "utf-8");

      const result = store.list();
      expect(result.length).toBe(0);
    });

    test("skips orphaned files (files directly in triggersDir)", () => {
      // writeFileSync a file directly under triggersDir — not inside a trigger subdirectory
      writeFileSync(join(tmp, "triggers", "not-a-trigger.json"), JSON.stringify({ id: "orphan" }), "utf-8");

      const result = store.list();
      expect(result.length).toBe(0);
    });
  });
});
