import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate, loadBundledMigrations } from "@aloop/sqlite-db";
import { ArtifactRegistry, type ArtifactKind, type CreateArtifactInput } from "./artifacts.ts";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function runArtifactsMigration(db: Database): void {
  const sql = readFileSync(join(__dirname, "../migrations/006-artifacts.sql"), "utf-8");
  db.run(sql);
}

function makeDb(): Database {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  runArtifactsMigration(db);
  return db;
}

function makeRegistry(db?: Database): ArtifactRegistry {
  return new ArtifactRegistry(db ?? makeDb());
}

describe("ArtifactRegistry", () => {
  describe("create", () => {
    test("creates artifact with all fields", () => {
      const registry = makeRegistry();
      const input: CreateArtifactInput = {
        project_id: "p_abc",
        session_id: "s_xyz",
        kind: "screenshot",
        phase: "proof",
        label: "dashboard",
        filename: "dashboard.png",
        media_type: "image/png",
        bytes: 12345,
      };
      const artifact = registry.create(input);
      expect(artifact._v).toBe(1);
      expect(artifact.id).toMatch(/^a_/);
      expect(artifact.project_id).toBe("p_abc");
      expect(artifact.session_id).toBe("s_xyz");
      expect(artifact.kind).toBe("screenshot");
      expect(artifact.phase).toBe("proof");
      expect(artifact.label).toBe("dashboard");
      expect(artifact.filename).toBe("dashboard.png");
      expect(artifact.media_type).toBe("image/png");
      expect(artifact.bytes).toBe(12345);
      expect(artifact.url).toBe(`/v1/artifacts/${artifact.id}/content`);
      expect(artifact.created_at).toBeTruthy();
    });

    test("creates artifact with only required fields", () => {
      const registry = makeRegistry();
      const input: CreateArtifactInput = {
        project_id: "p_abc",
        kind: "other",
        filename: "data.json",
        media_type: "application/json",
        bytes: 100,
      };
      const artifact = registry.create(input);
      expect(artifact.id).toMatch(/^a_/);
      expect(artifact.session_id).toBeNull();
      expect(artifact.setup_run_id).toBeNull();
      expect(artifact.work_item_key).toBeNull();
      expect(artifact.phase).toBeNull();
      expect(artifact.label).toBeNull();
    });

    test("uses provided id if given", () => {
      const registry = makeRegistry();
      const input: CreateArtifactInput = {
        id: "a_custom_id",
        project_id: "p_abc",
        kind: "image",
        filename: "x.png",
        media_type: "image/png",
        bytes: 50,
      };
      const artifact = registry.create(input);
      expect(artifact.id).toBe("a_custom_id");
    });
  });

  describe("get", () => {
    test("returns artifact by id", () => {
      const registry = makeRegistry();
      const created = registry.create({
        project_id: "p_abc",
        kind: "screenshot",
        filename: "a.png",
        media_type: "image/png",
        bytes: 100,
      });
      const found = registry.get(created.id);
      expect(found?.id).toBe(created.id);
      expect(found?.filename).toBe("a.png");
    });

    test("returns undefined for unknown id", () => {
      const registry = makeRegistry();
      const found = registry.get("a_unknown");
      expect(found).toBeUndefined();
    });
  });

  describe("list", () => {
    test("returns empty list when no artifacts", () => {
      const registry = makeRegistry();
      expect(registry.list()).toEqual([]);
    });

    test("returns all artifacts ordered by created_at desc", () => {
      const registry = makeRegistry();
      const now = new Date().toISOString();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, now });
      registry.create({ project_id: "p_2", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20, now });
      registry.create({ project_id: "p_3", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30, now });
      const list = registry.list();
      expect(list).toHaveLength(3);
      expect(list.map(a => a.filename)).toEqual(["a.png", "b.png", "c.png"]);
    });

    test("filters by project_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_2", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      registry.create({ project_id: "p_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30 });
      const list = registry.list({ project_id: "p_1" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.project_id === "p_1")).toBe(true);
    });

    test("filters by session_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", session_id: "s_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", session_id: "s_2", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      registry.create({ project_id: "p_1", session_id: "s_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30 });
      const list = registry.list({ session_id: "s_1" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.session_id === "s_1")).toBe(true);
    });

    test("filters by setup_run_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", setup_run_id: "run_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", setup_run_id: "run_2", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      const list = registry.list({ setup_run_id: "run_1" });
      expect(list).toHaveLength(1);
      expect(list[0]!.setup_run_id).toBe("run_1");
    });

    test("filters by work_item_key", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", work_item_key: "issue-42", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", work_item_key: "issue-43", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      const list = registry.list({ work_item_key: "issue-42" });
      expect(list).toHaveLength(1);
      expect(list[0]!.work_item_key).toBe("issue-42");
    });

    test("filters by phase", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", phase: "proof", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", phase: "build", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      const list = registry.list({ phase: "proof" });
      expect(list).toHaveLength(1);
      expect(list[0]!.phase).toBe("proof");
    });

    test("filters by type (kind)", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      registry.create({ project_id: "p_1", kind: "image", filename: "c.png", media_type: "image/png", bytes: 30 });
      const list = registry.list({ type: "image" as ArtifactKind });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.kind === "image")).toBe(true);
    });

    test("filters by composer_turn_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, composer_turn_id: "ct_1" });
      registry.create({ project_id: "p_1", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20, composer_turn_id: "ct_2" });
      registry.create({ project_id: "p_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30, composer_turn_id: "ct_1" });
      const list = registry.list({ composer_turn_id: "ct_1" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.composer_turn_id === "ct_1")).toBe(true);
    });

    test("filters by control_subagent_run_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, control_subagent_run_id: "run_a" });
      registry.create({ project_id: "p_1", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20, control_subagent_run_id: "run_b" });
      registry.create({ project_id: "p_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30, control_subagent_run_id: "run_a" });
      const list = registry.list({ control_subagent_run_id: "run_a" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.control_subagent_run_id === "run_a")).toBe(true);
    });

    test("filters by incubation_item_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, incubation_item_id: "ii_alpha" });
      registry.create({ project_id: "p_1", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20, incubation_item_id: "ii_beta" });
      registry.create({ project_id: "p_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30, incubation_item_id: "ii_alpha" });
      const list = registry.list({ incubation_item_id: "ii_alpha" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.incubation_item_id === "ii_alpha")).toBe(true);
    });

    test("filters by research_run_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, research_run_id: "rr_x" });
      registry.create({ project_id: "p_1", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20, research_run_id: "rr_y" });
      registry.create({ project_id: "p_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30, research_run_id: "rr_x" });
      const list = registry.list({ research_run_id: "rr_x" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.research_run_id === "rr_x")).toBe(true);
    });

    test("combines all filter dimensions (composer_turn_id + research_run_id)", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, composer_turn_id: "ct_1", research_run_id: "rr_1" });
      registry.create({ project_id: "p_1", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20, composer_turn_id: "ct_1", research_run_id: "rr_2" });
      registry.create({ project_id: "p_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30, composer_turn_id: "ct_2", research_run_id: "rr_1" });
      // Both filters apply (AND logic): composer_turn_id=ct_1 AND research_run_id=rr_1
      const list = registry.list({ composer_turn_id: "ct_1", research_run_id: "rr_1" });
      expect(list).toHaveLength(1);
      expect(list[0]!.filename).toBe("a.png");
    });
  });

  describe("delete", () => {
    test("deletes existing artifact", () => {
      const registry = makeRegistry();
      const created = registry.create({
        project_id: "p_abc",
        kind: "image",
        filename: "x.png",
        media_type: "image/png",
        bytes: 50,
      });
      registry.delete(created.id);
      expect(registry.get(created.id)).toBeUndefined();
    });

    test("throws ArtifactNotFoundError for unknown id", () => {
      const registry = makeRegistry();
      expect(() => registry.delete("a_unknown")).toThrow("artifact not found: a_unknown");
    });
  });
});