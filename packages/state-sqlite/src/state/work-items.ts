import type { Database } from "bun:sqlite";
import {
  type CreateWorkItemInput,
  type UpdateWorkItemInput,
  type WorkItem,
  type WorkItemFilter,
  WorkItemNotFoundError,
} from "./work-items-types.ts";

export {
  type WorkItem,
  type WorkItemFilter,
  type CreateWorkItemInput,
  type UpdateWorkItemInput,
  WorkItemNotFoundError,
};

type WorkItemRow = {
  id: string;
  project_id: string;
  tracker_id: string;
  ref_key: string;
  ref_url: string | null;
  kind: string;
  title: string;
  body: string;
  state: string;
  status: string | null;
  parent_ref_key: string | null;
  parent_tracker: string | null;
  labels: string;
  metadata: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

const COLS = `id, project_id, tracker_id, ref_key, ref_url, kind, title, body, state,
  status, parent_ref_key, parent_tracker, labels, metadata, created_at, updated_at, closed_at`;

export class WorkItemRegistry {
  constructor(private readonly db: Database) {}

  upsert(input: CreateWorkItemInput): WorkItem {
    const now = input.now ?? new Date().toISOString();
    const id = `wi_${input.project_id}_${input.tracker_id}_${input.ref_key}`.replace(/[^a-zA-Z0-9_]/g, "_");
    this.db.run(
      `INSERT INTO work_items
        (id, project_id, tracker_id, ref_key, ref_url, kind, title, body, state, status,
         parent_ref_key, parent_tracker, labels, metadata, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(project_id, tracker_id, ref_key) DO UPDATE SET
         title = excluded.title,
         body = excluded.body,
         status = excluded.status,
         parent_ref_key = excluded.parent_ref_key,
         parent_tracker = excluded.parent_tracker,
         labels = excluded.labels,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
      [
        id,
        input.project_id,
        input.tracker_id,
        input.ref_key,
        input.ref_url ?? null,
        input.kind,
        input.title,
        input.body ?? "",
        input.status ?? null,
        input.parent_ref_key ?? null,
        input.parent_tracker ?? null,
        JSON.stringify(input.labels ?? []),
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ],
    );
    const row = this.db
      .query<WorkItemRow, [string, string, string]>(`SELECT ${COLS} FROM work_items WHERE project_id = ? AND tracker_id = ? AND ref_key = ?`)
      .get(input.project_id, input.tracker_id, input.ref_key);
    if (!row) throw new WorkItemNotFoundError(input.project_id, input.tracker_id, input.ref_key);
    return rowToWorkItem(row);
  }

  get(project_id: string, tracker_id: string, ref_key: string): WorkItem | undefined {
    const row = this.db
      .query<WorkItemRow, [string, string, string]>(`SELECT ${COLS} FROM work_items WHERE project_id = ? AND tracker_id = ? AND ref_key = ?`)
      .get(project_id, tracker_id, ref_key);
    return row ? rowToWorkItem(row) : undefined;
  }

  list(filter: WorkItemFilter = {}): WorkItem[] {
    const conditions: string[] = [];
    const args: (string | number)[] = [];
    if (filter.project_id) { conditions.push("project_id = ?"); args.push(filter.project_id); }
    if (filter.kind) { conditions.push("kind = ?"); args.push(filter.kind); }
    if (filter.state) { conditions.push("state = ?"); args.push(filter.state); }
    if (filter.parent_ref_key) { conditions.push("parent_ref_key = ?"); args.push(filter.parent_ref_key); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return this.db
      .query<WorkItemRow, (string | number)[]>(`SELECT ${COLS} FROM work_items ${where} ORDER BY created_at ASC`)
      .all(...args)
      .map(rowToWorkItem);
  }

  update(project_id: string, tracker_id: string, ref_key: string, patch: UpdateWorkItemInput): WorkItem {
    const now = patch.now ?? new Date().toISOString();
    const fields: Array<[string, string | number | null]> = [];
    if (patch.title !== undefined) fields.push(["title", patch.title]);
    if (patch.body !== undefined) fields.push(["body", patch.body]);
    if (patch.state !== undefined) fields.push(["state", patch.state]);
    if (patch.status !== undefined) fields.push(["status", patch.status]);
    if (patch.labels !== undefined) fields.push(["labels", JSON.stringify([...patch.labels])]);
    if (patch.metadata !== undefined) fields.push(["metadata", JSON.stringify(patch.metadata)]);
    if (patch.closed_at !== undefined) fields.push(["closed_at", patch.closed_at]);
    const sets = ["updated_at = ?", ...fields.map(([k]) => `${k} = ?`)].join(", ");
    const args: (string | number | null)[] = [now, ...fields.map(([, v]) => v), project_id, tracker_id, ref_key];
    const changes = this.db.run(
      `UPDATE work_items SET ${sets} WHERE project_id = ? AND tracker_id = ? AND ref_key = ?`,
      args,
    );
    if (changes.changes === 0) throw new WorkItemNotFoundError(project_id, tracker_id, ref_key);
    const updated = this.get(project_id, tracker_id, ref_key);
    if (!updated) throw new WorkItemNotFoundError(project_id, tracker_id, ref_key);
    return updated;
  }
}

function rowToWorkItem(row: WorkItemRow): WorkItem {
  return {
    _v: 1,
    id: row.id,
    project_id: row.project_id,
    tracker_id: row.tracker_id,
    ref_key: row.ref_key,
    ref_url: row.ref_url,
    kind: row.kind as WorkItem["kind"],
    title: row.title,
    body: row.body,
    state: row.state as "open" | "closed",
    status: row.status,
    parent_ref_key: row.parent_ref_key,
    parent_tracker: row.parent_tracker,
    labels: JSON.parse(row.labels) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
  };
}
