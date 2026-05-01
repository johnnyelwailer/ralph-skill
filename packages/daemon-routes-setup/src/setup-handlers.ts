import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import {
  SetupRunNotFoundError,
  SetupRunNotActiveError,
  type CreateSetupRunInput,
  type SetupAnswerInput,
  type SetupCommentInput,
  type SetupRun,
  type SetupChapter,
  type SetupQuestion,
} from "./setup-types.ts";
import { SetupStore } from "./setup-store.ts";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  parseJsonBody,
} from "@aloop/daemon-routes";

export type SetupDeps = {
  readonly store: SetupStore;
  readonly eventsDir: string;
};

const VALID_PHASES: readonly string[] = [
  "discovery",
  "interview",
  "ambiguity",
  "review",
  "generation",
  "verification",
  "handoff",
  "completed",
];

/**
 * POST /v1/setup/runs — start a new setup run.
 * Body: { abs_path, mode?, non_interactive?, flags? }
 */
export async function createSetupRun(req: Request, deps: SetupDeps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const absPath = typeof body.data.abs_path === "string" ? body.data.abs_path : undefined;
  if (!absPath) return badRequest("abs_path is required");

  const mode = typeof body.data.mode === "string" ? body.data.mode : undefined;
  if (mode !== undefined && mode !== "standalone" && mode !== "orchestrator") {
    return badRequest("mode must be 'standalone' or 'orchestrator'");
  }

  const nonInteractive = body.data.non_interactive === true;
  const flags =
    typeof body.data.flags === "object" && body.data.flags !== null
      ? (body.data.flags as Record<string, string>)
      : {};

  const input: CreateSetupRunInput = { absPath, mode, nonInteractive, flags };
  const run = deps.store.create(input);

  return jsonResponse(201, buildRunResponse(run, deps));
}

/**
 * GET /v1/setup/runs — list all setup runs (active, completed, failed).
 */
export function listSetupRuns(_req: Request, deps: SetupDeps): Response {
  const runs = deps.store.list();
  return jsonResponse(200, {
    _v: 1,
    items: runs.map((r) => buildRunResponse(r, deps)),
  });
}

/**
 * GET /v1/setup/runs/:id — get a single setup run.
 */
export function getSetupRun(id: string, deps: SetupDeps): Response {
  try {
    const run = deps.store.get(id);
    return jsonResponse(200, buildRunResponse(run, deps));
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }
}

/**
 * GET /v1/setup/runs/:id/chapters — chapter/document breakdown.
 */
export function getSetupChapters(id: string, deps: SetupDeps): Response {
  try {
    const run = deps.store.get(id);
    return jsonResponse(200, {
      _v: 1,
      chapters: run.chapters,
      total: run.chapters.length,
    });
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }
}

/**
 * POST /v1/setup/runs/:id/answer — submit an interview answer.
 * Body: { question_id, value }
 */
export async function answerSetupRun(id: string, req: Request, deps: SetupDeps): Promise<Response> {
  try {
    deps.store.get(id); // validate existence
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }

  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const questionId =
    typeof body.data.question_id === "string" ? body.data.question_id : undefined;
  if (!questionId) return badRequest("question_id is required");

  const value = typeof body.data.value === "string" ? body.data.value : undefined;
  if (!value) return badRequest("value is required");

  const run = deps.store.answerQuestion(id, questionId, value);
  return jsonResponse(200, buildRunResponse(run, deps));
}

/**
 * POST /v1/setup/runs/:id/comments — add feedback/steering to a chapter or document.
 * Body: { target_type, target_id, body, artifact_refs? }
 */
export async function commentSetupRun(
  id: string,
  req: Request,
  deps: SetupDeps,
): Promise<Response> {
  try {
    deps.store.get(id);
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }

  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const targetType =
    typeof body.data.target_type === "string" ? body.data.target_type : undefined;
  if (!targetType || !["chapter", "document", "question"].includes(targetType)) {
    return badRequest("target_type must be 'chapter', 'document', or 'question'");
  }

  const targetId = typeof body.data.target_id === "string" ? body.data.target_id : undefined;
  if (!targetId) return badRequest("target_id is required");

  const commentBody = typeof body.data.body === "string" ? body.data.body : undefined;
  if (!commentBody) return badRequest("body is required");

  const artifactRefs = Array.isArray(body.data.artifact_refs)
    ? (body.data.artifact_refs as string[])
    : undefined;

  const input: SetupCommentInput = { target_type: targetType, target_id: targetId, body: commentBody, artifact_refs: artifactRefs };
  const run = deps.store.addComment(id, input);
  return jsonResponse(200, buildRunResponse(run, deps));
}

/**
 * POST /v1/setup/runs/:id/approve-scaffold — user approves generated files.
 * Rejected when verdict is not 'resolved'.
 */
export async function approveScaffold(id: string, deps: SetupDeps): Promise<Response> {
  try {
    const run = deps.store.get(id);
    if (run.verdict !== "resolved") {
      return errorResponse(
        409,
        "setup_not_ready",
        `scaffold cannot be approved while verdict is '${run.verdict}'; blocking ambiguities must be resolved first`,
        { verdict: run.verdict },
      );
    }
    // In a full implementation, this would trigger Phase 5 generation + Phase 6 verification.
    // For now, mark the run as transitioning to generation phase.
    const updated = deps.store.updatePhase(id, "generation");
    return jsonResponse(200, buildRunResponse(updated, deps));
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }
}

/**
 * POST /v1/setup/runs/:id/resume — continue an interrupted setup run.
 */
export async function resumeSetupRun(id: string, deps: SetupDeps): Promise<Response> {
  try {
    const run = deps.store.get(id);
    if (run.status !== "active") {
      return errorResponse(
        409,
        "setup_run_not_active",
        `setup run ${id} cannot be resumed (status: ${run.status})`,
        { status: run.status },
      );
    }
    // Resume returns the current stage — no state change needed, just return current state
    return jsonResponse(200, buildRunResponse(run, deps));
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }
}

/**
 * DELETE /v1/setup/runs/:id — abort a setup run.
 * May also unregister the project if status=setup_pending and no sessions exist.
 */
export async function deleteSetupRun(
  id: string,
  req: Request,
  deps: SetupDeps,
  projectRegistry?: { archive(id: string): unknown; purge(id: string): void; get(id: string): unknown | undefined },
  sessionsDir?: string,
): Promise<Response> {
  try {
    const run = deps.store.get(id);

    // If the project was registered and is still setup_pending, archive it.
    // If no sessions exist for the project, also purge it.
    if (run.projectId && projectRegistry && sessionsDir) {
      try {
        const project = projectRegistry.get(run.projectId) as { status: string } | undefined;
        if (project?.status === "setup_pending") {
          projectRegistry.archive(run.projectId as string);
          // Check if there are any sessions — purge if not
          const projectSessionsDir = join(sessionsDir, run.projectId);
          if (!existsSync(projectSessionsDir) || readdirSync(projectSessionsDir).length === 0) {
            projectRegistry.purge(run.projectId as string);
          }
        }
      } catch {
        // project operations are best-effort on abort
      }
    }

    deps.store.abandon(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }
}

/**
 * GET /v1/setup/runs/:id/events — SSE stream of setup events.
 * Topics: discovery.*, interview.*, ambiguity.*, confirmation.*, generation.*,
 *         verification.*, completion.*
 */
export function getSetupEvents(id: string, req: Request, deps: SetupDeps): Response {
  // Validate run exists first
  try {
    deps.store.get(id);
  } catch (err) {
    if (err instanceof SetupRunNotFoundError) {
      return errorResponse(404, "setup_run_not_found", err.message, { id });
    }
    throw err;
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? undefined;
  const lastEventId = req.headers.get("Last-Event-ID") ?? since;

  // Setup events live in the run's events JSONL: stateDir/setup_runs/<id>/events.jsonl
  const eventsPath = join(deps.eventsDir, id, "events.jsonl");

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
          const envelope = JSON.parse(line) as { id: string; topic: string; data: unknown };
          if (lastEventId !== undefined && envelope.id <= lastEventId) return;
          const sseLine = `id: ${envelope.id}\nevent: ${envelope.topic}\ndata: ${line}\n\n`;
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

// ─── Response builders ──────────────────────────────────────────────────────

function buildRunResponse(run: SetupRun, deps: SetupDeps): Record<string, unknown> {
  return {
    _v: 1,
    id: run.id,
    project_id: run.projectId,
    abs_path: run.absPath,
    mode: run.mode,
    status: run.status,
    phase: run.phase,
    verdict: run.verdict,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    completed_at: run.completedAt,
    questions: run.questions.map((q) => buildQuestionResponse(q)),
    chapters: run.chapters.map((c) => buildChapterResponse(c)),
    findings_count: countFindings(run),
    non_interactive: run.nonInteractive,
    events_url: `/v1/setup/runs/${run.id}/events`,
    chapters_url: `/v1/setup/runs/${run.id}/chapters`,
  };
}

function buildQuestionResponse(q: SetupQuestion): Record<string, unknown> {
  return {
    id: q.id,
    topic: q.topic,
    text: q.text,
    answer: q.answer,
    answered_at: q.answeredAt,
    answered: q.answer !== undefined,
    prerequisites: q.prerequisites,
    branch: q.branch,
    options: q.options ?? null,
  };
}

function buildChapterResponse(c: SetupChapter): Record<string, unknown> {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    status: c.status,
    artifact_refs: c.artifactRefs,
  };
}

function countFindings(run: SetupRun): number {
  const f = run.findings;
  let count = 0;
  if (f.repoInventory) count++;
  if (f.stackDetection) count++;
  if (f.structureAnalysis) count++;
  if (f.patternAnalysis) count++;
  if (f.buildBaseline) count++;
  if (f.intentSignals) count++;
  if (f.environment) count++;
  return count;
}

// Re-export parseJsonBody from daemon-routes for use in handlers
import { parseJsonBody as _parseJsonBody } from "@aloop/daemon-routes";
// Named import is unused warning fix — actually use it
const parseJsonBody = _parseJsonBody;
void parseJsonBody;
