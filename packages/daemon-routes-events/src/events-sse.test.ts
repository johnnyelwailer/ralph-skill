/**
 * Tests for events-sse.ts — SSE event streaming handler and helpers.
 */
import { describe, expect, test } from "bun:test";
import { handleEventsSSE, topicMatches, type EventsDeps } from "./events-sse.ts";

// ------------------------------------------------------------------
// topicMatches — unit tests (pure function)
// ------------------------------------------------------------------

describe("topicMatches", () => {
  describe("wildcard * — matches exactly one dot-separated segment", () => {
    test('"*" matches a single-segment topic', () => {
      expect(topicMatches("session", ["*"])).toBe(true);
    });

    test('"*" does not match multi-segment topic', () => {
      expect(topicMatches("session.update", ["*"])).toBe(false);
      expect(topicMatches("session.child.update", ["*"])).toBe(false);
    });

    test('"*" matches provider name', () => {
      expect(topicMatches("opencode", ["*"])).toBe(true);
    });

    test('"*" matches empty string topic (single segment by split)', () => {
      // "".split(".") === [""], length === 1, so "*" matches it
      expect(topicMatches("", ["*"])).toBe(true);
    });
  });

  describe("exact topic match", () => {
    test("exact match returns true", () => {
      expect(topicMatches("session.update", ["session.update"])).toBe(true);
    });

    test("exact mismatch returns false", () => {
      expect(topicMatches("session.update", ["session.create"])).toBe(false);
    });

    test("partial list match returns true when any pattern matches", () => {
      expect(topicMatches("session.update", ["session.create", "session.update"])).toBe(true);
    });
  });

  describe("segment-level wildcard", () => {
    test('"*" in pattern replaces exactly one segment', () => {
      expect(topicMatches("session.update", ["session.*"])).toBe(true);
      expect(topicMatches("session.child.update", ["session.*"])).toBe(false);
    });

    test('"*" at start matches single leading segment', () => {
      expect(topicMatches("session.update", ["*.update"])).toBe(true);
      expect(topicMatches("child.session.update", ["*.update"])).toBe(false);
    });

    test('"*" in middle matches single middle segment', () => {
      expect(topicMatches("session.child.update", ["session.*.update"])).toBe(true);
      expect(topicMatches("session.update", ["session.*.update"])).toBe(false);
    });

    test('multiple "*" segments each match exactly one segment', () => {
      expect(topicMatches("a.b.c", ["*.b.*"])).toBe(true);
      expect(topicMatches("a.x.c", ["*.b.*"])).toBe(false);
      expect(topicMatches("a.b.c.d", ["*.b.*"])).toBe(false);
    });
  });

  describe("empty pattern list", () => {
    test("empty pattern list returns true (matches all)", () => {
      expect(topicMatches("anything", [])).toBe(true);
      expect(topicMatches("", [])).toBe(true);
    });
  });

  describe("multiple patterns", () => {
    test("returns true if any pattern matches", () => {
      expect(topicMatches("session.update", ["foo.bar", "session.update"])).toBe(true);
    });

    test("returns false if no pattern matches", () => {
      expect(topicMatches("session.update", ["foo.bar", "baz.qux"])).toBe(false);
    });

    test("wildcard combined with exact matches", () => {
      expect(topicMatches("session", ["foo.bar", "*"])).toBe(true);
    });
  });

  describe("segment count mismatch", () => {
    test("different segment counts return false", () => {
      expect(topicMatches("session.update", ["session.update.extra"])).toBe(false);
      expect(topicMatches("session.update.extra", ["session.update"])).toBe(false);
    });
  });
});

// ------------------------------------------------------------------
// handleEventsSSE — method routing and error handling tests
// ------------------------------------------------------------------

function makeMockDeps(logPath: string, readEvents: Array<{ id: string; topic: string; data: unknown; timestamp: string }>): EventsDeps {
  const events = readEvents;
  return {
    logPath,
    store: {
      append: async () => {},
      close: async () => {},
      read: async function* (path: string, _since?: string) {
        if (path === logPath) {
          for (const env of events) {
            yield { ...env, _v: 1 as const };
          }
        }
      },
    },
    config: {},
  };
}

describe("handleEventsSSE", () => {
  test("returns 405 for non-GET request", async () => {
    const deps = makeMockDeps("/tmp/doesnotexist", []);
    const req = new Request("http://localhost/v1/events", { method: "POST" });
    const resp = await handleEventsSSE(req, deps, "/v1/events");
    expect(resp).not.toBeUndefined();
    expect(resp!.status).toBe(405);
    const body = await resp!.clone().json();
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("returns undefined for non-events pathname", async () => {
    const deps = makeMockDeps("/tmp/doesnotexist", []);
    const req = new Request("http://localhost/v1/other", { method: "GET" });
    const resp = await handleEventsSSE(req, deps, "/v1/other");
    expect(resp).toBeUndefined();
  });

  test("returns 405 for PUT request", async () => {
    const deps = makeMockDeps("/tmp/doesnotexist", []);
    const req = new Request("http://localhost/v1/events", { method: "PUT" });
    const resp = await handleEventsSSE(req, deps, "/v1/events");
    expect(resp).not.toBeUndefined();
    expect(resp!.status).toBe(405);
  });

  test("returns 405 for DELETE request", async () => {
    const deps = makeMockDeps("/tmp/doesnotexist", []);
    const req = new Request("http://localhost/v1/events", { method: "DELETE" });
    const resp = await handleEventsSSE(req, deps, "/v1/events");
    expect(resp).not.toBeUndefined();
    expect(resp!.status).toBe(405);
  });
});

/**
 * NOTE on SSE stream body tests:
 * Testing the SSE stream body (events flushed through the ReadableStream) is not
 * feasible with the current mock because Response.clone().text() never resolves on
 * an open SSE stream. The stream is intentionally infinite — tailLogFile uses
 * setInterval to poll the log file and has no natural close condition when reading
 * from a mock store that yields synchronously then continues polling.
 *
 * The critical SSE contract items (SSE headers, 405 routing, URL parsing, filter
 * logic via shouldSkip) ARE indirectly verified through:
 *   - "returns 200 with text/event-stream..." test (headers)
 *   - topicMatches unit tests (filter logic for topics)
 *
 * The following behaviors are UNTESTED due to the stream-timeout constraint:
 *   - SSE body content with filter params applied (topics, session_id, since)
 *   - SSE envelope format in actual stream output
 *   - Historical flush ordering in actual stream
 *
 * To test these properly, the mock store interface would need a way to signal
 * "end of historical data" to unblock the ReadableStream reader, or the SSE
 * handler's streaming part would need to be split into a separate testable unit.
 */
async function collectSSEWithTimeout(_resp: Response, _ms: number): Promise<string> {
  return "";
}

describe("SSE stream response headers", () => {
  test("returns 200 with text/event-stream Content-Type and no-cache", async () => {
    const deps = makeMockDeps("/tmp/doesnotexist", []);
    const req = new Request("http://localhost/v1/events", { method: "GET" });
    const resp = await handleEventsSSE(req, deps, "/v1/events");
    expect(resp).not.toBeUndefined();
    expect(resp!.status).toBe(200);
    expect(resp!.headers.get("Content-Type")).toBe("text/event-stream");
    expect(resp!.headers.get("Cache-Control")).toBe("no-cache");
    expect(resp!.headers.get("X-Accel-Buffering")).toBe("no");
  });
});
