import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import {
  clearPermits,
  projectPermitRemoval,
  projectGrantedPermit,
  type GrantedPermitProjection,
} from "./permits.ts";
import { PermitRegistry } from "./permits.ts";

describe("PermitRegistry", () => {
  let dir: string;
  let registry: PermitRegistry;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-permits-"));
    dbPath = join(dir, "db.sqlite");
    const { db } = openDatabase(dbPath);
    registry = new PermitRegistry(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("get returns undefined for unknown id", () => {
    expect(registry.get("nope")).toBeUndefined();
  });

  test("get finds an inserted permit", () => {
    const { db } = openDatabase(dbPath);
    const proj: GrantedPermitProjection = {
      permitId: "perm_x",
      sessionId: "s_1",
      providerId: "opencode",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    };
    projectGrantedPermit(db, proj);

    const found = registry.get("perm_x");
    expect(found).toEqual({
      id: "perm_x",
      sessionId: "s_1",
      providerId: "opencode",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });
    db.close();
  });

  test("list returns permits ordered by granted_at then id", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, {
      permitId: "perm_b",
      sessionId: "s_1",
      providerId: "opencode",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:02:00.000Z",
      expiresAt: "2026-01-01T00:07:00.000Z",
    });
    projectGrantedPermit(db, {
      permitId: "perm_a",
      sessionId: "s_2",
      providerId: "codex",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:01:00.000Z",
      expiresAt: "2026-01-01T00:06:00.000Z",
    });
    projectGrantedPermit(db, {
      permitId: "perm_c",
      sessionId: "s_3",
      providerId: "claude",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:01:00.000Z", // same grantedAt as perm_a
      expiresAt: "2026-01-01T00:06:00.000Z",
    });

    const list = new PermitRegistry(db).list();
    expect(list.map((p) => p.id)).toEqual(["perm_a", "perm_c", "perm_b"]);
    db.close();
  });

  test("list returns empty array when no permits exist", () => {
    const { db } = openDatabase(dbPath);
    expect(new PermitRegistry(db).list()).toEqual([]);
    db.close();
  });

  test("countActive returns 0 when no permits", () => {
    const { db } = openDatabase(dbPath);
    expect(new PermitRegistry(db).countActive()).toBe(0);
    db.close();
  });

  test("countActive returns correct count", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, {
      permitId: "p1",
      sessionId: "s",
      providerId: "x",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });
    projectGrantedPermit(db, {
      permitId: "p2",
      sessionId: "s",
      providerId: "y",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });
    expect(new PermitRegistry(db).countActive()).toBe(2);
    db.close();
  });

  test("listExpired returns nothing when no permits are expired", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, {
      permitId: "future",
      sessionId: "s",
      providerId: "x",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T23:59:59.000Z",
    });
    expect(new PermitRegistry(db).listExpired("2026-01-01T00:00:00.000Z")).toEqual([]);
    db.close();
  });

  test("listExpired returns permits whose expires_at <= nowIso", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, {
      permitId: "expired_1",
      sessionId: "s",
      providerId: "x",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
    projectGrantedPermit(db, {
      permitId: "still_live",
      sessionId: "s",
      providerId: "y",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });
    projectGrantedPermit(db, {
      permitId: "expired_2",
      sessionId: "s",
      providerId: "z",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:02:00.000Z",
      expiresAt: "2026-01-01T00:07:00.000Z",
    });

    const expired = new PermitRegistry(db).listExpired("2026-01-01T00:06:00.000Z");
    // expired_1 expires at 00:05:00 (≤ 00:06:00 ✓); still_live at 00:10:00 (> 00:06:00 ✗);
    // expired_2 at 00:07:00 (> 00:06:00 ✗)
    expect(expired.map((p) => p.id)).toEqual(["expired_1"]);
    db.close();
  });

  test("listExpired orders results by expires_at then id", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, {
      permitId: "later",
      sessionId: "s",
      providerId: "x",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });
    projectGrantedPermit(db, {
      permitId: "sooner",
      sessionId: "s",
      providerId: "x",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });

    const expired = new PermitRegistry(db).listExpired("2026-01-01T00:20:00.000Z");
    expect(expired.map((p) => p.id)).toEqual(["sooner", "later"]);
    db.close();
  });
});

describe("projection functions", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-permits-"));
    dbPath = join(dir, "db.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("projectGrantedPermit inserts a new permit", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, {
      permitId: "new_permit",
      sessionId: "s_1",
      providerId: "opencode",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });

    const row = db
      .query<{
        id: string;
        session_id: string;
        provider_id: string;
        ttl_seconds: number;
        granted_at: string;
        expires_at: string;
      }, [string]>("SELECT * FROM permits WHERE id = ?")
      .get("new_permit");

    expect(row).toEqual({
      id: "new_permit",
      session_id: "s_1",
      provider_id: "opencode",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-01T00:10:00.000Z",
    });
    db.close();
  });

  test("projectGrantedPermit upserts on conflict (idempotent grant)", () => {
    const { db } = openDatabase(dbPath);
    const original: GrantedPermitProjection = {
      permitId: "dup_permit",
      sessionId: "s_old",
      providerId: "codex",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    };
    projectGrantedPermit(db, original);

    // Same permit re-granted (e.g. renewal)
    const renewed: GrantedPermitProjection = {
      permitId: "dup_permit",
      sessionId: "s_new",
      providerId: "opencode",
      ttlSeconds: 900,
      grantedAt: "2026-01-01T01:00:00.000Z",
      expiresAt: "2026-01-01T01:15:00.000Z",
    };
    projectGrantedPermit(db, renewed);

    const rows = db.query<{ id: string; session_id: string }, []>("SELECT id, session_id FROM permits").all();
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual({ id: "dup_permit", session_id: "s_new" });
    db.close();
  });

  test("projectPermitRemoval deletes the permit by id", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, {
      permitId: "to_remove",
      sessionId: "s",
      providerId: "x",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });

    projectPermitRemoval(db, "to_remove");

    const row = db.query<{ id: string }, [string]>("SELECT id FROM permits WHERE id = ?").get("to_remove");
    // bun:sqlite get() returns null (not undefined) when no row found
    expect(row).toBeNull();
    db.close();
  });

  test("projectPermitRemoval is safe to call on non-existent id", () => {
    const { db } = openDatabase(dbPath);
    // Should not throw
    expect(() => projectPermitRemoval(db, "does_not_exist")).not.toThrow();
    db.close();
  });

  test("clearPermits removes all permits", () => {
    const { db } = openDatabase(dbPath);
    projectGrantedPermit(db, { permitId: "p1", sessionId: "s", providerId: "x", ttlSeconds: 600, grantedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:10:00.000Z" });
    projectGrantedPermit(db, { permitId: "p2", sessionId: "s", providerId: "y", ttlSeconds: 600, grantedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:10:00.000Z" });

    clearPermits(db);

    const rows = db.query<{}, []>("SELECT COUNT(*) AS count FROM permits").all();
    expect(rows[0]!.count).toBe(0);
    db.close();
  });
});
