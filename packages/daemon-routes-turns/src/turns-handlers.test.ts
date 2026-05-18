import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { handleTurns, type TurnsDeps } from "./turns-handlers.ts";
import { TurnRegistry } from "@aloop/state-sqlite";

function makeTestDb() {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE turns (
      id              TEXT PRIMARY KEY,
      session_id      TEXT NOT NULL,
      turn_id         TEXT NOT NULL,
      sequence        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      ended_at        TEXT,
      tokens_in       INTEGER NOT NULL DEFAULT 0,
      tokens_out      INTEGER NOT NULL DEFAULT 0,
      cost_usd        REAL    NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_turns_session_id ON turns(session_id);
    CREATE UNIQUE INDEX idx_turns_session_turn ON turns(session_id, turn_id);
  `);
  return db;
}

function makeDeps(): TurnsDeps {
  const base = mkdtempSync(join(tmpdir(), "aloop-turns-test-"));
  const db = makeTestDb();
  const turnRegistry = new TurnRegistry(db);
  return {
    sessionsDir: () => join(base, "sessions"),
    turns: turnRegistry,
  };
}

/** Collect all SSE data lines from a text/event-stream Response. */
async function collectSSELines(res: Response): Promise<string[]> {
  const lines: string[] = [];
  for await (const chunk of res.body!) {
    const text = new TextDecoder().decode(chunk);
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        lines.push(line.slice(6));
      }
    }
  }
  return lines;
}

describe("handleTurns", () => {
  describe("path mismatch", () => {
    test("returns undefined for unrelated pathname", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/something/else", { method: "GET" });
      const result = await handleTurns(req, deps, "/v1/something/else");
      expect(result).toBeUndefined();
    });

    test("returns undefined for /v1/sessions/:id without turns", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_1", { method: "GET" });
      const result = await handleTurns(req, deps, "/v1/sessions/s_1");
      expect(result).toBeUndefined();
    });
  });

  describe("GET /v1/sessions/:id/turns/:turnId/chunks", () => {
    test("returns SSE stream with 200 status and emits start/end markers", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_turns_1");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        JSON.stringify({
          _v: 1,
          id: "evt_001",
          timestamp: "2026-04-30T00:00:00.000Z",
          topic: "agent.chunk",
          data: {
            session_id: "s_turns_1",
            turn_id: "t_turns_1",
            sequence: 0,
            type: "text",
            content: { delta: "Hello" },
            final: false,
          },
        }) + "\n",
        "utf-8",
      );

      const req = new Request("http://localhost/v1/sessions/s_turns_1/turns/t_turns_1/chunks?replay=true", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_turns_1/turns/t_turns_1/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);
      expect(res!.headers.get("content-type")).toBe("text/event-stream");

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      expect(payloads).toContainEqual({ session_id: "s_turns_1", turn_id: "t_turns_1", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_turns_1", turn_id: "t_turns_1", type: "end" });
      expect(payloads).toContainEqual({
        session_id: "s_turns_1",
        turn_id: "t_turns_1",
        sequence: 0,
        type: "text",
        content: { delta: "Hello" },
        final: false,
      });
    });

    test("replay=true emits historical agent.chunk entries", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_replay");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        JSON.stringify({
          _v: 1,
          id: "evt_1",
          timestamp: "2026-04-30T00:00:01.000Z",
          topic: "agent.chunk",
          data: {
            session_id: "s_replay",
            turn_id: "t_1",
            sequence: 0,
            type: "text",
            content: { delta: "Line one" },
            final: false,
          },
        }) +
          "\n" +
          JSON.stringify({
            _v: 1,
            id: "evt_2",
            timestamp: "2026-04-30T00:00:02.000Z",
            topic: "agent.chunk",
            data: {
              session_id: "s_replay",
              turn_id: "t_1",
              sequence: 1,
              type: "text",
              content: { delta: "Line two" },
              final: true,
            },
          }) +
          "\n",
        "utf-8",
      );

      const req = new Request("http://localhost/v1/sessions/s_replay/turns/t_1/chunks?replay=true", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_replay/turns/t_1/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      const textChunks = payloads.filter((p: unknown) =>
        (p as { type?: string }).type === "text"
      );
      expect(textChunks).toHaveLength(2);
      expect(textChunks[0]).toMatchObject({ content: { delta: "Line one" }, final: false });
      expect(textChunks[1]).toMatchObject({ content: { delta: "Line two" }, final: true });
    });

    test("filters agent.chunk events by session_id and turn_id", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_filter_1");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        JSON.stringify({
          _v: 1,
          id: "evt_1",
          timestamp: "2026-04-30T00:00:01.000Z",
          topic: "agent.chunk",
          data: {
            session_id: "s_filter_1",
            turn_id: "t_other",
            sequence: 0,
            type: "text",
            content: { delta: "Wrong turn" },
            final: false,
          },
        }) +
          "\n" +
          JSON.stringify({
            _v: 1,
            id: "evt_2",
            timestamp: "2026-04-30T00:00:02.000Z",
            topic: "agent.chunk",
            data: {
              session_id: "s_filter_1",
              turn_id: "t_target",
              sequence: 0,
              type: "text",
              content: { delta: "Target chunk" },
              final: false,
            },
          }) +
          "\n",
        "utf-8",
      );

      const req = new Request("http://localhost/v1/sessions/s_filter_1/turns/t_target/chunks?replay=true", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_filter_1/turns/t_target/chunks");

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      const wrongTurn = payloads.find(
        (p: unknown) => (p as { turn_id?: string }).turn_id === "t_other",
      );
      expect(wrongTurn).toBeUndefined();

      expect(payloads).toContainEqual({
        session_id: "s_filter_1",
        turn_id: "t_target",
        sequence: 0,
        type: "text",
        content: { delta: "Target chunk" },
        final: false,
      });
    });

    test("streams from log.jsonl (not events.jsonl) — regression for file name mismatch", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_log_name");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        JSON.stringify({
          _v: 1,
          id: "evt_1",
          timestamp: "2026-04-30T00:00:01.000Z",
          topic: "agent.chunk",
          data: {
            session_id: "s_log_name",
            turn_id: "t_log",
            sequence: 0,
            type: "text",
            content: { delta: "From log.jsonl" },
            final: false,
          },
        }) + "\n",
        "utf-8",
      );

      const req = new Request("http://localhost/v1/sessions/s_log_name/turns/t_log/chunks?replay=true", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_log_name/turns/t_log/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      expect(payloads).toContainEqual({
        session_id: "s_log_name",
        turn_id: "t_log",
        sequence: 0,
        type: "text",
        content: { delta: "From log.jsonl" },
        final: false,
      });
    });

    test("returns only start/end markers when no log.jsonl exists", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_no_log");
      mkdirSync(sessionDir, { recursive: true });

      const req = new Request("http://localhost/v1/sessions/s_no_log/turns/t_no_log/chunks?replay=true", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_no_log/turns/t_no_log/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      expect(payloads).toContainEqual({ session_id: "s_no_log", turn_id: "t_no_log", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_no_log", turn_id: "t_no_log", type: "end" });
    });

    test("live-only (replay=false) emits end immediately", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_live_only");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        JSON.stringify({
          _v: 1,
          id: "evt_1",
          timestamp: "2026-04-30T00:00:01.000Z",
          topic: "agent.chunk",
          data: {
            session_id: "s_live_only",
            turn_id: "t_live",
            sequence: 0,
            type: "text",
            content: { delta: "Should not appear" },
            final: false,
          },
        }) + "\n",
        "utf-8",
      );

      const req = new Request("http://localhost/v1/sessions/s_live_only/turns/t_live/chunks", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_live_only/turns/t_live/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      expect(payloads).toContainEqual({ session_id: "s_live_only", turn_id: "t_live", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_live_only", turn_id: "t_live", type: "end" });
      const textChunks = payloads.filter((p: unknown) =>
        (p as { type?: string }).type === "text"
      );
      expect(textChunks).toHaveLength(0);
    });

    test("live-only emits end immediately even when no log file exists", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_live_no_log");
      mkdirSync(sessionDir, { recursive: true });

      const req = new Request("http://localhost/v1/sessions/s_live_no_log/turns/t_live/chunks", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_live_no_log/turns/t_live/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      expect(payloads).toContainEqual({ session_id: "s_live_no_log", turn_id: "t_live", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_live_no_log", turn_id: "t_live", type: "end" });
    });

    test("skips malformed JSON lines in log.jsonl without crashing", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_malformed");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        `not json at all\n${
          JSON.stringify({
            _v: 1,
            id: "evt_3",
            timestamp: "2026-04-30T00:00:02.000Z",
            topic: "agent.chunk",
            data: {
              session_id: "s_malformed",
              turn_id: "t_malformed",
              sequence: 0,
              type: "text",
              content: { delta: "Valid chunk" },
              final: false,
            },
          })
        }\n{"broken: json}\n`,
        "utf-8",
      );

      const req = new Request("http://localhost/v1/sessions/s_malformed/turns/t_malformed/chunks?replay=true", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_malformed/turns/t_malformed/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      expect(payloads).toContainEqual({ session_id: "s_malformed", turn_id: "t_malformed", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_malformed", turn_id: "t_malformed", type: "end" });
      expect(payloads).toContainEqual({
        session_id: "s_malformed",
        turn_id: "t_malformed",
        sequence: 0,
        type: "text",
        content: { delta: "Valid chunk" },
        final: false,
      });
    });
  });

  describe("method routing", () => {
    test("405 for non-GET methods on /v1/sessions/:id/turns/:turnId/chunks", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_1/turns/t_1/chunks", { method: "POST" });
      const res = await handleTurns(req, deps, "/v1/sessions/s_1/turns/t_1/chunks");
      expect(res).toBeDefined();
      expect(res!.status).toBe(405);
    });

    test("405 for PUT/DELETE on /v1/sessions/:id/turns/:turnId/chunks", async () => {
      const deps = makeDeps();
      const req1 = new Request("http://localhost/v1/sessions/s_1/turns/t_1/chunks", { method: "PUT" });
      const req2 = new Request("http://localhost/v1/sessions/s_1/turns/t_1/chunks", { method: "DELETE" });
      const res1 = await handleTurns(req1, deps, "/v1/sessions/s_1/turns/t_1/chunks");
      const res2 = await handleTurns(req2, deps, "/v1/sessions/s_1/turns/t_1/chunks");
      expect(res1!.status).toBe(405);
      expect(res2!.status).toBe(405);
    });

    test("405 for POST on /v1/sessions/:id/turns (already handled by other test)", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_1/turns", { method: "PUT" });
      const res = await handleTurns(req, deps, "/v1/sessions/s_1/turns");
      expect(res!.status).toBe(405);
    });
  });

  describe("edge cases", () => {
    test("returns undefined for empty turn_id segment", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_1/turns//chunks", { method: "GET" });
      const result = await handleTurns(req, deps, "/v1/sessions/s_1/turns//chunks");
      expect(result).toBeUndefined();
    });

    test("returns undefined for empty session_id segment", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions//turns/t_1/chunks", { method: "GET" });
      const result = await handleTurns(req, deps, "/v1/sessions//turns/t_1/chunks");
      expect(result).toBeUndefined();
    });
  });

  describe("GET /v1/sessions/:id/turns", () => {
    test("returns 200 with empty items when no turns exist", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_abc/turns", { method: "GET" });
      const res = await handleTurns(req, deps, "/v1/sessions/s_abc/turns");
      expect(res).toBeDefined();
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.items).toHaveLength(0);
    });

    test("405 for non-GET/POST methods on /v1/sessions/:id/turns", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_1/turns", { method: "DELETE" });
      const res = await handleTurns(req, deps, "/v1/sessions/s_1/turns");
      expect(res!.status).toBe(405);
    });
  });

  describe("POST /v1/sessions/:id/turns", () => {
    test("returns 400 when turn_id is missing", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_abc/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_abc/turns");
      expect(res!.status).toBe(400);
    });

    test("returns 400 when turn_id is empty string", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_abc/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turn_id: "" }),
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_abc/turns");
      expect(res!.status).toBe(400);
    });

    test("returns 200 with created turn when turn_id is valid", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_abc/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turn_id: "t_new_turn", sequence: 0 }),
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_abc/turns");
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.turn_id).toBe("t_new_turn");
      expect(body.session_id).toBe("s_abc");
      expect(body.sequence).toBe(0);
    });

    test("idempotent — creating same turn twice returns 200 not error", async () => {
      const deps = makeDeps();
      const req1 = new Request("http://localhost/v1/sessions/s_abc/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turn_id: "t_dupe" }),
      });
      const req2 = new Request("http://localhost/v1/sessions/s_abc/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turn_id: "t_dupe" }),
      });
      const res1 = await handleTurns(req1, deps, "/v1/sessions/s_abc/turns");
      const res2 = await handleTurns(req2, deps, "/v1/sessions/s_abc/turns");
      expect(res1!.status).toBe(200);
      expect(res2!.status).toBe(200);
    });
  });

  describe("GET /v1/sessions/:id/turns/:turnId", () => {
    test("returns 404 when turn does not exist", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_abc/turns/t_missing", { method: "GET" });
      const res = await handleTurns(req, deps, "/v1/sessions/s_abc/turns/t_missing");
      expect(res!.status).toBe(404);
    });

    test("returns 200 with turn data when turn exists", async () => {
      const deps = makeDeps();
      const createReq = new Request("http://localhost/v1/sessions/s_abc/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turn_id: "t_get_1" }),
      });
      await handleTurns(createReq, deps, "/v1/sessions/s_abc/turns");
      const getReq = new Request("http://localhost/v1/sessions/s_abc/turns/t_get_1", { method: "GET" });
      const res = await handleTurns(getReq, deps, "/v1/sessions/s_abc/turns/t_get_1");
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.turn_id).toBe("t_get_1");
      expect(body.session_id).toBe("s_abc");
    });
  });
});