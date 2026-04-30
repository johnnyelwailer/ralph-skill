import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { makeEvent, makeIdGenerator } from "@aloop/core";
import { loadBundledMigrations, migrate } from "@aloop/sqlite-db";
import {
  SchedulerMetricsProjector,
  loadSchedulerMetrics,
  type SchedulerMetricsSnapshot,
} from "./scheduler-projector.ts";

function openDb(): Database {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return db;
}

function snapshot(db: Database): SchedulerMetricsSnapshot {
  return loadSchedulerMetrics(db);
}

describe("SchedulerMetricsProjector", () => {
  test("apply handles scheduler.permit.deny — increments denial counter per gate and total decisions", () => {
    const db = openDb();
    const projector = new SchedulerMetricsProjector();
    const gen = makeIdGenerator();

    projector.apply(
      db,
      makeEvent("scheduler.permit.deny", { gate: "concurrency", reason: "too_many" }, gen),
    );
    projector.apply(
      db,
      makeEvent("scheduler.permit.deny", { gate: "concurrency", reason: "too_many" }, gen),
    );
    projector.apply(
      db,
      makeEvent("scheduler.permit.deny", { gate: "cpu", reason: "over_limit" }, gen),
    );

    const snap = snapshot(db);
    expect(snap.denialsByGate.get("concurrency")).toBe(2);
    expect(snap.denialsByGate.get("cpu")).toBe(1);
    expect(snap.denialsByGate.get("nonexistent")).toBeUndefined();
    expect(snap.totalDecisions).toBe(3); // 3 denials = 3 decisions
    db.close();
  });

  test("apply handles scheduler.permit.grant — increments total decisions only", () => {
    const db = openDb();
    const projector = new SchedulerMetricsProjector();
    const gen = makeIdGenerator();

    projector.apply(
      db,
      makeEvent("scheduler.permit.grant", { permit_id: "p1", session_id: "s1", provider_id: "openai" }, gen),
    );
    projector.apply(
      db,
      makeEvent("scheduler.permit.grant", { permit_id: "p2", session_id: "s2", provider_id: "anthropic" }, gen),
    );

    const snap = snapshot(db);
    expect(snap.denialsByGate.size).toBe(0); // no denials recorded
    expect(snap.totalDecisions).toBe(2);
    db.close();
  });

  test("apply ignores scheduler.permit.release — no side effects", () => {
    const db = openDb();
    const projector = new SchedulerMetricsProjector();
    const gen = makeIdGenerator();

    projector.apply(
      db,
      makeEvent("scheduler.permit.grant", { permit_id: "p1", session_id: "s1", provider_id: "openai" }, gen),
    );
    projector.apply(
      db,
      makeEvent("scheduler.permit.release", { permit_id: "p1" }, gen),
    );

    const snap = snapshot(db);
    expect(snap.totalDecisions).toBe(1); // only the grant counted
    expect(snap.denialsByGate.size).toBe(0);
    db.close();
  });

  test("apply ignores unknown topics", () => {
    const db = openDb();
    const projector = new SchedulerMetricsProjector();
    const gen = makeIdGenerator();

    projector.apply(db, makeEvent("some.other.topic", {}, gen));
    projector.apply(
      db,
      makeEvent("scheduler.permit.deny", { gate: "memory" }, gen),
    );

    const snap = snapshot(db);
    expect(snap.denialsByGate.get("memory")).toBe(1);
    expect(snap.totalDecisions).toBe(1);
    db.close();
  });

  test("apply normalises missing gate to 'unknown' and truncates to 64 chars", () => {
    const db = openDb();
    const projector = new SchedulerMetricsProjector();
    const gen = makeIdGenerator();

    // gate is undefined — should become "unknown"
    projector.apply(db, makeEvent("scheduler.permit.deny", {}, gen));

    const snap = snapshot(db);
    expect(snap.denialsByGate.get("unknown")).toBe(1);

    // gate longer than 64 chars — should be truncated
    const longGate = "a".repeat(80);
    projector.apply(db, makeEvent("scheduler.permit.deny", { gate: longGate }, gen));

    const snap2 = snapshot(db);
    // The stored gate should be truncated to 64 chars
    expect(snap2.denialsByGate.get("a".repeat(64))).toBe(1);
    expect(snap2.denialsByGate.has(longGate)).toBe(false);
    db.close();
  });

  test("loadSchedulerMetrics returns zero totals when table is empty", () => {
    const db = openDb();
    const snap = snapshot(db);
    expect(snap.denialsByGate.size).toBe(0);
    expect(snap.totalDecisions).toBe(0);
    db.close();
  });

  test("permit_denial_total and permit_decision_total are independent counters", () => {
    const db = openDb();
    const projector = new SchedulerMetricsProjector();
    const gen = makeIdGenerator();

    // 5 grants
    for (let i = 0; i < 5; i++) {
      projector.apply(
        db,
        makeEvent("scheduler.permit.grant", { permit_id: `p${i}`, session_id: `s${i}`, provider_id: "openai" }, gen),
      );
    }
    // 2 denials
    projector.apply(db, makeEvent("scheduler.permit.deny", { gate: "gate_a" }, gen));
    projector.apply(db, makeEvent("scheduler.permit.deny", { gate: "gate_b" }, gen));

    const snap = snapshot(db);
    expect(snap.totalDecisions).toBe(7); // 5 grants + 2 denials
    expect(snap.denialsByGate.get("gate_a")).toBe(1);
    expect(snap.denialsByGate.get("gate_b")).toBe(1);
    db.close();
  });

  test("apply uses ON CONFLICT to increment — idempotent on repeated events", () => {
    const db = openDb();
    const projector = new SchedulerMetricsProjector();
    const gen = makeIdGenerator();

    const denyEvent = makeEvent("scheduler.permit.deny", { gate: "idempotent_gate" }, gen);
    projector.apply(db, denyEvent);
    projector.apply(db, denyEvent);
    projector.apply(db, denyEvent);

    const snap = snapshot(db);
    expect(snap.denialsByGate.get("idempotent_gate")).toBe(3);
    expect(snap.totalDecisions).toBe(3);
    db.close();
  });
});
