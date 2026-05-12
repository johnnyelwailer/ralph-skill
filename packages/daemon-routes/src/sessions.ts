import { methodNotAllowed } from "./http-helpers.ts";
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

  // POST /v1/sessions/:id/steer
  const steerMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/steer$/);
  if (steerMatch) {
    if (req.method !== "POST") return methodNotAllowed();
    return steerSessionHandler(steerMatch[1]!, req, deps);
  }

  // GET /v1/sessions/:id
  const detailMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)$/);
  if (detailMatch) {
    const id = detailMatch[1]!;

    // POST /v1/sessions/:id/resume
    if (req.method === "POST") {
      return resumeSessionHandler(id, deps);
    }

    // POST /v1/sessions/:id/pause
    if (req.method === "POST") {
      return pauseSessionHandler(id, deps);
    }

    // POST /v1/sessions/:id/unpause
    if (req.method === "POST") {
      return unpauseSessionHandler(id, deps);
    }

    // GET /v1/sessions/:id/queue
    if (req.method === "GET") {
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
