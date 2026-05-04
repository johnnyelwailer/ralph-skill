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
import type { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type ComposerDeps = {
  readonly db: Database;
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
    proposal_refs: turn.proposal_refs,
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
  "global", "project", "incubation_item", "setup_run",
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
  "project", "incubation_item", "session", "work_item",
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
  return { kind, id: s.id as string | undefined };
}

function validateArtifactRef(ref: unknown): ComposerArtifactRef | null {
  if (ref === null || ref === undefined || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  if (typeof r.artifact_id !== "string") return null;
  return {
    artifact_id: r.artifact_id,
    role: r.role as string | null | undefined,
    selection: r.selection as string | null | undefined,
  };
}

function validateMediaInput(input: unknown): ComposerMediaInput | null {
  if (input === null || input === undefined || typeof input !== "object") return null;
  const m = input as Record<string, unknown>;
  const kind = m.kind;
  if (typeof kind !== "string" || !VALID_MEDIA_KINDS.has(kind)) return null;
  return {
    kind: kind as ComposerMediaInput["kind"],
    artifact_id: m.artifact_id as string | undefined,
    url: m.url as string | null | undefined,
    caption: m.caption as string | null | undefined,
    transcript_artifact_id: m.transcript_artifact_id as string | null | undefined,
    transcript_text: m.transcript_text as string | null | undefined,
    transcript_source: m.transcript_source as ComposerMediaInput["transcript_source"],
    derived_refs: m.derived_refs as string[] | undefined,
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
  if (kind === "incubation_item") {
    if (typeof r.item_id !== "string") return null;
    return { kind: "incubation_item", item_id: r.item_id };
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
    language: tr.language as string | undefined,
    allow_client_transcript: tr.allow_client_transcript as boolean | undefined,
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
  if (typeof message !== "string") return { ok: false, error: "message is required and must be a string" };

  const id = d.id;
  if (id !== undefined && typeof id !== "string") {
    return { ok: false, error: "id must be a string" };
  }

  const artifact_refs = d.artifact_refs;
  if (artifact_refs !== undefined && !Array.isArray(artifact_refs)) {
    return { ok: false, error: "artifact_refs must be an array" };
  }
  const parsedArtifactRefs = artifact_refs
    ? (artifact_refs as unknown[]).map(validateArtifactRef)
    : [];
  if (parsedArtifactRefs.some((r) => r === null)) {
    return { ok: false, error: "artifact_refs entries must have artifact_id string" };
  }

  const media_inputs = d.media_inputs;
  if (media_inputs !== undefined && !Array.isArray(media_inputs)) {
    return { ok: false, error: "media_inputs must be an array" };
  }
  const parsedMediaInputs = media_inputs
    ? (media_inputs as unknown[]).map(validateMediaInput)
    : [];
  if (parsedMediaInputs.some((m) => m === null)) {
    return { ok: false, error: "media_inputs entries must have valid kind and shape" };
  }

  const context_refs = d.context_refs;
  if (context_refs !== undefined && !Array.isArray(context_refs)) {
    return { ok: false, error: "context_refs must be an array" };
  }
  const parsedContextRefs = context_refs
    ? (context_refs as unknown[]).map(validateContextRef)
    : [];
  if (parsedContextRefs.some((r) => r === null)) {
    return { ok: false, error: "context_refs entries must have valid kind and required id field" };
  }

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
  const db = deps.db;
  const registry = new ComposerTurnRegistry(db);
  // Strip query string from pathname for route matching
  const cleanPathname = pathname.split("?")[0]!;

  // GET /v1/composer/turns
  if (req.method === "GET" && cleanPathname === "/v1/composer/turns") {
    const url = new URL(req.url);
    const filter: ComposerTurnFilter = {
      scope_kind: url.searchParams.get("scope_kind") as ComposerTurnScopeKind | undefined,
      scope_id: url.searchParams.get("scope_id") ?? undefined,
      status: url.searchParams.get("status") as ComposerTurnStatus | undefined,
      limit: url.searchParams.get("limit")
        ? Number.parseInt(url.searchParams.get("limit")!, 10)
        : undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    };
    const turns = registry.list(filter);
    return jsonResponse(200, turnListResponse(turns, filter));
  }

  // POST /v1/composer/turns
  if (req.method === "POST" && cleanPathname === "/v1/composer/turns") {
    const parsed = await parseJsonBody(req);
    if (parsed.error) return parsed.error;

    const validated = validateCreateInput(parsed.data);
    if (!validated.ok) return errorResponse(400, "validation_error", validated.error);

    const turn = registry.create(validated.input);
    return jsonResponse(201, turnResponse(turn));
  }

  // POST /v1/composer/turns/:id/cancel — must come before singleMatch
  const cancelMatch = pathname.match(/^\/v1\/composer\/turns\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === "POST") {
    const id = cancelMatch[1]!;
    try {
      const turn = registry.updateStatus(id, "cancelled");
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
  }

  // GET /v1/composer/turns/:id/chunks
  const chunksMatch = pathname.match(/^\/v1\/composer\/turns\/([^/]+)\/chunks$/);
  if (chunksMatch && req.method === "GET") {
    // Composer's own turn chunks are stored in its own turn event stream.
    // For now, return an empty replay stream — real-time streaming would need
    // a persistent subscription to the global event bus, same as session turns.
    const id = chunksMatch[1]!;
    try {
      registry.getById(id); // verify it exists
    } catch (err) {
      if (err instanceof ComposerTurnNotFoundError) {
        return errorResponse(404, "composer_turn_not_found", err.message);
      }
      return errorResponse(500, "internal_error", String(err));
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (data: unknown): void => {
          const line = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(line));
        };
        write({ composer_turn_id: id, type: "start" });
        write({ composer_turn_id: id, type: "end" });
        controller.close();
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
  if (launchedMatch && req.method === "GET") {
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
