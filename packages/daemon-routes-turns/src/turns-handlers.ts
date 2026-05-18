import { join } from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { badRequest, errorResponse, jsonResponse, methodNotAllowed, notFoundResponse, parseJsonBody } from "@aloop/daemon-routes";
import type { EventEnvelope } from "@aloop/core";
import type { TurnRegistry } from "@aloop/state-sqlite";

export type TurnsDeps = {
  readonly sessionsDir: string | (() => string);
  readonly turns: TurnRegistry;
};

export async function handleTurns(
  req: Request,
  deps: TurnsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/sessions/")) return undefined;

  // GET /v1/sessions/:id/turns
  const listMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/turns$/);
  if (listMatch) {
    if (req.method === "GET") {
      return listTurnsHandler(listMatch[1]!, deps);
    }
    if (req.method === "POST") {
      return createTurnHandler(req, listMatch[1]!, deps);
    }
    return methodNotAllowed();
  }

  // GET /v1/sessions/:id/turns/:turnId
  const getMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/turns\/([^/?#]+)$/);
  if (getMatch) {
    const sessionId = getMatch[1]!;
    const turnId = getMatch[2]!;
    if (req.method === "GET") {
      return getTurnHandler(sessionId, turnId, deps);
    }
    if (req.method === "PATCH") {
      return updateTurnHandler(req, sessionId, turnId, deps);
    }
    if (req.method === "DELETE") {
      return deleteTurnHandler(sessionId, turnId, deps);
    }
    return methodNotAllowed();
  }

  // GET /v1/sessions/:id/turns/:turnId/chunks (existing)
  const chunksMatch = pathname.match(/^\/v1\/sessions\/([^/?#]+)\/turns\/([^/?#]+)\/chunks$/);
  if (chunksMatch) {
    if (req.method !== "GET") {
      return errorResponse(405, "method_not_allowed", "method not allowed for this resource");
    }
    return streamTurnChunks(chunksMatch[1]!, chunksMatch[2]!, deps);
  }

  return undefined;
}

function listTurnsHandler(sessionId: string, deps: TurnsDeps): Response {
  const turns = deps.turns.list({ sessionId });
  return jsonResponse(200, {
    _v: 1,
    items: turns.map(turnResponse),
    next_cursor: null,
  });
}

function getTurnHandler(sessionId: string, turnId: string, deps: TurnsDeps): Response {
  const turn = deps.turns.getBySessionAndTurn(sessionId, turnId);
  if (!turn) {
    return errorResponse(404, "turn_not_found", `turn not found: ${turnId}`, { turn_id: turnId, session_id: sessionId });
  }
  return jsonResponse(200, turnResponse(turn));
}

async function createTurnHandler(req: Request, sessionId: string, deps: TurnsDeps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const turnId =
    typeof body.data.turn_id === "string" && body.data.turn_id.length > 0
      ? body.data.turn_id
      : undefined;
  if (!turnId) return badRequest("turn_id is required");

  const sequence =
    typeof body.data.sequence === "number" && Number.isInteger(body.data.sequence) && body.data.sequence >= 0
      ? body.data.sequence
      : 0;

  const turn = deps.turns.create({ sessionId, turnId, sequence });
  return jsonResponse(200, turnResponse(turn));
}

async function updateTurnHandler(req: Request, sessionId: string, turnId: string, deps: TurnsDeps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const existing = deps.turns.getBySessionAndTurn(sessionId, turnId);
  if (!existing) {
    return errorResponse(404, "turn_not_found", `turn not found: ${turnId}`, { turn_id: turnId, session_id: sessionId });
  }

  const endedAt =
    body.data.ended_at !== undefined
      ? (body.data.ended_at === null ? null : typeof body.data.ended_at === "string" ? body.data.ended_at : String(body.data.ended_at))
      : undefined;
  const tokensIn =
    typeof body.data.tokens_in === "number" && body.data.tokens_in >= 0
      ? body.data.tokens_in
      : undefined;
  const tokensOut =
    typeof body.data.tokens_out === "number" && body.data.tokens_out >= 0
      ? body.data.tokens_out
      : undefined;
  const costUsd =
    typeof body.data.cost_usd === "number" && body.data.cost_usd >= 0
      ? body.data.cost_usd
      : undefined;

  const turn = deps.turns.update(existing.id, {
    ...(endedAt !== undefined && { endedAt }),
    ...(tokensIn !== undefined && { tokensIn }),
    ...(tokensOut !== undefined && { tokensOut }),
    ...(costUsd !== undefined && { costUsd }),
  });
  return jsonResponse(200, turnResponse(turn));
}

function deleteTurnHandler(sessionId: string, turnId: string, deps: TurnsDeps): Response {
  const existing = deps.turns.getBySessionAndTurn(sessionId, turnId);
  if (!existing) {
    return errorResponse(404, "turn_not_found", `turn not found: ${turnId}`, { turn_id: turnId, session_id: sessionId });
  }
  return notFoundResponse(`DELETE /v1/sessions/${sessionId}/turns/${turnId} not yet implemented`);
}

function turnResponse(turn: {
  id: string;
  sessionId: string;
  turnId: string;
  sequence: number;
  createdAt: string;
  endedAt: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}): unknown {
  return {
    _v: 1,
    id: turn.id,
    session_id: turn.sessionId,
    turn_id: turn.turnId,
    sequence: turn.sequence,
    created_at: turn.createdAt,
    ended_at: turn.endedAt,
    tokens_in: turn.tokensIn,
    tokens_out: turn.tokensOut,
    cost_usd: turn.costUsd,
  };
}

function streamTurnChunks(sessionId: string, turnId: string, deps: TurnsDeps, replay = false): Response {
  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
  const eventsPath = join(sessionsDir, sessionId, "log.jsonl");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const writeSSEChunk = (data: unknown): void => {
        const line = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      writeSSEChunk({ session_id: sessionId, turn_id: turnId, type: "start" });

      if (replay) {
        if (!existsSync(eventsPath)) {
          writeSSEChunk({ session_id: sessionId, turn_id: turnId, type: "end" });
          controller.close();
          return;
        }

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
          writeSSEChunk({ session_id: sessionId, turn_id: turnId, type: "end" });
          controller.close();
        });
      } else {
        writeSSEChunk({ session_id: sessionId, turn_id: turnId, type: "end" });
        controller.close();
      }
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