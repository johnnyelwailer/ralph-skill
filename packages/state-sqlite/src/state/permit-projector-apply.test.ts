import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeEvent, makeIdGenerator } from "@aloop/core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { migrate, loadBundledMigrations } from "./migrations.ts";
import { PermitProjector } from "./permit-projector.ts";
import { PermitRegistry } from "./permits.ts";

describe("PermitProjector.apply", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase> extends { db: infer D } ? D : never;
  let projector: PermitProjector;
  let nextId: () => string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-permit-apply-"));
    const { db: database } = openDatabase(join(dir, "test.sqlite"));
    db = database;
    migrate(db, loadBundledMigrations());
    projector = new PermitProjector();
    nextId = makeIdGenerator(() => 1700000000000);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("permit.grant inserts a permit into the registry", () => {
    const event = makeEvent(
      "scheduler.permit.grant",
      {
        permit_id: "perm_test_grant",
        session_id: "s_grant",
        provider_id: "opencode",
        ttl_seconds: 300,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:05:00.000Z",
      },
      nextId,
      () => 1700000000000,
    );

    projector.apply(db, event);

    const permits = new PermitRegistry(db);
    const found = permits.get("perm_test_grant");
    expect(found).toBeDefined();
    expect(found!.sessionId).toBe("s_grant");
    expect(found!.providerId).toBe("opencode");
    expect(found!.ttlSeconds).toBe(300);
    expect(found!.expiresAt).toBe("2026-01-01T00:05:00.000Z");
  });

  test("permit.release removes the permit from the registry", () => {
    // First grant
    const grantEvent = makeEvent(
      "scheduler.permit.grant",
      {
        permit_id: "perm_test_release",
        session_id: "s_release",
        provider_id: "codex",
        ttl_seconds: 600,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:10:00.000Z",
      },
      nextId,
      () => 1700000000000,
    );
    projector.apply(db, grantEvent);

    // Then release
    const releaseEvent = makeEvent(
      "scheduler.permit.release",
      { permit_id: "perm_test_release" },
      nextId,
      () => 1700000001000,
    );
    projector.apply(db, releaseEvent);

    const permits = new PermitRegistry(db);
    expect(permits.get("perm_test_release")).toBeUndefined();
  });

  test("permit.expired removes the permit from the registry", () => {
    // First grant
    const grantEvent = makeEvent(
      "scheduler.permit.grant",
      {
        permit_id: "perm_test_expired",
        session_id: "s_expired",
        provider_id: "claude",
        ttl_seconds: 120,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:02:00.000Z",
      },
      nextId,
      () => 1700000000000,
    );
    projector.apply(db, grantEvent);

    const permits = new PermitRegistry(db);
    expect(permits.get("perm_test_expired")).toBeDefined();

    // Then expire
    const expiredEvent = makeEvent(
      "scheduler.permit.expired",
      { permit_id: "perm_test_expired" },
      nextId,
      () => 1700000002000,
    );
    projector.apply(db, expiredEvent);

    expect(permits.get("perm_test_expired")).toBeUndefined();
  });

  test("unknown topic is silently ignored (no-op)", () => {
    const event = makeEvent(
      "some.unknown.topic",
      { anything: "here" },
      nextId,
      () => 1700000000000,
    );

    // Should not throw
    expect(() => projector.apply(db, event)).not.toThrow();

    // Registry should be empty since no permit was added
    const permits = new PermitRegistry(db);
    expect(permits.list()).toEqual([]);
  });
});
