import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleTriggers } from "./trigger-handlers.ts";
import { TriggerStore } from "./trigger-store.ts";
import type { TriggersDeps } from "./trigger-handlers.ts";

function makeStore(tmp: string) {
  return new TriggerStore({ triggersDir: join(tmp, "triggers") });
}

function makeDeps(tmp: string): TriggersDeps {
  return { store: makeStore(tmp) };
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "aloop-trigger-handlers-"));
}

function createTriggerReq(deps: TriggersDeps, body: object) {
  return new Request("http://localhost/v1/triggers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listReq(deps: TriggersDeps, query = "") {
  return new Request(`http://localhost/v1/triggers${query ? `?${query}` : ""}`, {
    method: "GET",
  });
}

function getReq(deps: TriggersDeps, id: string) {
  return new Request(`http://localhost/v1/triggers/${id}`, { method: "GET" });
}

function patchReq(deps: TriggersDeps, id: string, body: object) {
  return new Request(`http://localhost/v1/triggers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fireReq(deps: TriggersDeps, id: string) {
  return new Request(`http://localhost/v1/triggers/${id}/fire`, { method: "POST" });
}

function deleteReq(deps: TriggersDeps, id: string) {
  return new Request(`http://localhost/v1/triggers/${id}`, { method: "DELETE" });
}

function req(deps: TriggersDeps, body: object) {
  return new Request("http://localhost/v1/triggers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── POST /v1/triggers ────────────────────────────────────────────────────────

describe("POST /v1/triggers", () => {
  let tmp: string;
  let deps: TriggersDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 201 with created trigger", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "global" },
      source: { kind: "time", schedule: "P7D" },
      action: { kind: "emit_alert", target: { message: "weekly check" } },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body._v).toBe(1);
    expect(body.id).toMatch(/^tr_/);
    expect(body.scope.kind).toBe("global");
    expect(body.source.kind).toBe("time");
    expect(body.action.kind).toBe("emit_alert");
    expect(body.enabled).toBe(true);
    expect(body.fire_count).toBe(0);
    expect(body.last_fired_at).toBeNull();
    expect(body.last_error).toBeNull();
    expect(body.created_at).toBeString();
  });

  test("accepts optional fields", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "project", id: "p_abc123" },
      source: { kind: "event", topic: "session.update" },
      action: { kind: "create_research_run", target: {} },
      budget_policy: { max_cost_usd_per_fire: 2.5 },
      debounce_seconds: 3600,
      enabled: false,
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.scope.id).toBe("p_abc123");
    expect(body.budget_policy.max_cost_usd_per_fire).toBe(2.5);
    expect(body.debounce_seconds).toBe(3600);
    expect(body.enabled).toBe(false);
  });

  test("rejects missing scope", async () => {
    const req = createTriggerReq(deps, {
      source: { kind: "time" },
      action: { kind: "emit_alert", target: {} },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects missing source", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "global" },
      action: { kind: "emit_alert", target: {} },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects missing action", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "global" },
      source: { kind: "time" },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects invalid scope.kind", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "invalid" },
      source: { kind: "time" },
      action: { kind: "emit_alert", target: {} },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects non-global trigger without scope.id", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "project" },
      source: { kind: "time" },
      action: { kind: "emit_alert", target: {} },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects invalid source.kind", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "global" },
      source: { kind: "invalid" },
      action: { kind: "emit_alert", target: {} },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects invalid action.kind", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "global" },
      source: { kind: "time" },
      action: { kind: "invalid", target: {} },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects negative budget_policy.max_cost_usd_per_fire", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "global" },
      source: { kind: "time" },
      action: { kind: "emit_alert", target: {} },
      budget_policy: { max_cost_usd_per_fire: -1 },
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("rejects non-integer debounce_seconds", async () => {
    const req = createTriggerReq(deps, {
      scope: { kind: "global" },
      source: { kind: "time" },
      action: { kind: "emit_alert", target: {} },
      debounce_seconds: 1.5,
    });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(400);
  });

  test("returns 405 for non-POST methods", async () => {
    const req = new Request("http://localhost/v1/triggers", { method: "PUT" });
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(405);
  });
});

// ─── GET /v1/triggers ──────────────────────────────────────────────────────────

describe("GET /v1/triggers", () => {
  let tmp: string;
  let deps: TriggersDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns empty list when no triggers", async () => {
    const req = listReq(deps);
    const res = await handleTriggers(req, deps, "/v1/triggers");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  test("returns all triggers", async () => {
    await handleTriggers(req(deps, { scope: { kind: "global" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } }), deps, "/v1/triggers");
    await handleTriggers(req(deps, { scope: { kind: "project", id: "p_x" }, source: { kind: "event" }, action: { kind: "tick_monitor", target: { monitor_id: "m_1" } } }), deps, "/v1/triggers");

    const listRequest = listReq(deps);
    const res = await handleTriggers(listRequest, deps, "/v1/triggers");
    const body = await res.json();
    expect(body.items.length).toBe(2);
  });

  test("filters by scope_kind", async () => {
    await handleTriggers(req(deps, { scope: { kind: "global" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } }), deps, "/v1/triggers");
    await handleTriggers(req(deps, { scope: { kind: "project", id: "p_x" }, source: { kind: "event" }, action: { kind: "tick_monitor", target: { monitor_id: "m_1" } } }), deps, "/v1/triggers");

    const listRequest = listReq(deps, "scope_kind=project");
    const res = await handleTriggers(listRequest, deps, "/v1/triggers");
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].scope.kind).toBe("project");
  });

  test("filters by enabled", async () => {
    await handleTriggers(req(deps, { scope: { kind: "global" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, enabled: true }), deps, "/v1/triggers");
    await handleTriggers(req(deps, { scope: { kind: "global" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, enabled: false }), deps, "/v1/triggers");

    const listRequest = listReq(deps, "enabled=true");
    const res = await handleTriggers(listRequest, deps, "/v1/triggers");
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].enabled).toBe(true);
  });
});

// ─── GET /v1/triggers/:id ─────────────────────────────────────────────────────

describe("GET /v1/triggers/:id", () => {
  let tmp: string;
  let deps: TriggersDeps;
  let id: string;

  beforeEach(async () => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
    const createRes = await handleTriggers(
      req(deps, { scope: { kind: "global" }, source: { kind: "time", schedule: "P7D" }, action: { kind: "emit_alert", target: { message: "weekly" } } }),
      deps,
      "/v1/triggers",
    );
    id = (await createRes.json()).id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns the trigger", async () => {
    const res = await handleTriggers(getReq(deps, id), deps, `/v1/triggers/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
    expect(body.scope.kind).toBe("global");
    expect(body.source.schedule).toBe("P7D");
  });

  test("returns 404 for unknown id", async () => {
    const res = await handleTriggers(getReq(deps, "tr_notfound"), deps, "/v1/triggers/tr_notfound");
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /v1/triggers/:id ───────────────────────────────────────────────────

describe("PATCH /v1/triggers/:id", () => {
  let tmp: string;
  let deps: TriggersDeps;
  let id: string;

  beforeEach(async () => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
    const createRes = await handleTriggers(
      req(deps, { scope: { kind: "global" }, source: { kind: "time", schedule: "P7D" }, action: { kind: "emit_alert", target: { message: "weekly" } } }),
      deps,
      "/v1/triggers",
    );
    id = (await createRes.json()).id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("patches enabled", async () => {
    const res = await handleTriggers(patchReq(deps, id, { enabled: false }), deps, `/v1/triggers/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });

  test("patches schedule", async () => {
    const res = await handleTriggers(patchReq(deps, id, { source: { kind: "time", schedule: "P14D" } }), deps, `/v1/triggers/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source.schedule).toBe("P14D");
  });

  test("clears budget_policy with null", async () => {
    const createRes = await handleTriggers(
      req(deps, { scope: { kind: "global" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} }, budget_policy: { max_cost_usd_per_fire: 1.0 } }),
      deps,
      "/v1/triggers",
    );
    const idWithBudget = (await createRes.json()).id;

    const res = await handleTriggers(patchReq(deps, idWithBudget, { budget_policy: null }), deps, `/v1/triggers/${idWithBudget}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget_policy).toBeNull();
  });

  test("returns 404 for unknown id", async () => {
    const res = await handleTriggers(patchReq(deps, "tr_notfound", { enabled: false }), deps, "/v1/triggers/tr_notfound");
    expect(res.status).toBe(404);
  });

  test("rejects invalid scope.kind", async () => {
    const res = await handleTriggers(patchReq(deps, id, { scope: { kind: "invalid" } }), deps, `/v1/triggers/${id}`);
    expect(res.status).toBe(400);
  });
});

// ─── POST /v1/triggers/:id/fire ────────────────────────────────────────────────

describe("POST /v1/triggers/:id/fire", () => {
  let tmp: string;
  let deps: TriggersDeps;
  let id: string;

  beforeEach(async () => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
    const createRes = await handleTriggers(
      req(deps, { scope: { kind: "global" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } }),
      deps,
      "/v1/triggers",
    );
    id = (await createRes.json()).id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("records fire and increments fire_count", async () => {
    const before = (await handleTriggers(getReq(deps, id), deps, `/v1/triggers/${id}`)).json();
    const fireRes = await handleTriggers(fireReq(deps, id), deps, `/v1/triggers/${id}/fire`);
    expect(fireRes.status).toBe(200);
    const body = await fireRes.json();
    expect(body.fire_count).toBe(1);
    expect(body.last_fired_at).not.toBeNull();
    expect(body.last_error).toBeNull();
  });

  test("rejects firing a disabled trigger", async () => {
    await handleTriggers(patchReq(deps, id, { enabled: false }), deps, `/v1/triggers/${id}`);
    const res = await handleTriggers(fireReq(deps, id), deps, `/v1/triggers/${id}/fire`);
    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown id", async () => {
    const res = await handleTriggers(fireReq(deps, "tr_notfound"), deps, "/v1/triggers/tr_notfound/fire");
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /v1/triggers/:id ──────────────────────────────────────────────────

describe("DELETE /v1/triggers/:id", () => {
  let tmp: string;
  let deps: TriggersDeps;
  let id: string;

  beforeEach(async () => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
    const createRes = await handleTriggers(
      req(deps, { scope: { kind: "global" }, source: { kind: "time" }, action: { kind: "emit_alert", target: {} } }),
      deps,
      "/v1/triggers",
    );
    id = (await createRes.json()).id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("deletes the trigger and returns 204", async () => {
    const res = await handleTriggers(deleteReq(deps, id), deps, `/v1/triggers/${id}`);
    expect(res.status).toBe(204);

    // verify it's gone
    const getRes = await handleTriggers(getReq(deps, id), deps, `/v1/triggers/${id}`);
    expect(getRes.status).toBe(404);
  });

  test("returns 404 for unknown id", async () => {
    const res = await handleTriggers(deleteReq(deps, "tr_notfound"), deps, "/v1/triggers/tr_notfound");
    expect(res.status).toBe(404);
  });
});

// ─── Unmatched paths return undefined ─────────────────────────────────────────

describe("unmatched paths", () => {
  let tmp: string;
  let deps: TriggersDeps;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns undefined for non-/v1/triggers paths", async () => {
    const req = new Request("http://localhost/v1/other", { method: "GET" });
    const res = await handleTriggers(req, deps, "/v1/other");
    expect(res).toBeUndefined();
  });
});

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

  describe("recordError", () => {
    test("sets last_error and updates updated_at without changing fire_count", async () => {
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

    test("overwrites previous last_error", async () => {
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

  describe("list filter — scope_id", () => {
    test("filters by scope_id (null for global)", async () => {
      await store.create({
        scope: { kind: "global", id: null },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });
      await store.create({
        scope: { kind: "project", id: "p_abc" },
        source: { kind: "time" },
        action: { kind: "emit_alert", target: {} },
      });

      const projectOnly = store.list({ scope_id: "p_abc" });
      expect(projectOnly.length).toBe(1);
      expect(projectOnly[0]!.scope.id).toBe("p_abc");

      const globalOnly = store.list({ scope_id: null });
      expect(globalOnly.length).toBe(1);
      expect(globalOnly[0]!.scope.kind).toBe("global");
    });
  });
});
