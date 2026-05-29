import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { SessionRegistry } from "./sessions-registry.ts";
import { SessionNotFoundError } from "./sessions-store.ts";
import type { AffectsCompletedWork, SessionFilter } from "./sessions-store.ts";

/**
 * Tests for SessionRegistry.list() pagination and filtering behavior.
 *
 * These tests assert behaviors defined in the StateStore seam (docs/spec/daemon.md):
 * - list returns a flat array (not paginated envelope with cursor) because the
 *   current implementation uses direct SQL LIMIT without cursor-based pagination.
 * - filter by projectId, status, kind, parentSessionId
 * - limit caps the result set size
 */
describe("SessionRegistry list", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];
  let registry: SessionRegistry;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-registry-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const opened = openDatabase(join(dir, "db.sqlite"));
    db = opened.db;
    registry = new SessionRegistry(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // ─── filter: projectId ────────────────────────────────────────────────────────

  test("list filters by projectId", () => {
    const now = "2025-01-01T00:00:00.000Z";
    registry.create({
      id: "s_proj_a",
      projectId: "p_alpha",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    registry.create({
      id: "s_proj_b",
      projectId: "p_beta",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    const filtered = registry.list({ projectId: "p_alpha" });
    expect(filtered.every((s) => s.projectId === "p_alpha")).toBe(true);
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });

  test("list returns empty for unknown projectId", () => {
    const items = registry.list({ projectId: "p_does_not_exist" });
    expect(items).toEqual([]);
  });

  // ─── filter: status ─────────────────────────────────────────────────────────

  test("list filters by status array", () => {
    const now = "2025-01-01T00:00:00.000Z";
    registry.create({
      id: "s_st1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    registry.create({
      id: "s_st2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    registry.updateStatus("s_st1", "completed");
    const filtered = registry.list({ status: ["completed", "running"] });
    const ids = filtered.map((s) => s.id);
    expect(ids).toContain("s_st1");
  });

  // ─── filter: kind ────────────────────────────────────────────────────────────

  test("list filters by kind array", () => {
    const now = "2025-01-01T00:00:00.000Z";
    registry.create({
      id: "s_orc",
      projectId: "p_1",
      kind: "orchestrator",
      workflow: "test",
      providerChain: [],
      now,
    });
    registry.create({
      id: "s_ch",
      projectId: "p_1",
      kind: "child",
      workflow: "test",
      providerChain: [],
      now,
    });
    const filtered = registry.list({ kind: ["orchestrator"] });
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every((s) => s.kind === "orchestrator")).toBe(true);
  });

  // ─── filter: parentSessionId ─────────────────────────────────────────────────

  test("list filters by parentSessionId", () => {
    const now = "2025-01-01T00:00:00.000Z";
    registry.create({
      id: "s_par",
      projectId: "p_1",
      kind: "orchestrator",
      workflow: "test",
      providerChain: [],
      now,
    });
    registry.create({
      id: "s_child",
      projectId: "p_1",
      kind: "child",
      workflow: "test",
      providerChain: [],
      parentSessionId: "s_par",
      now,
    });
    const children = registry.list({ parentSessionId: "s_par" });
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children.every((s) => s.parentSessionId === "s_par")).toBe(true);
  });

  // ─── filter: combined ────────────────────────────────────────────────────────

  test("list combines multiple filters", () => {
    const now = "2025-01-01T00:00:00.000Z";
    registry.create({
      id: "s_combo1",
      projectId: "p_x",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    registry.create({
      id: "s_combo2",
      projectId: "p_y",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    const filtered = registry.list({ projectId: "p_x", kind: ["standalone"] });
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every((s) => s.projectId === "p_x")).toBe(true);
  });

  // ─── limit ───────────────────────────────────────────────────────────────────

  test("list supports limit to cap result set", () => {
    const now = "2025-01-01T00:00:00.000Z";
    for (let i = 0; i < 5; i++) {
      registry.create({
        id: `s_lim_${i}`,
        projectId: "p_1",
        kind: "standalone",
        workflow: "test",
        providerChain: [],
        now,
      });
    }
    const filter: SessionFilter & { limit?: number } = { limit: 3 };
    const items = registry.list(filter);
    expect(items.length).toBeLessThanOrEqual(3);
  });

  test("list without limit returns all matching sessions", () => {
    const now = "2025-01-01T00:00:00.000Z";
    for (let i = 0; i < 3; i++) {
      registry.create({
        id: `s_all_${i}`,
        projectId: "p_all",
        kind: "standalone",
        workflow: "test",
        providerChain: [],
        now,
      });
    }
    const items = registry.list({ projectId: "p_all" });
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});
