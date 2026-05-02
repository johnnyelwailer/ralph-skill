/**
 * Tracker adapter types — the typed contract between the daemon and any
 * work-tracker backend (GitHub, GitLab, Linear, builtin, etc.).
 *
 * These types are the implementation of the interface defined in
 * `docs/spec/work-tracker.md`. The contract:
 *
 * - One adapter per tracker.
 * - One active adapter per project (configured in `aloop/config.yml`).
 * - All orchestrator interactions go through the adapter.
 * - Adapters are the only code that speaks tracker-native API.
 */

// ─── Refs ────────────────────────────────────────────────────────────────────

export type TrackerId = string;

export type WorkItemRef = {
  readonly adapter: TrackerId;
  readonly key: string;
  readonly url?: string;
};

// ─── Work items ─────────────────────────────────────────────────────────────

export type WorkItemKind = "epic" | "story" | "task_mirror" | "other";

export type WorkItem = {
  readonly ref: WorkItemRef;
  readonly kind: WorkItemKind;
  readonly title: string;
  readonly body: string;
  readonly state: "open" | "closed";
  readonly status?: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at?: string;
  readonly links: {
    readonly parent?: WorkItemRef;
    readonly children?: WorkItemRef[];
    readonly blocks?: WorkItemRef[];
    readonly blocked_by?: WorkItemRef[];
    readonly change_sets?: ChangeSetRef[];
  };
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type WorkItemDraft = {
  readonly kind: WorkItemKind;
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
  readonly parent?: WorkItemRef;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type WorkItemPatch = Partial<
  Readonly<Pick<WorkItem, "title" | "body" | "state" | "status" | "labels" | "assignees">>
>;

export type WorkItemFilter = {
  readonly kind?: WorkItemKind | readonly WorkItemKind[];
  readonly state?: "open" | "closed";
  readonly status?: string;
  readonly labels?: readonly string[];
  readonly parent?: WorkItemRef;
  readonly assignee?: string;
  readonly wave?: number;
  readonly limit?: number;
};

export type WorkItemChildrenSummary = {
  readonly total: number;
  readonly completed: number;
};

// ─── Hierarchy ───────────────────────────────────────────────────────────────

export type LinkChildOptions = {
  readonly replaceParent?: boolean;
};

// ─── Change sets ─────────────────────────────────────────────────────────────

export type ChangeSetRef = {
  readonly adapter: TrackerId;
  readonly key: string;
  readonly url?: string;
};

export type ChangeSetState = "open" | "closed" | "merged";

export type ChangeSet = {
  readonly ref: ChangeSetRef;
  readonly title: string;
  readonly body: string;
  readonly state: ChangeSetState;
  readonly baseBranch?: string;
  readonly headBranch: string;
  readonly author: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly merged_at?: string;
  readonly labels: readonly string[];
  readonly url?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type ChangeSetDraft = {
  readonly title: string;
  readonly body?: string;
  readonly baseBranch?: string;
  readonly headBranch: string;
  readonly labels?: readonly string[];
};

export type ChangeSetFilter = {
  readonly state?: ChangeSetState | readonly ChangeSetState[];
  readonly headBranch?: string;
  readonly baseBranch?: string;
  readonly author?: string;
  readonly limit?: number;
};

export type MergeMode = "squash" | "merge" | "fast_forward";

export type MergeResult = {
  readonly merged: boolean;
  readonly merge_sha?: string;
  readonly message?: string;
};

/** Line number for inline comment placement on a change set diff. */
export type LinePosition = number;

// ─── Comments ────────────────────────────────────────────────────────────────

export type CommentArtifactRef = {
  readonly artifact_id: string;
  readonly presentation?: "attachment" | "inline_image" | "link";
  readonly alt?: string;
};

export type CommentRef = {
  readonly id: string;
  readonly url?: string;
};

export type Comment = {
  readonly ref: CommentRef;
  readonly body: string;
  readonly author: string;
  readonly created_at: string;
  readonly updated_at?: string;
  readonly artifact_refs?: readonly CommentArtifactRef[];
  readonly metadata?: Readonly<Record<string, unknown>>;
};

// ─── Task mirroring ───────────────────────────────────────────────────────────

export type TaskSnapshot = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

// ─── Capabilities ────────────────────────────────────────────────────────────

export type TrackerCapabilities = {
  readonly work_items: true;
  readonly labels: boolean;
  readonly comments: boolean;
  readonly assignees: boolean;
  readonly change_sets: boolean;
  readonly change_set_reviews: boolean;
  readonly subscribe_events: boolean;

  readonly hierarchy: {
    readonly native: boolean;
    readonly max_depth: number;
    readonly max_children_per_parent: number;
    readonly single_parent_only: boolean;
    readonly cross_repo_allowed: boolean;
  };

  readonly tracks_tasks: {
    readonly mirror_supported: boolean;
    readonly mirror_shape: "checkboxes_in_body" | "sub_children" | "projects_board" | "none";
    readonly max_tasks_per_story: number | null;
  };

  readonly milestones: boolean;
  readonly projects_boards: boolean;
  readonly max_body_bytes: number;
};

// ─── Health ──────────────────────────────────────────────────────────────────

export type TrackerHealth = {
  readonly status: "healthy" | "degraded" | "unavailable";
  readonly message?: string;
};

// ─── Events ──────────────────────────────────────────────────────────────────

export type TrackerEventFilter = {
  readonly topics?: readonly string[];
  readonly work_item_ref?: WorkItemRef;
};

/**
 * Normalized tracker event shape emitted by the adapter's `subscribe` method.
 * The `subscribe` method is optional; adapters without real-time events support
 * are polled by a daemon-side reconciler instead.
 *
 * Specified in `docs/spec/work-tracker.md` §Events (lines 670–698).
 */
export type TrackerEvent = {
  readonly topic: string;
  readonly data: {
    readonly adapter: TrackerId;
    readonly project_id: string;
    readonly kind:
      | "work_item.created"
      | "work_item.updated"
      | "work_item.closed"
      | "work_item.reopened"
      | "hierarchy.child_added"
      | "hierarchy.child_removed"
      | "hierarchy.parent_added"
      | "hierarchy.parent_removed"
      | "comment.created"
      | "comment.updated"
      | "change_set.opened"
      | "change_set.updated"
      | "change_set.closed"
      | "change_set.merged"
      | "change_set.conflict"
      | "change_set.review_submitted"
      | "change_set.review_thread_resolved";
    readonly work_item?: WorkItemRef;
    readonly change_set?: ChangeSetRef;
    readonly reviewer?: string;
    readonly verdict?: "approved" | "changes_requested" | "reject";
    readonly received_at: string;
  };
};

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface TrackerAdapter {
  readonly id: TrackerId;
  readonly capabilities: TrackerCapabilities;

  // Connection
  ping(): Promise<TrackerHealth>;

  // Work item queries
  listWorkItems(filter: WorkItemFilter): AsyncIterable<WorkItem>;
  getWorkItem(ref: WorkItemRef): Promise<WorkItem>;
  listComments(ref: WorkItemRef): AsyncIterable<Comment>;
  listLinkedChangeSets(ref: WorkItemRef): AsyncIterable<ChangeSetRef>;

  // Hierarchy
  getParent(ref: WorkItemRef): Promise<WorkItemRef | null>;
  listChildren(ref: WorkItemRef): AsyncIterable<WorkItem>;
  linkChild(
    parent: WorkItemRef,
    child: WorkItemRef,
    opts?: LinkChildOptions,
  ): Promise<void>;
  unlinkChild(parent: WorkItemRef, child: WorkItemRef): Promise<void>;
  reorderChild(
    parent: WorkItemRef,
    child: WorkItemRef,
    after?: WorkItemRef,
    before?: WorkItemRef,
  ): Promise<void>;
  childrenSummary(ref: WorkItemRef): Promise<WorkItemChildrenSummary>;

  // Work item mutations
  createWorkItem(draft: WorkItemDraft): Promise<WorkItemRef>;
  updateWorkItem(ref: WorkItemRef, patch: WorkItemPatch): Promise<void>;
  addComment(
    ref: WorkItemRef,
    body: string,
    opts?: { artifact_refs?: readonly CommentArtifactRef[] },
  ): Promise<CommentRef>;
  addLabel(ref: WorkItemRef, label: string): Promise<void>;
  removeLabel(ref: WorkItemRef, label: string): Promise<void>;
  setAssignees(ref: WorkItemRef, assignees: readonly string[]): Promise<void>;
  closeWorkItem(
    ref: WorkItemRef,
    reason?: "completed" | "not_planned",
  ): Promise<void>;
  reopenWorkItem(ref: WorkItemRef): Promise<void>;

  // Change set operations — optional capability
  createChangeSet?(draft: ChangeSetDraft): Promise<ChangeSetRef>;
  getChangeSet?(ref: ChangeSetRef): Promise<ChangeSet>;
  listChangeSets?(filter: ChangeSetFilter): AsyncIterable<ChangeSet>;
  addChangeSetComment?(
    ref: ChangeSetRef,
    body: string,
    position?: LinePosition,
    opts?: { artifact_refs?: readonly CommentArtifactRef[] },
  ): Promise<CommentRef>;
  resolveChangeSetThread?(ref: CommentRef): Promise<void>;
  updateChangeSetBranch?(ref: ChangeSetRef): Promise<void>;
  mergeChangeSet?(ref: ChangeSetRef, mode: MergeMode): Promise<MergeResult>;
  closeChangeSet?(ref: ChangeSetRef): Promise<void>;

  // Task mirroring — optional capability
  mirrorTasks?(story: WorkItemRef, tasks: readonly TaskSnapshot[]): Promise<void>;
  readMirroredTasks?(story: WorkItemRef): AsyncIterable<TaskSnapshot>;

  // Events — optional capability
  subscribe?(filter: TrackerEventFilter): AsyncGenerator<TrackerEvent>;
}
