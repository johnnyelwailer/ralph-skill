import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleSessions, type SessionsDeps } from "./sessions.ts";

function makeDeps(sessionId?: string): SessionsDeps {
  const base = mkdtempSync(join(tmpdir(), "aloop-sessions-test-"));
  return {
    sessionsDir: () => join(base, sessionId ?? "sessions"),
  };
}

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

// ─── POST /v1/sessions/:id/steer ──────────────────────────────────────────────

describe("POST /v1/sessions/:id/steer", () => {
  test("returns 400 when instruction is missing", async () => {
    const deps = makeDeps("s_test_001");
    const req = new Request("http://x/v1/sessions/s_test_001/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_001/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("instruction");
  });

  test("returns 400 when instruction is empty string", async () => {
    const deps = makeDeps("s_test_002");
    const req = new Request("http://x/v1/sessions/s_test_002/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "   " }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_002/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when instruction is not a string", async () => {
    const deps = makeDeps("s_test_003");
    const req = new Request("http://x/v1/sessions/s_test_003/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: 123 }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_003/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps("s_test_004");
    const req = new Request("http://x/v1/sessions/s_test_004/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_004/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for non-object JSON body", async () => {
    const deps = makeDeps("s_test_005");
    const req = new Request("http://x/v1/sessions/s_test_005/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[1,2,3]",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_005/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("writes steering entry to queue dir and returns 200", async () => {
    const deps = makeDeps("s_test_006");
    const req = new Request("http://x/v1/sessions/s_test_006/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Focus on tests for the permit gate" }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_006/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{
      _v: number;
      id: string;
      filename: string;
      position: number;
      cycle_position_reset: boolean;
    }>(res!);
    expect(body._v).toBe(1);
    expect(body.id).toBeTruthy();
    expect(body.filename).toMatch(/^steering-\d+-[a-f0-9]{8}\.json$/);
    expect(body.position).toBe(0);
    expect(body.cycle_position_reset).toBe(true);
  });

  test("affects_completed_work defaults to unknown", async () => {
    const deps = makeDeps("s_test_007");
    const req = new Request("http://x/v1/sessions/s_test_007/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Focus on tests" }),
    });
    await handleSessions(req, deps, "/v1/sessions/s_test_007/steer");

    const queueDir = join(deps.sessionsDir(), "s_test_007", "queue");
    const files = await import("node:fs").then((fs) => fs.readdirSync(queueDir));
    const content = readFileSync(join(queueDir, files[0]!), "utf-8");
    const entry = JSON.parse(content);
    expect(entry.affects_completed_work).toBe("unknown");
  });

  test("affects_completed_work accepts yes", async () => {
    const deps = makeDeps("s_test_008");
    const req = new Request("http://x/v1/sessions/s_test_008/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Focus on tests", affects_completed_work: "yes" }),
    });
    await handleSessions(req, deps, "/v1/sessions/s_test_008/steer");

    const queueDir = join(deps.sessionsDir(), "s_test_008", "queue");
    const files = await import("node:fs").then((fs) => fs.readdirSync(queueDir));
    const content = readFileSync(join(queueDir, files[0]!), "utf-8");
    const entry = JSON.parse(content);
    expect(entry.affects_completed_work).toBe("yes");
  });

  test("affects_completed_work accepts no", async () => {
    const deps = makeDeps("s_test_009");
    const req = new Request("http://x/v1/sessions/s_test_009/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Focus on tests", affects_completed_work: "no" }),
    });
    await handleSessions(req, deps, "/v1/sessions/s_test_009/steer");

    const queueDir = join(deps.sessionsDir(), "s_test_009", "queue");
    const files = await import("node:fs").then((fs) => fs.readdirSync(queueDir));
    const content = readFileSync(join(queueDir, files[0]!), "utf-8");
    const entry = JSON.parse(content);
    expect(entry.affects_completed_work).toBe("no");
  });

  test("affects_completed_work invalid value defaults to unknown", async () => {
    const deps = makeDeps("s_test_010");
    const req = new Request("http://x/v1/sessions/s_test_010/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Focus on tests", affects_completed_work: "maybe" }),
    });
    await handleSessions(req, deps, "/v1/sessions/s_test_010/steer");

    const queueDir = join(deps.sessionsDir(), "s_test_010", "queue");
    const files = await import("node:fs").then((fs) => fs.readdirSync(queueDir));
    const content = readFileSync(join(queueDir, files[0]!), "utf-8");
    const entry = JSON.parse(content);
    expect(entry.affects_completed_work).toBe("unknown");
  });

  test("creates queue directory if it does not exist", async () => {
    const deps = makeDeps("s_test_011");
    const req = new Request("http://x/v1/sessions/s_test_011/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Focus on tests" }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_011/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const queueDir = join(deps.sessionsDir(), "s_test_011", "queue");
    const exists = await import("node:fs").then((fs) => fs.existsSync(queueDir));
    expect(exists).toBe(true);
  });

  test("returns 405 for non-POST method on steer", async () => {
    const deps = makeDeps("s_test_012");
    const req = new Request("http://x/v1/sessions/s_test_012/steer", {
      method: "GET",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_test_012/steer");

    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── GET /v1/sessions/:id/queue ────────────────────────────────────────────────

describe("GET /v1/sessions/:id/queue", () => {
  test("returns empty items when queue dir does not exist", async () => {
    const deps = makeDeps("s_queue_001");
    const req = new Request("http://x/v1/sessions/s_queue_001/queue", {
      method: "GET",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_queue_001/queue");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; items: unknown[] }>(res!);
    expect(body._v).toBe(1);
    expect(body.items).toEqual([]);
  });

  test("returns steering entries from queue dir", async () => {
    const deps = makeDeps("s_queue_002");
    const queueDir = join(deps.sessionsDir(), "s_queue_002", "queue");
    mkdirSync(queueDir, { recursive: true });

    const entry = {
      id: "steer_test_123",
      instruction: "Test instruction",
      affects_completed_work: "yes",
      created_at: "2026-04-29T00:00:00.000Z",
    };
    writeFileSync(join(queueDir, "steering-123.json"), JSON.stringify(entry), "utf-8");

    const req = new Request("http://x/v1/sessions/s_queue_002/queue", {
      method: "GET",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_queue_002/queue");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; items: unknown[] }>(res!);
    expect(body._v).toBe(1);
    expect(body.items).toHaveLength(1);
    expect((body.items[0] as { id: string }).id).toBe("steer_test_123");
  });

  test("ignores non-JSON files in queue dir", async () => {
    const deps = makeDeps("s_queue_003");
    const queueDir = join(deps.sessionsDir(), "s_queue_003", "queue");
    mkdirSync(queueDir, { recursive: true });

    writeFileSync(join(queueDir, "readme.txt"), "not a json file", "utf-8");
    const entry = {
      id: "steer_test_456",
      instruction: "Another test",
      affects_completed_work: "no",
      created_at: "2026-04-29T00:00:00.000Z",
    };
    writeFileSync(join(queueDir, "steering-456.json"), JSON.stringify(entry), "utf-8");

    const req = new Request("http://x/v1/sessions/s_queue_003/queue", {
      method: "GET",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_queue_003/queue");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: unknown[] }>(res!);
    expect(body.items).toHaveLength(1);
  });
});

// ─── DELETE /v1/sessions/:id/queue/:itemId ────────────────────────────────────

describe("DELETE /v1/sessions/:id/queue/:itemId", () => {
  test("returns 404 when queue dir does not exist", async () => {
    const deps = makeDeps("s_del_001");
    const req = new Request("http://x/v1/sessions/s_del_001/queue/some_item", {
      method: "DELETE",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_del_001/queue/some_item");

    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });

  test("returns 404 when item does not exist in queue", async () => {
    const deps = makeDeps("s_del_002");
    const queueDir = join(deps.sessionsDir(), "s_del_002", "queue");
    mkdirSync(queueDir, { recursive: true });

    const req = new Request("http://x/v1/sessions/s_del_002/queue/nonexistent_item", {
      method: "DELETE",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_del_002/queue/nonexistent_item");

    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });

  test("deletes existing queue item and returns 204", async () => {
    const deps = makeDeps("s_del_003");
    const queueDir = join(deps.sessionsDir(), "s_del_003", "queue");
    mkdirSync(queueDir, { recursive: true });

    const entry = {
      id: "steer_del_789",
      instruction: "Delete me",
      affects_completed_work: "yes",
      created_at: "2026-04-29T00:00:00.000Z",
    };
    writeFileSync(join(queueDir, "steering-789.json"), JSON.stringify(entry), "utf-8");

    const req = new Request("http://x/v1/sessions/s_del_003/queue/steer_del_789", {
      method: "DELETE",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_del_003/queue/steer_del_789");

    expect(res).toBeDefined();
    expect(res!.status).toBe(204);
    const files = await import("node:fs").then((fs) => fs.readdirSync(queueDir));
    expect(files).toHaveLength(0);
  });
});

// ─── Unhandled paths return undefined ───────────────────────────────────────

describe("unhandled paths", () => {
  test("returns 405 for non-GET/POST on /v1/sessions", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", { method: "DELETE" });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });

  test("returns list response for GET /v1/sessions", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", { method: "GET" });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
  });

  test("returns undefined for /v1/sessions/foo/bar (invalid action)", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions/foo/bar", { method: "GET" });
    const res = await handleSessions(req, deps, "/v1/sessions/foo/bar");
    expect(res).toBeUndefined();
  });
});
// ─── POST /v1/sessions ─────────────────────────────────────────────────────────

describe("POST /v1/sessions", () => {
  test("returns 400 when project_id is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "standalone" }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for invalid kind", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: "p_123", kind: "invalid" }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("creates session with default kind=standalone and returns 201", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: "p_abc" }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res!.status).toBe(201);
    const body = await resJson<{ _v: number; id: string; project_id: string; kind: string; status: string }>(res!);
    expect(body._v).toBe(1);
    expect(body.id).toMatch(/^s_[a-f0-9]{12}$/);
    expect(body.project_id).toBe("p_abc");
    expect(body.kind).toBe("standalone");
    expect(body.status).toBe("pending");
  });

  test("creates session with all fields and returns 201", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: "p_xyz",
        kind: "orchestrator",
        workflow: "my-workflow",
      }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res!.status).toBe(201);
    const body = await resJson<{ _v: number; id: string; project_id: string; kind: string; workflow: string | null; status: string }>(res!);
    expect(body.project_id).toBe("p_xyz");
    expect(body.kind).toBe("orchestrator");
    expect(body.workflow).toBe("my-workflow");
    expect(body.status).toBe("pending");
  });

  test("creates session directories on filesystem", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: "p_dirs" }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res!.status).toBe(201);
    const body = await resJson<{ id: string }>(res!);
    const sessionDir = join(deps.sessionsDir(), body.id);
    expect(existsSync(sessionDir)).toBe(true);
    expect(existsSync(join(sessionDir, "queue"))).toBe(true);
    expect(existsSync(join(sessionDir, "worktree"))).toBe(true);
    expect(existsSync(join(sessionDir, "session.json"))).toBe(true);
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res!.status).toBe(400);
  });

  test("accepts child kind", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: "p_child", kind: "child" }),
    });
    const res = await handleSessions(req, deps, "/v1/sessions");
    expect(res!.status).toBe(201);
    const body = await resJson<{ kind: string }>(res!);
    expect(body.kind).toBe("child");
  });
});

// ─── GET /v1/sessions/:id/log ─────────────────────────────────────────────────

describe("GET /v1/sessions/:id/log", () => {
  test("returns 404 when session does not exist", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/sessions/s_nonexistent/log", {
      method: "GET",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_nonexistent/log");
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns SSE stream with 200 when log exists", async () => {
    const deps = makeDeps("s_log_001");
    const sessionDir = join(deps.sessionsDir(), "s_log_001");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "log.jsonl"), "", "utf-8");
    const req = new Request("http://x/v1/sessions/s_log_001/log", {
      method: "GET",
    });
    const res = await handleSessions(req, deps, "/v1/sessions/s_log_001/log");
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("text/event-stream");
  });

  test("streams events via SSE", async () => {
    const deps = makeDeps("s_log_002");
    const sessionDir = join(deps.sessionsDir(), "s_log_002");
    mkdirSync(sessionDir, { recursive: true });
    const event1 = JSON.stringify({ _v: 1, id: "0001", topic: "session.update", data: { session_id: "s_log_002" } });
    const event2 = JSON.stringify({ _v: 1, id: "0002", topic: "agent.chunk", data: { session_id: "s_log_002", turn_id: "t1", sequence: 0, type: "text", content: { delta: "hi" }, final: false } });
    writeFileSync(join(sessionDir, "log.jsonl"), event1 + "\n" + event2 + "\n", "utf-8");

    const req = new Request("http://x/v1/sessions/s_log_002/log", { method: "GET" });
    const res = await handleSessions(req, deps, "/v1/sessions/s_log_002/log");
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("text/event-stream");
  });

  test("returns NDJSON format when format=ndjson", async () => {
    const deps = makeDeps("s_log_003");
    const sessionDir = join(deps.sessionsDir(), "s_log_003");
    mkdirSync(sessionDir, { recursive: true });
    const event1 = JSON.stringify({ _v: 1, id: "0001", topic: "session.update", data: {} });
    writeFileSync(join(sessionDir, "log.jsonl"), event1 + "\n", "utf-8");

    const req = new Request("http://x/v1/sessions/s_log_003/log?format=ndjson", { method: "GET" });
    const res = await handleSessions(req, deps, "/v1/sessions/s_log_003/log");
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("application/x-ndjson");
  });

  test("returns NDJSON format when format=jsonl", async () => {
    const deps = makeDeps("s_log_004");
    const sessionDir = join(deps.sessionsDir(), "s_log_004");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "log.jsonl"), "", "utf-8");

    const req = new Request("http://x/v1/sessions/s_log_004/log?format=jsonl", { method: "GET" });
    const res = await handleSessions(req, deps, "/v1/sessions/s_log_004/log");
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("application/x-ndjson");
  });

  test("skips events with id <= since parameter", async () => {
    const deps = makeDeps("s_log_005");
    const sessionDir = join(deps.sessionsDir(), "s_log_005");
    mkdirSync(sessionDir, { recursive: true });
    const event1 = JSON.stringify({ _v: 1, id: "0001", topic: "session.update", data: { n: 1 } });
    const event2 = JSON.stringify({ _v: 1, id: "0002", topic: "session.update", data: { n: 2 } });
    writeFileSync(join(sessionDir, "log.jsonl"), event1 + "\n" + event2 + "\n", "utf-8");

    const req = new Request("http://x/v1/sessions/s_log_005/log?since=0001", { method: "GET" });
    const res = await handleSessions(req, deps, "/v1/sessions/s_log_005/log");
    expect(res!.status).toBe(200);
  });

  test("closes stream when log file does not exist", async () => {
    const deps = makeDeps("s_log_006");
    const sessionDir = join(deps.sessionsDir(), "s_log_006");
    mkdirSync(sessionDir, { recursive: true });
    // No log.jsonl written

    const req = new Request("http://x/v1/sessions/s_log_006/log", { method: "GET" });
    const res = await handleSessions(req, deps, "/v1/sessions/s_log_006/log");
    expect(res!.status).toBe(200);
  });
});
