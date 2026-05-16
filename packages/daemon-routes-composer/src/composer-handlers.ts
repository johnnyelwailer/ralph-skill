/**
 * Composer API handlers.
 * All routes are prefixed /v1/composer/
 * Fully specified in docs/spec/api.md §Composer.
 */
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from "@aloop/daemon-routes";
import type {
  ComposerActionClass,
  ComposerApprovalPolicy,
  ComposerArtifactRef,
  ComposerContextRef,
  ComposerDelegationPolicy,
  ComposerIntentHint,
  ComposerMediaInput,
  ComposerTranscription,
  ComposerTranscriptionMode,
  ComposerTurn,
  ComposerTurnFilter,
  ComposerTurnScope,
  ComposerTurnScopeKind,
  ComposerTurnStatus,
  CreateComposerTurnInput,
} from "@aloop/core";
import {
  ComposerTurnNotFoundError,
  ComposerTurnRegistry,
} from "@aloop/state-sqlite";
import type { EventEnvelope } from "@aloop/core";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { Database } from "bun:sqlite";
import type { EventWriter } from "@aloop/state-sqlite";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type ComposerDeps = {
  readonly registry?: ComposerTurnRegistry;
  readonly db?: Database;
  readonly events?: EventWriter;
  readonly logFile: () => string;
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function turnResponse(turn: ComposerTurn): Record<string, unknown> {
  return {
    _v: 1,
    id: turn.id,
    scope: turn.scope,
    message: turn.message,
    status: turn.status,
    intent_hint: turn.intent_hint,
    media_mode: turn.media_mode,
    voice_mode: turn.voice_mode,
    artifact_refs: turn.artifact_refs,
    media_inputs: turn.media_inputs,
    context_refs: turn.context_refs,
    allowed_action_classes: turn.allowed_action_classes,
    delegation_policy: turn.delegation_policy,
    provider_chain: turn.provider_chain,
    transcription: turn.transcription,
    max_cost_usd: turn.max_cost_usd,
    approval_policy: turn.approval_policy,
    delegated_refs: turn.delegated_refs,
    launched_refs: turn.launched_refs,
    proposed_actions: turn.proposed_actions,
    usage: turn.usage,
    created_at: turn.created_at,
    updated_at: turn.updated_at,
  };
}

function turnListResponse(
  turns: ComposerTurn[],
  filter: ComposerTurnFilter,
): Record<string, unknown> {
  return {
    _v: 1,
    items: turns.map(turnResponse),
    next_cursor: turns.length === (filter.limit ?? 20)
      ? turns[turns.length - 1]!.created_at
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

const VALID_SCOPE_KINDS = new Set<string>([
  "global", "project", "artifact", "setup_run",
  "work_item", "session", "spec_section",
]);

const VALID_STATUSES = new Set<string>([
  "queued", "running", "waiting_for_approval",
  "completed", "failed", "cancelled",
]);

const VALID_INTENT_HINTS = new Set<string>([
  "capture", "research", "monitor", "project", "setup",
  "plan", "configure", "steer", "explain", "summarize", "apply",
]);

const VALID_ACTION_CLASSES = new Set<string>([
  "read", "capture", "research", "project", "setup",
  "tracker", "runtime", "provider", "scheduler", "config", "artifact",
]);

const VALID_MEDIA_KINDS = new Set<string>([
  "image", "audio", "speech", "video", "document",
  "url", "code", "log", "diff",
]);

const VALID_TRANSCRIPTION_MODES = new Set<string>([
  "auto", "native_provider", "fallback_transcriber", "client_supplied",
]);

const VALID_CONTEXT_REF_KINDS = new Set<string>([
  "project", "artifact", "session", "work_item",
]);

function validateScopeKind(kind: unknown): ComposerTurnScopeKind | null {
  if (typeof kind !== "string" || !VALID_SCOPE_KINDS.has(kind)) return null;
  return kind as ComposerTurnScopeKind;
}

function validateScope(scope: unknown): ComposerTurnScope | null {
  if (scope === null || scope === undefined || typeof scope !== "object") return null;
  const s = scope as Record<string, unknown>;
  const kind = validateScopeKind(s.kind);
  if (!kind) return null;
  if (s.id !== undefined && typeof s.id !== "string") return null;
  return s.id !== undefined ? { kind, id: s.id as string } : { kind };
}

function validateArtifactRef(ref: unknown): ComposerArtifactRef | null {
  if (ref === null || ref === undefined || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  if (typeof r.artifact_id !== "string") return null;
  return {
    artifact_id: r.artifact_id,
    ...(r.role === null || typeof r.role === "string" ? { role: r.role } : {}),
    ...(r.selection === null || typeof r.selection === "string" ? { selection: r.selection } : {}),
  };
}

function validateMediaInput(input: unknown): ComposerMediaInput | null {
  if (input === null || input === undefined || typeof input !== "object") return null;
  const m = input as Record<string, unknown>;
  const kind = m.kind;
  if (typeof kind !== "string" || !VALID_MEDIA_KINDS.has(kind)) return null;
  const transcriptSource = m.transcript_source;
  if (
    transcriptSource !== undefined &&
    transcriptSource !== null &&
    transcriptSource !== "client" &&
    transcriptSource !== "daemon" &&
    transcriptSource !== "provider" &&
    transcriptSource !== "external"
  ) return null;
  if (m.derived_refs !== undefined && !Array.isArray(m.derived_refs)) return null;
  return {
    kind: kind as ComposerMediaInput["kind"],
    ...(typeof m.artifact_id === "string" ? { artifact_id: m.artifact_id } : {}),
    ...(m.url === null || typeof m.url === "string" ? { url: m.url } : {}),
    ...(m.caption === null || typeof m.caption === "string" ? { caption: m.caption } : {}),
    ...(m.transcript_artifact_id === null || typeof m.transcript_artifact_id === "string"
      ? { transcript_artifact_id: m.transcript_artifact_id }
      : {}),
    ...(m.transcript_text === null || typeof m.transcript_text === "string"
      ? { transcript_text: m.transcript_text }
      : {}),
    ...(transcriptSource !== undefined ? { transcript_source: transcriptSource } : {}),
    ...(Array.isArray(m.derived_refs) ? { derived_refs: m.derived_refs as string[] } : {}),
  };
}

function validateContextRef(ref: unknown): ComposerContextRef | null {
  if (ref === null || ref === undefined || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  const kind = r.kind;
  if (typeof kind !== "string" || !VALID_CONTEXT_REF_KINDS.has(kind)) return null;
  if (kind === "project") {
    if (typeof r.project_id !== "string") return null;
    return { kind: "project", project_id: r.project_id };
  }
  if (kind === "artifact") {
    if (typeof r.artifact_id !== "string") return null;
    return { kind: "artifact", artifact_id: r.artifact_id };
  }
  if (kind === "session") {
    if (typeof r.session_id !== "string") return null;
    return { kind: "session", session_id: r.session_id };
  }
  if (kind === "work_item") {
    if (typeof r.work_item_key !== "string") return null;
    return { kind: "work_item", work_item_key: r.work_item_key };
  }
  return null;
}

function validateDelegationPolicy(policy: unknown): ComposerDelegationPolicy | null {
  if (policy === null || policy === undefined) {
    return { allow_subagents: true, max_subagents: 3, require_preview_for_mutations: true };
  }
  if (typeof policy !== "object") return null;
  const p = policy as Record<string, unknown>;
  if (typeof p.allow_subagents !== "boolean") return null;
  if (typeof p.max_subagents !== "number") return null;
  if (typeof p.require_preview_for_mutations !== "boolean") return null;
  return {
    allow_subagents: p.allow_subagents,
    max_subagents: p.max_subagents,
    require_preview_for_mutations: p.require_preview_for_mutations,
  };
}

function validateTranscription(t: unknown): ComposerTranscription | null {
  if (t === null || t === undefined) return { mode: "auto" as ComposerTranscriptionMode };
  if (typeof t !== "object") return null;
  const tr = t as Record<string, unknown>;
  const mode = tr.mode;
  if (typeof mode !== "string" || !VALID_TRANSCRIPTION_MODES.has(mode)) return null;
  return {
    mode: mode as ComposerTranscriptionMode,
    ...(typeof tr.language === "string" ? { language: tr.language } : {}),
    ...(typeof tr.allow_client_transcript === "boolean"
      ? { allow_client_transcript: tr.allow_client_transcript }
      : {}),
  };
}

function validateCreateInput(data: unknown): {
  ok: true;
  input: CreateComposerTurnInput;
} | {
  ok: false;
  error: string;
} {
  if (data === null || data === undefined || typeof data !== "object") {
    return { ok: false, error: "request body must be a non-null object" };
  }
  const d = data as Record<string, unknown>;

  const scope = validateScope(d.scope);
  if (!scope) return { ok: false, error: "scope.kind is required and must be a valid kind" };

  const message = d.message;
  if (typeof message !== "string" || message.length === 0) return { ok: false, error: "message is required and must be a non-empty string" };

  const id = d.id;
  if (id !== undefined && typeof id !== "string") {
    return { ok: false, error: "id must be a string" };
  }

  const artifact_refs = d.artifact_refs;
  if (artifact_refs !== undefined && !Array.isArray(artifact_refs)) {
    return { ok: false, error: "artifact_refs must be an array" };
  }
  const artifactRefResults = artifact_refs
    ? (artifact_refs as unknown[]).map(validateArtifactRef)
    : [];
  const nullArtifactIdx = artifactRefResults.findIndex((r) => r === null);
  if (nullArtifactIdx !== -1) {
    return { ok: false, error: "artifact_refs entries must have artifact_id string" };
  }
  const parsedArtifactRefs = artifactRefResults as ComposerArtifactRef[];

  const media_inputs = d.media_inputs;
  if (media_inputs !== undefined && !Array.isArray(media_inputs)) {
    return { ok: false, error: "media_inputs must be an array" };
  }
  const mediaInputResults = media_inputs
    ? (media_inputs as unknown[]).map(validateMediaInput)
    : [];
  const nullMediaIdx = mediaInputResults.findIndex((m) => m === null);
  if (nullMediaIdx !== -1) {
    return { ok: false, error: "media_inputs entries must have valid kind and shape" };
  }
  const parsedMediaInputs = mediaInputResults as ComposerMediaInput[];

  const context_refs = d.context_refs;
  if (context_refs !== undefined && !Array.isArray(context_refs)) {
    return { ok: false, error: "context_refs must be an array" };
  }
  const contextRefResults = context_refs
    ? (context_refs as unknown[]).map(validateContextRef)
    : [];
  const nullContextIdx = contextRefResults.findIndex((r) => r === null);
  if (nullContextIdx !== -1) {
    return { ok: false, error: "context_refs entries must have valid kind and required id field" };
  }
  const parsedContextRefs = contextRefResults as ComposerContextRef[];

  const intent_hint = d.intent_hint;
  if (intent_hint !== undefined && (typeof intent_hint !== "string" || !VALID_INTENT_HINTS.has(intent_hint))) {
    return { ok: false, error: "intent_hint must be a valid hint value" };
  }

  const allowed_action_classes = d.allowed_action_classes;
  if (allowed_action_classes !== undefined && !Array.isArray(allowed_action_classes)) {
    return { ok: false, error: "allowed_action_classes must be an array" };
  }
  if (allowed_action_classes !== undefined && (allowed_action_classes as unknown[]).some((c) => typeof c !== "string" || !VALID_ACTION_CLASSES.has(c))) {
    return { ok: false, error: "allowed_action_classes entries must be valid action class strings" };
  }

  const delegation_policy = validateDelegationPolicy(d.delegation_policy);
  if (!delegation_policy) return { ok: false, error: "delegation_policy must be an object with boolean fields" };

  const provider_chain = d.provider_chain;
  if (provider_chain !== undefined && !Array.isArray(provider_chain)) {
    return { ok: false, error: "provider_chain must be an array" };
  }
  if (provider_chain !== undefined && (provider_chain as unknown[]).some((p) => typeof p !== "string")) {
    return { ok: false, error: "provider_chain entries must be strings" };
  }

  const transcription = validateTranscription(d.transcription);
  if (!transcription) return { ok: false, error: "transcription.mode must be valid" };

  const max_cost_usd = d.max_cost_usd;
  if (max_cost_usd !== undefined && (typeof max_cost_usd !== "number" || max_cost_usd < 0)) {
    return { ok: false, error: "max_cost_usd must be a non-negative number" };
  }

  const approval_policy = d.approval_policy;
  if (approval_policy !== undefined && approval_policy !== "preview_required" && approval_policy !== "auto_approved") {
    return { ok: false, error: "approval_policy must be 'preview_required' or 'auto_approved'" };
  }

  return {
    ok: true,
    input: {
      ...(id ? { id: id as string } : {}),
      scope,
      message,
      ...(parsedArtifactRefs.length > 0 ? { artifact_refs: parsedArtifactRefs } : {}),
      ...(parsedMediaInputs.length > 0 ? { media_inputs: parsedMediaInputs } : {}),
      ...(parsedContextRefs.length > 0 ? { context_refs: parsedContextRefs } : {}),
      ...(intent_hint ? { intent_hint: intent_hint as ComposerIntentHint } : {}),
      ...(allowed_action_classes && (allowed_action_classes as string[]).length > 0
        ? { allowed_action_classes: allowed_action_classes as readonly ComposerActionClass[] }
        : {}),
      ...(delegation_policy ? { delegation_policy } : {}),
      ...(provider_chain && (provider_chain as string[]).length > 0
        ? { provider_chain: provider_chain as readonly string[] }
        : {}),
      ...(transcription ? { transcription } : {}),
      ...(max_cost_usd !== undefined ? { max_cost_usd } : {}),
      ...(approval_policy ? { approval_policy: approval_policy as ComposerApprovalPolicy } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleComposer(
  req: Request,
  deps: ComposerDeps,
  pathname: string,
): Promise<Response | undefined> {
  const registry = deps.registry ?? new ComposerTurnRegistry(requiredDb(deps));
  // Strip query string from pathname for route matching
  const cleanPathname = pathname.split("?")[0]!;

  // GET /v1/composer/turns
  if (req.method === "GET" && cleanPathname === "/v1/composer/turns") {
    const url = new URL(req.url);
    const filter: {
      scope_kind?: ComposerTurnScopeKind;
      scope_id?: string;
      status?: ComposerTurnStatus;
      control_subagent_run_id?: string;
      limit?: number;
      cursor?: string;
    } = {};
    const scopeKind = url.searchParams.get("scope_kind");
    if (scopeKind !== null) filter.scope_kind = scopeKind as ComposerTurnScopeKind;
    const scopeId = url.searchParams.get("scope_id");
    if (scopeId !== null) filter.scope_id = scopeId;
    const status = url.searchParams.get("status");
    if (status !== null) filter.status = status as ComposerTurnStatus;
    const controlSubagentRunId = url.searchParams.get("control_subagent_run_id");
    if (controlSubagentRunId !== null) filter.control_subagent_run_id = controlSubagentRunId;
    const limitStr = url.searchParams.get("limit");
    if (limitStr !== null) filter.limit = Number.parseInt(limitStr, 10);
    const cursor = url.searchParams.get("cursor");
    if (cursor !== null) filter.cursor = cursor;
    const turns = registry.list(filter);
    return jsonResponse(200, turnListResponse(turns, filter));
  }

  // POST /v1/composer/turns
  if (req.method === "POST" && cleanPathname === "/v1/composer/turns") {
    const parsed = await parseJsonBody(req);
    if ("error" in parsed) {
      const err = parsed.error;
      const clone = err.clone();
      const json = await clone.json() as { error?: { code?: string; message?: string } };
      if (json?.error?.code === "bad_request") {
        return errorResponse(400, "validation_error", json.error.message ?? "validation error");
      }
      return err;
    }

    const validated = validateCreateInput(parsed.data);
    if (!validated.ok) return errorResponse(400, "validation_error", validated.error);

    const turn = registry.create(validated.input);
    emitTurnChanged(deps, turn);
    return jsonResponse(201, turnResponse(turn));
  }

  // Non-GET/POST methods on /v1/composer/turns → 405
  if (cleanPathname === "/v1/composer/turns") {
    return methodNotAllowed();
  }

  // POST /v1/composer/turns/:id/cancel — must come before singleMatch
  const cancelMatch = pathname.match(/^\/v1\/composer\/turns\/([^/]+)\/cancel$/);
  if (cancelMatch) {
    if (req.method !== "POST") return methodNotAllowed();
    const id = cancelMatch[1]!;
    try {
      const turn = registry.updateStatus(id, "cancelled");
      emitTurnChanged(deps, turn);
      return jsonResponse(200, turnResponse(turn));
    } catch (err) {
      if (err instanceof ComposerTurnNotFoundError) {
        return errorResponse(404, "composer_turn_not_found", err.message);
      }
      return errorResponse(500, "internal_error", String(err));
    }
  }

  // GET /v1/composer/turns/:id
  const singleMatch = pathname.match(/^\/v1\/composer\/turns\/([^/]+)$/);
  if (singleMatch) {
    const id = singleMatch[1]!;

    if (req.method === "GET") {
      try {
        const turn = registry.getById(id);
        return jsonResponse(200, turnResponse(turn));
      } catch (err) {
        if (err instanceof ComposerTurnNotFoundError) {
          return errorResponse(404, "composer_turn_not_found", err.message);
        }
        return errorResponse(500, "internal_error", String(err));
      }
    }

    if (req.method === "DELETE") {
      try {
        registry.delete(id);
        return jsonResponse(204, null);
      } catch (err) {
        if (err instanceof ComposerTurnNotFoundError) {
          return errorResponse(404, "composer_turn_not_found", err.message);
        }
        return errorResponse(500, "internal_error", String(err));
      }
    }

    return methodNotAllowed();
  }

  // GET /v1/composer/turns/:id/chunks
  const chunksMatch = cleanPathname.match(/^\/v1\/composer\/turns\/([^/]+)\/chunks$/);
  if (chunksMatch) {
    if (req.method !== "GET") return methodNotAllowed();
    const id = chunksMatch[1]!;
    try {
      registry.getById(id); // verify it exists
    } catch (err) {
      if (err instanceof ComposerTurnNotFoundError) {
        return errorResponse(404, "composer_turn_not_found", err.message);
      }
      return errorResponse(500, "internal_error", String(err));
    }

    const url = new URL(req.url);
    const replay = url.searchParams.get("replay") === "true";

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writeSSEChunk = (data: unknown): void => {
          const line = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(line));
        };

        writeSSEChunk({ composer_turn_id: id, type: "start" });

        if (!deps.logFile) {
          writeSSEChunk({ composer_turn_id: id, type: "end" });
          controller.close();
          return;
        }

        const logPath = deps.logFile();
        if (!existsSync(logPath)) {
          writeSSEChunk({ composer_turn_id: id, type: "end" });
          controller.close();
          return;
        }

        if (replay) {
          const fileStream = createReadStream(logPath, { encoding: "utf-8" });
          const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

          rl.on("line", (line) => {
            if (line.length === 0) return;
            try {
              const envelope = JSON.parse(line) as EventEnvelope;
              if (
                envelope.topic === "agent.chunk" &&
                (envelope.data as Record<string, unknown>).composer_turn_id === id
              ) {
                writeSSEChunk(envelope.data);
              }
            } catch {
              // skip malformed lines
            }
          });

          rl.on("close", () => {
            writeSSEChunk({ composer_turn_id: id, type: "end" });
            controller.close();
          });

          rl.on("error", () => {
            writeSSEChunk({ composer_turn_id: id, type: "end" });
            controller.close();
          });
        } else {
          writeSSEChunk({ composer_turn_id: id, type: "end" });
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

  // GET /v1/composer/turns/:id/launched
  const launchedMatch = pathname.match(/^\/v1\/composer\/turns\/([^/]+)\/launched$/);
  if (launchedMatch) {
    if (req.method !== "GET") return methodNotAllowed();
    const id = launchedMatch[1]!;
    try {
      const turn = registry.getById(id);
      return jsonResponse(200, { _v: 1, launched_refs: turn.launched_refs });
    } catch (err) {
      if (err instanceof ComposerTurnNotFoundError) {
        return errorResponse(404, "composer_turn_not_found", err.message);
      }
      return errorResponse(500, "internal_error", String(err));
    }
  }

  return undefined;
}

function requiredDb(deps: ComposerDeps): Database {
  if (!deps.db) throw new Error("ComposerDeps requires either registry or db");
  return deps.db;
}

function emitTurnChanged(deps: ComposerDeps, turn: ComposerTurn): void {
  if (deps.events) {
    void deps.events.append("composer.turn.changed", {
      composer_turn_id: turn.id,
      status: turn.status,
      scope: turn.scope,
      updated_at: turn.updated_at,
    });
  }
}
