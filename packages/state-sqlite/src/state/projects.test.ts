import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import {
  canonicalizeProjectPath,
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  ProjectRegistry,
} from "./projects.ts";

describe("canonicalizeProjectPath", () => {
  test("resolves relative to absolute", () => {
    const abs = canonicalizeProjectPath("./foo");
    expect(abs.startsWith("/")).toBe(true);
  });

  test("returns absolute form for non-existent paths", () => {
    const p = canonicalizeProjectPath("/nonexistent/foo/bar");
    expect(p).toBe("/nonexistent/foo/bar");
  });

  test("strips trailing slashes on non-existent paths", () => {
    expect(canonicalizeProjectPath("/nonexistent/foo/")).toBe("/nonexistent/foo");
    expect(canonicalizeProjectPath("/nonexistent/foo//")).toBe("/nonexistent/foo");
  });
});

describe("ProjectRegistry", () => {
  let registry: ProjectRegistry;
  let tmpProjectDir: string;

  beforeEach(() => {
    const { db } = openDatabase(":memory:");
    registry = new ProjectRegistry(db);
    tmpProjectDir = mkdtempSync(join(tmpdir(), "aloop-proj-"));
  });

  afterEach(() => {
    rmSync(tmpProjectDir, { recursive: true, force: true });
  });

  test("create returns a project with setup_pending status", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    expect(p.status).toBe("setup_pending");
    expect(p.absPath).toBe(canonicalizeProjectPath(tmpProjectDir));
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.addedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(p.lastActiveAt).toBeNull();
  });

  test("create defaults name to basename of abs_path", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    const base = tmpProjectDir.split("/").pop() ?? "";
    expect(p.name).toBe(base);
  });

  test("create accepts custom name", () => {
    const p = registry.create({ absPath: tmpProjectDir, name: "my-project" });
    expect(p.name).toBe("my-project");
  });

  test("create rejects duplicate absPath", () => {
    registry.create({ absPath: tmpProjectDir });
    expect(() => registry.create({ absPath: tmpProjectDir })).toThrow(
      ProjectAlreadyRegisteredError,
    );
  });

  test("create rejects duplicate path regardless of representation", () => {
    registry.create({ absPath: tmpProjectDir });
    expect(() => registry.create({ absPath: tmpProjectDir + "/" })).toThrow(
      ProjectAlreadyRegisteredError,
    );
  });

  test("get returns undefined for unknown id", () => {
    expect(registry.get("nope")).toBeUndefined();
  });

  test("getByPath finds the registered project", () => {
    const created = registry.create({ absPath: tmpProjectDir });
    const found = registry.getByPath(tmpProjectDir);
    expect(found?.id).toBe(created.id);
  });

  test("list returns all projects by default, ordered by added_at", () => {
    const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
    const dirA = mkdtempSync(join(tmpdir(), "a-"));
    const dirB = mkdtempSync(join(tmpdir(), "b-"));
    try {
      registry.create({ absPath: dirA, now: t(10) });
      registry.create({ absPath: dirB, now: t(5) });
      const list = registry.list();
      expect(list.length).toBe(2);
      expect(list[0]!.absPath.includes("/b-")).toBe(true);
      expect(list[1]!.absPath.includes("/a-")).toBe(true);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  test("list filters by status", () => {
    const p1 = registry.create({ absPath: tmpProjectDir });
    const dir2 = mkdtempSync(join(tmpdir(), "p-"));
    try {
      const p2 = registry.create({ absPath: dir2 });
      registry.updateStatus(p2.id, "ready");
      expect(registry.list({ status: "ready" }).map((p) => p.id)).toEqual([p2.id]);
      expect(registry.list({ status: "setup_pending" }).map((p) => p.id)).toEqual([p1.id]);
      expect(registry.list({ status: "archived" })).toEqual([]);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  test("updateName persists and bumps updated_at", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    const later = new Date(Date.parse(p.updatedAt) + 1000).toISOString();
    const renamed = registry.updateName(p.id, "renamed", later);
    expect(renamed.name).toBe("renamed");
    expect(renamed.updatedAt).toBe(later);
  });

  test("updateName rejects empty names", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    expect(() => registry.updateName(p.id, "   ")).toThrow(/empty/);
  });

  test("updateName throws on unknown id", () => {
    expect(() => registry.updateName("nope", "x")).toThrow(ProjectNotFoundError);
  });

  test("updateStatus throws ProjectNotFoundError for unknown id", () => {
    expect(() => registry.updateStatus("nope", "ready")).toThrow(ProjectNotFoundError);
  });

  test("updateStatus enforces valid enum via DB CHECK", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    // Cast through `any` to prove the DB is the enforcement layer, not TS.
    expect(() =>
      registry.updateStatus(p.id, "bogus" as unknown as "ready"),
    ).toThrow();
  });

  test("archive transitions status to archived", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    const archived = registry.archive(p.id);
    expect(archived.status).toBe("archived");
  });

  test("touchActivity updates last_active_at without changing status", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    expect(p.lastActiveAt).toBeNull();
    const now = new Date().toISOString();
    registry.touchActivity(p.id, now);
    const after = registry.get(p.id)!;
    expect(after.lastActiveAt).toBe(now);
    expect(after.status).toBe(p.status);
  });

  test("purge hard-deletes the row", () => {
    const p = registry.create({ absPath: tmpProjectDir });
    registry.purge(p.id);
    expect(registry.get(p.id)).toBeUndefined();
    // Path is now free to re-register
    const again = registry.create({ absPath: tmpProjectDir });
    expect(again.id).not.toBe(p.id);
  });
});
