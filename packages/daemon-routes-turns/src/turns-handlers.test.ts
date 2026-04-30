import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleTurns, type TurnsDeps } from "./turns-handlers.ts";

function makeDeps(): TurnsDeps {
  const base = mkdtempSync(join(tmpdir(), "aloop-turns-test-"));
  return {
    sessionsDir: () => join(base, "sessions"),
  };
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
    test("returns SSE stream with 200 status", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_turns_1");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "events.jsonl"),
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

      const req = new Request("http://localhost/v1/sessions/s_turns_1/turns/t_turns_1/chunks", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_turns_1/turns/t_turns_1/chunks");

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);
      expect(res!.headers.get("content-type")).toBe("text/event-stream");
    });

    test("returns 405 for POST method", async () => {
      const deps = makeDeps();
      const req = new Request("http://localhost/v1/sessions/s_1/turns/t_1/chunks", {
        method: "POST",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_1/turns/t_1/chunks");
      expect(res!.status).toBe(405);
    });

    test("filters agent.chunk events by session_id and turn_id", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_filter_1");
      mkdirSync(sessionDir, { recursive: true });

      writeFileSync(
        join(sessionDir, "events.jsonl"),
        [
          JSON.stringify({
            _v: 1,
            id: "evt_other",
            timestamp: "2026-04-30T00:00:00.000Z",
            topic: "session.update",
            data: { session_id: "s_filter_1", phase: "build" },
          }) + "\n",
          JSON.stringify({
            _v: 1,
            id: "evt_target",
            timestamp: "2026-04-30T00:00:01.000Z",
            topic: "agent.chunk",
            data: {
              session_id: "s_filter_1",
              turn_id: "t_target",
              sequence: 0,
              type: "text",
              content: { delta: "Target chunk" },
              final: false,
            },
          }) + "\n",
          JSON.stringify({
            _v: 1,
            id: "evt_wrong_turn",
            timestamp: "2026-04-30T00:00:02.000Z",
            topic: "agent.chunk",
            data: {
              session_id: "s_filter_1",
              turn_id: "t_other",
              sequence: 0,
              type: "text",
              content: { delta: "Wrong turn" },
              final: false,
            },
          }) + "\n",
        ].join(""),
        "utf-8",
      );

      const req = new Request("http://localhost/v1/sessions/s_filter_1/turns/t_target/chunks", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_filter_1/turns/t_target/chunks");
      expect(res!.status).toBe(200);
    });
  });
});