import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { makeEvent, makeIdGenerator } from "@aloop/core";
import { loadBundledMigrations, migrate } from "@aloop/sqlite-db";
import {
  loadProjectDailyCost,
  ProjectDailyCostProjector,
} from "./project-daily-cost-projector.ts";

function openDb(): Database {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return db;
}

/** Make a grant event for ProjectDailyCostProjector. */
function makeGrant(
  projectId: string,
  permitId: string,
  sessionId: string,
  providerId: string,
  grantedAt: string,
  expiresAt: string,
  estimatedCostUsdCents?: number,
) {
  const event = makeEvent(
    "scheduler.permit.grant",
    {
      permit_id: permitId,
      session_id: sessionId,
      provider_id: providerId,
      ttl_seconds: 600,
      granted_at: grantedAt,
      expires_at: expiresAt,
      estimated_cost_usd_cents: estimatedCostUsdCents,
    },
    makeIdGenerator(),
  );
  // Inject project_id so ProjectDailyCostProjector can route the cost correctly.
  // This mirrors how createEventWriter injects session.project_id at write time.
  (event as Record<string, unknown>).metadata = { project_id: projectId };
  return event;
}

function makeRelease(permitId: string) {
  return makeEvent(
    "scheduler.permit.release",
    { permit_id: permitId },
    makeIdGenerator(),
  );
}

function makeExpired(permitId: string) {
  return makeEvent(
    "scheduler.permit.expired",
    { permit_id: permitId },
    makeIdGenerator(),
  );
}

describe("ProjectDailyCostProjector", () => {
  describe("apply", () => {
    test("accumulates cost_usd_cents on scheduler.permit.grant", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_alpha", "perm_1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 50),
      );
      projector.apply(
        db,
        makeGrant("p_alpha", "perm_2", "s_2", "claude",
          "2026-01-01T14:00:00.000Z", "2026-01-01T14:10:00.000Z", 30),
      );

      const snap = loadProjectDailyCost(db, "p_alpha", "2026-01-01");
      expect(snap).not.toBeNull();
      expect(snap!.costUsdCents).toBe(80);
      expect(snap!.tokens).toBe(0);
      db.close();
    });

    test("accumulates cost across multiple days separately", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_beta", "perm_d1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 100),
      );
      projector.apply(
        db,
        makeGrant("p_beta", "perm_d2", "s_2", "claude",
          "2026-01-02T10:00:00.000Z", "2026-01-02T10:10:00.000Z", 200),
      );

      const jan01 = loadProjectDailyCost(db, "p_beta", "2026-01-01");
      const jan02 = loadProjectDailyCost(db, "p_beta", "2026-01-02");
      expect(jan01!.costUsdCents).toBe(100);
      expect(jan02!.costUsdCents).toBe(200);
      db.close();
    });

    test("accumulates cost across multiple projects independently", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_gamma", "perm_g1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 75),
      );
      projector.apply(
        db,
        makeGrant("p_delta", "perm_d1", "s_2", "claude",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 25),
      );

      const gamma = loadProjectDailyCost(db, "p_gamma", "2026-01-01");
      const delta = loadProjectDailyCost(db, "p_delta", "2026-01-01");
      expect(gamma!.costUsdCents).toBe(75);
      expect(delta!.costUsdCents).toBe(25);
      db.close();
    });

    test("defaults estimated_cost_usd_cents to 0 when absent", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      // grant without estimated_cost_usd_cents
      projector.apply(
        db,
        makeGrant("p_epsilon", "perm_e1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z"),
      );

      const snap = loadProjectDailyCost(db, "p_epsilon", "2026-01-01");
      expect(snap!.costUsdCents).toBe(0);
      db.close();
    });

    test("skips events with zero cost", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_zeta", "perm_z1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 0),
      );

      const snap = loadProjectDailyCost(db, "p_zeta", "2026-01-01");
      // No row should be inserted for zero cost
      expect(snap).toBeNull();
      db.close();
    });

    test("skips events with negative cost", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_eta", "perm_eta1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", -50),
      );

      const snap = loadProjectDailyCost(db, "p_eta", "2026-01-01");
      expect(snap).toBeNull();
      db.close();
    });

    test("skips scheduler.permit.release — no side effects", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_theta", "perm_t1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 50),
      );
      projector.apply(db, makeRelease("perm_t1"));

      const snap = loadProjectDailyCost(db, "p_theta", "2026-01-01");
      // Cost from the grant should remain; release has no effect
      expect(snap!.costUsdCents).toBe(50);
      db.close();
    });

    test("skips scheduler.permit.expired — no side effects", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_iota", "perm_i1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 40),
      );
      projector.apply(db, makeExpired("perm_i1"));

      const snap = loadProjectDailyCost(db, "p_iota", "2026-01-01");
      expect(snap!.costUsdCents).toBe(40);
      db.close();
    });

    test("ignores unknown event topics", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_kappa", "perm_k1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 60),
      );
      projector.apply(
        db,
        makeEvent("some.random.topic", {}, makeIdGenerator()),
      );

      const snap = loadProjectDailyCost(db, "p_kappa", "2026-01-01");
      expect(snap!.costUsdCents).toBe(60);
      db.close();
    });

    test("ON CONFLICT accumulates cost on repeated grant for same project+day", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      projector.apply(
        db,
        makeGrant("p_lambda", "perm_l1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 20),
      );
      projector.apply(
        db,
        makeGrant("p_lambda", "perm_l2", "s_2", "claude",
          "2026-01-01T11:00:00.000Z", "2026-01-01T11:10:00.000Z", 20),
      );
      projector.apply(
        db,
        makeGrant("p_lambda", "perm_l3", "s_3", "opencode",
          "2026-01-01T12:00:00.000Z", "2026-01-01T12:10:00.000Z", 20),
      );

      const snap = loadProjectDailyCost(db, "p_lambda", "2026-01-01");
      // Three grants × 20 cents each = 60 cents accumulated via ON CONFLICT
      expect(snap!.costUsdCents).toBe(60);
      db.close();
    });
  });

  describe("loadProjectDailyCost", () => {
    test("returns null when no row exists for project+date", () => {
      const db = openDb();
      const result = loadProjectDailyCost(db, "nonexistent", "2026-01-01");
      expect(result).toBeNull();
      db.close();
    });

    test("returns null when project exists but different date", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();
      projector.apply(
        db,
        makeGrant("p_mu", "perm_mu1", "s_1", "opencode",
          "2026-01-01T10:00:00.000Z", "2026-01-01T10:10:00.000Z", 50),
      );

      const jan01 = loadProjectDailyCost(db, "p_mu", "2026-01-01");
      const jan02 = loadProjectDailyCost(db, "p_mu", "2026-01-02");
      expect(jan01).not.toBeNull();
      expect(jan02).toBeNull();
      db.close();
    });

    test("extracts date from granted_at timestamp correctly", () => {
      const db = openDb();
      const projector = new ProjectDailyCostProjector();

      // granted_at is 2026-03-15T23:59:59.000Z → date portion should be 2026-03-15
      projector.apply(
        db,
        makeGrant("p_nu", "perm_nu1", "s_1", "opencode",
          "2026-03-15T23:59:59.000Z", "2026-03-15T23:59:59.000Z", 100),
      );

      const snap = loadProjectDailyCost(db, "p_nu", "2026-03-15");
      expect(snap).not.toBeNull();
      expect(snap!.costUsdCents).toBe(100);
      db.close();
    });
  });
});
