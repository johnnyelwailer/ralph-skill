import { watch } from "node:fs";
import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";

export type EventsDeps = {
  readonly store: {
    readonly append: (event: EventEnvelope) => Promise<void>;
    readonly read: (path: string, since?: string) => AsyncIterable<EventEnvelope>;
    readonly close: () => Promise<void>;
  };
  readonly logPath: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly config: Record<string, (...args: any[]) => any>;
};

// Minimal inline type — matches @aloop/core EventEnvelope
interface EventEnvelope {
  readonly id: string;
  readonly topic: string;
  readonly data: unknown;
  readonly timestamp: string;
  readonly _v: 1;
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

export async function handleEventsSSE(
  req: Request,
  deps: EventsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname !== "/v1/events") return undefined;
  if (req.method !== "GET") {
    return jsonError(405, "method_not_allowed", "GET required");
  }

  const url = new URL(req.url);
  const topics = parseTopics(url.searchParams.get("topics") ?? "*");
  const sessionId = url.searchParams.get("session_id") ?? undefined;
  const parentId = url.searchParams.get("parent") ?? undefined;
  const since = url.searchParams.get("since") ?? req.headers.get("Last-Event-ID") ?? undefined;
  const projectId = url.searchParams.get("project_id") ?? undefined;
  const composerTurnId = url.searchParams.get("composer_turn_id") ?? undefined;
  const controlSubagentRunId = url.searchParams.get("control_subagent_run_id") ?? undefined;
  const filter = {
    topics,
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(since !== undefined ? { since } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(composerTurnId !== undefined ? { composerTurnId } : {}),
    ...(controlSubagentRunId !== undefined ? { controlSubagentRunId } : {}),
  };

  // Collect all historical events from the log file
  const historical: EventEnvelope[] = [];
  try {
    for await (const env of deps.store.read(deps.logPath)) {
      if (!shouldSkip(env, filter)) {
        historical.push(env);
      }
    }
  } catch {
    // File may not exist yet — historical stays empty
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();

      // Flush historical events immediately
      for (const env of historical) {
        controller.enqueue(enc.encode(formatSSE(env)));
      }

      // Detect client disconnect so we stop watching
      req.signal.addEventListener("abort", () => {
        controller.close();
      });

      // Tail the log file for new events; cleanup via req.signal abort
      tailLogFile(deps.logPath, (env) => {
        if (!shouldSkip(env, filter)) {
          try {
            controller.enqueue(enc.encode(formatSSE(env)));
          } catch {
            // Client disconnected
          }
        }
      }, req.signal);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

// ---------------------------------------------------------------------------
// File tailing
// ---------------------------------------------------------------------------

/**
 * Watch a JSONL file for new content appended after the current file size.
 * Calls `onEvent` for each new parsed EventEnvelope. Stops when `signal` aborts.
 */
function tailLogFile(
  path: string,
  onEvent: (env: EventEnvelope) => void,
  signal: AbortSignal,
): void {
  let pos = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let active = true;

  function readNewEvents() {
    if (!active) return;
    const rl = createInterface({
      input: createReadStream(path, { start: pos, encoding: "utf-8" }),
      crlfDelay: Infinity,
    });
    let consumed = false;
    rl.on("line", (line) => {
      if (!active) return;
      if (!line.trim()) return;
      consumed = true;
      try {
        onEvent(JSON.parse(line) as EventEnvelope);
      } catch {
        // Malformed line — skip
      }
    });
    rl.on("close", () => {
      if (consumed && active) {
        try {
          pos = statSync(path).size;
        } catch {
          // File may be gone
        }
      }
    });
    rl.on("error", () => {
      if (interval) clearInterval(interval);
    });
  }

  // Initial position: current file size
  try {
    pos = statSync(path).size;
  } catch {
    pos = 0;
  }

  // Poll for new events every 250ms
  interval = setInterval(readNewEvents, 250);

  // Also use fs.watch for immediate notification when available
  let watcher: ReturnType<typeof watch> | null = null;
  try {
    watcher = watch(path, { signal }, () => {
      if (interval) clearInterval(interval);
      readNewEvents();
      interval = setInterval(readNewEvents, 250);
    });
  } catch {
    // fs.watch not supported — stick with polling
  }

  // Stop everything on client disconnect
  signal.addEventListener("abort", () => {
    active = false;
    if (interval) clearInterval(interval);
    watcher?.close();
  });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

interface FilterOptions {
  topics: string[];
  sessionId?: string;
  parentId?: string;
  since?: string;
  projectId?: string;
  composerTurnId?: string;
  controlSubagentRunId?: string;
}

/** Returns true when the event should be SKIPPED (not streamed). */
function shouldSkip(env: EventEnvelope, opts: FilterOptions): boolean {
  const { topics, sessionId, parentId, since, projectId, composerTurnId, controlSubagentRunId } = opts;

  if (since && env.id <= since) return true;
  if (sessionId && (env.data as Record<string, unknown>)?.session_id !== sessionId) return true;
  if (parentId && (env.data as Record<string, unknown>)?.parent_session_id !== parentId) return true;
  if (projectId && (env.data as Record<string, unknown>)?.project_id !== projectId) return true;
  if (composerTurnId && (env.data as Record<string, unknown>)?.composer_turn_id !== composerTurnId) return true;
  if (controlSubagentRunId && (env.data as Record<string, unknown>)?.control_subagent_run_id !== controlSubagentRunId) return true;
  if (!topicMatches(env.topic, topics)) return true;

  return false;
}

/**
 * Glob matching where `*` matches exactly one dot-separated segment.
 * `session.*`   → matches `session.update`, not `session.child.update`
 * `*`           → matches anything with exactly one segment (or empty list = all)
 * `**.update`   → treated as literal (no recursive glob support)
 */
export function topicMatches(topic: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  const topicSegments = topic.split(".");
  for (const pattern of patterns) {
    if (pattern === "*") {
      if (topicSegments.length === 1) return true;
      continue;
    }
    const patternSegments = pattern.split(".");
    if (patternSegments.length !== topicSegments.length) continue;
    let matched = true;
    for (let i = 0; i < patternSegments.length; i++) {
      if (patternSegments[i] !== "*" && patternSegments[i] !== topicSegments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function parseTopics(raw: string): string[] {
  if (!raw || raw === "*") return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// SSE formatting
// ---------------------------------------------------------------------------

function formatSSE(env: EventEnvelope): string {
  const topic = env.topic.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
  const payload = JSON.stringify(env.data ?? null).replace(/\n/g, "\\n").replace(/\r/g, "\\r");
  return [
    `id: ${env.id}`,
    `event: ${topic}`,
    `data: ${payload}`,
    "",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
