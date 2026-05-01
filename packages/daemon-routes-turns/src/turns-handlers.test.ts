import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleTurns, type TurnsDeps } from "./turns-handlers.ts";

function makeDeps(): TurnsDeps {
  const base = mkdtempSync(join(tmpdir(), "aloop-turns-test-"));
  return {
    sessionsDir: () => join(base, "sessions"),
  };
}

/** Collect all SSE data lines from a text/event-stream Response. */
async function collectSSELines(res: Response): Promise<string[]> {
  const lines: string[] = [];
  // Bun's Response body iteration works over Uint8Array chunks
  for await (const chunk of res.body!) {
    const text = new TextDecoder().decode(chunk);
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        lines.push(line.slice(6)); // strip "data: " prefix
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

      // Should emit a "start" marker, the chunk data, and an "end" marker
      expect(payloads).toContainEqual({ session_id: "s_turns_1", turn_id: "t_turns_1", type: "start" });
      expect(payloads).toContainEqual({
        session_id: "s_turns_1",
        turn_id: "t_turns_1",
        sequence: 0,
        type: "text",
        content: { delta: "Hello" },
        final: false,
      });
      expect(payloads).toContainEqual({ session_id: "s_turns_1", turn_id: "t_turns_1", type: "end" });
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
        join(sessionDir, "log.jsonl"),
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

      const req = new Request("http://localhost/v1/sessions/s_filter_1/turns/t_target/chunks?replay=true", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_filter_1/turns/t_target/chunks");
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      // session.update event must be filtered out
      expect(payloads.find((p: unknown) => (p as {topic?: string}).topic === "session.update")).toBeUndefined();

      // Wrong-turn chunk must be filtered out
      const wrongTurn = payloads.find(
        (p: unknown) => (p as {turn_id?: string}).turn_id === "t_other",
      );
      expect(wrongTurn).toBeUndefined();

      // Correct turn chunk must be present
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

      // Only write log.jsonl — the correct file name used by session producers
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        JSON.stringify({
          _v: 1,
          id: "evt_log",
          timestamp: "2026-04-30T00:00:00.000Z",
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

    test("emits end marker even when log file does not exist", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_no_log");
      mkdirSync(sessionDir, { recursive: true });
      // No log.jsonl written

      const req = new Request("http://localhost/v1/sessions/s_no_log/turns/t_no_log/chunks", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_no_log/turns/t_no_log/chunks");
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      // Should still emit start and end markers (file not found is handled gracefully)
      expect(payloads).toContainEqual({ session_id: "s_no_log", turn_id: "t_no_log", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_no_log", turn_id: "t_no_log", type: "end" });
    });

    test("replay=false emits only start+end markers without reading the log (live-only)", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_live_only");
      mkdirSync(sessionDir, { recursive: true });
      // Pre-populate log.jsonl — live-only mode should NOT read it
      writeFileSync(
        join(sessionDir, "log.jsonl"),
        JSON.stringify({
          _v: 1,
          id: "evt_live_ignore",
          timestamp: "2026-04-30T00:00:00.000Z",
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

      const req = new Request("http://localhost/v1/sessions/s_live_only/turns/t_live/chunks?replay=false", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_live_only/turns/t_live/chunks");
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      // Must emit start and end markers
      expect(payloads).toContainEqual({ session_id: "s_live_only", turn_id: "t_live", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_live_only", turn_id: "t_live", type: "end" });
      // Must NOT emit the chunk that was in the log — this is live-only
      const ignored = payloads.find((p: unknown) => (p as {content?: {delta?: string}}).content?.delta === "Should not appear");
      expect(ignored).toBeUndefined();
    });

    test("replay=false without log file emits only start+end (graceful no-op)", async () => {
      const deps = makeDeps();
      const sessionDir = join(deps.sessionsDir(), "s_live_no_log");
      mkdirSync(sessionDir, { recursive: true });
      // No log.jsonl written

      const req = new Request("http://localhost/v1/sessions/s_live_no_log/turns/t_live/chunks?replay=false", {
        method: "GET",
      });
      const res = await handleTurns(req, deps, "/v1/sessions/s_live_no_log/turns/t_live/chunks");
      expect(res!.status).toBe(200);

      const lines = await collectSSELines(res!);
      const payloads = lines.map((l) => JSON.parse(l));

      expect(payloads).toContainEqual({ session_id: "s_live_no_log", turn_id: "t_live", type: "start" });
      expect(payloads).toContainEqual({ session_id: "s_live_no_log", turn_id: "t_live", type: "end" });
    });
  });
});
