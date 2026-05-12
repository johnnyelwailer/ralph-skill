import { badRequest, errorResponse, jsonResponse, methodNotAllowed, parseJsonBody } from "./http-helpers";
import type { SessionRegistry } from "@aloop/state-sqlite";
import type { ProjectRegistry } from "@aloop/state-projects";

export type SessionsDeps = {
  readonly sessions: SessionRegistry;
  readonly projects: ProjectRegistry;
};

const VALID_KINDS = ["standalone", "orchestrator", "child"] as const;
const VALID_STATUSES = [
  "pending", "running", "interrupted", "stopped", "paused", "completed", "failed",
] as const;
const VALID_AFFECTS = ["yes", "no", "unknown"] as const;

// ── GET /v1/sessions ──────────────────────────────────────────────────────────

export function listSessionsHandler(req: Request, deps: SessionsDeps): Response {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id") ?? undefined;
  const statusParam = url.searchParams.get("status") ?? undefined;
  const kindParam = url.searchParams.get("kind") ?? undefined;
  const parentParam = url.searchParams.get("parent") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const cursorParam = url.searchParams.get("cursor");

  const status = statusParam
    ? (statusParam.split(",").filter((s) => VALID_STATUSES.includes(s as typeof VALID_STATUSES[number])) as readonly string[])
    : undefined;
  const kind = kindParam
    ? (kindParam.split(",").filter((k) => VALID_KINDS.includes(k as typeof VALID_KINDS[number])) as readonly string[])
    : undefined;
  const limit = limitParam ? Number(limitParam) : undefined;
  const cursor = cursorParam ? Number(cursorParam) : undefined;

  const items = deps.sessions.list({ projectId, status, kind, parentSessionId: parentParam ?? undefined, limit, cursor });
  return jsonResponse(200, {
    _v: 1,
    items: items.map(sessionResponse),
    next_cursor: null,
  });
}

// ── GET /v1/sessions/:id ─────────────────────────────────────────────────────

export function getSessionHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  return jsonResponse(200, sessionResponse(session));
}

// ── POST /v1/sessions ────────────────────────────────────────────────────────

export async function createSessionHandler(req: Request, deps: SessionsDeps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const projectId =
    typeof body.data.project_id === "string" && body.data.project_id.length > 0
      ? body.data.project_id
      : undefined;
  if (!projectId) return badRequest("project_id is required");

  // Verify project exists
  const project = deps.projects.get(projectId);
  if (!project) {
    return errorResponse(404, "project_not_found", `project not found: ${projectId}`, { project_id: projectId });
  }

  const kind = VALID_KINDS.includes(body.data.kind as typeof VALID_KINDS[number])
    ? (body.data.kind as typeof VALID_KINDS[number])
    : undefined;
  if (!kind) return badRequest(`kind must be one of: ${VALID_KINDS.join(", ")}`);

  const workflow =
    typeof body.data.workflow === "string" && body.data.workflow.length > 0
      ? body.data.workflow
      : undefined;
  if (!workflow) return badRequest("workflow is required");

  const providerChain =
    Array.isArray(body.data.provider_chain)
      ? (body.data.provider_chain as string[])
      : undefined;
  if (!providerChain) return badRequest("provider_chain must be an array of provider ids");

  // kind=child requires parent_session_id
  if (kind === "child") {
    const parentId =
      typeof body.data.parent_session_id === "string" && body.data.parent_session_id.length > 0
        ? body.data.parent_session_id
        : undefined;
    if (!parentId) return badRequest("kind=child requires parent_session_id");
    const parent = deps.sessions.get(parentId);
    if (!parent) return errorResponse(404, "parent_session_not_found", `parent session not found: ${parentId}`, { parent_session_id: parentId });
    if (parent.kind === "child") return badRequest("grandchild sessions are not allowed");
  }

  const maxIterations =
    typeof body.data.max_iterations === "number" && body.data.max_iterations > 0
      ? body.data.max_iterations
      : null;

  const session = deps.sessions.create({
    id: typeof body.data.id === "string" && body.data.id.length > 0 ? body.data.id : undefined,
    projectId,
    kind,
    workflow,
    providerChain,
    issueRef: body.data.issue ?? null,
    parentSessionId: kind === "child" ? body.data.parent_session_id : null,
    maxIterations,
    notes: typeof body.data.notes === "string" ? body.data.notes : "",
  });

  return jsonResponse(201, sessionResponse(session));
}

// ── DELETE /v1/sessions/:id ───────────────────────────────────────────────────

export function deleteSessionHandler(id: string, req: Request, deps: SessionsDeps): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "graceful";

  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }

  const allowedModes = ["graceful", "force"];
  if (!allowedModes.includes(mode)) {
    return badRequest(`mode must be one of: ${allowedModes.join(", ")}`);
  }

  if (session.status === "archived") {
    return errorResponse(409, "session_not_deletable", "cannot delete session in archived status", { id, status: session.status });
  }

  if (mode === "force") {
    deps.sessions.delete(id);
    return jsonResponse(200, { id, status: "deleted" });
  } else {
    const updated = deps.sessions.updateStatus(id, "stopped");
    return jsonResponse(200, sessionResponse(updated));
  }
}

// ── POST /v1/sessions/:id/resume ─────────────────────────────────────────────

export function resumeSessionHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  const validStatuses = ["interrupted", "stopped", "paused"];
  if (!validStatuses.includes(session.status)) {
    return badRequest(`cannot resume session in status: ${session.status}. Valid statuses: ${validStatuses.join(", ")}`);
  }
  const updated = deps.sessions.updateStatus(id, "running", { startedAt: new Date().toISOString() });
  return jsonResponse(200, sessionResponse(updated));
}

// ── POST /v1/sessions/:id/pause ───────────────────────────────────────────────

export function pauseSessionHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  if (session.status !== "running") {
    return badRequest(`cannot pause session in status: ${session.status}. Must be running.`);
  }
  const updated = deps.sessions.updateStatus(id, "paused");
  return jsonResponse(200, sessionResponse(updated));
}

// ── POST /v1/sessions/:id/unpause ────────────────────────────────────────────

export function unpauseSessionHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  if (session.status !== "paused") {
    return badRequest(`cannot unpause session in status: ${session.status}. Must be paused.`);
  }
  const updated = deps.sessions.updateStatus(id, "running");
  return jsonResponse(200, sessionResponse(updated));
}

// ── POST /v1/sessions/:id/steer ──────────────────────────────────────────────

// TODO(workflow-plan): Steering should queue a compiled handler run, normally
// `on.steer`, with the instruction in the handler payload. This endpoint still
// writes the old instruction-style queue item until the queue schema migrates.
export async function steerSessionHandler(id: string, req: Request, deps: SessionsDeps): Promise<Response> {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }

  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const instruction =
    typeof body.data.instruction === "string" && body.data.instruction.trim().length > 0
      ? body.data.instruction.trim()
      : undefined;
  if (!instruction) return badRequest("instruction is required");

  const affectsCompletedWork = VALID_AFFECTS.includes(body.data.affects_completed_work as typeof VALID_AFFECTS[number])
    ? (body.data.affects_completed_work as typeof VALID_AFFECTS[number])
    : "no";

  const queueCount = deps.sessions.listQueue(id).length;
  const item = deps.sessions.enqueue({
    sessionId: id,
    filename: `steer-${Date.now()}.md`,
    instruction,
    affectsCompletedWork,
    position: queueCount,
  });

  return jsonResponse(201, {
    _v: 1,
    queue_item_id: item.id,
    filename: item.filename,
    position: item.position,
    session_id: item.sessionId,
  });
}

// ── GET /v1/sessions/:id/queue ────────────────────────────────────────────────

export function listSessionQueueHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  const items = deps.sessions.listQueue(id);
  return jsonResponse(200, {
    _v: 1,
    items: items.map((item) => ({
      id: item.id,
      session_id: item.sessionId,
      filename: item.filename,
      instruction: item.instruction,
      affects_completed_work: item.affectsCompletedWork,
      position: item.position,
      created_at: item.createdAt,
    })),
  });
}

// ── DELETE /v1/sessions/:id/queue/:itemId ────────────────────────────────────

export function deleteSessionQueueItemHandler(
  id: string,
  itemId: string,
  deps: SessionsDeps,
): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  deps.sessions.dequeueItem(id, itemId);
  return new Response(null, { status: 204 });
}

// ── Response shape ───────────────────────────────────────────────────────────

function sessionResponse(s: {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  workflow: string;
  providerChain: readonly string[];
  issueRef: string | null;
  parentSessionId: string | null;
  maxIterations: number | null;
  notes: string;
  currentIteration: number;
  currentPhase: string | null;
  currentProviderId: string | null;
  lastEventId: string | null;
  createdAt: string;
  updatedAt: string;
  stoppedAt: string | null;
  startedAt: string | null;
}): Record<string, unknown> {
  return {
    _v: 1,
    id: s.id,
    project_id: s.projectId,
    kind: s.kind,
    status: s.status,
    workflow: s.workflow,
    provider_chain: s.providerChain,
    issue_ref: s.issueRef,
    parent_session_id: s.parentSessionId,
    max_iterations: s.maxIterations,
    notes: s.notes,
    current_iteration: s.currentIteration,
    current_phase: s.currentPhase,
    current_provider_id: s.currentProviderId,
    last_event_id: s.lastEventId,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    stopped_at: s.stoppedAt,
    started_at: s.startedAt,
  };
}
