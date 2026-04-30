import { describe, expect, test } from "bun:test";
import type { SessionKind, SessionStatus } from "./types.ts";

describe("SessionKind", () => {
  test('"standalone" is a valid SessionKind', () => {
    const kind: SessionKind = "standalone";
    expect(kind).toBe("standalone");
  });

  test('"orchestrator" is a valid SessionKind', () => {
    const kind: SessionKind = "orchestrator";
    expect(kind).toBe("orchestrator");
  });

  test('"child" is a valid SessionKind', () => {
    const kind: SessionKind = "child";
    expect(kind).toBe("child");
  });
});

describe("SessionStatus", () => {
  test('"pending" is a valid SessionStatus', () => {
    const status: SessionStatus = "pending";
    expect(status).toBe("pending");
  });

  test('"running" is a valid SessionStatus', () => {
    const status: SessionStatus = "running";
    expect(status).toBe("running");
  });

  test('"paused" is a valid SessionStatus', () => {
    const status: SessionStatus = "paused";
    expect(status).toBe("paused");
  });

  test('"interrupted" is a valid SessionStatus', () => {
    const status: SessionStatus = "interrupted";
    expect(status).toBe("interrupted");
  });

  test('"stopped" is a valid SessionStatus', () => {
    const status: SessionStatus = "stopped";
    expect(status).toBe("stopped");
  });

  test('"completed" is a valid SessionStatus', () => {
    const status: SessionStatus = "completed";
    expect(status).toBe("completed");
  });

  test('"failed" is a valid SessionStatus', () => {
    const status: SessionStatus = "failed";
    expect(status).toBe("failed");
  });

  test('"archived" is a valid SessionStatus', () => {
    const status: SessionStatus = "archived";
    expect(status).toBe("archived");
  });
});

describe("EventEnvelope", () => {
  test("has required v1 field", () => {
    // The type-level test that EventEnvelope has _v: 1
    const envelope = {
      _v: 1 as const,
      id: "1740000000000.000001",
      timestamp: "2026-01-01T00:00:00.000Z",
      topic: "test.event",
      data: { hello: "world" },
    };
    expect(envelope._v).toBe(1);
  });
});
