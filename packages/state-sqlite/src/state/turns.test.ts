import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TurnRegistry, TurnNotFoundError } from "./turns.ts";

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
  return { db };
}

function makeRegistry() {
  const { db } = makeTestDb();
  return { registry: new TurnRegistry(db), db };
}

test("create inserts a turn with all fields", () => {
  const { registry } = makeRegistry();
  const now = "2026-05-01T10:00:00Z";
  const turn = registry.create({
    id: "t_001",
    sessionId: "s_abc",
    turnId: "t_turn_1",
    sequence: 0,
    now,
  });
  expect(turn.id).toBe("t_001");
  expect(turn.sessionId).toBe("s_abc");
  expect(turn.turnId).toBe("t_turn_1");
  expect(turn.sequence).toBe(0);
  expect(turn.createdAt).toBe(now);
  expect(turn.endedAt).toBeNull();
  expect(turn.tokensIn).toBe(0);
  expect(turn.tokensOut).toBe(0);
  expect(turn.costUsd).toBe(0);
});

test("create auto-generates id when not provided", () => {
  const { registry } = makeRegistry();
  const turn = registry.create({
    sessionId: "s_abc",
    turnId: "t_turn_2",
  });
  expect(turn.id).toMatch(/^[a-f0-9-]{36}$/);
});

test("create is idempotent — duplicate session_id+turn_id does not error", () => {
  const { registry } = makeRegistry();
  registry.create({ sessionId: "s_abc", turnId: "t_turn_3" });
  expect(() =>
    registry.create({ sessionId: "s_abc", turnId: "t_turn_3" })
  ).not.toThrow();
});

test("getBySessionAndTurn returns turn when it exists", () => {
  const { registry } = makeRegistry();
  registry.create({ id: "t_002", sessionId: "s_abc", turnId: "t_turn_4" });
  const turn = registry.getBySessionAndTurn("s_abc", "t_turn_4");
  expect(turn).toBeDefined();
  expect(turn!.id).toBe("t_002");
});

test("getBySessionAndTurn returns undefined when not found", () => {
  const { registry } = makeRegistry();
  const turn = registry.getBySessionAndTurn("s_missing", "t_missing");
  expect(turn).toBeUndefined();
});

test("list returns all turns for a session", () => {
  const { registry } = makeRegistry();
  registry.create({ sessionId: "s_abc", turnId: "t_a" });
  registry.create({ sessionId: "s_abc", turnId: "t_b" });
  registry.create({ sessionId: "s_abc", turnId: "t_c" });
  registry.create({ sessionId: "s_other", turnId: "t_a" });
  const turns = registry.list({ sessionId: "s_abc" });
  expect(turns).toHaveLength(3);
  expect(turns.every((t) => t.sessionId === "s_abc")).toBe(true);
});

test("list returns all turns when no filter", () => {
  const { registry } = makeRegistry();
  registry.create({ sessionId: "s_1", turnId: "t_1" });
  registry.create({ sessionId: "s_2", turnId: "t_1" });
  const turns = registry.list();
  expect(turns).toHaveLength(2);
});

test("list returns empty array when no turns", () => {
  const { registry } = makeRegistry();
  const turns = registry.list();
  expect(turns).toHaveLength(0);
});

test("update sets ended_at and usage fields", () => {
  const { registry } = makeRegistry();
  const turn = registry.create({ sessionId: "s_abc", turnId: "t_update" });
  const updated = registry.update(turn.id, {
    endedAt: "2026-05-01T11:00:00Z",
    tokensIn: 1500,
    tokensOut: 300,
    costUsd: 0.05,
  });
  expect(updated.endedAt).toBe("2026-05-01T11:00:00Z");
  expect(updated.tokensIn).toBe(1500);
  expect(updated.tokensOut).toBe(300);
  expect(updated.costUsd).toBe(0.05);
});

test("update is no-op when no fields provided", () => {
  const { registry } = makeRegistry();
  const turn = registry.create({ sessionId: "s_abc", turnId: "t_noop" });
  const updated = registry.update(turn.id, {});
  expect(updated.id).toBe(turn.id);
  expect(updated.endedAt).toBeNull();
});

test("update throws TurnNotFoundError for unknown id", () => {
  const { registry } = makeRegistry();
  expect(() =>
    registry.update("t_unknown", { endedAt: "2026-05-01Z" })
  ).toThrow(TurnNotFoundError);
});

test("update partial — only endedAt", () => {
  const { registry } = makeRegistry();
  const turn = registry.create({ sessionId: "s_abc", turnId: "t_partial" });
  const updated = registry.update(turn.id, { endedAt: "2026-05-01T12:00:00Z" });
  expect(updated.endedAt).toBe("2026-05-01T12:00:00Z");
  expect(updated.tokensIn).toBe(0);
});