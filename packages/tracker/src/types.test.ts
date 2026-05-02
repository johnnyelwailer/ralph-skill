import { describe, expect, test } from "bun:test";
import type {
  TrackerAdapter,
  WorkItemRef,
  WorkItem,
  WorkItemDraft,
  WorkItemPatch,
  WorkItemFilter,
  WorkItemKind,
  WorkItemChildrenSummary,
  ChangeSetRef,
  ChangeSet,
  ChangeSetDraft,
  ChangeSetFilter,
  MergeMode,
  MergeResult,
  LinePosition,
  CommentArtifactRef,
  Comment,
  CommentRef,
  TaskSnapshot,
  TrackerCapabilities,
  TrackerHealth,
  TrackerEventFilter,
  TrackerEvent,
  TrackerId,
  LinkChildOptions,
} from "./types.ts";

// ─── WorkItemRef ─────────────────────────────────────────────────────────────

describe("WorkItemRef", () => {
  test("accepts valid ref", () => {
    const ref: WorkItemRef = { adapter: "github", key: "42" };
    expect(ref.adapter).toBe("github");
    expect(ref.key).toBe("42");
  });

  test("accepts url field", () => {
    const ref: WorkItemRef = {
      adapter: "github",
      key: "42",
      url: "https://github.com/owner/repo/issues/42",
    };
    expect(ref.url).toBe("https://github.com/owner/repo/issues/42");
  });
});

// ─── WorkItem ────────────────────────────────────────────────────────────────

describe("WorkItem", () => {
  test("accepts minimal valid work item", () => {
    const item: WorkItem = {
      ref: { adapter: "github", key: "1" },
      kind: "epic",
      title: "Implement auth",
      body: "...",
      state: "open",
      labels: [],
      assignees: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      links: {},
      metadata: {},
    };
    expect(item.kind).toBe("epic");
    expect(item.state).toBe("open");
  });

  test("accepts closed item with closed_at", () => {
    const item: WorkItem = {
      ref: { adapter: "github", key: "2" },
      kind: "story",
      title: "Add login form",
      body: "...",
      state: "closed",
      closed_at: "2026-01-15T12:00:00Z",
      labels: [],
      assignees: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-10T00:00:00Z",
      links: {},
      metadata: {},
    };
    expect(item.state).toBe("closed");
    expect(item.closed_at).toBe("2026-01-15T12:00:00Z");
  });

  test("accepts work item with all link relations", () => {
    const parent: WorkItemRef = { adapter: "github", key: "1" };
    const child: WorkItemRef = { adapter: "github", key: "2" };
    const block: WorkItemRef = { adapter: "github", key: "3" };
    const blocked: WorkItemRef = { adapter: "github", key: "4" };
    const cs: ChangeSetRef = { adapter: "github", key: "PR/42" };
    const item: WorkItem = {
      ref: { adapter: "github", key: "2" },
      kind: "story",
      title: "Child story",
      body: "...",
      state: "open",
      labels: [],
      assignees: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      links: {
        parent,
        children: [child],
        blocks: [block],
        blocked_by: [blocked],
        change_sets: [cs],
      },
      metadata: { refined: true },
    };
    expect(item.links.parent).toEqual(parent);
    expect(item.links.children).toHaveLength(1);
    expect(item.links.blocks).toHaveLength(1);
    expect(item.links.blocked_by).toHaveLength(1);
    expect(item.links.change_sets).toHaveLength(1);
  });

  test("accepts task_mirror kind", () => {
    const item: WorkItem = {
      ref: { adapter: "github", key: "5" },
      kind: "task_mirror",
      title: "Write tests",
      body: "...",
      state: "open",
      labels: [],
      assignees: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      links: {},
      metadata: {},
    };
    expect(item.kind).toBe("task_mirror");
  });

  test("all fields are readonly", () => {
    const item: WorkItem = {
      ref: { adapter: "github", key: "1" },
      kind: "epic",
      title: "Test",
      body: "...",
      state: "open",
      labels: [],
      assignees: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      links: {},
      metadata: {},
    };
    // @ts-expect-error — fields must be readonly
    item.title = "mutated";
    // @ts-expect-error — labels must be readonly
    item.labels.push("x");
  });
});

// ─── WorkItemDraft ───────────────────────────────────────────────────────────

describe("WorkItemDraft", () => {
  test("accepts minimal draft", () => {
    const draft: WorkItemDraft = {
      kind: "epic",
      title: "New epic",
      body: "...",
    };
    expect(draft.kind).toBe("epic");
    expect(draft.labels).toBeUndefined();
    expect(draft.parent).toBeUndefined();
  });

  test("accepts draft with optional fields", () => {
    const parent: WorkItemRef = { adapter: "github", key: "1" };
    const draft: WorkItemDraft = {
      kind: "story",
      title: "New story",
      body: "...",
      labels: ["priority_high"],
      assignees: ["alice"],
      parent,
      metadata: { wave: 1 },
    };
    expect(draft.labels).toEqual(["priority_high"]);
    expect(draft.assignees).toEqual(["alice"]);
    expect(draft.parent).toEqual(parent);
    expect(draft.metadata).toEqual({ wave: 1 });
  });

  test("labels and assignees are readonly arrays", () => {
    const draft: WorkItemDraft = {
      kind: "epic",
      title: "Test",
      body: "...",
      labels: ["a"],
      assignees: ["b"],
    };
    // @ts-expect-error — labels must be readonly
    draft.labels.push("x");
    // @ts-expect-error — assignees must be readonly
    draft.assignees[0] = "y";
  });
});

// ─── WorkItemPatch ───────────────────────────────────────────────────────────

describe("WorkItemPatch", () => {
  test("accepts partial patch with title only", () => {
    const patch: WorkItemPatch = { title: "Updated title" };
    expect(patch.title).toBe("Updated title");
    expect((patch as WorkItemPatch).body).toBeUndefined();
  });

  test("accepts partial patch with state only", () => {
    const patch: WorkItemPatch = { state: "closed" };
    expect(patch.state).toBe("closed");
  });

  test("accepts full patch", () => {
    const patch: WorkItemPatch = {
      title: "Updated",
      body: "New body",
      state: "closed",
      status: "done",
      labels: ["done"],
      assignees: ["alice"],
    };
    expect(patch.title).toBe("Updated");
    expect(patch.status).toBe("done");
  });

  test("empty object is valid patch", () => {
    const patch: WorkItemPatch = {};
    expect(Object.keys(patch)).toHaveLength(0);
  });
});

// ─── WorkItemFilter ───────────────────────────────────────────────────────────

describe("WorkItemFilter", () => {
  test("accepts empty filter", () => {
    const filter: WorkItemFilter = {};
    expect(filter.kind).toBeUndefined();
    expect(filter.limit).toBeUndefined();
  });

  test("accepts filter with array of kinds", () => {
    const filter: WorkItemFilter = {
      kind: ["epic", "story"],
      limit: 50,
    };
    expect(filter.kind).toEqual(["epic", "story"]);
    expect(filter.limit).toBe(50);
  });

  test("accepts filter with single kind", () => {
    const filter: WorkItemFilter = { kind: "story" };
    expect(filter.kind).toBe("story");
  });

  test("accepts filter with parent ref", () => {
    const parent: WorkItemRef = { adapter: "github", key: "1" };
    const filter: WorkItemFilter = { parent, state: "open" };
    expect(filter.parent).toEqual(parent);
    expect(filter.state).toBe("open");
  });
});

// ─── WorkItemKind ───────────────────────────────────────────────────────────

describe("WorkItemKind", () => {
  test("accepts all valid kind values", () => {
    const kinds: WorkItemKind[] = ["epic", "story", "task_mirror", "other"];
    expect(kinds).toContain("epic");
    expect(kinds).toContain("task_mirror");
  });
});

// ─── WorkItemChildrenSummary ─────────────────────────────────────────────────

describe("WorkItemChildrenSummary", () => {
  test("accepts valid summary", () => {
    const s: WorkItemChildrenSummary = { total: 10, completed: 3 };
    expect(s.total).toBe(10);
    expect(s.completed).toBe(3);
  });

  test("completed can equal total", () => {
    const s: WorkItemChildrenSummary = { total: 5, completed: 5 };
    expect(s.completed).toBe(s.total);
  });
});

// ─── ChangeSetRef ───────────────────────────────────────────────────────────

describe("ChangeSetRef", () => {
  test("accepts valid ref", () => {
    const ref: ChangeSetRef = { adapter: "github", key: "PR/42" };
    expect(ref.adapter).toBe("github");
    expect(ref.key).toBe("PR/42");
  });
});

// ─── ChangeSet ───────────────────────────────────────────────────────────────

describe("ChangeSet", () => {
  test("accepts minimal valid change set", () => {
    const cs: ChangeSet = {
      ref: { adapter: "github", key: "PR/42" },
      title: "feat: add login",
      body: "...",
      state: "open",
      headBranch: "feat/login",
      author: "alice",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      labels: [],
      metadata: {},
    };
    expect(cs.state).toBe("open");
    expect(cs.headBranch).toBe("feat/login");
  });

  test("accepts merged change set with merge sha", () => {
    const cs: ChangeSet = {
      ref: { adapter: "github", key: "PR/42" },
      title: "feat: add login",
      body: "...",
      state: "merged",
      headBranch: "feat/login",
      author: "alice",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      merged_at: "2026-01-02T12:00:00Z",
      labels: [],
      metadata: {},
    };
    expect(cs.state).toBe("merged");
    expect(cs.merged_at).toBe("2026-01-02T12:00:00Z");
  });

  test("all fields are readonly", () => {
    const cs: ChangeSet = {
      ref: { adapter: "github", key: "1" },
      title: "Test",
      body: "...",
      state: "open",
      headBranch: "x",
      author: "a",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      labels: [],
      metadata: {},
    };
    // @ts-expect-error — fields must be readonly
    cs.title = "mutated";
    // @ts-expect-error — labels must be readonly
    cs.labels.push("x");
  });
});

// ─── ChangeSetDraft ─────────────────────────────────────────────────────────

describe("ChangeSetDraft", () => {
  test("accepts minimal draft", () => {
    const draft: ChangeSetDraft = {
      title: "New PR",
      headBranch: "feat/new",
    };
    expect(draft.title).toBe("New PR");
    expect(draft.body).toBeUndefined();
    expect(draft.baseBranch).toBeUndefined();
  });

  test("accepts full draft", () => {
    const draft: ChangeSetDraft = {
      title: "New PR",
      body: "Implements feature X",
      baseBranch: "main",
      headBranch: "feat/x",
      labels: ["feature"],
    };
    expect(draft.baseBranch).toBe("main");
    expect(draft.labels).toEqual(["feature"]);
  });
});

// ─── ChangeSetFilter ─────────────────────────────────────────────────────────

describe("ChangeSetFilter", () => {
  test("accepts empty filter", () => {
    const filter: ChangeSetFilter = {};
    expect(filter.state).toBeUndefined();
  });

  test("accepts filter with array of states", () => {
    const filter: ChangeSetFilter = {
      state: ["open", "merged"],
      limit: 20,
    };
    expect(filter.state).toEqual(["open", "merged"]);
    expect(filter.limit).toBe(20);
  });
});

// ─── MergeMode ───────────────────────────────────────────────────────────────

describe("MergeMode", () => {
  test("accepts all valid merge modes", () => {
    const modes: MergeMode[] = ["squash", "merge", "fast_forward"];
    for (const m of modes) {
      expect(["squash", "merge", "fast_forward"]).toContain(m);
    }
  });
});

// ─── MergeResult ─────────────────────────────────────────────────────────────

describe("MergeResult", () => {
  test("accepts successful merge with sha", () => {
    const result: MergeResult = {
      merged: true,
      merge_sha: "abc123",
      message: "Squash and merge",
    };
    expect(result.merged).toBe(true);
    expect(result.merge_sha).toBe("abc123");
  });

  test("accepts failed merge", () => {
    const result: MergeResult = {
      merged: false,
      message: "Branch has conflicts",
    };
    expect(result.merged).toBe(false);
    expect(result.merge_sha).toBeUndefined();
  });
});

// ─── CommentArtifactRef ──────────────────────────────────────────────────────

describe("CommentArtifactRef", () => {
  test("accepts minimal artifact ref", () => {
    const ref: CommentArtifactRef = { artifact_id: "art_42" };
    expect(ref.artifact_id).toBe("art_42");
    expect(ref.presentation).toBeUndefined();
  });

  test("accepts with presentation", () => {
    const ref: CommentArtifactRef = {
      artifact_id: "art_42",
      presentation: "inline_image",
      alt: "Screenshot of login page",
    };
    expect(ref.presentation).toBe("inline_image");
    expect(ref.alt).toBe("Screenshot of login page");
  });

  test("accepts all presentation values", () => {
    const vals: CommentArtifactRef["presentation"][] = [
      "attachment",
      "inline_image",
      "link",
    ];
    for (const v of vals) {
      const ref: CommentArtifactRef = { artifact_id: "x", presentation: v };
      expect(ref.presentation).toBe(v);
    }
  });
});

// ─── Comment ─────────────────────────────────────────────────────────────────

describe("Comment", () => {
  test("accepts minimal comment", () => {
    const c: Comment = {
      ref: { id: "123" },
      body: "Looks good!",
      author: "alice",
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(c.body).toBe("Looks good!");
    expect(c.updated_at).toBeUndefined();
    expect(c.artifact_refs).toBeUndefined();
  });

  test("accepts comment with artifact refs", () => {
    const c: Comment = {
      ref: { id: "456", url: "https://github.com/..." },
      body: "See screenshot below",
      author: "bob",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      artifact_refs: [{ artifact_id: "art_1", presentation: "inline_image" }],
    };
    expect(c.artifact_refs).toHaveLength(1);
    expect(c.artifact_refs![0]!.artifact_id).toBe("art_1");
  });
});

// ─── TaskSnapshot ────────────────────────────────────────────────────────────

describe("TaskSnapshot", () => {
  test("accepts pending task", () => {
    const t: TaskSnapshot = { id: "t1", title: "Write tests", completed: false };
    expect(t.completed).toBe(false);
  });

  test("accepts completed task", () => {
    const t: TaskSnapshot = { id: "t2", title: "Write tests", completed: true };
    expect(t.completed).toBe(true);
  });
});

// ─── TrackerCapabilities ─────────────────────────────────────────────────────

describe("TrackerCapabilities", () => {
  test("accepts full capabilities", () => {
    const caps: TrackerCapabilities = {
      work_items: true,
      labels: true,
      comments: true,
      assignees: true,
      change_sets: true,
      change_set_reviews: true,
      subscribe_events: true,
      hierarchy: {
        native: true,
        max_depth: 8,
        max_children_per_parent: 100,
        single_parent_only: true,
        cross_repo_allowed: false,
      },
      tracks_tasks: {
        mirror_supported: true,
        mirror_shape: "sub_children",
        max_tasks_per_story: 50,
      },
      milestones: false,
      projects_boards: false,
      max_body_bytes: 65536,
    };
    expect(caps.work_items).toBe(true);
    expect(caps.hierarchy.max_depth).toBe(8);
    expect(caps.tracks_tasks.mirror_shape).toBe("sub_children");
  });

  test("builtin adapter — no native hierarchy", () => {
    const caps: TrackerCapabilities = {
      work_items: true,
      labels: false,
      comments: false,
      assignees: false,
      change_sets: false,
      change_set_reviews: false,
      subscribe_events: false,
      hierarchy: {
        native: true,
        max_depth: 8,
        max_children_per_parent: 100,
        single_parent_only: false,
        cross_repo_allowed: false,
      },
      tracks_tasks: {
        mirror_supported: false,
        mirror_shape: "none",
        max_tasks_per_story: null,
      },
      milestones: false,
      projects_boards: false,
      max_body_bytes: 1_000_000,
    };
    expect(caps.change_sets).toBe(false);
    expect(caps.tracks_tasks.mirror_supported).toBe(false);
    expect(caps.tracks_tasks.mirror_shape).toBe("none");
  });

  test("all mirror shapes are valid", () => {
    const shapes: TrackerCapabilities["tracks_tasks"]["mirror_shape"][] = [
      "checkboxes_in_body",
      "sub_children",
      "projects_board",
      "none",
    ];
    for (const shape of shapes) {
      const caps: TrackerCapabilities = {
        work_items: true,
        labels: false,
        comments: false,
        assignees: false,
        change_sets: false,
        change_set_reviews: false,
        subscribe_events: false,
        hierarchy: {
          native: false,
          max_depth: 0,
          max_children_per_parent: 0,
          single_parent_only: false,
          cross_repo_allowed: false,
        },
        tracks_tasks: { mirror_supported: false, mirror_shape: shape, max_tasks_per_story: null },
        milestones: false,
        projects_boards: false,
        max_body_bytes: 0,
      };
      expect(caps.tracks_tasks.mirror_shape).toBe(shape);
    }
  });
});

// ─── TrackerHealth ───────────────────────────────────────────────────────────

describe("TrackerHealth", () => {
  test("accepts healthy status", () => {
    const h: TrackerHealth = { status: "healthy" };
    expect(h.status).toBe("healthy");
    expect(h.message).toBeUndefined();
  });

  test("accepts degraded with message", () => {
    const h: TrackerHealth = {
      status: "degraded",
      message: "Rate limit approaching",
    };
    expect(h.status).toBe("degraded");
    expect(h.message).toBe("Rate limit approaching");
  });

  test("accepts unavailable status", () => {
    const h: TrackerHealth = { status: "unavailable" };
    expect(h.status).toBe("unavailable");
  });
});

// ─── TrackerEventFilter ──────────────────────────────────────────────────────

describe("TrackerEventFilter", () => {
  test("accepts empty filter", () => {
    const f: TrackerEventFilter = {};
    expect(f.topics).toBeUndefined();
    expect(f.work_item_ref).toBeUndefined();
  });

  test("accepts filter with topics", () => {
    const f: TrackerEventFilter = {
      topics: ["work_item.created", "work_item.closed"],
    };
    expect(f.topics).toHaveLength(2);
  });
});

// ─── LinkChildOptions ───────────────────────────────────────────────────────

describe("LinkChildOptions", () => {
  test("empty is valid", () => {
    const opts: LinkChildOptions = {};
    expect(opts.replaceParent).toBeUndefined();
  });

  test("replaceParent = true", () => {
    const opts: LinkChildOptions = { replaceParent: true };
    expect(opts.replaceParent).toBe(true);
  });
});

// ─── TrackerAdapter interface ────────────────────────────────────────────────

describe("TrackerAdapter", () => {
  // A mock adapter that implements all required methods.
  const makeMockAdapter = (): TrackerAdapter => ({
    id: "test",
    capabilities: {
      work_items: true,
      labels: false,
      comments: false,
      assignees: false,
      change_sets: false,
      change_set_reviews: false,
      subscribe_events: false,
      hierarchy: {
        native: false,
        max_depth: 0,
        max_children_per_parent: 0,
        single_parent_only: false,
        cross_repo_allowed: false,
      },
      tracks_tasks: {
        mirror_supported: false,
        mirror_shape: "none",
        max_tasks_per_story: null,
      },
      milestones: false,
      projects_boards: false,
      max_body_bytes: 0,
    },
    async ping() {
      return { status: "healthy" };
    },
    async *listWorkItems(_filter) {
      // empty
    },
    async getWorkItem(_ref) {
      throw new Error("not implemented in mock");
    },
    async *listComments(_ref) {
      // empty
    },
    async *listLinkedChangeSets(_ref) {
      // empty
    },
    async getParent(_ref) {
      return null;
    },
    async *listChildren(_ref) {
      // empty
    },
    async linkChild(_parent, _child) {
      // noop
    },
    async unlinkChild(_parent, _child) {
      // noop
    },
    async reorderChild(_parent, _child) {
      // noop
    },
    async childrenSummary(_ref) {
      return { total: 0, completed: 0 };
    },
    async createWorkItem(_draft) {
      return { adapter: "test", key: "1" };
    },
    async updateWorkItem(_ref, _patch) {
      // noop
    },
    async addComment(_ref, _body) {
      return { id: "c1" };
    },
    async addLabel(_ref, _label) {
      // noop
    },
    async removeLabel(_ref, _label) {
      // noop
    },
    async setAssignees(_ref, _assignees) {
      // noop
    },
    async closeWorkItem(_ref, _reason) {
      // noop
    },
    async reopenWorkItem(_ref) {
      // noop
    },
  });

  test("adapter can be created with all required methods", () => {
    const adapter = makeMockAdapter();
    expect(adapter.id).toBe("test");
    expect(adapter.capabilities.work_items).toBe(true);
  });

  test("ping returns TrackerHealth", async () => {
    const adapter = makeMockAdapter();
    const health = await adapter.ping();
    expect(health.status).toBe("healthy");
  });

  test("createWorkItem returns WorkItemRef", async () => {
    const adapter = makeMockAdapter();
    const ref = await adapter.createWorkItem({
      kind: "epic",
      title: "Test",
      body: "...",
    });
    expect(ref.adapter).toBe("test");
    expect(ref.key).toBe("1");
  });

  test("closeWorkItem accepts optional reason", async () => {
    const adapter = makeMockAdapter();
    const ref: WorkItemRef = { adapter: "test", key: "1" };
    // Should compile — both reason variants should work
    await adapter.closeWorkItem(ref, "completed");
    await adapter.closeWorkItem(ref, "not_planned");
    await adapter.closeWorkItem(ref); // no reason
  });

  test("optional change set methods are absent on basic adapter", () => {
    const adapter = makeMockAdapter();
    expect(typeof (adapter as Partial<TrackerAdapter>).createChangeSet).toBe("undefined");
    expect(typeof (adapter as Partial<TrackerAdapter>).mergeChangeSet).toBe("undefined");
  });

  test("capabilities.hierarchy is required and structured", () => {
    const adapter = makeMockAdapter();
    expect(typeof adapter.capabilities.hierarchy.native).toBe("boolean");
    expect(typeof adapter.capabilities.hierarchy.max_depth).toBe("number");
  });

  test("capabilities.tracks_tasks is required and structured", () => {
    const adapter = makeMockAdapter();
    expect(typeof adapter.capabilities.tracks_tasks.mirror_supported).toBe("boolean");
    expect(
      ["checkboxes_in_body", "sub_children", "projects_board", "none"],
    ).toContain(adapter.capabilities.tracks_tasks.mirror_shape);
  });
});

// ─── Type-level invariants ───────────────────────────────────────────────────

// These are compile-time checks encoded as runtime tests that verify
// TypeScript accepts correct inputs and rejects incorrect ones.

describe("Type-level invariants", () => {
  test("WorkItemRef.key is a string (not number)", () => {
    // GitHub numeric IDs must be stored as strings
    const ref: WorkItemRef = { adapter: "github", key: "123" };
    expect(typeof ref.key).toBe("string");
  });

  test("WorkItemFilter.kind accepts single WorkItemKind", () => {
    const filter: WorkItemFilter = { kind: "story" };
    expect(filter.kind).toBe("story");
  });

  test("WorkItemFilter.kind accepts array of WorkItemKind", () => {
    const filter: WorkItemFilter = { kind: ["epic", "story"] };
    expect(Array.isArray(filter.kind)).toBe(true);
  });

  test("MergeMode is a string union", () => {
    const mode: MergeMode = "squash";
    // @ts-expect-error — invalid merge mode should not compile
    const bad: MergeMode = "rebase";
  });

  test("ChangeSet.state is a string union", () => {
    const cs: ChangeSet = {
      ref: { adapter: "x", key: "1" },
      title: "t",
      body: "",
      state: "merged",
      headBranch: "x",
      author: "a",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      labels: [],
      metadata: {},
    };
    expect(cs.state).toBe("merged");
    // @ts-expect-error — invalid state should not compile
    cs.state = "pending";
  });

  test("Comment.presentation is optional string union", () => {
    const ref: CommentArtifactRef = {
      artifact_id: "a1",
      presentation: "attachment",
    };
    expect(ref.presentation).toBe("attachment");
    // @ts-expect-error — invalid presentation should not compile
    const bad: CommentArtifactRef = { artifact_id: "a1", presentation: "video" };
  });

  test("WorkItemPatch does not allow arbitrary fields", () => {
    const patch: WorkItemPatch = { title: "x" };
    // @ts-expect-error — kind is not in WorkItemPatch
    const bad: WorkItemPatch = { kind: "epic" };
  });

  test("readonly arrays cannot be widened to mutable", () => {
    const item: WorkItem = {
      ref: { adapter: "x", key: "1" },
      kind: "epic",
      title: "Test",
      body: "",
      state: "open",
      labels: ["a", "b"],
      assignees: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      links: {},
      metadata: {},
    };
    // This assignment would violate readonly — it should not compile
    // @ts-expect-error — labels is readonly
    const mutable: string[] = item.labels;
    void mutable;
  });
});

// ─── TrackerEvent ───────────────────────────────────────────────────────────

describe("TrackerEvent", () => {
  test("accepts minimal event", () => {
    const e: TrackerEvent = {
      topic: "tracker.event",
      data: {
        adapter: "github",
        project_id: "p_123",
        kind: "work_item.created",
        received_at: "2026-01-01T00:00:00Z",
      },
    };
    expect(e.topic).toBe("tracker.event");
    expect(e.data.kind).toBe("work_item.created");
  });

  test("accepts all event kinds", () => {
    const kinds: TrackerEvent["data"]["kind"][] = [
      "work_item.created",
      "work_item.updated",
      "work_item.closed",
      "work_item.reopened",
      "hierarchy.child_added",
      "hierarchy.child_removed",
      "hierarchy.parent_added",
      "hierarchy.parent_removed",
      "comment.created",
      "comment.updated",
      "change_set.opened",
      "change_set.updated",
      "change_set.closed",
      "change_set.merged",
      "change_set.conflict",
      "change_set.review_submitted",
      "change_set.review_thread_resolved",
    ];
    for (const kind of kinds) {
      const e: TrackerEvent = {
        topic: "tracker.event",
        data: { adapter: "github", project_id: "p_1", kind, received_at: "2026-01-01T00:00:00Z" },
      };
      expect(e.data.kind).toBe(kind);
    }
  });

  test("accepts event with optional fields", () => {
    const e: TrackerEvent = {
      topic: "tracker.event",
      data: {
        adapter: "github",
        project_id: "p_123",
        kind: "change_set.review_submitted",
        work_item: { adapter: "github", key: "42" },
        change_set: { adapter: "github", key: "pr_99" },
        reviewer: "alice",
        verdict: "changes_requested",
        received_at: "2026-01-01T00:00:00Z",
      },
    };
    expect(e.data.verdict).toBe("changes_requested");
    expect(e.data.change_set?.key).toBe("pr_99");
  });

  test("verdict is readonly union", () => {
    const approved: TrackerEvent["data"]["verdict"] = "approved";
    const requested: TrackerEvent["data"]["verdict"] = "changes_requested";
    const reject: TrackerEvent["data"]["verdict"] = "reject";
    expect(approved).toBe("approved");
    expect(requested).toBe("changes_requested");
    expect(reject).toBe("reject");
  });
});

// ─── LinePosition ───────────────────────────────────────────────────────────

describe("LinePosition", () => {
  test("is a number", () => {
    const pos: LinePosition = 42;
    expect(pos).toBe(42);
  });

  test("accepts zero", () => {
    const pos: LinePosition = 0;
    expect(pos).toBe(0);
  });
});
