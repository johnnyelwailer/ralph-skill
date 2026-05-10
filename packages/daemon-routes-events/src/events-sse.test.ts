import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleEventsSSE, topicMatches } from "./events-sse";

function makeEvent(topic: string, data: Record<string, unknown>, id: string): string {
  return JSON.stringify({ _v: 1, id, timestamp: new Date().toISOString(), topic, data }) + "\n";
}

function makeStore(logPath: string, since?: string) {
  return {
    append: async () => {},
    async *read(_path: string, sinceId?: string): AsyncIterable<Record<string, unknown>> {
      if (!existsSync(logPath)) return;
      const rl = createInterface({
        input: createReadStream(logPath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });
      try {
        for await (const line of rl) {
          if (!line.trim()) continue;
          const env = JSON.parse(line) as Record<string, unknown>;
          if ((sinceId ?? sinceId ?? sinceId) !== undefined && (env.id as string) <= (sinceId ?? since ?? "")) continue;
          yield env;
        }
      } finally {
        rl.close();
      }
    },
    close: async () => {},
  };
}

function makeDeps(logPath: string) {
  return { store: makeStore(logPath), logPath, config: {} };
}

/** Collect SSE frames from a streaming response up to timeoutMs, then cancel. */
async function collectSSE(res: Response, timeoutMs = 600): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let output = "";
  try {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      // Always wait for data first; deadline check happens AFTER the await
      // so we never process a frame after the deadline has passed.
      const remaining = Math.max(1, deadline - Date.now());
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), remaining)),
      ]);
      if (done || Date.now() >= deadline) break;
      output += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel();
  }
  return output;
}

describe("handleEventsSSE", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-evt-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns undefined for unrelated pathname", async () => {
    const deps = makeDeps(join(dir, "log.jsonl"));
    const req = new Request("http://localhost/v1/other", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/other");
    expect(res).toBeUndefined();
  });

  test("returns 405 for non-GET methods", async () => {
    const deps = makeDeps(join(dir, "log.jsonl"));
    const req = new Request("http://localhost/v1/events", { method: "POST" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("streams historical events as SSE on GET /v1/events", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1", phase: "build" }, "1744986531000.000001"));
    appendFileSync(logPath, makeEvent("provider.health", { providerId: "opencode", status: "healthy" }, "1744986531000.000002"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const output = await collectSSE(res, 800);
    expect(output).toContain("event: session.update");
    expect(output).toContain("event: provider.health");
    expect(output).toContain('"session_id":"s_1"');
  });

  test("filters by session_id query param", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1" }, "1744986531000.000001"));
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_2" }, "1744986531000.000002"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events?session_id=s_1", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 800);
    expect(output).toContain("s_1");
    expect(output).not.toContain("s_2");
  });

  test("filters by parent query param", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "child_1", parent_session_id: "orch_1" }, "1744986531000.000001"));
    appendFileSync(logPath, makeEvent("session.update", { session_id: "child_2", parent_session_id: "orch_2" }, "1744986531000.000002"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events?parent=orch_1", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 800);
    expect(output).toContain("child_1");
    expect(output).not.toContain("child_2");
  });

  test("filters by topics glob pattern", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1" }, "1744986531000.000001"));
    appendFileSync(logPath, makeEvent("provider.health", { providerId: "opencode" }, "1744986531000.000002"));
    appendFileSync(logPath, makeEvent("scheduler.permit.grant", { permit_id: "p_1" }, "1744986531000.000003"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events?topics=session.*,provider.*", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 800);
    expect(output).toContain("session.update");
    expect(output).toContain("provider.health");
    expect(output).not.toContain("scheduler.permit");
  });

  test("replays from since event id", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1" }, "1744986531000.000001"));
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_2" }, "1744986531000.000002"));
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_3" }, "1744986531000.000003"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events?since=1744986531000.000002", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 800);
    expect(output).toContain("s_3");
    expect(output).not.toContain("s_1");
    expect(output).not.toContain("s_2");
  });

  test("uses Last-Event-ID header as fallback for since", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1" }, "1744986531000.000001"));
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_2" }, "1744986531000.000002"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events", {
      method: "GET",
      headers: { "Last-Event-ID": "1744986531000.000001" },
    });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 800);
    expect(output).toContain("s_2");
    expect(output).not.toContain("s_1");
  });

  test("uses since query param over Last-Event-ID header", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1" }, "1744986531000.000001"));
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_2" }, "1744986531000.000002"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events?since=1744986531000.000001", {
      method: "GET",
      headers: { "Last-Event-ID": "1744986531000.000000" },
    });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 800);
    expect(output).toContain("s_2");
    expect(output).not.toContain("s_1");
  });

  test("skips malformed lines without crashing", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, "NOT JSON AT ALL\n");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1" }, "1744986531000.000001"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 4890);
    // Malformed line triggers an SSE error comment — that's correct SSE error handling.
    // The valid event s_1 must still be present.
    expect(output).toContain("s_1");
  });

  test("returns empty stream on missing log file", async () => {
    const logPath = join(dir, "nonexistent.jsonl");
    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const output = await collectSSE(res, 300);
    expect(output).toBe("");
  });

  test("uses event id as SSE id for client resumption", async () => {
    const logPath = join(dir, "log.jsonl");
    writeFileSync(logPath, "");
    appendFileSync(logPath, makeEvent("session.update", { session_id: "s_1" }, "1744986531000.000042"));

    const deps = makeDeps(logPath);
    const req = new Request("http://localhost/v1/events", { method: "GET" });
    const res = await handleEventsSSE(req, deps as any, "/v1/events") as Response;

    const output = await collectSSE(res, 800);
    expect(output).toContain("id: 1744986531000.000042");
  });
});

describe("topicMatches", () => {
  test("exact match", () => {
    expect(topicMatches("session.update", ["session.update"])).toBe(true);
    expect(topicMatches("session.update", ["provider.health"])).toBe(false);
  });

  test('"*" matches exactly one segment', () => {
    expect(topicMatches("session", ["*"])).toBe(true);
    expect(topicMatches("session.update", ["*"])).toBe(false);
    expect(topicMatches("session.child.update", ["*"])).toBe(false);
  });

  test('"*" matches single-segment topics', () => {
    expect(topicMatches("error", ["*"])).toBe(true);
    expect(topicMatches("provider.health", ["*"])).toBe(false);
  });

  test("segment wildcard in multi-segment pattern", () => {
    expect(topicMatches("session.update", ["session.*"])).toBe(true);
    expect(topicMatches("session.child.update", ["session.*"])).toBe(false);
    expect(topicMatches("provider.health", ["session.*"])).toBe(false);
  });

  test("multiple patterns", () => {
    expect(topicMatches("session.update", ["session.*", "provider.*"])).toBe(true);
    expect(topicMatches("provider.health", ["session.*", "provider.*"])).toBe(true);
    expect(topicMatches("scheduler.permit", ["session.*", "provider.*"])).toBe(false);
  });

  test("empty patterns = match all", () => {
    expect(topicMatches("anything.here", [])).toBe(true);
    expect(topicMatches("x", [])).toBe(true);
  });
});
