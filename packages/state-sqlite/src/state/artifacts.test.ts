import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate, loadBundledMigrations } from "@aloop/sqlite-db";
import { ArtifactRegistry, type ArtifactKind, type CreateArtifactInput } from "./artifacts.ts";

function makeDb(): Database {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
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

    test("creates artifact with incubation metadata", () => {
      const registry = makeRegistry();
      const input: CreateArtifactInput = {
        project_id: "p_abc",
        kind: "screenshot",
        filename: "capture.png",
        media_type: "image/png",
        bytes: 12345,
        incubation: {
          lifecycle: "captured",
          scope: { kind: "project", project_id: "p_abc" },
          title: "Investigate mobile capture for aloop",
          labels: ["product"],
          priority: "normal",
          source: {
            client: "mobile-web",
            captured_at: "2026-05-08T10:00:00.000Z",
            author: "user_123",
            url: "https://example.com/capture",
          },
          related_artifact_ids: [],
          promoted_refs: [],
        },
      };
      const artifact = registry.create(input);
      expect(artifact.incubation).not.toBeNull();
      expect(artifact.incubation!.lifecycle).toBe("captured");
      expect(artifact.incubation!.scope.kind).toBe("project");
      expect(artifact.incubation!.title).toBe("Investigate mobile capture for aloop");
      expect(artifact.incubation!.labels).toEqual(["product"]);
      expect(artifact.incubation!.priority).toBe("normal");
      expect(artifact.incubation!.source!.client).toBe("mobile-web");
      expect(artifact.incubation!.source!.captured_at).toBe("2026-05-08T10:00:00.000Z");
    });

    test("creates artifact with null incubation when not provided", () => {
      const registry = makeRegistry();
      const input: CreateArtifactInput = {
        project_id: "p_abc",
        kind: "other",
        filename: "data.json",
        media_type: "application/json",
        bytes: 100,
      };
      const artifact = registry.create(input);
      expect(artifact.incubation).toBeNull();
    });

    test("creates artifact with explicit null incubation", () => {
      const registry = makeRegistry();
      const input: CreateArtifactInput = {
        project_id: "p_abc",
        kind: "other",
        filename: "data.json",
        media_type: "application/json",
        bytes: 100,
        incubation: null,
      };
      const artifact = registry.create(input);
      expect(artifact.incubation).toBeNull();
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

    test("returns artifact with incubation metadata", () => {
      const registry = makeRegistry();
      const created = registry.create({
        project_id: "p_abc",
        kind: "screenshot",
        filename: "a.png",
        media_type: "image/png",
        bytes: 100,
        incubation: {
          lifecycle: "clarifying",
          scope: { kind: "workspace", workspace_id: "w_xyz" },
          title: "Test idea",
          labels: ["research"],
          priority: "high",
          source: { client: "cli", captured_at: "2026-05-09T00:00:00.000Z" },
          related_artifact_ids: ["a_001"],
          promoted_refs: [],
        },
      });
      const found = registry.get(created.id);
      expect(found).not.toBeUndefined();
      expect(found!.incubation).not.toBeNull();
      expect(found!.incubation!.lifecycle).toBe("clarifying");
      expect(found!.incubation!.title).toBe("Test idea");
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
      registry.create({ project_id: "p_1", composer_turn_id: "t_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", composer_turn_id: "t_2", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      registry.create({ project_id: "p_1", composer_turn_id: "t_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30 });
      const list = registry.list({ composer_turn_id: "t_1" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.composer_turn_id === "t_1")).toBe(true);
    });

    test("filters by control_subagent_run_id", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", control_subagent_run_id: "c_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", control_subagent_run_id: "c_2", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      registry.create({ project_id: "p_1", control_subagent_run_id: "c_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30 });
      const list = registry.list({ control_subagent_run_id: "c_1" });
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.control_subagent_run_id === "c_1")).toBe(true);
    });

    test("filters by multiple dimensions", () => {
      const registry = makeRegistry();
      registry.create({ project_id: "p_1", session_id: "s_1", composer_turn_id: "t_1", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10 });
      registry.create({ project_id: "p_1", session_id: "s_1", composer_turn_id: "t_2", kind: "screenshot", filename: "b.png", media_type: "image/png", bytes: 20 });
      registry.create({ project_id: "p_1", session_id: "s_2", composer_turn_id: "t_1", kind: "diff", filename: "c.png", media_type: "image/png", bytes: 30 });
      const list = registry.list({ session_id: "s_1", composer_turn_id: "t_1" });
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