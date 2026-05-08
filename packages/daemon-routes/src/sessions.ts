import type { SessionsDeps } from "./sessions-handlers.ts";
import {
  createSessionHandler,
  deleteSessionHandler,
  deleteSessionQueueItemHandler,
  getSessionHandler,
  listSessionQueueHandler,
  listSessionsHandler,
  pauseSessionHandler,
  resumeSessionHandler,
  steerSessionHandler,
  unpauseSessionHandler,
} from "./sessions-handlers.ts";

export { type SessionsDeps } from "./sessions-handlers.ts";

export function handleSessions(req: Request, deps: SessionsDeps, pathname: string): Response | Promise<Response> | undefined {
  const url = new URL(req.url);

  // GET /v1/sessions
  if (req.method === "GET" && pathname === "/v1/sessions") {
    return listSessionsHandler(req, deps);
  }

  // POST /v1/sessions
  if (req.method === "POST" && pathname === "/v1/sessions") {
    return createSessionHandler(req, deps);
  }

  // GET /v1/sessions/:id
  const detailMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)$/);
  if (detailMatch) {
    const id = detailMatch[1]!;

    // POST /v1/sessions/:id/resume
    if (req.method === "POST" && url.pathname === `/v1/sessions/${id}/resume`) {
      return resumeSessionHandler(id, deps);
    }

    // POST /v1/sessions/:id/pause
    if (req.method === "POST" && url.pathname === `/v1/sessions/${id}/pause`) {
      return pauseSessionHandler(id, deps);
    }

    // POST /v1/sessions/:id/unpause
    if (req.method === "POST" && url.pathname === `/v1/sessions/${id}/unpause`) {
      return unpauseSessionHandler(id, deps);
    }

    // POST /v1/sessions/:id/steer
    if (req.method === "POST" && url.pathname === `/v1/sessions/${id}/steer`) {
      return steerSessionHandler(id, req, deps);
    }

    // GET /v1/sessions/:id/queue
    if (req.method === "GET" && url.pathname === `/v1/sessions/${id}/queue`) {
      return listSessionQueueHandler(id, deps);
    }

    // GET /v1/sessions/:id
    if (req.method === "GET") {
      return getSessionHandler(id, deps);
    }

    // DELETE /v1/sessions/:id
    if (req.method === "DELETE") {
      return deleteSessionHandler(id, req, deps);
    }
  }

  // DELETE /v1/sessions/:id/queue/:itemId
  const queueDeleteMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/queue\/([^/?#]+)$/);
  if (queueDeleteMatch && req.method === "DELETE") {
    return deleteSessionQueueItemHandler(queueDeleteMatch[1]!, queueDeleteMatch[2]!, deps);
  }

  return undefined;
}
