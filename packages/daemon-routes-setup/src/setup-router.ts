import type { SetupDeps } from "./setup-handlers.ts";
import {
  createSetupRun,
  listSetupRuns,
  getSetupRun,
  getSetupChapters,
  answerSetupRun,
  commentSetupRun,
  approveScaffold,
  resumeSetupRun,
  deleteSetupRun,
  getSetupEvents,
} from "./setup-handlers.ts";

/**
 * Dispatcher for all /v1/setup/* routes.
 * Returns undefined for paths it doesn't own (caller should 404).
 */
export function handleSetup(
  req: Request,
  deps: SetupDeps,
  pathname: string,
  projectRegistry?: { archive(id: string): unknown; purge(id: string): void; get(id: string): unknown | undefined },
  sessionsDir?: string,
): Promise<Response> | Response | undefined {
  // POST /v1/setup/runs — create
  if (req.method === "POST" && pathname === "/v1/setup/runs") {
    return createSetupRun(req, deps);
  }

  // GET /v1/setup/runs — list
  if (req.method === "GET" && pathname === "/v1/setup/runs") {
    return listSetupRuns(req, deps);
  }

  // GET /v1/setup/runs/:id/events — SSE events (before generic :id routing)
  {
    const eventsMatch = pathname.match(/^\/v1\/setup\/runs\/([^/]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      return getSetupEvents(eventsMatch[1]!, req, deps);
    }
  }

  // GET /v1/setup/runs/:id/chapters
  {
    const chaptersMatch = pathname.match(/^\/v1\/setup\/runs\/([^/]+)\/chapters$/);
    if (chaptersMatch && req.method === "GET") {
      return getSetupChapters(chaptersMatch[1]!, deps);
    }
  }

  // POST /v1/setup/runs/:id/answer
  {
    const match = pathname.match(/^\/v1\/setup\/runs\/([^/]+)\/answer$/);
    if (match && req.method === "POST") {
      return answerSetupRun(match[1]!, req, deps);
    }
  }

  // POST /v1/setup/runs/:id/comments
  {
    const match = pathname.match(/^\/v1\/setup\/runs\/([^/]+)\/comments$/);
    if (match && req.method === "POST") {
      return commentSetupRun(match[1]!, req, deps);
    }
  }

  // POST /v1/setup/runs/:id/approve-scaffold
  {
    const match = pathname.match(/^\/v1\/setup\/runs\/([^/]+)\/approve-scaffold$/);
    if (match && req.method === "POST") {
      return approveScaffold(match[1]!, deps);
    }
  }

  // POST /v1/setup/runs/:id/resume
  {
    const match = pathname.match(/^\/v1\/setup\/runs\/([^/]+)\/resume$/);
    if (match && req.method === "POST") {
      return resumeSetupRun(match[1]!, deps);
    }
  }

  // DELETE /v1/setup/runs/:id
  {
    const match = pathname.match(/^\/v1\/setup\/runs\/([^/]+)$/);
    if (match && req.method === "DELETE") {
      return deleteSetupRun(match[1]!, req, deps, projectRegistry, sessionsDir);
    }
  }

  // GET /v1/setup/runs/:id — get single run (must be after specific sub-paths above)
  {
    const match = pathname.match(/^\/v1\/setup\/runs\/([^/]+)$/);
    if (match && req.method === "GET") {
      return getSetupRun(match[1]!, deps);
    }
  }

  return undefined;
}
