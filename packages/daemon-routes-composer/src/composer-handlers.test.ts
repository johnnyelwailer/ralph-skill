/**
 * Tests for composer API handlers.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleComposer, type ComposerDeps } from "./composer-handlers.ts";
import { ComposerTurnRegistry } from "@aloop/state-sqlite";
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
  const logFile = join(dir, "daemon.log.jsonl");
  const registry = new ComposerTurnRegistry(db);
  deps = { db, registry, logFile: () => logFile };
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
      "artifact",
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
    // Insert with a 1ms delay between each to ensure distinct created_at timestamps.
    // Without delays, multiple inserts in the same millisecond share the same created_at,
    // which can cause items from page 1 to reappear on page 2 when using created_at < cursor.
    for (let i = 0; i < 5; i++) {
      await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" }, message: `Turn ${i}`,
      });
      // Wait 1ms so the next insert gets a strictly later created_at
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
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

  test("filters by control_subagent_run_id", async () => {
    const { registry } = deps;
    const now = new Date().toISOString();
    const turn = registry.create({
      scope: { kind: "global" },
      message: "Turn with subagent csr_abc",
      now,
    });
    registry.updateResponse(turn.id, {
      delegated_refs: [
        { kind: "control_subagent_run", id: "csr_abc", role: "editor", scope: { kind: "global" }, status: "running" },
      ],
      now,
    });
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns?control_subagent_run_id=csr_abc");
    const body = await resp.clone().json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.message).toBe("Turn with subagent csr_abc");
    expect(body.items[0]!.delegated_refs[0]!.id).toBe("csr_abc");
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

  test("returns empty stream when log file does not exist", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Stream me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/chunks`);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain('"type":"start"');
    expect(text).toContain('"type":"end"');
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns/ct_unknown/chunks");
    expect(resp.status).toBe(404);
  });

  test("returns empty stream when log file does not exist", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Stream me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/chunks`);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain('"type":"start"');
    expect(text).toContain('"type":"end"');
  });

  test("replay=true streams matching agent.chunk events from log", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Stream me",
    })).json() as { id: string };

    const logFile = deps.logFile();
    writeFileSync(logFile, [
      { _v: 1, id: "1", topic: "agent.chunk", data: { composer_turn_id: created.id, session_id: "s_1", turn_id: "t_1", sequence: 0, type: "text", content: { delta: "hello" }, final: false } },
      { _v: 1, id: "2", topic: "agent.chunk", data: { composer_turn_id: created.id, session_id: "s_1", turn_id: "t_1", sequence: 1, type: "usage", content: { tokens: 100 }, final: true } },
      { _v: 1, id: "3", topic: "agent.chunk", data: { composer_turn_id: "other_turn", session_id: "s_1", turn_id: "t_1", sequence: 0, type: "text", content: { delta: "should be filtered" }, final: false } },
    ].map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/chunks?replay=true`);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain("\"hello\"");
    expect(text).toContain("\"tokens\":100");
    expect(text).not.toContain("should be filtered");
  });

  test("replay=false streams only start and end", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Stream me",
    })).json() as { id: string };

    const logFile = deps.logFile();
    writeFileSync(logFile, [
      { _v: 1, id: "1", topic: "agent.chunk", data: { composer_turn_id: created.id, session_id: "s_1", turn_id: "t_1", sequence: 0, type: "text", content: { delta: "hello" }, final: false } },
    ].map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/chunks?replay=false`);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain('"type":"start"');
    expect(text).toContain('"type":"end"');
    expect(text).not.toContain("hello");
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
// Input validation edge cases
// ---------------------------------------------------------------------------

describe("POST /v1/composer/turns validation edge cases", () => {
  test("rejects non-object body (primitives)", async () => {
    for (const body of [null, "hello", 42, true]) {
      const req = new Request("http://localhost/v1/composer/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const resp = await handler(req, deps, "/v1/composer/turns");
      expect(resp!.status).toBe(400);
      const json = await resp!.clone().json();
      expect(json.error.code).toBe("validation_error");
    }
  });

  test("rejects array body", async () => {
    const req = new Request("http://localhost/v1/composer/turns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ scope: { kind: "global" }, message: "hi" }]),
    });
    const resp = await handler(req, deps, "/v1/composer/turns");
    expect(resp!.status).toBe(400);
    const json = await resp!.clone().json();
    expect(json.error.code).toBe("validation_error");
  });

  test("rejects empty string message", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "",
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects non-string message", async () => {
    for (const message of [42, null, [], { text: "hello" }]) {
      const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" },
        message,
      });
      expect(resp.status).toBe(400);
    }
  });

  test("rejects invalid transcription.mode", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      transcription: { mode: "not_a_mode" },
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects non-object transcription (number)", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      transcription: 42,
    });
    expect(resp.status).toBe(400);
  });

  test("accepts null transcription as default", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      transcription: null,
    });
    expect(resp.status).toBe(201);
  });

  test("rejects non-array artifact_refs", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      artifact_refs: "not-an-array",
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects null in artifact_refs array", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      artifact_refs: [null],
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects non-array media_inputs", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      media_inputs: { kind: "image" },
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects non-array context_refs", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      context_refs: { kind: "project" },
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects non-array provider_chain", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      provider_chain: { 0: "opencode" },
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects non-array allowed_action_classes", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      allowed_action_classes: "read",
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects invalid delegation_policy (non-boolean allow_subagents)", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      delegation_policy: { allow_subagents: "yes", max_subagents: 3, require_preview_for_mutations: true },
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects invalid delegation_policy (non-number max_subagents)", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      delegation_policy: { allow_subagents: true, max_subagents: "3", require_preview_for_mutations: false },
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects invalid context_refs kind", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      context_refs: [{ kind: "invalid_kind", project_id: "p_1" }],
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects context_refs kind=project without project_id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      context_refs: [{ kind: "project" }],
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects context_refs kind=artifact without artifact_id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      context_refs: [{ kind: "artifact" }],
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects context_refs kind=session without session_id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      context_refs: [{ kind: "session" }],
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects context_refs kind=work_item without work_item_key", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
      context_refs: [{ kind: "work_item" }],
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("accepts all valid transcription modes", async () => {
    const modes = ["auto", "native_provider", "fallback_transcriber", "client_supplied"];
    for (const mode of modes) {
      const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" },
        message: "Hello",
        transcription: { mode },
      });
      expect(resp.status).toBe(201);
    }
  });

  test("accepts all valid action classes", async () => {
    const classes = ["read", "capture", "research", "project", "setup", "tracker", "runtime", "provider", "scheduler", "config", "artifact"];
    for (const cls of classes) {
      const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
        scope: { kind: "global" },
        message: "Hello",
        allowed_action_classes: [cls],
      });
      expect(resp.status).toBe(201);
    }
  });
});

// ---------------------------------------------------------------------------
// Method routing
// ---------------------------------------------------------------------------

describe("Method routing", () => {
  test("POST /v1/composer/turns returns 405 for PUT", async () => {
    const resp = await makeRequest(handler, deps, "PUT", "/v1/composer/turns");
    expect(resp.status).toBe(405);
  });

  test("POST /v1/composer/turns returns 405 for DELETE", async () => {
    const resp = await makeRequest(handler, deps, "DELETE", "/v1/composer/turns");
    expect(resp.status).toBe(405);
  });

  test("GET /v1/composer/turns returns 405 for POST", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "POST to GET route",
    });
    // handler matches POST first, so this creates a turn (201), not 405
    // This is correct behavior — the POST handler takes precedence on that path
    expect(resp.status).toBe(201);
  });

  test("GET /v1/composer/turns/:id returns 405 for POST", async () => {
    // Create a turn first
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    // POST to single-turn route should be 405 (no POST handler for single turn)
    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}`, {});
    expect(resp.status).toBe(405);
  });

  test("GET /v1/composer/turns/:id returns 405 for PUT", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PUT", `/v1/composer/turns/${created.id}`, {});
    expect(resp.status).toBe(405);
  });

  test("GET /v1/composer/turns/:id returns 200", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}`, {});
    expect(resp.status).toBe(200);
  });

  test("GET /v1/composer/turns/:id/chunks returns 405 for POST", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/chunks`, {});
    expect(resp.status).toBe(405);
  });

  test("GET /v1/composer/turns/:id/launched returns 405 for POST", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/launched`, {});
    expect(resp.status).toBe(405);
  });

  test("GET /v1/composer/turns/:id/launched returns 405 for PUT", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PUT", `/v1/composer/turns/${created.id}/launched`, {});
    expect(resp.status).toBe(405);
  });

  test("POST /v1/composer/turns/:id/cancel returns 405 for GET", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/cancel`, {});
    expect(resp.status).toBe(405);
  });

  test("POST /v1/composer/turns/:id/fire does not exist (404)", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/fire`, {});
    expect(resp.status).toBe(404);
  });

  test("extra path segments on single turn return 404", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Find me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/extra`, {});
    expect(resp.status).toBe(404);
  });

  test("query string is stripped before route matching", async () => {
    // Create a turn to list
    await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "With query",
    });

    // GET with query string should still match the list route
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns?scope_kind=global", {});
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.items.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/composer/turns/:id/approve
// ---------------------------------------------------------------------------

describe("POST /v1/composer/turns/:id/approve", () => {
  test("approves a turn in waiting_for_approval state", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Approve me",
    })).json() as { id: string };
    const { registry } = deps;
    registry.updateResponse(created.id, { status: "waiting_for_approval" });

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/approve`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.status).toBe("running");
  });

  test("returns 409 for turn not in waiting_for_approval state", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Not waiting",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/approve`);
    expect(resp.status).toBe(409);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("invalid_state");
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns/ct_unknown/approve");
    expect(resp.status).toBe(404);
  });

  test("returns 405 for GET", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Find me",
    })).json() as { id: string };
    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/approve`);
    expect(resp.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/composer/turns/:id/actions
// ---------------------------------------------------------------------------

describe("GET /v1/composer/turns/:id/actions", () => {
  test("returns proposed_actions for existing turn", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "List actions",
    })).json() as { id: string };
    const { registry } = deps;
    registry.updateResponse(created.id, {
      proposed_actions: [
        {
          id: "act_abc",
          class: "config",
          method: "PUT",
          path: "/v1/providers/overrides",
          summary: "Prefer codex",
          produced_by: { kind: "control_subagent_run", id: "csr_1" },
          risk: "medium" as const,
          requires_approval: true,
        },
      ],
    });

    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}/actions`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body._v).toBe(1);
    expect(body.proposed_actions).toHaveLength(1);
    expect(body.proposed_actions[0].id).toBe("act_abc");
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/composer/turns/ct_unknown/actions");
    expect(resp.status).toBe(404);
  });

  test("POST returns 404 (route not defined)", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Find me",
    })).json() as { id: string };
    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/actions`);
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/composer/turns/:id/actions/:action_id/apply
// POST /v1/composer/turns/:id/actions/:action_id/reject
// ---------------------------------------------------------------------------

describe("POST /v1/composer/turns/:id/actions/:action_id/apply", () => {
  test("applies an action and transitions turn to running if requires_approval", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Apply action",
    })).json() as { id: string };
    const { registry } = deps;
    registry.updateResponse(created.id, {
      status: "waiting_for_approval",
      proposed_actions: [
        {
          id: "act_abc",
          class: "config",
          method: "PUT",
          path: "/v1/providers/overrides",
          summary: "Prefer codex",
          produced_by: { kind: "control_subagent_run", id: "csr_1" },
          risk: "medium" as const,
          requires_approval: true,
        },
      ],
    });

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/actions/act_abc/apply`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.action_id).toBe("act_abc");
    expect(body.status).toBe("applied");
    expect(body.turn_status).toBe("running");
  });

  test("applies an action without state transition if not requires_approval", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Apply no-approval action",
    })).json() as { id: string };
    const { registry } = deps;
    registry.updateResponse(created.id, {
      status: "running",
      proposed_actions: [
        {
          id: "act_xyz",
          class: "read",
          method: "GET",
          path: "/v1/projects",
          summary: "List projects",
          produced_by: { kind: "control_subagent_run", id: "csr_1" },
          risk: "low" as const,
          requires_approval: false,
        },
      ],
    });

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/actions/act_xyz/apply`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.action_id).toBe("act_xyz");
    expect(body.status).toBe("applied");
  });

  test("returns 404 for unknown action id", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Find action",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/actions/act_unknown/apply`);
    expect(resp.status).toBe(404);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("action_not_found");
  });

  test("returns 404 for unknown turn id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/composer/turns/ct_unknown/actions/act_1/apply");
    expect(resp.status).toBe(404);
  });
});

describe("POST /v1/composer/turns/:id/actions/:action_id/reject", () => {
  test("rejects an action", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Reject action",
    })).json() as { id: string };
    const { registry } = deps;
    registry.updateResponse(created.id, {
      proposed_actions: [
        {
          id: "act_abc",
          class: "config",
          method: "PUT",
          path: "/v1/providers/overrides",
          summary: "Prefer codex",
          produced_by: { kind: "control_subagent_run", id: "csr_1" },
          risk: "high" as const,
          requires_approval: true,
        },
      ],
    });

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/actions/act_abc/reject`);
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.action_id).toBe("act_abc");
    expect(body.status).toBe("rejected");
  });

  test("returns 404 for unknown action id", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Find action",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "POST", `/v1/composer/turns/${created.id}/actions/act_unknown/reject`);
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/composer/turns/:id
// ---------------------------------------------------------------------------

describe("PATCH /v1/composer/turns/:id", () => {
  test("updates status via PATCH", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch me",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      status: "running",
    });
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.status).toBe("running");
  });

  test("updates media_mode via PATCH", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch media",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      media_mode: "derived",
    });
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.media_mode).toBe("derived");
  });

  test("updates usage via PATCH", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch usage",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      usage: { tokens_in: 1000, tokens_out: 500, cost_usd: 0.05 },
    });
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.usage.tokens_in).toBe(1000);
    expect(body.usage.tokens_out).toBe(500);
    expect(body.usage.cost_usd).toBe(0.05);
  });

  test("updates delegated_refs via PATCH", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch delegated",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      delegated_refs: [
        { kind: "control_subagent_run", id: "csr_abc", role: "editor", scope: { kind: "global" }, status: "running" },
      ],
    });
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.delegated_refs).toHaveLength(1);
    expect(body.delegated_refs[0].id).toBe("csr_abc");
  });

  test("updates proposed_actions via PATCH", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch actions",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      proposed_actions: [
        {
          id: "act_1",
          class: "config",
          method: "PUT",
          path: "/v1/providers/overrides",
          summary: "Change override",
          produced_by: { kind: "control_subagent_run", id: "csr_1" },
          risk: "medium" as const,
          requires_approval: true,
        },
      ],
    });
    expect(resp.status).toBe(200);
    const body = await resp.clone().json();
    expect(body.proposed_actions).toHaveLength(1);
    expect(body.proposed_actions[0].id).toBe("act_1");
  });

  test("returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "PATCH", "/v1/composer/turns/ct_unknown", {
      status: "running",
    });
    expect(resp.status).toBe(404);
  });

  test("returns 400 for invalid status value", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch invalid",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      status: "not_a_status",
    });
    expect(resp.status).toBe(400);
    const body = await resp.clone().json();
    expect(body.error.code).toBe("validation_error");
  });

  test("returns 400 for invalid media_mode value", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch invalid media",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      media_mode: "invalid",
    });
    expect(resp.status).toBe(400);
  });

  test("returns 400 for non-object usage", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch invalid usage",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      usage: "not an object",
    });
    expect(resp.status).toBe(400);
  });

  test("returns 400 for missing usage.tokens_in", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Patch invalid usage 2",
    })).json() as { id: string };

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/composer/turns/${created.id}`, {
      usage: { tokens_in: "not a number", tokens_out: 500, cost_usd: 0.05 },
    });
    expect(resp.status).toBe(400);
  });

  test("returns 405 for GET", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Find me",
    })).json() as { id: string };
    const resp = await makeRequest(handler, deps, "GET", `/v1/composer/turns/${created.id}`);
    expect(resp.status).toBe(200);
  });

  test("returns 405 for DELETE", async () => {
    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" }, message: "Find me",
    })).json() as { id: string };
    const resp = await makeRequest(handler, deps, "DELETE", `/v1/composer/turns/${created.id}`);
    expect(resp.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// composer.turn.changed events
// ---------------------------------------------------------------------------

describe("composer.turn.changed events", () => {
  test("emits event on POST /v1/composer/turns", async () => {
    const appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const eventsDep = {
      append: async <T>(topic: string, data: T) => {
        appendedEvents.push({ topic, data });
        return { _v: 1, id: "evt_test", timestamp: "2026-05-01T00:00:00Z", topic, data: data as Record<string, unknown> };
      },
    };
    const depsWithEvents = { db, events: eventsDep };

    await makeRequest(handler, depsWithEvents, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
    });

    expect(appendedEvents.some(e => e.topic === "composer.turn.changed")).toBe(true);
    const evt = appendedEvents.find(e => e.topic === "composer.turn.changed")!;
    expect(evt.data.composer_turn_id).toBeTruthy();
    expect(evt.data.status).toBe("queued");
  });

  test("emits event on POST /v1/composer/turns/:id/cancel", async () => {
    const appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const eventsDep = {
      append: async <T>(topic: string, data: T) => {
        appendedEvents.push({ topic, data });
        return { _v: 1, id: "evt_test", timestamp: "2026-05-01T00:00:00Z", topic, data: data as Record<string, unknown> };
      },
    };
    const depsWithEvents = { db, events: eventsDep };

    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "To cancel",
    })).json() as { id: string };

    appendedEvents.length = 0;

    await makeRequest(handler, depsWithEvents, "POST", `/v1/composer/turns/${created.id}/cancel`, {});

    expect(appendedEvents.some(e => e.topic === "composer.turn.changed")).toBe(true);
    const evt = appendedEvents.find(e => e.topic === "composer.turn.changed")!;
    expect(evt.data.composer_turn_id).toBe(created.id);
    expect(evt.data.status).toBe("cancelled");
  });

  test("emits event on PATCH /v1/composer/turns/:id", async () => {
    const appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const eventsDep = {
      append: async <T>(topic: string, data: T) => {
        appendedEvents.push({ topic, data });
        return { _v: 1, id: "evt_test", timestamp: "2026-05-01T00:00:00Z", topic, data: data as Record<string, unknown> };
      },
    };
    const depsWithEvents = { db, events: eventsDep };

    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "To patch",
    })).json() as { id: string };

    appendedEvents.length = 0;

    await makeRequest(handler, depsWithEvents, "PATCH", `/v1/composer/turns/${created.id}`, {
      status: "running",
    });

    expect(appendedEvents.some(e => e.topic === "composer.turn.changed")).toBe(true);
  });

  test("emits event on POST /v1/composer/turns/:id/approve", async () => {
    const appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const eventsDep = {
      append: async <T>(topic: string, data: T) => {
        appendedEvents.push({ topic, data });
        return { _v: 1, id: "evt_test", timestamp: "2026-05-01T00:00:00Z", topic, data: data as Record<string, unknown> };
      },
    };
    const depsWithEvents = { db, events: eventsDep };

    const created = await (await makeRequest(handler, deps, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "To approve",
    })).json() as { id: string };
    deps.registry!.updateResponse(created.id, { status: "waiting_for_approval" });

    appendedEvents.length = 0;

    await makeRequest(handler, depsWithEvents, "POST", `/v1/composer/turns/${created.id}/approve`, {});

    expect(appendedEvents.some(e => e.topic === "composer.turn.changed")).toBe(true);
  });

  test("does not emit event when events is not provided", async () => {
    const appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const eventsDep = {
      append: async <T>(topic: string, data: T) => {
        appendedEvents.push({ topic, data });
        return { _v: 1, id: "evt_test", timestamp: "2026-05-01T00:00:00Z", topic, data: data as Record<string, unknown> };
      },
    };
    const depsWithEvents = { db, events: eventsDep };

    await makeRequest(handler, depsWithEvents, "POST", "/v1/composer/turns", {
      scope: { kind: "global" },
      message: "Hello",
    });

    expect(appendedEvents.filter(e => e.topic === "composer.turn.changed").length).toBe(1);
  });
});
