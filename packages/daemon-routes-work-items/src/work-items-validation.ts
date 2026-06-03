import { badRequest } from "@aloop/daemon-routes";
import type { WorkItemDraft, WorkItemKind, WorkItemPatch } from "@aloop/tracker";

const VALID_KINDS: readonly WorkItemKind[] = ["epic", "story", "task_mirror", "other"];
export const VALID_STATES: readonly ("open" | "closed")[] = ["open", "closed"];

type CreateBody = {
  project_id?: unknown;
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  status?: unknown;
  parent_ref_key?: unknown;
  parent_tracker?: unknown;
  labels?: unknown;
  metadata?: unknown;
};

type PatchBody = {
  title?: unknown;
  body?: unknown;
  state?: unknown;
  status?: unknown;
  labels?: unknown;
  metadata?: unknown;
};

export type CreateInput = {
  project_id: string;
  kind: WorkItemKind;
  title: string;
  body: string;
  status: string | null;
  parent_ref_key: string | null;
  parent_tracker: string | null;
  labels: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type PatchInput = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  status?: string | null;
  labels?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export function validateCreateBody(data: unknown): { input?: CreateInput; error?: Response } {
  if (data === null || typeof data !== "object") {
    return { error: badRequest("request body must be a non-null object") };
  }
  const obj = data as CreateBody;
  if (typeof obj.project_id !== "string" || !obj.project_id) {
    return { error: badRequest("project_id is required and must be a non-empty string") };
  }
  if (typeof obj.kind !== "string" || !VALID_KINDS.includes(obj.kind as WorkItemKind)) {
    return { error: badRequest(`kind must be one of: ${VALID_KINDS.join(", ")}`) };
  }
  if (typeof obj.title !== "string" || !obj.title.trim()) {
    return { error: badRequest("title is required and must be a non-empty string") };
  }
  if (obj.body !== undefined && typeof obj.body !== "string") {
    return { error: badRequest("body must be a string") };
  }
  if (obj.labels !== undefined && !Array.isArray(obj.labels)) {
    return { error: badRequest("labels must be an array of strings") };
  }
  return {
    input: {
      project_id: obj.project_id,
      kind: obj.kind as WorkItemKind,
      title: obj.title,
      body: (obj.body as string) ?? "",
      status: (obj.status as string) ?? null,
      parent_ref_key: (obj.parent_ref_key as string) ?? null,
      parent_tracker: (obj.parent_tracker as string) ?? null,
      labels: (obj.labels as string[]) ?? [],
      metadata: (obj.metadata as Record<string, unknown>) ?? {},
    },
  };
}

export function validatePatchBody(data: unknown): { patch?: PatchInput; error?: Response } {
  if (data === null || typeof data !== "object") {
    return { error: badRequest("request body must be a non-null object") };
  }
  const obj = data as PatchBody;
  if (obj.title !== undefined && (typeof obj.title !== "string" || !obj.title.trim())) {
    return { error: badRequest("title must be a non-empty string") };
  }
  if (obj.body !== undefined && typeof obj.body !== "string") {
    return { error: badRequest("body must be a string") };
  }
  if (obj.state !== undefined && (typeof obj.state !== "string" || !VALID_STATES.includes(obj.state as "open" | "closed"))) {
    return { error: badRequest(`state must be one of: ${VALID_STATES.join(", ")}`) };
  }
  if (obj.labels !== undefined && !Array.isArray(obj.labels)) {
    return { error: badRequest("labels must be an array of strings") };
  }
  const patch: PatchInput = {};
  if (obj.title !== undefined) patch.title = obj.title;
  if (obj.body !== undefined) patch.body = obj.body;
  if (obj.state !== undefined) patch.state = obj.state as "open" | "closed";
  if (obj.status !== undefined) patch.status = obj.status as string;
  if (obj.labels !== undefined) patch.labels = obj.labels as string[];
  if (obj.metadata !== undefined) patch.metadata = obj.metadata as Record<string, unknown>;
  return { patch };
}

export function toAdapterDraft(input: CreateInput): WorkItemDraft {
  return {
    kind: input.kind,
    title: input.title,
    body: input.body,
    labels: input.labels,
    ...(input.parent_ref_key
      ? { parent: { adapter: input.parent_tracker ?? "builtin", key: input.parent_ref_key } }
      : {}),
    ...(Object.keys(input.metadata).length > 0 ? { metadata: { ...input.metadata } } : {}),
  };
}

export function toAdapterPatch(patch: PatchInput): WorkItemPatch {
  return {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
    ...(patch.state !== undefined ? { state: patch.state } : {}),
    ...(patch.status !== undefined && patch.status !== null ? { status: patch.status } : {}),
    ...(patch.labels !== undefined ? { labels: [...patch.labels] } : {}),
  };
}

export function parseRefKey(pathname: string): { projectId: string | null; trackerId: string | null; refKey: string | null } {
  const m = /^\/v1\/work-items\/([^/]+)\/([^/]+)\/(.+)$/.exec(pathname);
  if (!m) return { projectId: null, trackerId: null, refKey: null };
  return { projectId: m[1] ?? null, trackerId: m[2] ?? null, refKey: m[3] ?? null };
}
