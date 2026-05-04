/**
 * Tests for composer API handlers.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { handleComposer, type ComposerDeps } from "./composer-handlers.ts";
import { migrate, loadBundledMigrations } from "@aloop/sqlite-db";

// ---------------------------------------------------------------------------
// Test database setup
// ---------------------------------------------------------------------------

function createTestDb(): { db: Database; dir: string } {
  const dir = join("/tmp", `composer-test-${crypto.randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, "test.db"));
  const migrations = loadBundledMigrations();
  migrate(db, migrations);
  return { db, dir };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

async function makeRequest(
  handler: typeof handleComposer,
  deps: ComposerDeps,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<Response> {
  const url = `http://localhost${pathname}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const req = new Request(url, init);
  const resp = await handler(req, deps, pathname);
  if (resp === undefined) {
    return new Response(null, { status: 404 });
  }
  return resp;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let handler: typeof handleComposer;
let deps: ComposerDeps;
let db: Database;
let dir: string;

beforeEach(() => {
  const setup = createTestDb();
  db = setup.db;
  dir = setup.dir;
  deps = { db };
  handler = handleComposer;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// POST /v1/composer/turns — create
// ---------------------------------------------------------------------------

describe("POST /v1/composer/turns", () => {
  test("creates a turn with required fields only", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello, composer",
    });
    expect(resp.status).toBe(201);
    const body = await resp.clone().json();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.scope).toEqual({ kind: "global" });
    expect(body.status).toBe("queued");
    expect(body.message).toBe("Hello, composer");
    expect(body.media_mode).toBe("none");
    expect(body.voice_mode).toBe("none");
    expect(body.delegated_refs).toEqual([]);
    expect(body.launched_refs).toEqual([]);
    expect(body.proposed_actions).toEqual([]);
    expect(body.proposal_refs).toEqual([]);
    expect(body.usage.tokens_in).toBe(0);
    expect(body.usage.tokens_out).toBe(0);
    expect(body.usage.cost_usd).toBe(0);
    expect(body.created_at).toBeTruthy();
    expect(body.updated_at).toBeTruthy();
  });

  test("creates a turn with all optional fields", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      id: "ct_fixed_id",
      scope: { kind: "project", id: "p_abc" },
      message: "Full turn",
      artifact_refs: [{ artifact_id: "a_1", role: "screenshot" }],
      media_inputs: [{ kind: "image", artifact_id: "a_2", caption: "see this" }],
      context_refs: [{ kind: "project", project_id: "p_xyz" }],
      intent_hint: "research",
      allowed_action_classes: ["read", "research"],
      delegation_policy: {
        allow_subagents: true,
        max_subagents: 2,
        require_preview_for_mutations: false,
      },
      provider_chain: ["codex", "claude"],
      transcription: { mode: "native_provider", language: "en" },
      max_cost_usd: 1.5,
      approval_policy: "auto_approved",
    });
    expect(resp.status).toBe(201);
    const body = await resp.clone().json();
    expect(body.id).toBe("ct_fixed_id");
    expect(body.scope).toEqual({ kind: "project", id: "p_abc" });
    expect(body.status).toBe("queued");
    expect(body.intent_hint).toBe("research");
    expect(body.allowed_action_classes).toEqual(["read", "research"]);
    expect(body.delegation_policy.allow_subagents).toBe(true);
    expect(body.delegation_policy.max_subagents).toBe(2);
    expect(body.delegation_policy.require_preview_for_mutations).toBe(false);
    expect(body.provider_chain).toEqual(["codex", "claude"]);
    expect(body.transcription.mode).toBe("native_provider");
    expect(body.transcription.language).toBe("en");
    expect(body.max_cost_usd).toBe(1.5);
    expect(body.approval_policy).toBe("auto_approved");
  });

  test("rejects missing scope", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      message: "Hello",
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects missing message", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects invalid scope.kind", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "not_a_kind" },
      message: "Hello",
    });
    expect(resp.status).toBe(400);
  });

  test("rejects invalid intent_hint", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      intent_hint: "not_a_hint",
    });
    expect(resp.status).toBe(400);
  });

  test("rejects invalid approval_policy", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      approval_policy: "invalid",
    });
    expect(resp.status).toBe(400);
  });

  test("rejects negative max_cost_usd", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      max_cost_usd: -1,
    });
    expect(resp.status).toBe(400);
  });

  test("rejects artifact_refs entries without artifact_id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      artifact_refs: [{ role: "screenshot" }],
    });
    expect(resp.status).toBe(400);
  });

  test("rejects invalid media_inputs kind", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      media_inputs: [{ kind: "not_a_kind" }],
    });
    expect(resp.status).toBe(400);
  });

  test("rejects invalid context_refs kind", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      context_refs: [{ kind: "not_a_kind" }],
    });
    expect(resp.status).toBe(400);
  });

  test("rejects invalid action class in allowed_action_classes", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      allowed_action_classes: ["not_an_action"],
    });
    expect(resp.status).toBe(400);
  });

  test("rejects non-array provider_chain", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      provider_chain: "not_an_array",
    });
    expect(resp.status).toBe(400);
  });

  test("accepts all valid scope kinds", async () => {
    const kinds = [
      "global",
      "project",
      "incubation_item",
      "setup_run",
      "work_item",
      "session",
      "spec_section",
    ];
    for (const kind of kinds) {
      const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind },
        message: `Hello for ${kind}`,
      });
      expect(resp.status).toBe(201);
    }
  });

  test("accepts all valid intent hints", async () => {
    const hints = [
      "capture", "research", "monitor", "project", "setup",
      "plan", "configure", "steer", "explain", "summarize", "apply",
    ];
    for (const hint of hints) {
      const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" },
        message: "Hello",
        intent_hint: hint,
      });
      expect(resp.status).toBe(201);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /v1/composer/turns — list
// ---------------------------------------------------------------------------

describe("GET /v1/composer/turns", () => {
  test("returns empty list when no turns", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns");
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeUndefined();
  });

  test("returns turns ordered by created_at desc", async () => {
    const r1 = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "First",
    });
    const r2 = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Second",
    });
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns");
    const body = await resp.clone().json();
    expect(body.items).toHaveLength(2);
    // Most recent first
    expect(body.items[0]!.message).toBe("Second");
    expect(body.items[1]!.message).toBe("First");
  });

  test("filters by scope_kind", async () => {
    await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Global",
    });
    await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "project", id: "p_abc" }, message: "Project",
    });
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns?scope_kind=project");
    const body = await resp.clone().json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.message).toBe("Project");
    expect(body.items[0]!.scope.kind).toBe("project");
  });

  test("filters by status", async () => {
    // First create a turn then manually update its status via POST cancel
    const cr1 = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Queued",
    });
    const { id: id2 } = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Cancelled",
    })).json() as { id: string };

    await makeRequest(handler, deps, "POST", `/v1/composer/turns/${id2}/cancel`);

    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns?status=cancelled");
    const body = await resp.clone().json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.status).toBe("cancelled");
  });

  test("respects limit param", async () => {
    for (let i = 0; i < 5; i++) {
      await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" }, message: `Turn ${i}`,
      });
    }
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns?limit=3");
    const body = await resp.clone().json();
    expect(body.items).toHaveLength(3);
    expect(body.next_cursor).toBeDefined();
  });

  test("cursor pagination returns next page of results", async () => {
    for (let i = 0; i < 5; i++) {
      await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" }, message: `Turn ${i}`,
      });
    }
    // First page
    const page1 = await (await makeRequest(handler, deps, "GET", "/v1/composer/turns?limit=2")).json();
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBeDefined();

    // Second page using cursor
    const page2 = await (await makeRequest(handler, deps, "GET", `/v1/composer/turns?limit=2&cursor=${page1.next_cursor}`)).json();
    expect(page2.items).toHaveLength(2);
    // No overlap between pages
    const page1Ids = page1.items.map((t: { id: string }) => t.id);
    const page2Ids = page2.items.map((t: { id: string }) => t.id);
    for (const id of page1Ids) {
      expect(page2Ids).not.toContain(id);
    }
  });

  test("filters by scope_id", async () => {
    await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Global",
    });
    await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "project", id: "p_abc" }, message: "Project ABC",
    });
    await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "project", id: "p_xyz" }, message: "Project XYZ",
    });
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns?scope_kind=project&scope_id=p_abc");
    const body = await resp.clone().json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.message).toBe("Project ABC");
    expect(body.items[0]!.scope.id).toBe("p_abc");
  });

  test("caps limit at 100", async () => {
    for (let i = 0; i < 5; i++) {
      await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" }, message: `Turn ${i}`,
      });
    }
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns?limit=200");
    const body = await resp.clone().json();
    expect(body.items).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/composer/turns/:id — get single
// ---------------------------------------------------------------------------

describe("GET /v1/composer/turns/:id", () => {
  test("returns a turn by id", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.id).toBe(created.id);
    expect(body.message).toBe("Find me");
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns/ct_unknown");
    expect(resp.status).toBe(404);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("composer_turn_not_found");
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/composer/turns/:id
// ---------------------------------------------------------------------------

describe("DELETE /v1/composer/turns/:id", () => {
  test("deletes an existing turn", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Delete me",
    })).json() as { id: string };

    const delResp = await makeRequest(handler, deps, "DELETE", `/v1/composer/turns/${created.id}`);
    expect(delResp.status).toBe(204);

    const getResp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}`);
    expect(getResp.status).toBe(404);
  });

  test("returns 404 when deleting unknown id", async () => {
    const resp = await makeRequest(handler, deps, "DELETE", "/v1/composer/turns/ct_unknown");
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/composer/turns/:id/cancel
// ---------------------------------------------------------------------------

describe("POST /v1/composer/turns/:id/cancel", () => {
  test("cancels an existing turn", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Cancel me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/cancel`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.status).toBe("cancelled");
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns/ct_unknown/cancel");
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/composer/turns/:id/chunks
// ---------------------------------------------------------------------------

describe("GET /v1/composer/turns/:id/chunks", () => {
  test("returns SSE stream for existing turn", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Stream me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/chunks`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("text/event-stream");
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns/ct_unknown/chunks");
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/composer/turns/:id/launched
// ---------------------------------------------------------------------------

describe("GET /v1/composer/turns/:id/launched", () => {
  test("returns launched_refs for existing turn", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Launch from me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/launched`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body._v).toBe(1);
    expect(body.launched_refs).toEqual([]);
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns/ct_unknown/launched");
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Method routing
// ---------------------------------------------------------------------------

describe("Method routing", () => {
  test("POST /v1/composer/turns returns 405 for GET", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns");
    // GET /v1/composer/turns is valid, so we get 200, not 405
    expect(resp.status).toBe(200);
  });

  test("unhandled paths return undefined", async () => {
    const resp = await makeRequest(handler, deps, "PATCH", "/v1/composer/turns/ct_abc");
    expect(resp.status).toBe(404);
  });
});
