import { badRequest, errorResponse, jsonResponse, methodNotAllowed, parseJsonBody } from "./http-helpers";
import type { EventWriter, ProjectRegistry, SessionFilter, SessionKind, SessionRegistry, SessionStatus } from "@aloop/state-sqlite";

export type SessionsDeps = {
  readonly sessions: SessionRegistry;
  readonly projects: ProjectRegistry;
  readonly sessionsDir: string | (() => string);
  readonly events?: EventWriter;
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
    ? (statusParam.split(",").filter((s) => VALID_STATUSES.includes(s as typeof VALID_STATUSES[number])) as readonly SessionStatus[])
    : undefined;
  const kind = kindParam
    ? (kindParam.split(",").filter((k) => VALID_KINDS.includes(k as typeof VALID_KINDS[number])) as readonly SessionKind[])
    : undefined;
  const limit = limitParam ? Number(limitParam) : undefined;
  const cursor = cursorParam ? Number(cursorParam) : undefined;

  const filter: SessionFilter = {
    ...(projectId !== undefined && { projectId }),
    ...(status !== undefined && { status }),
    ...(kind !== undefined && { kind }),
    ...(parentParam !== undefined && { parentSessionId: parentParam }),
    ...(limit !== undefined && { limit }),
    ...(cursor !== undefined && { cursor }),
  };
  const items = deps.sessions.list(filter);
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

  const kindInput = body.data.kind;
  let kind: typeof VALID_KINDS[number] = "standalone";
  if (kindInput !== undefined) {
    if (VALID_KINDS.includes(kindInput as typeof VALID_KINDS[number])) {
      kind = kindInput as typeof VALID_KINDS[number];
    } else {
      return badRequest(`kind must be one of: ${VALID_KINDS.join(", ")}`);
    }
  }

  if (body.data.workflow === undefined || body.data.workflow === null || typeof body.data.workflow !== "string" || body.data.workflow.length === 0) {
    return badRequest("workflow is required");
  }
  const workflow = body.data.workflow;

  if (body.data.provider_chain === undefined || body.data.provider_chain === null || !Array.isArray(body.data.provider_chain) || body.data.provider_chain.length === 0) {
    return badRequest("provider_chain is required and must be a non-empty array");
  }
  const providerChain = body.data.provider_chain as string[];

  // kind=child requires parent_session_id
  let parentId: string | undefined = undefined;
  if (kind === "child") {
    parentId =
      typeof body.data.parent_session_id === "string" && body.data.parent_session_id.length > 0
        ? body.data.parent_session_id
        : undefined;
    if (!parentId) return badRequest("kind=child requires parent_session_id");
    const parent = deps.sessions.get(parentId);
    if (!parent) return badRequest(`parent session not found: ${parentId}`);
    if (parent.kind === "child") return badRequest("grandchild sessions are not allowed");
  }

  const maxIterations =
    typeof body.data.max_iterations === "number" && body.data.max_iterations > 0
      ? body.data.max_iterations
      : null;

  const issueRef =
    body.data.issue !== undefined && body.data.issue !== null
      ? (typeof body.data.issue === "number" && !Number.isNaN(body.data.issue) ? String(body.data.issue) : null)
      : null;

  const session = deps.sessions.create({
    ...(typeof body.data.id === "string" && body.data.id.length > 0 && { id: body.data.id }),
    projectId,
    kind,
    workflow,
    providerChain,
    issueRef,
    parentSessionId: kind === "child" ? (parentId as string) : null,
    maxIterations,
    notes: typeof body.data.notes === "string" ? (body.data.notes as string) : "",
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

  const terminal = ["completed", "failed", "archived"];
  if (terminal.includes(session.status)) {
    return errorResponse(409, "session_not_stoppable", `cannot delete session in status: ${session.status}`, { id, status: session.status });
  }

  const previousStatus = session.status;
  if (mode === "force") {
    deps.sessions.updateStatus(id, "stopped");
    if (deps.events) {
      void deps.events.append("session.forced", {
        session_id: id,
        previous_status: previousStatus,
      });
      void deps.events.append("session.event", {
        session_id: id,
        previous_status: previousStatus,
        status: "stopped",
        kind: session.kind,
        workflow: session.workflow,
        project_id: session.projectId,
      });
    }
    return jsonResponse(200, { id, status: "stopped" });
  } else {
    const updated = deps.sessions.updateStatus(id, "stopped");
    if (deps.events) {
      void deps.events.append("session.event", {
        session_id: id,
        previous_status: previousStatus,
        status: "stopped",
        kind: session.kind,
        workflow: session.workflow,
        project_id: session.projectId,
      });
    }
    return jsonResponse(200, sessionResponse(updated));
  }
}

// ── POST /v1/sessions/:id/resume ─────────────────────────────────────────────

export function resumeSessionHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  const terminal = ["failed"];
  if (terminal.includes(session.status)) {
    return errorResponse(409, "session_not_resumable", `cannot resume session in status: ${session.status}`, { id, status: session.status });
  }
  if (session.status !== "stopped" && session.status !== "interrupted" && session.status !== "paused") {
    return errorResponse(409, "session_not_resumable", `cannot resume session in status: ${session.status}`, { id, status: session.status });
  }
  const previousStatus = session.status;
  const updated = deps.sessions.updateStatus(id, "running", { startedAt: new Date().toISOString() });
  if (deps.events) {
    void deps.events.append("session.event", {
      session_id: id,
      previous_status: previousStatus,
      status: "running",
      kind: session.kind,
      workflow: session.workflow,
      project_id: session.projectId,
    });
  }
  return jsonResponse(200, sessionResponse(updated));
}

// ── POST /v1/sessions/:id/pause ───────────────────────────────────────────────

export function pauseSessionHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  if (session.status === "completed" || session.status === "failed") {
    return errorResponse(409, "session_not_pausable", `cannot pause session in status: ${session.status}`, { id, status: session.status });
  }
  if (session.status === "paused" || session.status === "stopped" || session.status === "interrupted") {
    return errorResponse(409, "session_not_pausable", `cannot pause session in status: ${session.status}`, { id, status: session.status });
  }
  if (session.status !== "running" && session.status !== "pending") {
    return errorResponse(409, "session_not_pausable", `cannot pause session in status: ${session.status}`, { id, status: session.status });
  }
  const previousStatus = session.status;
  const updated = deps.sessions.updateStatus(id, "paused");
  if (deps.events) {
    void deps.events.append("session.event", {
      session_id: id,
      previous_status: previousStatus,
      status: "paused",
      kind: session.kind,
      workflow: session.workflow,
      project_id: session.projectId,
    });
  }
  return jsonResponse(200, sessionResponse(updated));
}

// ── POST /v1/sessions/:id/unpause ────────────────────────────────────────────

export function unpauseSessionHandler(id: string, deps: SessionsDeps): Response {
  const session = deps.sessions.get(id);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  if (session.status !== "paused") {
    return errorResponse(409, "session_not_paused", `cannot unpause session in status: ${session.status}`, { id, status: session.status });
  }
  const previousStatus = session.status;
  const updated = deps.sessions.updateStatus(id, "running");
  if (deps.events) {
    void deps.events.append("session.event", {
      session_id: id,
      previous_status: previousStatus,
      status: "running",
      kind: session.kind,
      workflow: session.workflow,
      project_id: session.projectId,
    });
  }
  return jsonResponse(200, sessionResponse(updated));
}

// ── POST /v1/sessions/:id/steer ──────────────────────────────────────────────

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
  try {
    deps.sessions.dequeueItem(id, itemId);
  } catch {
    return errorResponse(404, "queue_item_not_found", `queue item not found: ${itemId}`, { id, item_id: itemId });
  }
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
