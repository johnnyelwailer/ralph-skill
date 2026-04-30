import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { badRequest, errorResponse, jsonResponse, methodNotAllowed, notFoundResponse, parseJsonBody } from "./http-helpers.ts";
import type { AffectsCompletedWork, SteeringQueueEntry, EventEnvelope, SessionKind, SessionStatus } from "@aloop/core";

export type SessionsDeps = {
  readonly sessionsDir: () => string;
};

export async function handleSessions(
  req: Request,
  deps: SessionsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/sessions")) return undefined;

  if (pathname === "/v1/sessions") {
    if (req.method === "GET") return listSessions(req, deps);
    if (req.method === "POST") return createSession(req, deps);
    return methodNotAllowed();
  }

  const rest = pathname.slice("/v1/sessions/".length);
  const [id, action, ...restSegments] = rest.split("/");
  if (!id) return notFoundResponse(pathname);

  if (!action) {
    if (req.method === "GET") return getSession(id, deps);
    if (req.method === "DELETE") return deleteSession(id, req, deps);
    return methodNotAllowed();
  }

  if (action === "steer" && req.method === "POST") {
    return await steerSession(id, req, deps);
  }

  if (action === "steer") {
    return methodNotAllowed();
  }

  if (action === "queue" && req.method === "GET") {
    return listQueue(id, deps);
  }

  if (action === "queue" && req.method === "DELETE" && restSegments[0]) {
    return deleteQueueItem(id, restSegments[0], deps);
  }

  if (action === "queue") {
    return methodNotAllowed();
  }

  if (action === "log" && req.method === "GET") {
    return streamLog(id, req, deps);
  }

  if (action === "pause" && req.method === "POST") {
    return pauseSession(id, deps);
  }

  if (action === "unpause" && req.method === "POST") {
    return unpauseSession(id, deps);
  }

  if (action === "resume" && req.method === "POST") {
    return resumeSession(id, deps);
  }

  return undefined;
}

function listSessions(_req: Request, deps: SessionsDeps): Response {
  const sessionsDir = deps.sessionsDir();
  if (!existsSync(sessionsDir)) {
    return jsonResponse(200, { _v: 1, items: [], next_cursor: null });
  }

  let entries: string[];
  try {
    entries = readdirSync(sessionsDir);
  } catch {
    return jsonResponse(200, { _v: 1, items: [], next_cursor: null });
  }

  const items: SessionSummary[] = [];
  for (const id of entries) {
    const sessionDir = join(sessionsDir, id);
    const summary = loadSessionSummary(sessionDir);
    if (summary) items.push(summary);
  }

  return jsonResponse(200, { _v: 1, items, next_cursor: null });
}

function getSession(id: string, deps: SessionsDeps): Response {
  const sessionDir = join(deps.sessionsDir(), id);
  if (!existsSync(sessionDir)) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  const summary = loadSessionSummary(sessionDir);
  if (!summary) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }
  return jsonResponse(200, { _v: 1, ...summary });
}

async function createSession(req: Request, deps: SessionsDeps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const projectId = typeof body.data.project_id === "string" ? body.data.project_id : undefined;
  if (!projectId) return badRequest("project_id is required");

  const kind = typeof body.data.kind === "string" ? body.data.kind : "standalone";
  const validKinds = ["standalone", "orchestrator", "child"];
  if (!validKinds.includes(kind)) {
    return badRequest(`kind must be one of: ${validKinds.join(", ")}`);
  }

  const workflow = typeof body.data.workflow === "string" ? body.data.workflow : undefined;

  const id = `s_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const sessionDir = join(deps.sessionsDir(), id);
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(join(sessionDir, "queue"), { recursive: true });
  mkdirSync(join(sessionDir, "worktree"), { recursive: true });

  const session: SessionSummary = {
    id,
    project_id: projectId,
    kind: kind as SessionKind,
    status: "pending",
    workflow: workflow ?? null,
    created_at: new Date().toISOString(),
  };

  writeFileSync(join(sessionDir, "session.json"), JSON.stringify(session), "utf-8");

  return jsonResponse(201, { _v: 1, ...session });
}

function streamLog(sessionId: string, req: Request, deps: SessionsDeps): Response {
  const sessionDir = join(deps.sessionsDir(), sessionId);
  if (!existsSync(sessionDir)) {
    return errorResponse(404, "session_not_found", `session not found: ${sessionId}`, { session_id: sessionId });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? undefined;
  const format = url.searchParams.get("format") ?? "json";

  const eventsPath = join(sessionDir, "log.jsonl");

  if (format === "ndjson" || format === "jsonl") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (!existsSync(eventsPath)) {
          controller.close();
          return;
        }

        const fileStream = createReadStream(eventsPath, { encoding: "utf-8" });
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        rl.on("line", (line) => {
          if (line.length === 0) return;
          try {
            const envelope = JSON.parse(line) as EventEnvelope;
            if (since !== undefined && envelope.id <= since) return;
            controller.enqueue(encoder.encode(line + "\n"));
          } catch {
            // skip malformed lines
          }
        });

        rl.on("close", () => controller.close());
        rl.on("error", () => controller.close());
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-cache",
        "connection": "keep-alive",
      },
    });
  }

  // Default: SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!existsSync(eventsPath)) {
        controller.close();
        return;
      }

      const fileStream = createReadStream(eventsPath, { encoding: "utf-8" });
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

      rl.on("line", (line) => {
        if (line.length === 0) return;
        try {
          const envelope = JSON.parse(line) as EventEnvelope;
          if (since !== undefined && envelope.id <= since) return;
          const sseLine = `data: ${line}\n\n`;
          controller.enqueue(encoder.encode(sseLine));
        } catch {
          // skip malformed lines
        }
      });

      rl.on("close", () => controller.close());
      rl.on("error", () => controller.close());
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

async function steerSession(id: string, req: Request, deps: SessionsDeps): Promise<Response> {
  const sessionDir = join(deps.sessionsDir(), id);
  const queueDir = join(sessionDir, "queue");

  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const instruction = typeof body.data.instruction === "string" ? body.data.instruction : undefined;
  if (!instruction || instruction.trim().length === 0) {
    return badRequest("instruction is required and must be a non-empty string");
  }

  const rawAffects = typeof body.data.affects_completed_work === "string"
    ? body.data.affects_completed_work
    : undefined;
  const affects: AffectsCompletedWork =
    rawAffects === "yes" || rawAffects === "no" ? rawAffects : "unknown";

  mkdirSync(queueDir, { recursive: true });

  const entry: SteeringQueueEntry = {
    id: crypto.randomUUID(),
    instruction: instruction.trim(),
    affects_completed_work: affects,
    created_at: new Date().toISOString(),
  };

  const filename = `steering-${Date.now()}-${entry.id.slice(0, 8)}.json`;
  writeFileSync(join(queueDir, filename), JSON.stringify(entry), "utf-8");

  return jsonResponse(200, {
    _v: 1,
    id: entry.id,
    filename,
    position: 0,
    cycle_position_reset: true,
  });
}

function listQueue(id: string, deps: SessionsDeps): Response {
  const queueDir = join(deps.sessionsDir(), id, "queue");
  if (!existsSync(queueDir)) {
    return jsonResponse(200, { _v: 1, items: [] });
  }

  let files: string[];
  try {
    files = readdirSync(queueDir);
  } catch {
    return jsonResponse(200, { _v: 1, items: [] });
  }

  const items: SteeringQueueEntry[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = readFileSync(join(queueDir, file), "utf-8");
      const entry = JSON.parse(content) as SteeringQueueEntry;
      if (entry && typeof entry.id === "string" && typeof entry.instruction === "string") {
        items.push(entry);
      }
    } catch {
      continue;
    }
  }

  return jsonResponse(200, { _v: 1, items });
}

function deleteQueueItem(sessionId: string, itemId: string, deps: SessionsDeps): Response {
  const queueDir = join(deps.sessionsDir(), sessionId, "queue");
  if (!existsSync(queueDir)) {
    return notFoundResponse(`/v1/sessions/${sessionId}/queue/${itemId}`);
  }

  let files: string[];
  try {
    files = readdirSync(queueDir);
  } catch {
    return notFoundResponse(`/v1/sessions/${sessionId}/queue/${itemId}`);
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = readFileSync(join(queueDir, file), "utf-8");
      const entry = JSON.parse(content) as SteeringQueueEntry;
      if (entry.id === itemId) {
        unlinkSync(join(queueDir, file));
        return new Response(null, { status: 204 });
      }
    } catch {
      continue;
    }
  }

  return notFoundResponse(`/v1/sessions/${sessionId}/queue/${itemId}`);
}

// ─── Session lifecycle ─────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["completed", "failed", "archived"]);
const PAUSABLE_STATUSES = new Set(["running", "pending"]);
const RESUMABLE_STATUSES = new Set(["paused", "interrupted", "stopped"]);

function loadSessionSummary(sessionDir: string): SessionSummary | null {
  const path = join(sessionDir, "session.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SessionSummary;
  } catch {
    return null;
  }
}

function saveSessionSummary(sessionDir: string, s: SessionSummary): void {
  writeFileSync(join(sessionDir, "session.json"), JSON.stringify(s), "utf-8");
}

/**
 * DELETE /v1/sessions/:id
 * Stops a session.  Mode is either "graceful" (default, finish current turn)
 * or "force" (immediate kill).  For orchestrators, cascades to all children.
 */
async function deleteSession(
  id: string,
  req: Request,
  deps: SessionsDeps,
): Promise<Response> {
  const sessionDir = join(deps.sessionsDir(), id);
  const session = loadSessionSummary(sessionDir);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }

  if (TERMINAL_STATUSES.has(session.status)) {
    return errorResponse(409, "session_not_stoppable", `session ${id} is already ${session.status}`, {
      id,
      status: session.status,
    });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "graceful";

  const nextStatus: SessionStatus =
    mode === "force" ? "stopped" : session.status === "pending" ? "stopped" : "stopped";

  const updated: SessionSummary = {
    ...session,
    status: nextStatus,
  };
  saveSessionSummary(sessionDir, updated);

  return jsonResponse(200, { _v: 1, id, status: nextStatus });
}

/**
 * POST /v1/sessions/:id/pause
 * Pauses a session at the next cycle boundary.  Does NOT kill an in-flight turn.
 */
function pauseSession(id: string, deps: SessionsDeps): Response {
  const sessionDir = join(deps.sessionsDir(), id);
  const session = loadSessionSummary(sessionDir);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }

  if (!PAUSABLE_STATUSES.has(session.status)) {
    return errorResponse(409, "session_not_pausable", `session ${id} cannot be paused from status ${session.status}`, {
      id,
      status: session.status,
    });
  }

  const updated: SessionSummary = { ...session, status: "paused" };
  saveSessionSummary(sessionDir, updated);
  return jsonResponse(200, { _v: 1, id, status: "paused" });
}

/**
 * POST /v1/sessions/:id/unpause
 * Resumes a paused session.
 */
function unpauseSession(id: string, deps: SessionsDeps): Response {
  const sessionDir = join(deps.sessionsDir(), id);
  const session = loadSessionSummary(sessionDir);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }

  if (session.status !== "paused") {
    return errorResponse(409, "session_not_paused", `session ${id} is not paused (status: ${session.status})`, {
      id,
      status: session.status,
    });
  }

  const updated: SessionSummary = { ...session, status: "running" };
  saveSessionSummary(sessionDir, updated);
  return jsonResponse(200, { _v: 1, id, status: "running" });
}

/**
 * POST /v1/sessions/:id/resume
 * Resumes a session from interrupted, stopped, or paused status.
 */
function resumeSession(id: string, deps: SessionsDeps): Response {
  const sessionDir = join(deps.sessionsDir(), id);
  const session = loadSessionSummary(sessionDir);
  if (!session) {
    return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
  }

  if (!RESUMABLE_STATUSES.has(session.status)) {
    return errorResponse(409, "session_not_resumable", `session ${id} cannot be resumed from status ${session.status}`, {
      id,
      status: session.status,
    });
  }

  const updated: SessionSummary = { ...session, status: "running" };
  saveSessionSummary(sessionDir, updated);
  return jsonResponse(200, { _v: 1, id, status: "running" });
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type SessionSummary = {
  readonly id: string;
  readonly project_id: string;
  readonly kind: SessionKind;
  readonly status: SessionStatus;
  readonly workflow: string | null;
  readonly created_at: string;
};
