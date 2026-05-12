import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { errorResponse, jsonResponse, methodNotAllowed } from "./http-helpers.ts";
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

  // GET /v1/sessions/:id/queue
  const queueMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/queue$/);
  if (queueMatch && req.method === "GET") {
    return listSessionQueueHandler(queueMatch[1]!, deps);
  }

  // DELETE /v1/sessions/:id/queue/:itemId
  const queueDeleteMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/queue\/([^/?#]+)$/);
  if (queueDeleteMatch && req.method === "DELETE") {
    return deleteSessionQueueItemHandler(queueDeleteMatch[1]!, queueDeleteMatch[2]!, deps);
  }

  // GET /v1/sessions/:id/log
  const logMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/log$/);
  if (logMatch && req.method === "GET") {
    const id = logMatch[1]!;
    const session = deps.sessions.get(id);
    if (!session) {
      return errorResponse(404, "session_not_found", `session not found: ${id}`, { id });
    }
    return readSessionLog(req, deps, id);
  }

  // POST /v1/sessions/:id/resume
  const resumeMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/resume$/);
  if (resumeMatch && req.method === "POST") {
    return resumeSessionHandler(resumeMatch[1]!, deps);
  }

  // POST /v1/sessions/:id/pause
  const pauseMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/pause$/);
  if (pauseMatch && req.method === "POST") {
    return pauseSessionHandler(pauseMatch[1]!, deps);
  }

  // POST /v1/sessions/:id/unpause
  const unpauseMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/unpause$/);
  if (unpauseMatch && req.method === "POST") {
    return unpauseSessionHandler(unpauseMatch[1]!, deps);
  }

  // GET /v1/sessions/:id
  const detailMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)$/);
  if (detailMatch && req.method === "GET") {
    return getSessionHandler(detailMatch[1]!, deps);
  }

  // DELETE /v1/sessions/:id
  if (detailMatch && req.method === "DELETE") {
    return deleteSessionHandler(detailMatch[1]!, req, deps);
  }

  return undefined;
}

function readSessionLog(req: Request, deps: SessionsDeps, sessionId: string): Response {
  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
  const logPath = `${sessionsDir}/${sessionId}/log.jsonl`;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "sse";
  const since = url.searchParams.get("since") ?? undefined;

  if (!existsSync(logPath)) {
    return jsonResponse(200, { _v: 1, items: [], next_cursor: null });
  }

  if (format === "ndjson" || format === "jsonl") {
    return streamNdjson(logPath, since);
  }

  return streamSSE(logPath, since);
}

function streamSSE(logPath: string, since: string | undefined): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!existsSync(logPath)) {
        controller.close();
        return;
      }

      const fileStream = createReadStream(logPath, { encoding: "utf-8" });
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

      rl.on("line", (line) => {
        if (line.length === 0) return;
        try {
          const envelope = JSON.parse(line);
          if (since !== undefined && envelope.id <= since) return;
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

function streamNdjson(logPath: string, since: string | undefined): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!existsSync(logPath)) {
        controller.close();
        return;
      }

      const fileStream = createReadStream(logPath, { encoding: "utf-8" });
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

      rl.on("line", (line) => {
        if (line.length === 0) return;
        try {
          const envelope = JSON.parse(line);
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