import type { WorkItemKind } from "@aloop/tracker";

export type WorkItem = {
  readonly _v: 1;
  readonly id: string;
  readonly project_id: string;
  readonly tracker_id: string;
  readonly ref_key: string;
  readonly ref_url: string | null;
  readonly kind: WorkItemKind;
  readonly title: string;
  readonly body: string;
  readonly state: "open" | "closed";
  readonly status: string | null;
  readonly parent_ref_key: string | null;
  readonly parent_tracker: string | null;
  readonly labels: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
};

export type WorkItemFilter = {
  readonly project_id?: string;
  readonly kind?: WorkItemKind;
  readonly state?: "open" | "closed";
  readonly parent_ref_key?: string;
};

export type CreateWorkItemInput = {
  readonly project_id: string;
  readonly tracker_id: string;
  readonly ref_key: string;
  readonly ref_url?: string | null;
  readonly kind: WorkItemKind;
  readonly title: string;
  readonly body?: string;
  readonly status?: string | null;
  readonly parent_ref_key?: string | null;
  readonly parent_tracker?: string | null;
  readonly labels?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly now?: string;
};

export type UpdateWorkItemInput = {
  readonly title?: string;
  readonly body?: string;
  readonly state?: "open" | "closed";
  readonly status?: string | null;
  readonly labels?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly closed_at?: string | null;
  readonly now?: string;
};

export class WorkItemNotFoundError extends Error {
  readonly code = "work_item_not_found" as const;
  constructor(readonly project_id: string, readonly tracker_id: string, readonly ref_key: string) {
    super(`work item not found: ${project_id}/${tracker_id}/${ref_key}`);
    this.name = "WorkItemNotFoundError";
  }
}
