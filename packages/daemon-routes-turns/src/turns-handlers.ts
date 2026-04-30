import { join } from "node:path";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { errorResponse, notFoundResponse } from "@aloop/daemon-routes";
import type { EventEnvelope } from "@aloop/core";

export type TurnsDeps = {
  readonly sessionsDir: () => string;
};

export async function handleTurns(
  req: Request,
  deps: TurnsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/sessions/")) return undefined;

  const match = pathname.match(
    /^\/v1\/sessions\/([^/]+)\/turns\/([^/]+)\/chunks$/,
  );
  if (!match) return undefined;

  const sessionId = match[1]!;
  const turnId = match[2]!;

  if (req.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "method not allowed for this resource");
  }

  return streamTurnChunks(sessionId, turnId, deps);
}

function streamTurnChunks(sessionId: string, turnId: string, deps: TurnsDeps): Response {
  const eventsPath = join(deps.sessionsDir(), sessionId, "events.jsonl");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const writeSSEChunk = (data: unknown): void => {
        const line = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      writeSSEChunk({ session_id: sessionId, turn_id: turnId, type: "start" });

      const fileStream = createReadStream(eventsPath, { encoding: "utf-8" });
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

      rl.on("line", (line) => {
        if (line.length === 0) return;
        try {
          const envelope = JSON.parse(line) as EventEnvelope;
          if (
            envelope.topic === "agent.chunk" &&
            (envelope.data as { session_id?: string; turn_id?: string }).session_id === sessionId &&
            (envelope.data as { session_id?: string; turn_id?: string }).turn_id === turnId
          ) {
            writeSSEChunk(envelope.data);
          }
        } catch {
          // skip malformed lines
        }
      });

      rl.on("close", () => {
        writeSSEChunk({ session_id: sessionId, turn_id: turnId, type: "end" });
        controller.close();
      });

      rl.on("error", () => {
        controller.close();
      });
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