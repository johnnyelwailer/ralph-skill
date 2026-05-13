import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { errorResponse, jsonResponse, methodNotAllowed } from "./http-helpers.ts";
import type { SessionsDeps } from "./sessions-handlers.ts";
import {
  createSessionHandler,
  deleteSessionHandler,
  deleteSessionQueueItemHandler,
  getSessionHandler,
  getSessionMetricsHandler,
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
  if (pathname === "/v1/sessions") {
    if (req.method === "GET") return listSessionsHandler(req, deps);
    if (req.method === "POST") return createSessionHandler(req, deps);
    return methodNotAllowed();
  }

  // POST /v1/sessions/:id/steer
  const steerMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/steer$/);
  if (steerMatch) {
    if (req.method !== "POST") return methodNotAllowed();
    return steerSessionHandler(steerMatch[1]!, req, deps);
  }

  // GET /v1/sessions/:id/queue
  const queueMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/queue$/);
  if (queueMatch) {
    if (req.method !== "GET") return methodNotAllowed();
    return listSessionQueueHandler(queueMatch[1]!, deps);
  }

  // DELETE /v1/sessions/:id/queue/:itemId
  const queueDeleteMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/queue\/([^/?#]+)$/);
  if (queueDeleteMatch) {
    if (req.method !== "DELETE") return methodNotAllowed();
    return deleteSessionQueueItemHandler(queueDeleteMatch[1]!, queueDeleteMatch[2]!, deps);
  }

  // GET /v1/sessions/:id/log
  const logMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/log$/);
  if (logMatch) {
    if (req.method !== "GET") return methodNotAllowed();
    return readSessionLog(req, deps, logMatch[1]!);
  }

  // POST /v1/sessions/:id/resume
  const resumeMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/resume$/);
  if (resumeMatch) {
    if (req.method !== "POST") return methodNotAllowed();
    return resumeSessionHandler(resumeMatch[1]!, deps);
  }

  // POST /v1/sessions/:id/pause
  const pauseMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/pause$/);
  if (pauseMatch) {
    if (req.method !== "POST") return methodNotAllowed();
    return pauseSessionHandler(pauseMatch[1]!, deps);
  }

  // POST /v1/sessions/:id/unpause
  const unpauseMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/unpause$/);
  if (unpauseMatch) {
    if (req.method !== "POST") return methodNotAllowed();
    return unpauseSessionHandler(unpauseMatch[1]!, deps);
  }

  // GET /v1/sessions/:id/metrics
  const metricsMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/metrics$/);
  if (metricsMatch) {
    if (req.method !== "GET") return methodNotAllowed();
    return getSessionMetricsHandler(metricsMatch[1]!, deps);
  }

  // GET /v1/sessions/:id
  const detailMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)$/);
  if (detailMatch) {
    if (req.method === "GET") return getSessionHandler(detailMatch[1]!, deps);
    if (req.method === "DELETE") return deleteSessionHandler(detailMatch[1]!, req, deps);
    return methodNotAllowed();
  }

  return undefined;
}

function readSessionLog(req: Request, deps: SessionsDeps, sessionId: string): Response {
  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
  const sessionDir = `${sessionsDir}/${sessionId}`;
  const logPath = `${sessionDir}/log.jsonl`;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "sse";
  const since = url.searchParams.get("since") ?? undefined;

  if (!existsSync(sessionDir)) {
    return errorResponse(404, "session_not_found", `session not found: ${sessionId}`, { id: sessionId });
  }

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