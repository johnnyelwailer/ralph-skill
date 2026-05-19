import { describe, expect, test } from "bun:test";
import {
  type SessionKind,
  type SessionStatus,
  type Session,
  type CreateSessionInput,
  type SessionFilter,
  type AffectsCompletedWork,
  type SessionQueueItem,
  SessionNotFoundError,
} from "./sessions-store.ts";

describe("SessionKind", () => {
  test('has "standalone" as a valid kind', () => {
    const kind: SessionKind = "standalone";
    expect(kind).toBe("standalone");
  });

  test('has "orchestrator" as a valid kind', () => {
    const kind: SessionKind = "orchestrator";
    expect(kind).toBe("orchestrator");
  });

  test('has "child" as a valid kind', () => {
    const kind: SessionKind = "child";
    expect(kind).toBe("child");
  });
});

describe("SessionStatus", () => {
  const statuses: SessionStatus[] = [
    "pending",
    "running",
    "interrupted",
    "stopped",
    "paused",
    "completed",
    "failed",
    "archived",
  ];

  for (const status of statuses) {
    test(`"${status}" is a valid SessionStatus`, () => {
      const s: SessionStatus = status;
      expect(s).toBe(status);
    });
  }
});

describe("SessionNotFoundError", () => {
  test("has correct name", () => {
    const error = new SessionNotFoundError("s_abc123");
    expect(error.name).toBe("SessionNotFoundError");
  });

  test("includes sessionId in message", () => {
    const error = new SessionNotFoundError("s_abc123");
    expect(error.message).toContain("s_abc123");
  });

  test("message format is descriptive", () => {
    const error = new SessionNotFoundError("s_xyz");
    expect(error.message).toBe("session not found: s_xyz");
  });

  test("is an instance of Error", () => {
    const error = new SessionNotFoundError("s_abc");
    expect(error).toBeInstanceOf(Error);
  });

  test("sessionId is accessible on the error", () => {
    const error = new SessionNotFoundError("s_abc123");
    expect(error.sessionId).toBe("s_abc123");
  });

  test("different IDs produce different messages", () => {
    const error1 = new SessionNotFoundError("s_aaa");
    const error2 = new SessionNotFoundError("s_bbb");
    expect(error1.message).not.toBe(error2.message);
  });
});

describe("SessionFilter", () => {
  test("can specify projectId filter", () => {
    const filter: SessionFilter = { projectId: "proj_abc" };
    expect(filter.projectId).toBe("proj_abc");
  });

  test("can specify single status filter", () => {
    const filter: SessionFilter = { status: ["running"] };
    expect(filter.status).toEqual(["running"]);
  });

  test("can specify multiple status filters", () => {
    const filter: SessionFilter = { status: ["running", "paused"] };
    expect(filter.status).toHaveLength(2);
    expect(filter.status).toContain("running");
    expect(filter.status).toContain("paused");
  });

  test("can specify kind filter", () => {
    const filter: SessionFilter = { kind: ["orchestrator", "child"] };
    expect(filter.kind).toContain("orchestrator");
    expect(filter.kind).toContain("child");
  });

  test("can specify parentSessionId filter", () => {
    const filter: SessionFilter = { parentSessionId: "s_parent_123" };
    expect(filter.parentSessionId).toBe("s_parent_123");
  });

  test("can specify limit", () => {
    const filter: SessionFilter = { limit: 25 };
    expect(filter.limit).toBe(25);
  });

  test("can specify cursor", () => {
    const filter: SessionFilter = { cursor: 100 };
    expect(filter.cursor).toBe(100);
  });

  test("can combine multiple filter fields", () => {
    const filter: SessionFilter = {
      projectId: "proj_abc",
      status: ["running", "paused"],
      kind: ["orchestrator"],
      limit: 10,
    };
    expect(filter.projectId).toBe("proj_abc");
    expect(filter.status).toHaveLength(2);
    expect(filter.kind).toEqual(["orchestrator"]);
    expect(filter.limit).toBe(10);
  });
});

describe("CreateSessionInput", () => {
  test("requires projectId, kind, workflow, providerChain", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
    };
    expect(input.projectId).toBe("proj_abc");
    expect(input.kind).toBe("standalone");
    expect(input.workflow).toBe("plan-build-review");
    expect(input.providerChain).toEqual(["provider-a"]);
  });

  test("accepts optional id", () => {
    const input: CreateSessionInput = {
      id: "s_custom_id",
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
    };
    expect(input.id).toBe("s_custom_id");
  });

  test("accepts optional issueRef", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
      issueRef: "github.com/user/repo#42",
    };
    expect(input.issueRef).toBe("github.com/user/repo#42");
  });

  test("accepts optional parentSessionId", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "child",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
      parentSessionId: "s_parent_123",
    };
    expect(input.parentSessionId).toBe("s_parent_123");
  });

  test("accepts optional maxIterations", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
      maxIterations: 10,
    };
    expect(input.maxIterations).toBe(10);
  });

  test("accepts null as maxIterations", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
      maxIterations: null,
    };
    expect(input.maxIterations).toBeNull();
  });

  test("accepts optional notes", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
      notes: "This is a test session",
    };
    expect(input.notes).toBe("This is a test session");
  });

  test("defaults notes to undefined", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
    };
    expect(input.notes).toBeUndefined();
  });

  test("accepts optional now timestamp", () => {
    const input: CreateSessionInput = {
      projectId: "proj_abc",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["provider-a"],
      now: "2024-06-01T00:00:00.000Z",
    };
    expect(input.now).toBe("2024-06-01T00:00:00.000Z");
  });
});

describe("SessionQueueItem", () => {
  test("has all required fields", () => {
    const item: SessionQueueItem = {
      id: "qi_abc123",
      sessionId: "s_abc123",
      filename: "instruction.md",
      instruction: "Fix the bug in the auth module",
      affectsCompletedWork: "yes",
      position: 0,
      createdAt: "2024-06-01T00:00:00.000Z",
    };
    expect(item.id).toBe("qi_abc123");
    expect(item.sessionId).toBe("s_abc123");
    expect(item.affectsCompletedWork).toBe("yes");
    expect(item.position).toBe(0);
  });

  test('affectsCompletedWork accepts "yes" value', () => {
    const item: SessionQueueItem = {
      id: "qi_1",
      sessionId: "s_1",
      filename: "f",
      instruction: "x",
      affectsCompletedWork: "yes",
      position: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(item.affectsCompletedWork).toBe("yes");
  });

  test('affectsCompletedWork accepts "no" value', () => {
    const item: SessionQueueItem = {
      id: "qi_1",
      sessionId: "s_1",
      filename: "f",
      instruction: "x",
      affectsCompletedWork: "no",
      position: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(item.affectsCompletedWork).toBe("no");
  });

  test('affectsCompletedWork accepts "unknown" value', () => {
    const item: SessionQueueItem = {
      id: "qi_1",
      sessionId: "s_1",
      filename: "f",
      instruction: "x",
      affectsCompletedWork: "unknown",
      position: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(item.affectsCompletedWork).toBe("unknown");
  });
});

describe("Session interface shape", () => {
  test("all fields are typed correctly", () => {
    const session: Session = {
      id: "s_abc123",
      projectId: "proj_abc",
      kind: "standalone",
      status: "running",
      workflow: "plan-build-review",
      providerChain: ["provider-a", "provider-b"],
      issueRef: "github.com/user/repo#42",
      parentSessionId: null,
      maxIterations: 10,
      notes: "Test session",
      currentIteration: 1,
      currentPhase: "build",
      currentProviderId: "provider-a",
      lastEventId: "evt_xyz",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      stoppedAt: null,
      startedAt: "2024-01-01T00:01:00.000Z",
    };
    expect(session.id).toBe("s_abc123");
    expect(session.status).toBe("running");
    expect(session.kind).toBe("standalone");
    expect(session.providerChain).toHaveLength(2);
  });

  test("null fields can be null", () => {
    const session: Session = {
      id: "s_abc",
      projectId: "proj",
      kind: "standalone",
      status: "pending",
      workflow: "test",
      providerChain: [],
      issueRef: null,
      parentSessionId: null,
      maxIterations: null,
      notes: "",
      currentIteration: 0,
      currentPhase: null,
      currentProviderId: null,
      lastEventId: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      stoppedAt: null,
      startedAt: null,
    };
    expect(session.issueRef).toBeNull();
    expect(session.parentSessionId).toBeNull();
    expect(session.currentPhase).toBeNull();
  });
});

describe("AffectsCompletedWork", () => {
  test('"yes" is a valid AffectsCompletedWork', () => {
    const v: AffectsCompletedWork = "yes";
    expect(v).toBe("yes");
  });

  test('"no" is a valid AffectsCompletedWork', () => {
    const v: AffectsCompletedWork = "no";
    expect(v).toBe("no");
  });

  test('"unknown" is a valid AffectsCompletedWork', () => {
    const v: AffectsCompletedWork = "unknown";
    expect(v).toBe("unknown");
  });
});