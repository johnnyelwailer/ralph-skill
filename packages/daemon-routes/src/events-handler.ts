import { drainTailedLines, type TailedFile } from "./tail.ts";
import type { EventEnvelope } from "@aloop/core";

export type EventsDeps = {
  readonly logFile: () => string;
  readonly sessionsDir: () => string;
};

export type EventsFilter = {
  topics: string;
  sessionId?: string;
  projectId?: string;
  parent?: string;
  composerTurnId?: string;
  controlSubagentRunId?: string;
  lastEventId?: string;
};

/**
 * GET /v1/events — SSE event stream.  Per api.md §Events, the handler reads
 * existing log lines, then enters a polling tail so new events written after
 * the subscription are streamed to the client.  Stream closes on
 * req.signal abort.  All events are durable and replayable via JSONL.
 */
export async function handleEvents(
  req: Request,
  deps: EventsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname !== "/v1/events") return undefined;
  if (req.method !== "GET") return undefined;

  const filter = parseFilter(new URL(req.url));
  const lastEventId = req.headers.get("Last-Event-ID");
  const effective: EventsFilter =
    filter.lastEventId === undefined && lastEventId !== null ? { ...filter, lastEventId } : filter;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Flush a comment byte immediately so fetch() returns without waiting
      // for the first real event.  SSE comment lines (start with ":") are
      // ignored by clients.
      controller.enqueue(enc.encode(`: connected ${Date.now()}\n\n`));

      const tails = tailTargets(deps, effective);
      let active = true;

      const drain = (tailed: TailedFile): void => {
        if (!active) return;
        (async () => {
          for await (const line of drainTailedLines(tailed)) {
            if (!active) break;
            try {
              const env = JSON.parse(line) as EventEnvelope;
              if (passesFilter(env, effective)) {
                controller.enqueue(enc.encode(`id: ${env.id}\nevent: ${env.topic}\ndata: ${line}\n\n`));
              }
            } catch {
              // skip malformed lines
            }
          }
        })().catch(() => {});
      };

      for (const t of tails) drain(t);
      const interval = setInterval(() => {
        if (active) for (const t of tails) drain(t);
      }, 200);

      req.signal.addEventListener("abort", () => {
        if (!active) return;
        active = false;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function parseFilter(url: URL): EventsFilter {
  const str = (n: string): string | undefined => {
    const v = url.searchParams.get(n);
    return v === null ? undefined : v;
  };
  return {
    topics: str("topics") ?? "*",
    ...(str("session_id") !== undefined && { sessionId: str("session_id")! }),
    ...(str("project_id") !== undefined && { projectId: str("project_id")! }),
    ...(str("parent") !== undefined && { parent: str("parent")! }),
    ...(str("composer_turn_id") !== undefined && { composerTurnId: str("composer_turn_id")! }),
    ...(str("control_subagent_run_id") !== undefined && { controlSubagentRunId: str("control_subagent_run_id")! }),
    ...(str("since") !== undefined && { lastEventId: str("since")! }),
  };
}

function tailTargets(deps: EventsDeps, f: EventsFilter): TailedFile[] {
  const out: TailedFile[] = [{ path: deps.logFile(), position: 0 }];
  if (f.sessionId !== undefined) out.push({ path: `${deps.sessionsDir()}/${f.sessionId}/log.jsonl`, position: 0 });
  return out;
}

function passesFilter(env: EventEnvelope, f: EventsFilter): boolean {
  if (f.lastEventId !== undefined && env.id <= f.lastEventId) return false;
  if (f.topics !== "*" && !matchGlob(f.topics, env.topic)) return false;
  const d = env.data as Record<string, unknown> | null;
  if (f.sessionId !== undefined && d?.session_id !== f.sessionId) return false;
  if (f.projectId !== undefined && d?.project_id !== f.projectId) return false;
  if (f.parent !== undefined && d?.parent_session_id !== f.parent) return false;
  if (f.composerTurnId !== undefined && d?.composer_turn_id !== f.composerTurnId) return false;
  if (f.controlSubagentRunId !== undefined && d?.control_subagent_run_id !== f.controlSubagentRunId) return false;
  return true;
}

/** Glob match for topic patterns. Supports '*' wildcard. */
export function matchGlob(pattern: string, topic: string): boolean {
  return matchGlobParts(pattern.split("."), topic.split("."));
}

function matchGlobParts(p: string[], t: string[]): boolean {
  if (p.length === 0) return t.length === 0;
  if (t.length === 0) return false;
  if (p[0] === "*") return matchGlobParts(p.slice(1), t.slice(1));
  if (p[0] !== t[0]) return false;
  return matchGlobParts(p.slice(1), t.slice(1));
}
