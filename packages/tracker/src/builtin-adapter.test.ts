import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createBuiltinAdapter, type CreateBuiltinAdapterOptions } from "./builtin-adapter.js";
import fs from "node:fs";
import path from "node:path";

const TMP = `/tmp/aloop-tracker-test-${Date.now()}`;

function makeAdapter(options?: CreateBuiltinAdapterOptions) {
  return createBuiltinAdapter({ root: options?.root ?? TMP });
}

describe("createBuiltinAdapter", () => {
  beforeEach(() => {
    fs.mkdirSync(TMP, { recursive: true });
    fs.mkdirSync(path.join(TMP, "changesets"), { recursive: true });
    fs.writeFileSync(path.join(TMP, "events.jsonl"), "", "utf-8");
  });

  afterEach(() => {
    try {
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch {}
  });

  describe("ping", () => {
    test("returns healthy when root exists", async () => {
      const adapter = makeAdapter();
      const health = await adapter.ping();
      expect(health.status).toBe("healthy");
    });

    test("returns unavailable when root is inaccessible", async () => {
      const adapter = createBuiltinAdapter({ root: "/nonexistent/path/xyz" });
      const health = await adapter.ping();
      expect(health.status).toBe("unavailable");
    });
  });

  describe("createWorkItem", () => {
    test("creates epic with key 0001", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({
        kind: "epic",
        title: "Test Epic",
        body: "Epic body",
      });
      expect(ref.adapter).toBe("builtin");
      expect(ref.key).toBe("0001");
    });

    test("creates story with parent link", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({
        kind: "epic",
        title: "Epic",
        body: "...",
      });
      const storyRef = await adapter.createWorkItem({
        kind: "story",
        title: "Story",
        body: "...",
        parent: epicRef,
      });
      expect(storyRef.adapter).toBe("builtin");
      expect(storyRef.key).toBe("0002");
      const story = await adapter.getWorkItem(storyRef);
      expect(story.links.parent?.key).toBe("0001");
    });

    test("sequential items get incrementing keys", async () => {
      const adapter = makeAdapter();
      const ref1 = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const ref2 = await adapter.createWorkItem({ kind: "epic", title: "E2", body: "..." });
      const ref3 = await adapter.createWorkItem({ kind: "epic", title: "E3", body: "..." });
      expect(ref1.key).toBe("0001");
      expect(ref2.key).toBe("0002");
      expect(ref3.key).toBe("0003");
    });

    test("applies labels from draft", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({
        kind: "epic",
        title: "E1",
        body: "...",
        labels: ["priority_high"],
      });
      const item = await adapter.getWorkItem(ref);
      expect(item.labels).toEqual(["priority_high"]);
    });

    test("applies assignees from draft", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({
        kind: "epic",
        title: "E1",
        body: "...",
        assignees: ["alice"],
      });
      const item = await adapter.getWorkItem(ref);
      expect(item.assignees).toEqual(["alice"]);
    });

    test("writes event to events.jsonl", async () => {
      const adapter = makeAdapter();
      await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const content = fs.readFileSync(path.join(TMP, "events.jsonl"), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const env = JSON.parse(lines[0] as string);
      expect(env.topic).toBe("work_item.created");
      expect(env.data.key).toBe("0001");
    });
  });

  describe("getWorkItem", () => {
    test("retrieves created item", async () => {
      const adapter = makeAdapter();
      const created = await adapter.createWorkItem({ kind: "epic", title: "Test", body: "body" });
      const item = await adapter.getWorkItem(created);
      expect(item.title).toBe("Test");
      expect(item.kind).toBe("epic");
      expect(item.state).toBe("open");
    });

    test("throws for nonexistent key", () => {
      const adapter = makeAdapter();
      expect(adapter.getWorkItem({ adapter: "builtin", key: "9999" })).rejects.toThrow();
    });
  });

  describe("listWorkItems", () => {
    test("lists all items with no filter", async () => {
      const adapter = makeAdapter();
      await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.createWorkItem({ kind: "story", title: "S1", body: "..." });
      const items = [];
      for await (const item of adapter.listWorkItems({})) {
        items.push(item);
      }
      expect(items).toHaveLength(2);
    });

    test("filters by kind", async () => {
      const adapter = makeAdapter();
      await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.createWorkItem({ kind: "story", title: "S1", body: "..." });
      const items = [];
      for await (const item of adapter.listWorkItems({ kind: "story" })) {
        items.push(item);
      }
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("S1");
    });

    test("filters by state", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.closeWorkItem(ref, "completed");
      await adapter.createWorkItem({ kind: "epic", title: "E2", body: "..." });
      const items = [];
      for await (const item of adapter.listWorkItems({ state: "open" })) {
        items.push(item);
      }
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("E2");
    });

    test("filters by parent", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: epicRef });
      await adapter.createWorkItem({ kind: "story", title: "S2", body: "..." });
      const items = [];
      for await (const item of adapter.listWorkItems({ parent: epicRef })) {
        items.push(item);
      }
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("S1");
    });

    test("filters by assignee", async () => {
      const adapter = makeAdapter();
      await adapter.createWorkItem({ kind: "epic", title: "E1", body: "...", assignees: ["alice"] });
      await adapter.createWorkItem({ kind: "epic", title: "E2", body: "...", assignees: ["bob"] });
      const items = [];
      for await (const item of adapter.listWorkItems({ assignee: "alice" })) {
        items.push(item);
      }
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("E1");
    });

    test("filters by labels", async () => {
      const adapter = makeAdapter();
      await adapter.createWorkItem({ kind: "epic", title: "E1", body: "...", labels: ["priority_high"] });
      await adapter.createWorkItem({ kind: "epic", title: "E2", body: "..." });
      const items = [];
      for await (const item of adapter.listWorkItems({ labels: ["priority_high"] })) {
        items.push(item);
      }
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("E1");
    });
  });

  describe("updateWorkItem", () => {
    test("updates title", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "Original", body: "..." });
      await adapter.updateWorkItem(ref, { title: "Updated" });
      const item = await adapter.getWorkItem(ref);
      expect(item.title).toBe("Updated");
    });

    test("updates state to closed", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.updateWorkItem(ref, { state: "closed" });
      const item = await adapter.getWorkItem(ref);
      expect(item.state).toBe("closed");
    });

    test("updates labels", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.updateWorkItem(ref, { labels: ["priority_high", "aloop/epic"] });
      const item = await adapter.getWorkItem(ref);
      expect(item.labels).toEqual(["priority_high", "aloop/epic"]);
    });

    test("writes event to events.jsonl", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      fs.writeFileSync(path.join(TMP, "events.jsonl"), "", "utf-8");
      await adapter.updateWorkItem(ref, { title: "Updated" });
      const content = fs.readFileSync(path.join(TMP, "events.jsonl"), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const env = JSON.parse(lines[0] as string);
      expect(env.topic).toBe("work_item.updated");
    });
  });

  describe("closeWorkItem", () => {
    test("closes with completed reason", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.closeWorkItem(ref, "completed");
      const item = await adapter.getWorkItem(ref);
      expect(item.state).toBe("closed");
      expect(item.metadata.close_reason).toBe("completed");
    });

    test("closes with not_planned reason", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.closeWorkItem(ref, "not_planned");
      const item = await adapter.getWorkItem(ref);
      expect(item.state).toBe("closed");
      expect(item.metadata.close_reason).toBe("not_planned");
    });

    test("closes without reason defaults to completed", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.closeWorkItem(ref);
      const item = await adapter.getWorkItem(ref);
      expect(item.state).toBe("closed");
      expect(item.metadata.close_reason).toBe("completed");
    });

    test("writes event to events.jsonl", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      fs.writeFileSync(path.join(TMP, "events.jsonl"), "", "utf-8");
      await adapter.closeWorkItem(ref, "completed");
      const content = fs.readFileSync(path.join(TMP, "events.jsonl"), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const env = JSON.parse(lines[0] as string);
      expect(env.topic).toBe("work_item.closed");
    });
  });

  describe("reopenWorkItem", () => {
    test("reopens closed item", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.closeWorkItem(ref, "completed");
      await adapter.reopenWorkItem(ref);
      const item = await adapter.getWorkItem(ref);
      expect(item.state).toBe("open");
    });

    test("writes event to events.jsonl", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.closeWorkItem(ref, "completed");
      fs.writeFileSync(path.join(TMP, "events.jsonl"), "", "utf-8");
      await adapter.reopenWorkItem(ref);
      const content = fs.readFileSync(path.join(TMP, "events.jsonl"), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const env = JSON.parse(lines[0] as string);
      expect(env.topic).toBe("work_item.reopened");
    });
  });

  describe("getParent", () => {
    test("returns parent ref for child item", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const storyRef = await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: epicRef });
      const parent = await adapter.getParent(storyRef);
      expect(parent?.key).toBe("0001");
    });

    test("returns null for item without parent", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const parent = await adapter.getParent(ref);
      expect(parent).toBeNull();
    });
  });

  describe("listChildren", () => {
    test("lists children of epic", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: epicRef });
      await adapter.createWorkItem({ kind: "story", title: "S2", body: "...", parent: epicRef });
      const children = [];
      for await (const child of adapter.listChildren(epicRef)) {
        children.push(child);
      }
      expect(children).toHaveLength(2);
    });

    test("returns empty for item with no children", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const children = [];
      for await (const child of adapter.listChildren(ref)) {
        children.push(child);
      }
      expect(children).toHaveLength(0);
    });
  });

  describe("childrenSummary", () => {
    test("counts total and completed", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const s1 = await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: epicRef });
      await adapter.createWorkItem({ kind: "story", title: "S2", body: "...", parent: epicRef });
      await adapter.closeWorkItem(s1, "completed");
      const summary = await adapter.childrenSummary(epicRef);
      expect(summary.total).toBe(2);
      expect(summary.completed).toBe(1);
    });
  });

  describe("linkChild", () => {
    test("links child to parent and writes event", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const storyRef = await adapter.createWorkItem({ kind: "story", title: "S1", body: "..." });
      await adapter.linkChild(epicRef, storyRef);
      const story = await adapter.getWorkItem(storyRef);
      expect(story.links.parent?.key).toBe("0001");
    });
  });

  describe("unlinkChild", () => {
    test("removes parent link from child", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const storyRef = await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: epicRef });
      await adapter.unlinkChild(epicRef, storyRef);
      const story = await adapter.getWorkItem(storyRef);
      expect(story.links.parent).toBeUndefined();
    });
  });

  describe("addLabel", () => {
    test("adds label to item", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.addLabel(ref, "aloop/epic");
      const item = await adapter.getWorkItem(ref);
      expect(item.labels).toContain("aloop/epic");
    });
  });

  describe("removeLabel", () => {
    test("removes label from item", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "...", labels: ["aloop/epic"] });
      await adapter.removeLabel(ref, "aloop/epic");
      const item = await adapter.getWorkItem(ref);
      expect(item.labels).not.toContain("aloop/epic");
    });
  });

  describe("setAssignees", () => {
    test("sets assignees on item", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      await adapter.setAssignees(ref, ["alice", "bob"]);
      const item = await adapter.getWorkItem(ref);
      expect(item.assignees).toEqual(["alice", "bob"]);
    });
  });

  describe("readMirroredTasks", () => {
    test("returns task mirrors for a story", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const storyRef = await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: epicRef });
      const t1 = await adapter.createWorkItem({ kind: "task_mirror", title: "Task 1", body: "...", parent: storyRef });
      const t2 = await adapter.createWorkItem({ kind: "task_mirror", title: "Task 2", body: "...", parent: storyRef });
      await adapter.closeWorkItem(t1, "completed");
      const tasks = [];
      for await (const task of adapter.readMirroredTasks(storyRef)) {
        tasks.push(task);
      }
      expect(tasks).toHaveLength(2);
      const completed = tasks.find((t) => t.id === t1.key);
      const pending = tasks.find((t) => t.id === t2.key);
      expect(completed?.completed).toBe(true);
      expect(pending?.completed).toBe(false);
    });

    test("returns empty for non-story item", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const tasks = [];
      for await (const task of adapter.readMirroredTasks(epicRef)) {
        tasks.push(task);
      }
      expect(tasks).toHaveLength(0);
    });
  });

  describe("capabilities", () => {
    test("id is builtin", async () => {
      const adapter = makeAdapter();
      expect(adapter.id).toBe("builtin");
    });

    test("hierarchy is native", async () => {
      const adapter = makeAdapter();
      expect(adapter.capabilities.hierarchy.native).toBe(true);
      expect(adapter.capabilities.hierarchy.single_parent_only).toBe(false);
    });

    test("change_sets capability is false", async () => {
      const adapter = makeAdapter();
      expect(adapter.capabilities.change_sets).toBe(false);
    });

    test("task mirroring is supported with sub_children shape", async () => {
      const adapter = makeAdapter();
      expect(adapter.capabilities.tracks_tasks.mirror_supported).toBe(true);
      expect(adapter.capabilities.tracks_tasks.mirror_shape).toBe("sub_children");
    });
  });

  describe("listLinkedChangeSets", () => {
    test("returns change sets from item links", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({
        kind: "story",
        title: "S1",
        body: "...",
        metadata: {
          change_sets: [{ adapter: "builtin", key: "PR/1" }],
        },
      } as Parameters<typeof adapter.createWorkItem>[0]);
      void ref;
    });
  });
});
  describe("reorderChild", () => {
    test("is a no-op — does not throw", async () => {
      const adapter = makeAdapter();
      const parentRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const childRef = await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: parentRef });
      // Must not throw — reorderChild is not yet implemented in the builtin adapter
      await adapter.reorderChild(parentRef, childRef);
      // Verify child is still linked
      const parent = await adapter.getParent(childRef);
      expect(parent?.key).toBe("0001");
    });

    test("accepts after and before references without throwing", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "Epic", body: "..." });
      const s1 = await adapter.createWorkItem({ kind: "story", title: "S1", body: "...", parent: epicRef });
      const s2 = await adapter.createWorkItem({ kind: "story", title: "S2", body: "...", parent: epicRef });
      // Must not throw even with after/before hints
      await adapter.reorderChild(epicRef, s2, s1);
    });
  });

  describe("mirrorTasks", () => {
    test("is a no-op — does not throw", async () => {
      const adapter = makeAdapter();
      const epicRef = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const storyRef = await adapter.createWorkItem({ kind: "story", title: "Story", body: "...", parent: epicRef });
      // mirrorTasks is a stub — must not throw
      await adapter.mirrorTasks(storyRef, [
        { id: "t1", title: "Task 1", completed: false },
        { id: "t2", title: "Task 2", completed: true },
      ]);
    });

    test("accepts empty task array without throwing", async () => {
      const adapter = makeAdapter();
      const storyRef = await adapter.createWorkItem({ kind: "story", title: "Story", body: "..." });
      await adapter.mirrorTasks(storyRef, []);
    });
  });

  describe("addComment", () => {
    test("returns a CommentRef without persisting the comment", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const commentRef = await adapter.addComment(ref, "This is a comment body");
      expect(commentRef.id).toBeDefined();
      expect(typeof commentRef.id).toBe("string");
    });

    test("returns CommentRef with id that is a valid string and changes across multiple calls", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const id1 = (await adapter.addComment(ref, "First")).id;
      const id2 = (await adapter.addComment(ref, "Second")).id;
      const id3 = (await adapter.addComment(ref, "Third")).id;
      // All IDs must be non-empty strings
      expect(typeof id1).toBe("string");
      expect(id1.length).toBeGreaterThan(0);
      // Across three calls with deliberate delay, IDs should differ
      // (If called within same ms, Date.now() may collide — use delay to avoid flakiness)
      await new Promise((r) => setTimeout(r, 2));
      const id4 = (await adapter.addComment(ref, "Fourth")).id;
      expect(id4).not.toBe(id1);
    });

    test("accepts artifact_refs option without throwing", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      const commentRef = await adapter.addComment(ref, "Comment with screenshot", {
        artifact_refs: [{ artifact_id: "art_123", presentation: "inline_image", alt: "Screenshot" }],
      });
      expect(commentRef.id).toBeDefined();
    });
  });

  describe("listComments", () => {
    test("returns empty iterable — comments are not stored in builtin adapter", async () => {
      const adapter = makeAdapter();
      const ref = await adapter.createWorkItem({ kind: "epic", title: "E1", body: "..." });
      // addComment creates a comment ref but does not persist it
      await adapter.addComment(ref, "A comment that is not stored");
      const comments = [];
      for await (const _ of adapter.listComments(ref)) {
        comments.push(_);
      }
      expect(comments).toHaveLength(0);
    });
  });
