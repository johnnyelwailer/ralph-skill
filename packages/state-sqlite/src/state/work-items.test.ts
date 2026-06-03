import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { WorkItemRegistry, WorkItemNotFoundError } from "./work-items.ts";

function seedProject(db: ReturnType<typeof openDatabase>["db"], id: string): void {
  const now = "2025-01-01T00:00:00.000Z";
  db.run(
    `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
     VALUES (?, ?, ?, 'ready', ?, ?)`,
    [id, `/tmp/p-${id}-${Date.now()}`, `p-${id}`, now, now],
  );
}

describe("WorkItemRegistry", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];
  let registry: WorkItemRegistry;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-wi-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const opened = openDatabase(join(dir, "db.sqlite"));
    db = opened.db;
    seedProject(db, "p_main");
    seedProject(db, "p_other");
    registry = new WorkItemRegistry(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("upsert inserts a work item and round-trips it", () => {
    const item = registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "epic-1",
      kind: "epic",
      title: "Ship work items",
      body: "The first epic",
      status: "needs_refinement",
      labels: ["delivery", "M7"],
    });
    expect(item.id).toMatch(/^wi_p_main_builtin_epic_1$/);
    expect(item.title).toBe("Ship work items");
    expect(item.kind).toBe("epic");
    expect(item.state).toBe("open");
    expect(item.labels).toEqual(["delivery", "M7"]);
    expect(item.metadata).toEqual({});
    expect(item.parent_ref_key).toBeNull();
    const fetched = registry.get("p_main", "builtin", "epic-1");
    expect(fetched?.id).toBe(item.id);
  });

  test("upsert on existing (project, tracker, ref_key) updates fields", () => {
    const created = registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "epic-1",
      kind: "epic",
      title: "Old",
      status: "needs_refinement",
    });
    const updated = registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "epic-1",
      kind: "epic",
      title: "New",
      status: "refined",
      body: "Tightened scope",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe("New");
    expect(updated.body).toBe("Tightened scope");
    expect(updated.status).toBe("refined");
    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at >= created.updated_at).toBe(true);
  });

  test("upsert with parent_ref_key records the parent link", () => {
    registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "epic-1",
      kind: "epic",
      title: "Epic",
    });
    const story = registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "story-1",
      kind: "story",
      title: "Story",
      parent_ref_key: "epic-1",
      parent_tracker: "builtin",
    });
    expect(story.parent_ref_key).toBe("epic-1");
    expect(story.parent_tracker).toBe("builtin");
  });

  test("list filters by project_id, kind, state, and parent_ref_key", () => {
    registry.upsert({ project_id: "p_main", tracker_id: "builtin", ref_key: "e1", kind: "epic", title: "E1" });
    registry.upsert({ project_id: "p_main", tracker_id: "builtin", ref_key: "e2", kind: "epic", title: "E2" });
    registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "s1",
      kind: "story",
      title: "S1",
      parent_ref_key: "e1",
    });
    registry.upsert({ project_id: "p_other", tracker_id: "builtin", ref_key: "e3", kind: "epic", title: "E3" });
    expect(registry.list({ project_id: "p_main" }).map((i) => i.ref_key)).toEqual(["e1", "e2", "s1"]);
    expect(registry.list({ project_id: "p_main", kind: "epic" }).map((i) => i.ref_key)).toEqual(["e1", "e2"]);
    expect(registry.list({ project_id: "p_main", parent_ref_key: "e1" }).map((i) => i.ref_key)).toEqual(["s1"]);
    const closed = registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "s1-closed",
      kind: "story",
      title: "Closed",
    });
    registry.update("p_main", "builtin", "s1-closed", { state: "closed", closed_at: "2025-01-02T00:00:00.000Z" });
    expect(registry.list({ project_id: "p_main", state: "closed" }).map((i) => i.ref_key)).toEqual(["s1-closed"]);
    expect(closed.state).toBe("open");
  });

  test("update changes only the provided fields and bumps updated_at", () => {
    registry.upsert({
      project_id: "p_main",
      tracker_id: "builtin",
      ref_key: "s1",
      kind: "story",
      title: "Original",
      labels: ["todo"],
    });
    const updated = registry.update("p_main", "builtin", "s1", {
      status: "in_progress",
      labels: ["in-progress", "M7"],
    });
    expect(updated.title).toBe("Original");
    expect(updated.status).toBe("in_progress");
    expect(updated.labels).toEqual(["in-progress", "M7"]);
  });

  test("update on missing item throws WorkItemNotFoundError", () => {
    expect(() =>
      registry.update("p_main", "builtin", "ghost", { title: "nope" }),
    ).toThrow(WorkItemNotFoundError);
  });

  test("get returns undefined for missing item", () => {
    expect(registry.get("p_main", "builtin", "missing")).toBeUndefined();
  });
});
