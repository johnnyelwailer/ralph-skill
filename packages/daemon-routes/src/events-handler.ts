import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { errorResponse } from "./http-helpers.ts";
import type { EventEnvelope } from "@aloop/core";

export type EventsDeps = {
  readonly logFile: () => string;
  readonly sessionsDir: () => string;
};

/**
 * GET /v1/events
 *
 * Subscribe to the global event stream as SSE.  Supports filtering by:
 *   topics   — glob pattern on topic (e.g. "session.*", "scheduler.permit.*")
 *   session_id
 *   project_id
 *   since    — last event ID seen (resume from that point)
 *
 * The live tail streams from the global daemon log.  The implementation
 * follows the pattern in api.md §Events: all events are durable and
 * replayable via the JSONL log.
 */
export async function handleEvents(
  req: Request,
  deps: EventsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname !== "/v1/events") return undefined;
  if (req.method !== "GET") return undefined;

  const url = new URL(req.url);
  const topics = url.searchParams.get("topics") ?? "*";
  const sessionId = url.searchParams.get("session_id");
  const projectId = url.searchParams.get("project_id");
  const parent = url.searchParams.get("parent");
  const researchRunId = url.searchParams.get("research_run_id");
  const composerTurnId = url.searchParams.get("composer_turn_id");
  const controlSubagentRunId = url.searchParams.get("control_subagent_run_id");
  const since = url.searchParams.get("since") ?? undefined;

  // Last-Event-ID header is the standard SSE reconnect token
  const lastEventId = req.headers.get("Last-Event-ID") ?? since;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const logFile = deps.logFile();
      const sessionsDir = deps.sessionsDir();

      const sessions: string[] = [];

      if (sessionId) {
        // When filtering by session_id, also tail that session's log.jsonl
        const sessionLog = `${sessionsDir}/${sessionId}/log.jsonl`;
        if (existsSync(sessionLog)) sessions.push(sessionLog);
      }
      // Always tail the global log
      if (existsSync(logFile)) sessions.push(logFile);

      if (sessions.length === 0) {
        // Empty stream — nothing to tail yet
        controller.close();
        return;
      }

      // We use a single read stream across all files; since each file is
      // append-only and the ordering across files is not meaningful for the
      // global bus (events are identified by id), we stream them as they arrive.
      let active = sessions.length;

      for (const file of sessions) {
        const fileStream = createReadStream(file, { encoding: "utf-8" });
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        rl.on("line", (line) => {
          if (line.length === 0) return;
          try {
            const envelope = JSON.parse(line) as EventEnvelope;
            if (lastEventId !== undefined && envelope.id <= lastEventId) return;

            // Topic glob filter
            if (topics !== "*" && !matchGlob(topics, envelope.topic)) return;

            // session_id filter — data is typed loosely here
            if (sessionId) {
              const data = envelope.data as Record<string, unknown>;
              if (data.session_id !== sessionId) return;
            }

            // project_id filter — matches data.project_id
            if (projectId) {
              const data = envelope.data as Record<string, unknown>;
              if (data.project_id !== projectId) return;
            }

            // parent filter — matches data.parent_id
            if (parent) {
              const data = envelope.data as Record<string, unknown>;
              if (data.parent_id !== parent) return;
            }

            // research_run_id filter — matches data.research_run_id
            if (researchRunId) {
              const data = envelope.data as Record<string, unknown>;
              if (data.research_run_id !== researchRunId) return;
            }

            // composer_turn_id filter — matches data.composer_turn_id
            if (composerTurnId) {
              const data = envelope.data as Record<string, unknown>;
              if (data.composer_turn_id !== composerTurnId) return;
            }

            // control_subagent_run_id filter — matches data.control_subagent_run_id
            if (controlSubagentRunId) {
              const data = envelope.data as Record<string, unknown>;
              if (data.control_subagent_run_id !== controlSubagentRunId) return;
            }

            const sseLine = `id: ${envelope.id}\nevent: ${envelope.topic}\ndata: ${line}\n\n`;
            controller.enqueue(encoder.encode(sseLine));
          } catch {
            // skip malformed lines
          }
        });

        rl.on("close", () => {
          active--;
          if (active === 0) controller.close();
        });

        rl.on("error", () => {
          active--;
          if (active === 0) controller.close();
        });
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-accel-buffering": "no", // disable nginx buffering
    },
  });
}

/** Glob match for topic patterns. Supports '*' wildcard. */
export function matchGlob(pattern: string, topic: string): boolean {
  const parts = pattern.split(".");
  const tparts = topic.split(".");
  return matchGlobParts(parts, tparts);
}

function matchGlobParts(pattern: string[], topic: string[]): boolean {
  if (pattern.length === 0) return topic.length === 0;
  if (topic.length === 0) return false;
  const [p, ...prest] = pattern;
  const [t, ...trest] = topic;
  if (p === "*") {
    // '*' matches exactly one segment.
    // Consume this segment and continue with remaining pattern + remaining topic.
    return matchGlobParts(prest, trest);
  }
  if (p !== t) return false;
  return matchGlobParts(prest, trest);
}
