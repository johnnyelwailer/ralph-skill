import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { openDatabase } from "./database.ts";
import { loadBundledMigrations } from "./migrations.ts";
import {
  IncubationItemRegistry,
  IncubationItemNotFoundError,
  type IncubationItemFilter,
  type CreateIncubationItemInput,
} from "./incubation.ts";

function makeDb(): Database {
  const { db } = openDatabase(":memory:");
  return db;
}

function makeRegistry(db?: Database): IncubationItemRegistry {
  return new IncubationItemRegistry(db ?? makeDb());
}

function makeSource(): CreateIncubationItemInput["source"] {
  return { client: "test", captured_at: new Date().toISOString() };
}

describe("IncubationItemRegistry", () => {
  describe("create", () => {
    test("creates incubation item with all fields", () => {
      const registry = makeRegistry();
      const input: CreateIncubationItemInput = {
        id: "ii_test_1",
        scope: { kind: "global" },
        title: "Test Item",
        body: "Test body content",
        state: "captured",
        labels: ["label1", "label2"],
        priority: "high",
        source: makeSource(),
        links: {
          project_id: "p_abc",
          artifact_ids: ["a_1", "a_2"],
          related_item_ids: ["ii_related"],
          promoted_refs: [],
        },
        metadata: { key: "value" },
        now: "2026-01-01T00:00:00.000Z",
      };
      const item = registry.create(input);

      expect(item._v).toBe(1);
      expect(item.id).toBe("ii_test_1");
      expect(item.scope).toEqual({ kind: "global" });
      expect(item.title).toBe("Test Item");
      expect(item.body).toBe("Test body content");
      expect(item.state).toBe("captured");
      expect(item.labels).toEqual(["label1", "label2"]);
      expect(item.priority).toBe("high");
      expect(item.source.client).toBe("test");
      expect(item.links.project_id).toBe("p_abc");
      expect(item.links.artifact_ids).toEqual(["a_1", "a_2"]);
      expect(item.links.related_item_ids).toEqual(["ii_related"]);
      expect(item.metadata).toEqual({ key: "value" });
      expect(item.created_at).toBe("2026-01-01T00:00:00.000Z");
      expect(item.updated_at).toBe("2026-01-01T00:00:00.000Z");
    });

    test("creates incubation item with only required fields", () => {
      const registry = makeRegistry();
      const input: CreateIncubationItemInput = {
        scope: { kind: "global" },
        title: "Minimal Item",
        source: makeSource(),
      };
      const item = registry.create(input);

      expect(item.id).toMatch(/^.{36}$/); // UUID format
      expect(item.body).toBe("");
      expect(item.state).toBe("captured");
      expect(item.labels).toEqual([]);
      expect(item.priority).toBeUndefined();
      expect(item.links.project_id).toBeUndefined();
      expect(item.links.artifact_ids).toEqual([]);
      expect(item.links.related_item_ids).toEqual([]);
      expect(item.links.promoted_refs).toEqual([]);
      expect(item.metadata).toEqual({});
    });

    test("creates incubation item with project scope", () => {
      const registry = makeRegistry();
      const item = registry.create({
        scope: { kind: "project", project_id: "p_xyz" },
        title: "Project Item",
        source: makeSource(),
      });

      expect(item.scope).toEqual({ kind: "project", project_id: "p_xyz" });
    });

    test("creates incubation item with candidate_project scope", () => {
      const registry = makeRegistry();
      const item = registry.create({
        scope: { kind: "candidate_project", abs_path: "/tmp/repo", repo_url: "https://github.com/test/repo" },
        title: "Candidate Item",
        source: makeSource(),
      });

      expect(item.scope).toEqual({ kind: "candidate_project", abs_path: "/tmp/repo", repo_url: "https://github.com/test/repo" });
    });

    test("uses provided id if given", () => {
      const registry = makeRegistry();
      const item = registry.create({
        id: "ii_custom",
        scope: { kind: "global" },
        title: "Custom ID Item",
        source: makeSource(),
      });
      expect(item.id).toBe("ii_custom");
    });

    test("generates UUID when id not provided", () => {
      const registry = makeRegistry();
      const item = registry.create({
        scope: { kind: "global" },
        title: "UUID Item",
        source: makeSource(),
      });
      expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test("uses provided now timestamp", () => {
      const registry = makeRegistry();
      const item = registry.create({
        scope: { kind: "global" },
        title: "Timestamped Item",
        source: makeSource(),
        now: "2026-06-01T12:00:00.000Z",
      });
      expect(item.created_at).toBe("2026-06-01T12:00:00.000Z");
      expect(item.updated_at).toBe("2026-06-01T12:00:00.000Z");
    });
  });

  describe("get", () => {
    test("returns incubation item by id", () => {
      const registry = makeRegistry();
      const created = registry.create({
        id: "ii_get_test",
        scope: { kind: "global" },
        title: "Get Test",
        source: makeSource(),
      });
      const found = registry.get("ii_get_test");

      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe("Get Test");
    });

    test("returns undefined for unknown id", () => {
      const registry = makeRegistry();
      const found = registry.get("ii_unknown");
      expect(found).toBeUndefined();
    });
  });

  describe("list", () => {
    test("returns empty list when no items", () => {
      const registry = makeRegistry();
      expect(registry.list()).toEqual([]);
    });

    test("returns all items ordered by created_at desc", () => {
      const registry = makeRegistry();
      registry.create({ scope: { kind: "global" }, title: "First", source: makeSource(), now: "2026-01-01T00:00:00.000Z" });
      registry.create({ scope: { kind: "global" }, title: "Second", source: makeSource(), now: "2026-01-02T00:00:00.000Z" });
      registry.create({ scope: { kind: "global" }, title: "Third", source: makeSource(), now: "2026-01-03T00:00:00.000Z" });

      const list = registry.list();
      expect(list).toHaveLength(3);
      expect(list.map(i => i.title)).toEqual(["Third", "Second", "First"]);
    });

    test("filters by state", () => {
      const registry = makeRegistry();
      registry.create({ scope: { kind: "global" }, title: "Captured", source: makeSource(), state: "captured" });
      registry.create({ scope: { kind: "global" }, title: "Researching", source: makeSource(), state: "researching" });
      registry.create({ scope: { kind: "global" }, title: "Another Captured", source: makeSource(), state: "captured" });

      const list = registry.list({ state: "captured" });
      expect(list).toHaveLength(2);
      expect(list.every(i => i.state === "captured")).toBe(true);
    });

    test("filters by project_id via links", () => {
      const registry = makeRegistry();
      registry.create({ scope: { kind: "global" }, title: "Item A", source: makeSource(), links: { project_id: "p_1" } });
      registry.create({ scope: { kind: "global" }, title: "Item B", source: makeSource(), links: { project_id: "p_2" } });
      registry.create({ scope: { kind: "global" }, title: "Item C", source: makeSource(), links: { project_id: "p_1" } });

      const list = registry.list({ project_id: "p_1" });
      expect(list).toHaveLength(2);
      expect(list.every(i => i.links.project_id === "p_1")).toBe(true);
    });

    test("filters by scope_kind", () => {
      const registry = makeRegistry();
      registry.create({ scope: { kind: "global" }, title: "Global", source: makeSource() });
      registry.create({ scope: { kind: "project", project_id: "p_1" }, title: "Project", source: makeSource() });

      const globalList = registry.list({ scope_kind: "global" });
      expect(globalList).toHaveLength(1);
      expect(globalList[0]!.title).toBe("Global");

      const projectList = registry.list({ scope_kind: "project" });
      expect(projectList).toHaveLength(1);
      expect(projectList[0]!.title).toBe("Project");
    });

    test("combines multiple filters", () => {
      const registry = makeRegistry();
      registry.create({ scope: { kind: "global" }, title: "A", source: makeSource(), state: "captured", links: { project_id: "p_1" } });
      registry.create({ scope: { kind: "global" }, title: "B", source: makeSource(), state: "researching", links: { project_id: "p_1" } });
      registry.create({ scope: { kind: "global" }, title: "C", source: makeSource(), state: "captured", links: { project_id: "p_2" } });

      const list = registry.list({ state: "captured", project_id: "p_1" });
      expect(list).toHaveLength(1);
      expect(list[0]!.title).toBe("A");
    });
  });

  describe("updateState", () => {
    test("updates state of existing item", () => {
      const registry = makeRegistry();
      const item = registry.create({ scope: { kind: "global" }, title: "Update Test", source: makeSource(), now: "2026-01-01T00:00:00.000Z" });

      const updated = registry.updateState(item.id, "researching", "2026-01-02T00:00:00.000Z");
      expect(updated.state).toBe("researching");
      expect(updated.updated_at).toBe("2026-01-02T00:00:00.000Z");
    });

    test("throws IncubationItemNotFoundError for unknown id", () => {
      const registry = makeRegistry();
      expect(() => registry.updateState("ii_unknown", "researching")).toThrow(IncubationItemNotFoundError);
      expect(() => registry.updateState("ii_unknown", "researching")).toThrow("incubation item not found: ii_unknown");
    });

    test("updateState accepts all valid states", () => {
      const registry = makeRegistry();
      const item = registry.create({ scope: { kind: "global" }, title: "States", source: makeSource() });

      const states: Array<"captured" | "clarifying" | "researching" | "synthesized" | "ready_for_promotion" | "promoted" | "archived" | "discarded"> = [
        "captured", "clarifying", "researching", "synthesized", "ready_for_promotion", "promoted", "archived", "discarded",
      ];
      for (const state of states) {
        const updated = registry.updateState(item.id, state);
        expect(updated.state).toBe(state);
      }
    });
  });

  describe("updateLinks", () => {
    test("updates links of existing item", () => {
      const registry = makeRegistry();
      const item = registry.create({
        scope: { kind: "global" },
        title: "Links Test",
        source: makeSource(),
        links: { artifact_ids: ["a_1"] },
      });

      const updated = registry.updateLinks(item.id, {
        project_id: "p_new",
        artifact_ids: ["a_1", "a_2"],
        related_item_ids: ["ii_rel"],
        promoted_refs: [],
      });

      expect(updated.links.project_id).toBe("p_new");
      expect(updated.links.artifact_ids).toEqual(["a_1", "a_2"]);
      expect(updated.links.related_item_ids).toEqual(["ii_rel"]);
    });

    test("throws IncubationItemNotFoundError for unknown id", () => {
      const registry = makeRegistry();
      expect(() =>
        registry.updateLinks("ii_unknown", {
          project_id: undefined,
          artifact_ids: [],
          related_item_ids: [],
          promoted_refs: [],
        })
      ).toThrow(IncubationItemNotFoundError);
      expect(() =>
        registry.updateLinks("ii_unknown", {
          project_id: undefined,
          artifact_ids: [],
          related_item_ids: [],
          promoted_refs: [],
        })
      ).toThrow("incubation item not found: ii_unknown");
    });
  });

  describe("archive", () => {
    test("archives existing item by transitioning state to archived", () => {
      const registry = makeRegistry();
      const item = registry.create({ scope: { kind: "global" }, title: "Archive Me", source: makeSource() });

      const archived = registry.archive(item.id);
      expect(archived.state).toBe("archived");
    });

    test("throws IncubationItemNotFoundError for unknown id", () => {
      const registry = makeRegistry();
      expect(() => registry.archive("ii_unknown")).toThrow(IncubationItemNotFoundError);
    });
  });

  describe("discard", () => {
    test("discards existing item by transitioning state to discarded", () => {
      const registry = makeRegistry();
      const item = registry.create({ scope: { kind: "global" }, title: "Discard Me", source: makeSource() });

      const discarded = registry.discard(item.id);
      expect(discarded.state).toBe("discarded");
    });

    test("throws IncubationItemNotFoundError for unknown id", () => {
      const registry = makeRegistry();
      expect(() => registry.discard("ii_unknown")).toThrow(IncubationItemNotFoundError);
    });
  });

  describe("promote", () => {
    test("promotes existing item with promotion refs", () => {
      const registry = makeRegistry();
      const item = registry.create({ scope: { kind: "global" }, title: "Promote Me", source: makeSource() });

      const promoted = registry.promote(item.id, [{ ref: "feat/new-feature", message: "New feature" }]);

      expect(promoted.state).toBe("promoted");
      expect(promoted.links.promoted_refs).toEqual([{ ref: "feat/new-feature", message: "New feature" }]);
    });

    test("promote appends to existing promoted_refs", () => {
      const registry = makeRegistry();
      const item = registry.create({
        scope: { kind: "global" },
        title: "Promote Twice",
        source: makeSource(),
        links: { promoted_refs: [{ ref: "feat/old", message: "Old feature" }] },
      });

      const promoted = registry.promote(item.id, [{ ref: "feat/new", message: "New feature" }]);

      expect(promoted.links.promoted_refs).toEqual([
        { ref: "feat/old", message: "Old feature" },
        { ref: "feat/new", message: "New feature" },
      ]);
    });

    test("throws IncubationItemNotFoundError for unknown id", () => {
      const registry = makeRegistry();
      expect(() => registry.promote("ii_unknown", [{ ref: "feat/x", message: "x" }])).toThrow(IncubationItemNotFoundError);
    });
  });

  describe("IncubationItemNotFoundError", () => {
    test("has correct code property", () => {
      const error = new IncubationItemNotFoundError("ii_test");
      expect(error.code).toBe("incubation_item_not_found");
    });

    test("has correct message format", () => {
      const error = new IncubationItemNotFoundError("ii_abc123");
      expect(error.message).toBe("incubation item not found: ii_abc123");
    });

    test("id property is accessible", () => {
      const error = new IncubationItemNotFoundError("ii_xyz");
      expect(error.id).toBe("ii_xyz");
    });
  });
});
