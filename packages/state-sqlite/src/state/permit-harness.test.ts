import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { loadBundledMigrations, migrate, openDatabase } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PermitProjector } from "./permit-projector.ts";
import { PermitRegistry } from "./permits.ts";

type Harness = {
  db: Database;
  dir: string;
  close(): void;
};

function makeHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "aloop-permit-harness-"));
  const dbPath = join(dir, "db.sqlite");
  const { db } = openDatabase(dbPath);
  return { db, dir, close() { db.close(); } };
}

describe("PermitProjector — permit grant branch", () => {
  let h: Harness;

  beforeEach(() => { h = makeHarness(); });
  afterEach(() => { h.close(); rmSync(h.dir, { recursive: true, force: true }); });

  test("apply inserts a permit and it is queryable via PermitRegistry", () => {
    const projector = new PermitProjector();

    projector.apply(h.db, {
      _v: 1,
      id: "evt_g1",
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:00:00.000Z",
      data: {
        permit_id: "perm_direct_g",
        session_id: "s_direct",
        provider_id: "opencode",
        ttl_seconds: 600,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:10:00.000Z",
      },
    });

    const permits = new PermitRegistry(h.db);
    expect(permits.countActive()).toBe(1);
    const p = permits.get("perm_direct_g");
    expect(p?.sessionId).toBe("s_direct");
    expect(p?.providerId).toBe("opencode");
    expect(p?.ttlSeconds).toBe(600);
  });

  test("apply grant with duplicate permit_id updates the existing permit (ON CONFLICT)", () => {
    const projector = new PermitProjector();

    projector.apply(h.db, {
      _v: 1,
      id: "evt_g_first",
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:00:00.000Z",
      data: {
        permit_id: "perm_same",
        session_id: "s_first",
        provider_id: "opencode",
        ttl_seconds: 300,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:05:00.000Z",
      },
    });

    // Grant again with same ID — ON CONFLICT should update
    projector.apply(h.db, {
      _v: 1,
      id: "evt_g_second",
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:05:00.000Z",
      data: {
        permit_id: "perm_same",
        session_id: "s_second",
        provider_id: "codex",
        ttl_seconds: 600,
        granted_at: "2026-01-01T00:05:00.000Z",
        expires_at: "2026-01-01T00:15:00.000Z",
      },
    });

    const permits = new PermitRegistry(h.db);
    // Only one permit (upsert)
    expect(permits.countActive()).toBe(1);
    // Updated values
    const p = permits.get("perm_same");
    expect(p?.sessionId).toBe("s_second");
    expect(p?.providerId).toBe("codex");
    expect(p?.ttlSeconds).toBe(600);
  });
});

describe("PermitRegistry — listExpired and get", () => {
  let h: Harness;

  beforeEach(() => { h = makeHarness(); });
  afterEach(() => { h.close(); rmSync(h.dir, { recursive: true, force: true }); });

  test("listExpired — returns only permits past the given timestamp", () => {
    const projector = new PermitProjector();

    // Expired long ago
    projector.apply(h.db, {
      _v: 1,
      id: "evt_e1",
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:00:00.000Z",
      data: {
        permit_id: "perm_old",
        session_id: "s_old",
        provider_id: "opencode",
        ttl_seconds: 1,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:00:01.000Z",
      },
    });

    // Still valid
    projector.apply(h.db, {
      _v: 1,
      id: "evt_e2",
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T01:00:00.000Z",
      data: {
        permit_id: "perm_fresh",
        session_id: "s_fresh",
        provider_id: "codex",
        ttl_seconds: 3600,
        granted_at: "2026-01-01T01:00:00.000Z",
        expires_at: "2026-01-01T02:00:00.000Z",
      },
    });

    const permits = new PermitRegistry(h.db);
    expect(permits.countActive()).toBe(2);

    // At 00:00:02Z — only perm_old is expired
    const expired1 = permits.listExpired("2026-01-01T00:00:02.000Z");
    expect(expired1).toHaveLength(1);
    expect(expired1[0]!.id).toBe("perm_old");

    // At 03:00:00Z — both are expired
    const expired2 = permits.listExpired("2026-01-01T03:00:00.000Z");
    expect(expired2).toHaveLength(2);

    // Before any expiry — none expired
    const noneExpired = permits.listExpired("2025-12-31T00:00:00.000Z");
    expect(noneExpired).toHaveLength(0);
  });

  test("get — returns undefined for non-existent permit id", () => {
    const permits = new PermitRegistry(h.db);
    expect(permits.get("does-not-exist")).toBeUndefined();
  });

  test("list — returns all permits ordered by granted_at then id", () => {
    const projector = new PermitProjector();

    projector.apply(h.db, {
      _v: 1,
      id: "evt_l1",
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T01:00:00.000Z",
      data: {
        permit_id: "perm_alpha",
        session_id: "s_alpha",
        provider_id: "opencode",
        ttl_seconds: 300,
        granted_at: "2026-01-01T01:00:00.000Z",
        expires_at: "2026-01-01T01:05:00.000Z",
      },
    });

    projector.apply(h.db, {
      _v: 1,
      id: "evt_l2",
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:00:00.000Z",
      data: {
        permit_id: "perm_beta",
        session_id: "s_beta",
        provider_id: "codex",
        ttl_seconds: 300,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:05:00.000Z",
      },
    });

    const permits = new PermitRegistry(h.db);
    const all = permits.list();
    // Ordered by granted_at, then id
    expect(all[0]!.id).toBe("perm_beta");
    expect(all[1]!.id).toBe("perm_alpha");
  });
});
