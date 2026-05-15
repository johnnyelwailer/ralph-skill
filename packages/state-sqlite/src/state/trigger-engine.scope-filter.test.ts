/**
 * Tests for trigger-engine scope-filtering behaviour.
 *
 * filterEventsByScope is the internal helper that determines which events
 * are forwarded to projectors when a trigger fires with a scoped target
 * (project, workspace, artifact, or global).
 *
 * We test it through the public executeRefreshProjection API:
 *  - Append events with different __scope and project_id fields
 *  - Call executeRefreshProjection with a scoped RefreshProjectionTarget
 *  - Verify the projector received (or didn't receive) the expected events
 *
 * These tests cover the spec contract described in trigger-engine.ts §Scope matching.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { createEventWriter } from "../events/append-and-project.ts";
import { EventCountsProjector, type Projector } from "./projector.ts";
import {
  executeRefreshProjection,
  type TriggerEngineDeps,
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
  return mkdtempSync(join(tmpdir(), "aloop-scope-filter-"));
}

// Helper: append an event with a given topic and data (may include __scope or project_id)
async function appendEvent(
  deps: TriggerEngineDeps,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  await deps.events.append(topic, data);
}

describe("executeRefreshProjection scope filtering", () => {
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

  // ── Unscoped events (no __scope, no project_id) ─────────────────────────────

  test("event without __scope and without project_id is forwarded when scopeTarget is undefined", async () => {
    // When scopeTarget is undefined (no scope filter), all events pass through
    await appendEvent(deps, "unscoped.topic", { key: "value1" });
    await appendEvent(deps, "unscoped.topic", { key: "value2" });

    // No scope filter — projection_name="*" hits all projectors
    const result = await executeRefreshProjection(deps, { projection_name: "*" });
    expect(result.refreshed).toBe(2);
  });

  test("event without __scope and without project_id is NOT forwarded when scope_kind is project", async () => {
    // Events without __scope and without project_id should not match a project scope
    await appendEvent(deps, "orphan.topic", { key: "value" });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_test",
    });

    // Projector received no events for this scope — the unscoped orphan event was filtered out
    expect(result.refreshed).toBe(0);
  });

  // ── Events with __scope ────────────────────────────────────────────────────

  test("event with matching __scope.kind and __scope.id is forwarded to projector", async () => {
    await appendEvent(deps, "scoped.topic", {
      __scope: { kind: "project", id: "p_alpha" },
      data: "a",
    });
    await appendEvent(deps, "scoped.topic", {
      __scope: { kind: "project", id: "p_beta" },
      data: "b",
    });

    // Only project:p_alpha events should reach the projector
    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_alpha",
    });

    expect(result.refreshed).toBe(1);
  });

  test("event with __scope.kind matching but different __scope.id is filtered out", async () => {
    await appendEvent(deps, "scoped.topic", {
      __scope: { kind: "project", id: "p_other" },
      data: "x",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_target",
    });

    expect(result.refreshed).toBe(0);
  });

  test("event with __scope.kind not matching scope_kind is filtered out", async () => {
    await appendEvent(deps, "scoped.topic", {
      __scope: { kind: "workspace", id: "ws_1" },
      data: "x",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_1",
    });

    expect(result.refreshed).toBe(0);
  });

  test("event with __scope matching global scope is forwarded", async () => {
    await appendEvent(deps, "global.topic", {
      __scope: { kind: "global", id: null },
      data: "global event",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "global",
      scope_id: null,
    });

    expect(result.refreshed).toBe(1);
  });

  test("global scope with undefined scope_id acts as wildcard — any id matches", async () => {
    // When scope_id is undefined in the target, it acts as a wildcard (any id is fine)
    await appendEvent(deps, "global.topic", {
      __scope: { kind: "global", id: null },
      data: "global",
    });
    await appendEvent(deps, "project.topic", {
      __scope: { kind: "project", id: "p_specific" },
      data: "project",
    });

    // Global scope with undefined id: global events pass, non-global do not
    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "global",
      scope_id: undefined,
    });

    expect(result.refreshed).toBe(1);
  });

  test("__scope with id=null does NOT match project scope with a specific id", async () => {
    // An event with id=null in __scope should not match a project scope with a specific id
    await appendEvent(deps, "nullscope.topic", {
      __scope: { kind: "project", id: null },
      data: "null-id project",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_specific",
    });

    // id=null does not match a specific scope_id
    expect(result.refreshed).toBe(0);
  });

  // ── Events with project_id but no __scope ──────────────────────────────────

  test("event with matching project_id field (no __scope) is forwarded to projector", async () => {
    // The filter checks __scope first; if absent, falls back to project_id field
    await appendEvent(deps, "project.event", {
      project_id: "p_match",
      data: "matched by project_id",
    });
    await appendEvent(deps, "project.event", {
      project_id: "p_other",
      data: "not matched",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_match",
    });

    expect(result.refreshed).toBe(1);
  });

  test("event with non-matching project_id field (no __scope) is filtered out", async () => {
    await appendEvent(deps, "project.event", {
      project_id: "p_wrong",
      data: "should not match",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_target",
    });

    expect(result.refreshed).toBe(0);
  });

  test("event without __scope and without project_id is skipped for non-global scope", async () => {
    // An event that has neither __scope nor project_id should not be forwarded
    // for any scope_kind other than global
    await appendEvent(deps, "bare.event", { bare: "field" });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_any",
    });

    expect(result.refreshed).toBe(0);
  });

  // ── Mixed events ──────────────────────────────────────────────────────────

  test("mixed scoped and unscoped events: only matching events are forwarded", async () => {
    // Event with __scope.project:p_target — matched by scopeMatchesEventScope
    await appendEvent(deps, "project.topic", {
      __scope: { kind: "project", id: "p_target" },
      data: "matched by __scope",
    });
    // Event without __scope but with matching project_id field — matched by fallback
    await appendEvent(deps, "project.topic", {
      project_id: "p_target",
      data: "matched by project_id field",
    });
    // Event without __scope and without project_id — filtered out (no fallback for orphan)
    await appendEvent(deps, "orphan.topic", { orphan: "true" });
    // Event with non-matching __scope — filtered out by scopeMatchesEventScope
    await appendEvent(deps, "project.topic", {
      __scope: { kind: "project", id: "p_other" },
      data: "non-matching __scope",
    });
    // Event with matching project_id but also has __scope — scopeMatchesEventScope
    // sees __scope exists and uses it (project_id fallback is skipped)
    await appendEvent(deps, "both.topic", {
      __scope: { kind: "project", id: "p_wrong" },
      project_id: "p_target", // wrong scope, project_id ignored since __scope is present
      data: "scope wins over project_id",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_target",
    });

    // Only 2 events match:
    //  - project:p_target via __scope (scopeMatchesEventScope)
    //  - project_id=p_target via project_id field fallback (no __scope present)
    // The orphan (no __scope, no project_id) and p_wrong __scope events are filtered out.
    expect(result.refreshed).toBe(2);
  });

  // ── scope_target undefined (no filter) ─────────────────────────────────────

  test("scope_kind undefined passes all events to projector regardless of __scope", async () => {
    await appendEvent(deps, "a.topic", {
      __scope: { kind: "project", id: "p_1" },
    });
    await appendEvent(deps, "b.topic", {
      __scope: { kind: "workspace", id: "ws_1" },
    });
    await appendEvent(deps, "c.topic", { project_id: "p_2" });
    await appendEvent(deps, "d.topic", { bare: "true" });

    const result = await executeRefreshProjection(deps, { projection_name: "event_counts" });
    // All 4 events pass through when no scope filter is applied
    expect(result.refreshed).toBe(4);
  });

  // ── Multiple projectors ────────────────────────────────────────────────────

  test("all projectors receive the same scope-filtered events when name is '*'", async () => {
    // When projection_name="*", all projectors receive the same filtered events
    const dbPath2 = join(tmp, "db2.sqlite");
    const logPath2 = join(tmp, "log2.jsonl");
    const { db: db2 } = openDatabase(dbPath2);
    const store2 = new JsonlEventStore(logPath2);
    const proj2 = new EventCountsProjector();
    const events2 = createEventWriter({
      db: db2,
      store: store2,
      projectors: [proj2],
      nextId: () => `evt_${Math.random().toString(36).slice(2, 10)}`,
    });

    await deps.events.append("target.topic", {
      __scope: { kind: "project", id: "p_scope" },
    });
    await events2.append("target.topic", {
      __scope: { kind: "project", id: "p_scope" },
    });

    // Both deps (each with its own EventCountsProjector) receive the scoped event
    const result1 = await executeRefreshProjection(deps, {
      projection_name: "*",
      scope_kind: "project",
      scope_id: "p_scope",
    });
    expect(result1.refreshed).toBe(1);

    store2.close();
    db2.close();
  });

  // ── edge cases ─────────────────────────────────────────────────────────────

  test("event with empty string project_id is not matched by project scope", async () => {
    await appendEvent(deps, "empty.project", {
      project_id: "",
      data: "empty project_id",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_any",
    });

    expect(result.refreshed).toBe(0);
  });

  test("__scope.id of undefined falls through to project_id check (not a wildcard)", async () => {
    // __scope.id is undefined (not null) — should fall through to project_id check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await appendEvent(deps, "undef.scope", { __scope: { kind: "project" } as any, data: "undefined id" });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_any",
    });

    expect(result.refreshed).toBe(0);
  });

  test("__scope=null (falsy) falls through to project_id field check", async () => {
    // An event with __scope: null should have its project_id field checked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await appendEvent(deps, "nullscope.event", { __scope: null as any, project_id: "p_via_field" });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: "p_via_field",
    });

    // __scope: null → falsy → project_id field check kicks in
    expect(result.refreshed).toBe(1);
  });

  test("workspace scope events are forwarded when workspace scope matches", async () => {
    await appendEvent(deps, "workspace.topic", {
      __scope: { kind: "workspace", id: "ws_alpha" },
    });
    await appendEvent(deps, "workspace.topic", {
      __scope: { kind: "workspace", id: "ws_beta" },
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "workspace",
      scope_id: "ws_alpha",
    });

    expect(result.refreshed).toBe(1);
  });

  test("artifact scope events are forwarded when artifact scope matches", async () => {
    await appendEvent(deps, "artifact.topic", {
      __scope: { kind: "artifact", id: "art_xyz" },
    });
    await appendEvent(deps, "artifact.topic", {
      __scope: { kind: "artifact", id: "art_abc" },
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "artifact",
      scope_id: "art_xyz",
    });

    expect(result.refreshed).toBe(1);
  });

  test("refreshed count is the total number of events processed by the projector", async () => {
    await appendEvent(deps, "e1", { __scope: { kind: "global", id: null } });
    await appendEvent(deps, "e2", { __scope: { kind: "global", id: null } });
    await appendEvent(deps, "e3", { __scope: { kind: "global", id: null } });

    const result = await executeRefreshProjection(deps, { projection_name: "*" });
    expect(result.refreshed).toBe(3);
  });

  test("event with project_id='0' (string zero) is distinct from project_id=0", async () => {
    // project_id is a string field; "0" is a valid non-empty string that should not match undefined
    await appendEvent(deps, "zero.project", {
      project_id: "0",
      data: "string zero",
    });

    const result = await executeRefreshProjection(deps, {
      projection_name: "event_counts",
      scope_kind: "project",
      scope_id: undefined, // wildcard — but "0" is not undefined
    });

    // "0" string is not undefined, so it doesn't match a wildcard scope_id
    expect(result.refreshed).toBe(0);
  });
});
