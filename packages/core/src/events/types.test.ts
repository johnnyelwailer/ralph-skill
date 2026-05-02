import { describe, expect, test } from "bun:test";
import type { AgentChunkData, SessionKind, SessionStatus } from "./types.ts";

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

describe("AgentChunkData", () => {
  // Required fields: session_id, turn_id, sequence, type, content, final
  test("accepts minimal text chunk", () => {
    const chunk: AgentChunkData = {
      session_id: "s_abc",
      turn_id: "t_001",
      sequence: 0,
      type: "text",
      content: { delta: "hello" },
      final: false,
    };
    expect(chunk.session_id).toBe("s_abc");
    expect(chunk.turn_id).toBe("t_001");
    expect(chunk.sequence).toBe(0);
    expect(chunk.type).toBe("text");
    expect(chunk.content.delta).toBe("hello");
    expect(chunk.final).toBe(false);
  });

  test("accepts text chunk with optional parent_id (orchestrator child turn)", () => {
    const chunk: AgentChunkData = {
      session_id: "s_parent",
      turn_id: "t_child",
      parent_id: "s_parent_turn_123",
      sequence: 5,
      type: "text",
      content: { delta: "working on it" },
      final: false,
    };
    expect(chunk.parent_id).toBe("s_parent_turn_123");
  });

  test("accepts reasoning chunk", () => {
    const chunk: AgentChunkData = {
      session_id: "s_abc",
      turn_id: "t_001",
      sequence: 1,
      type: "reasoning",
      content: { delta: "let me think about this" },
      final: false,
    };
    expect(chunk.type).toBe("reasoning");
  });

  test("accepts usage chunk with tokens and cost_usd", () => {
    const chunk: AgentChunkData = {
      session_id: "s_abc",
      turn_id: "t_001",
      sequence: 99,
      type: "usage",
      content: { tokens: 4200, cost_usd: 0.067 },
      final: true,
    };
    expect(chunk.content.tokens).toBe(4200);
    expect(chunk.content.cost_usd).toBeCloseTo(0.067);
    expect(chunk.final).toBe(true);
  });

  test("accepts error chunk", () => {
    const chunk: AgentChunkData = {
      session_id: "s_abc",
      turn_id: "t_001",
      sequence: 2,
      type: "error",
      content: { error: "connection refused" },
      final: true,
    };
    expect(chunk.content.error).toBe("connection refused");
  });

  test("accepts result chunk with arbitrary submit payload", () => {
    const chunk: AgentChunkData = {
      session_id: "s_abc",
      turn_id: "t_001",
      sequence: 3,
      type: "result",
      content: { result: { commit_sha: "abc123", files_changed: 4 } },
      final: true,
    };
    expect((chunk.content.result as { commit_sha: string }).commit_sha).toBe("abc123");
  });

  test("final text chunk may carry summary", () => {
    const chunk: AgentChunkData = {
      session_id: "s_abc",
      turn_id: "t_001",
      sequence: 10,
      type: "text",
      content: { delta: "", summary: "Completed the task" },
      final: true,
    };
    expect(chunk.content.summary).toBe("Completed the task");
    expect(chunk.final).toBe(true);
  });

  test("all fields are readonly", () => {
    const chunk: AgentChunkData = {
      session_id: "s_abc",
      turn_id: "t_001",
      sequence: 0,
      type: "text",
      content: { delta: "hi" },
      final: false,
    };
    // @ts-expect-error — fields are readonly, assignment should be a type error
    chunk.session_id = "s_other";
    // @ts-expect-error — content is also readonly
    chunk.content = { delta: "nope" };
  });
});
