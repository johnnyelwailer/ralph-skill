import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  parseJsonBody,
} from "@aloop/daemon-routes";
import type { ProjectRegistry, WorkItemRegistry } from "@aloop/state-sqlite";
import type { TrackerRegistry, WorkItemKind } from "@aloop/tracker";
import {
  parseRefKey,
  toAdapterDraft,
  toAdapterPatch,
  validateCreateBody,
  validatePatchBody,
  VALID_STATES,
} from "./work-items-validation.ts";

export type WorkItemsDeps = {
  readonly trackerRegistry: TrackerRegistry;
  readonly workItemRegistry: WorkItemRegistry;
  readonly projectRegistry: ProjectRegistry;
};

const VALID_KINDS: readonly WorkItemKind[] = ["epic", "story", "task_mirror", "other"];

export function handleWorkItems(
  req: Request,
  deps: WorkItemsDeps,
  pathname: string,
): Response | Promise<Response | undefined> | undefined {
  if (pathname === "/v1/work-items") {
    if (req.method === "GET") return listWorkItems(req, deps);
    if (req.method === "POST") return createWorkItem(req, deps);
    return methodNotAllowed();
  }
  const ref = parseRefKey(pathname);
  if (ref.projectId && ref.trackerId && ref.refKey) {
    if (req.method === "GET") return getWorkItem(ref.projectId, ref.trackerId, ref.refKey, deps);
    if (req.method === "PATCH") return patchWorkItem(req, ref.projectId, ref.trackerId, ref.refKey, deps);
    return methodNotAllowed();
  }
  return undefined;
}

function listWorkItems(req: Request, deps: WorkItemsDeps): Response {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) return badRequest("project_id query parameter is required");
  const kindParam = url.searchParams.get("kind");
  if (kindParam && !VALID_KINDS.includes(kindParam as WorkItemKind)) {
    return badRequest(`kind must be one of: ${VALID_KINDS.join(", ")}`);
  }
  const stateParam = url.searchParams.get("state");
  if (stateParam && !VALID_STATES.includes(stateParam as "open" | "closed")) {
    return badRequest(`state must be one of: ${VALID_STATES.join(", ")}`);
  }
  const items = deps.workItemRegistry.list({
    project_id: projectId,
    ...(kindParam ? { kind: kindParam as WorkItemKind } : {}),
    ...(stateParam ? { state: stateParam as "open" | "closed" } : {}),
  });
  return jsonResponse(200, { _v: 1, items, next_cursor: null });
}

async function createWorkItem(req: Request, deps: WorkItemsDeps): Promise<Response> {
  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const validation = validateCreateBody(parsed.data);
  if (validation.error) return validation.error;
  const input = validation.input!;
  const project = deps.projectRegistry.get(input.project_id);
  if (!project) {
    return errorResponse(404, "project_not_found", `project not found: ${input.project_id}`, { project_id: input.project_id });
  }
  const adapter = await deps.trackerRegistry.getAdapter(input.project_id);
  const ref = await adapter.createWorkItem(toAdapterDraft(input));
  const projected = deps.workItemRegistry.upsert({
    project_id: input.project_id,
    tracker_id: adapter.id,
    ref_key: ref.key,
    ref_url: ref.url ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    status: input.status,
    parent_ref_key: input.parent_ref_key,
    parent_tracker: input.parent_tracker,
    labels: input.labels,
    metadata: input.metadata,
  });
  return jsonResponse(201, projected);
}

function getWorkItem(projectId: string, trackerId: string, refKey: string, deps: WorkItemsDeps): Response {
  const item = deps.workItemRegistry.get(projectId, trackerId, refKey);
  if (!item) {
    return errorResponse(404, "work_item_not_found", `work item not found: ${projectId}/${trackerId}/${refKey}`);
  }
  return jsonResponse(200, item);
}

async function patchWorkItem(
  req: Request,
  projectId: string,
  trackerId: string,
  refKey: string,
  deps: WorkItemsDeps,
): Promise<Response> {
  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const validation = validatePatchBody(parsed.data);
  if (validation.error) return validation.error;
  const patch = validation.patch!;
  const existing = deps.workItemRegistry.get(projectId, trackerId, refKey);
  if (!existing) {
    return errorResponse(404, "work_item_not_found", `work item not found: ${projectId}/${trackerId}/${refKey}`);
  }
  const adapter = await deps.trackerRegistry.getAdapter(projectId);
  await adapter.updateWorkItem({ adapter: adapter.id, key: refKey }, toAdapterPatch(patch));
  if (patch.state === "closed") {
    try {
      await adapter.closeWorkItem({ adapter: adapter.id, key: refKey });
    } catch (err) {
      return errorResponse(409, "close_failed", (err as Error).message);
    }
  }
  const nowIso = new Date().toISOString();
  const updated = deps.workItemRegistry.update(projectId, trackerId, refKey, {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
    ...(patch.state !== undefined ? { state: patch.state, closed_at: patch.state === "closed" ? nowIso : null } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
    ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
  });
  return jsonResponse(200, updated);
}
