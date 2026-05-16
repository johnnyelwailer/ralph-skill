import fs from "node:fs";
import path from "node:path";
import type {
  TrackerAdapter,
  TrackerId,
  TrackerHealth,
  WorkItemFilter,
  WorkItem,
  WorkItemRef,
  WorkItemDraft,
  WorkItemPatch,
  ChangeSetRef,
  CommentRef,
  TaskSnapshot,
  LinkChildOptions,
  WorkItemChildrenSummary,
  TrackerCapabilities,
  TrackerEventFilter,
  TrackerEvent,
} from "./types.js";

export interface CreateBuiltinAdapterOptions {
  root?: string;
  projectId?: string;
}

function builtinCapabilities(): TrackerCapabilities {
  return {
    work_items: true,
    labels: false,
    comments: false,
    assignees: false,
    change_sets: false,
    change_set_reviews: false,
    subscribe_events: true,
    hierarchy: {
      native: true,
      max_depth: 8,
      max_children_per_parent: 100,
      single_parent_only: false,
      cross_repo_allowed: false,
    },
    tracks_tasks: {
      mirror_supported: true,
      mirror_shape: "sub_children",
      max_tasks_per_story: 50,
    },
    milestones: false,
    projects_boards: false,
    max_body_bytes: 1_000_000,
  };
}

function nextKey(dir: string): string {
  const entries = fs.readdirSync(dir).filter(
    (e) => fs.statSync(path.join(dir, e)).isFile() && e.endsWith(".json"),
  );
  let max = 0;
  for (const e of entries) {
    const num = parseInt(e.slice(0, 4), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return String(max + 1).padStart(4, "0");
}

function itemPath(root: string, key: string): string {
  return path.join(root, `${key}.json`);
}

function readItem(root: string, key: string): WorkItem {
  const raw = fs.readFileSync(itemPath(root, key), "utf-8");
  return JSON.parse(raw) as WorkItem;
}

function writeItem(root: string, item: WorkItem): void {
  fs.writeFileSync(itemPath(root, item.ref.key), JSON.stringify(item, null, 2), "utf-8");
}

function appendEvent(root: string, topic: string, data: unknown): void {
  const env = {
    _v: 1,
    id: `${Date.now()}.${String(Math.random()).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    topic,
    data,
  };
  const line = JSON.stringify(env) + "\n";
  fs.appendFileSync(path.join(root, "events.jsonl"), line, "utf-8");
}

function resolveStatus(status: string | undefined): string {
  return status ?? "needs_refinement";
}

export function createBuiltinAdapter(
  options: CreateBuiltinAdapterOptions = {},
): TrackerAdapter {
  const root = options.root ?? ".aloop/tracker";
  const projectId = options.projectId ?? "builtin";

  function ensureRoot(): void {
    try {
      fs.readdirSync(root);
    } catch {
      fs.mkdirSync(root, { recursive: true });
      fs.mkdirSync(path.join(root, "changesets"), { recursive: true });
      fs.writeFileSync(path.join(root, "events.jsonl"), "", "utf-8");
    }
    try {
      fs.readdirSync(path.join(root, "changesets"));
    } catch {
      fs.mkdirSync(path.join(root, "changesets"), { recursive: true });
    }
  }

  return {
    id: "builtin" as TrackerId,
    capabilities: builtinCapabilities(),

    async ping(): Promise<TrackerHealth> {
      try {
        ensureRoot();
        return { status: "healthy" };
      } catch {
        return { status: "unavailable", message: "cannot access tracker directory" };
      }
    },

    async *listWorkItems(filter: WorkItemFilter): AsyncIterable<WorkItem> {
      ensureRoot();
      const entries = fs.readdirSync(root).filter((e) => {
        const stat = fs.statSync(path.join(root, e));
        return stat.isFile() && e.endsWith(".json") && e !== "events.jsonl" && !e.startsWith("changesets");
      });
      for (const entry of entries) {
        const raw = fs.readFileSync(path.join(root, entry), "utf-8");
        const item = JSON.parse(raw) as WorkItem;
        if (filter.kind !== undefined) {
          const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
          if (!kinds.includes(item.kind)) continue;
        }
        if (filter.state !== undefined && item.state !== filter.state) continue;
        if (filter.labels !== undefined && filter.labels.length > 0) {
          if (!filter.labels.some((l) => item.labels.includes(l))) continue;
        }
        if (filter.parent !== undefined) {
          if (!item.links.parent || item.links.parent.key !== filter.parent.key) continue;
        }
        if (filter.assignee !== undefined) {
          if (!item.assignees.includes(filter.assignee)) continue;
        }
        yield item;
      }
    },

    async getWorkItem(ref: WorkItemRef): Promise<WorkItem> {
      return readItem(root, ref.key);
    },

    async *listComments(_ref: WorkItemRef): AsyncIterable<never> {
    },

    async *listLinkedChangeSets(ref: WorkItemRef): AsyncIterable<ChangeSetRef> {
      const item = readItem(root, ref.key);
      if (!item.links.change_sets) return;
      for (const csRef of item.links.change_sets) {
        yield csRef;
      }
    },

    async getParent(ref: WorkItemRef): Promise<WorkItemRef | null> {
      const item = readItem(root, ref.key);
      return item.links.parent ?? null;
    },

    async *listChildren(ref: WorkItemRef): AsyncIterable<WorkItem> {
      const parentKey = ref.key;
      const entries = fs.readdirSync(root).filter((e) => {
        const stat = fs.statSync(path.join(root, e));
        return stat.isFile() && e.endsWith(".json") && e !== "events.jsonl" && !e.startsWith("changesets");
      });
      for (const entry of entries) {
        const raw = fs.readFileSync(path.join(root, entry), "utf-8");
        const item = JSON.parse(raw) as WorkItem;
        if (item.links.parent && item.links.parent.key === parentKey) {
          yield item;
        }
      }
    },

    async linkChild(parent: WorkItemRef, child: WorkItemRef, _opts?: LinkChildOptions): Promise<void> {
      const parentItem = readItem(root, parent.key);
      const childItem = readItem(root, child.key);
      const updatedChild: WorkItem = {
        ...childItem,
        links: { ...childItem.links, parent: parentItem.ref },
        updated_at: new Date().toISOString(),
      };
      writeItem(root, updatedChild);
      appendEvent(root, "hierarchy.child_added", {
        adapter: "builtin",
        parent_key: parent.key,
        child_key: child.key,
      });
    },

    async unlinkChild(_parent: WorkItemRef, child: WorkItemRef): Promise<void> {
      const childItem = readItem(root, child.key);
      const { parent: _removed, ...restLinks } = childItem.links;
      const updatedChild: WorkItem = {
        ...childItem,
        links: restLinks,
        updated_at: new Date().toISOString(),
      };
      writeItem(root, updatedChild);
      appendEvent(root, "hierarchy.child_removed", {
        adapter: "builtin",
        child_key: child.key,
      });
    },

    async reorderChild(_parent: WorkItemRef, _child: WorkItemRef, _after?: WorkItemRef, _before?: WorkItemRef): Promise<void> {
    },

    async childrenSummary(ref: WorkItemRef): Promise<WorkItemChildrenSummary> {
      let total = 0;
      let completed = 0;
      const entries = fs.readdirSync(root).filter((e) => {
        const stat = fs.statSync(path.join(root, e));
        return stat.isFile() && e.endsWith(".json") && e !== "events.jsonl" && !e.startsWith("changesets");
      });
      for (const entry of entries) {
        const raw = fs.readFileSync(path.join(root, entry), "utf-8");
        const item = JSON.parse(raw) as WorkItem;
        if (item.links.parent && item.links.parent.key === ref.key) {
          total++;
          if (item.state === "closed") completed++;
        }
      }
      return { total, completed };
    },

    async createWorkItem(draft: WorkItemDraft): Promise<WorkItemRef> {
      ensureRoot();
      const key = nextKey(root);
      const now = new Date().toISOString();
      const item: WorkItem = {
        ref: { adapter: "builtin", key },
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
        state: "open",
        status: resolveStatus(draft.metadata?.status as string | undefined),
        labels: [...(draft.labels ?? [])],
        assignees: [...(draft.assignees ?? [])],
        created_at: now,
        updated_at: now,
        links: {
          ...(draft.parent !== undefined && { parent: draft.parent }),
          children: [],
          blocks: [],
          blocked_by: [],
          change_sets: [],
        },
        metadata: { ...(draft.metadata ?? {}) },
      };
      writeItem(root, item);
      appendEvent(root, "work_item.created", { adapter: "builtin", key, kind: draft.kind });
      return item.ref;
    },

    async updateWorkItem(ref: WorkItemRef, patch: WorkItemPatch): Promise<void> {
      const item = readItem(root, ref.key);
      const updated: WorkItem = {
        ...item,
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.body !== undefined && { body: patch.body }),
        ...(patch.state !== undefined && { state: patch.state }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.labels !== undefined && { labels: [...patch.labels] }),
        ...(patch.assignees !== undefined && { assignees: [...patch.assignees] }),
        updated_at: new Date().toISOString(),
      };
      writeItem(root, updated);
      appendEvent(root, "work_item.updated", { adapter: "builtin", key: ref.key });
    },

    async addComment(_ref: WorkItemRef, _body: string, _opts?: { artifact_refs?: readonly import("./types.js").CommentArtifactRef[] }): Promise<CommentRef> {
      return { id: `c_${Date.now()}` };
    },

    async addLabel(ref: WorkItemRef, label: string): Promise<void> {
      const item = readItem(root, ref.key);
      const updated: WorkItem = {
        ...item,
        labels: [...item.labels, label],
        updated_at: new Date().toISOString(),
      };
      writeItem(root, updated);
      appendEvent(root, "work_item.updated", { adapter: "builtin", key: ref.key, action: "addLabel" });
    },

    async removeLabel(ref: WorkItemRef, label: string): Promise<void> {
      const item = readItem(root, ref.key);
      const updated: WorkItem = {
        ...item,
        labels: item.labels.filter((l) => l !== label),
        updated_at: new Date().toISOString(),
      };
      writeItem(root, updated);
      appendEvent(root, "work_item.updated", { adapter: "builtin", key: ref.key, action: "removeLabel" });
    },

    async setAssignees(ref: WorkItemRef, assignees: readonly string[]): Promise<void> {
      const item = readItem(root, ref.key);
      const updated: WorkItem = {
        ...item,
        assignees: [...assignees],
        updated_at: new Date().toISOString(),
      };
      writeItem(root, updated);
      appendEvent(root, "work_item.updated", { adapter: "builtin", key: ref.key, action: "setAssignees" });
    },

    async closeWorkItem(
      ref: WorkItemRef,
      reason?: "completed" | "not_planned",
    ): Promise<void> {
      const item = readItem(root, ref.key);
      const updated: WorkItem = {
        ...item,
        state: "closed",
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { ...item.metadata, close_reason: reason ?? "completed" },
      };
      writeItem(root, updated);
      appendEvent(root, "work_item.closed", { adapter: "builtin", key: ref.key, reason });
    },

    async reopenWorkItem(ref: WorkItemRef): Promise<void> {
      const item = readItem(root, ref.key);
      const updated: WorkItem = {
        ...item,
        state: "open",
        updated_at: new Date().toISOString(),
      };
      writeItem(root, updated);
      appendEvent(root, "work_item.reopened", { adapter: "builtin", key: ref.key });
    },

    async mirrorTasks(_story: WorkItemRef, _tasks: readonly TaskSnapshot[]): Promise<void> {
      void _story;
      void _tasks;
    },

    async *readMirroredTasks(story: WorkItemRef): AsyncIterable<TaskSnapshot> {
      const item = readItem(root, story.key);
      if (item.kind !== "story") return;
      const entries = fs.readdirSync(root).filter((e) => {
        const stat = fs.statSync(path.join(root, e));
        return stat.isFile() && e.endsWith(".json") && e !== "events.jsonl" && !e.startsWith("changesets");
      });
      for (const entry of entries) {
        const raw = fs.readFileSync(path.join(root, entry), "utf-8");
        const child = JSON.parse(raw) as WorkItem;
        if (child.links.parent?.key === story.key && child.kind === "task_mirror") {
          yield {
            id: child.ref.key,
            title: child.title,
            completed: child.state === "closed",
          };
        }
      }
    },

    async *subscribe(filter: TrackerEventFilter): AsyncGenerator<TrackerEvent> {
      ensureRoot();
      const eventsPath = path.join(root, "events.jsonl");
      let lastSize = 0;

      const watcher = fs.watch(root, { persistent: false }, (eventType, filename) => {
        if (eventType === "rename" && filename === "events.jsonl") {
        }
      });

      try {
        while (true) {
          try {
            const stat = fs.statSync(eventsPath);
            if (stat.size > lastSize) {
              const fd = fs.openSync(eventsPath, "r");
              try {
                fs.readSync(fd, Buffer.alloc(stat.size - lastSize), 0, stat.size - lastSize, lastSize);
              } finally {
                fs.closeSync(fd);
              }
              const stream = fs.createReadStream(eventsPath, {
                start: lastSize,
                encoding: "utf-8",
              });
              const rl = (await import("node:readline")).createInterface({ input: stream });
              for await (const line of rl) {
                if (!line.trim()) continue;
                try {
                  const env = JSON.parse(line) as { topic: string; data: Record<string, unknown>; timestamp: string };
                  if (filter.topics !== undefined && !filter.topics.includes(env.topic)) continue;
                  yield {
                    topic: env.topic,
                    data: {
                      adapter: "builtin" as TrackerId,
                      project_id: projectId,
                      kind: env.topic as TrackerEvent["data"]["kind"],
                      received_at: env.timestamp,
                    },
                  };
                } catch {
                }
              }
              lastSize = stat.size;
            }
          } catch {
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } finally {
        watcher.close();
      }
    },
  };
}