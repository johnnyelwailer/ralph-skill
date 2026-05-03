import { badRequest, errorResponse, jsonResponse, methodNotAllowed, notFoundResponse, parseJsonBody } from "@aloop/daemon-routes";
import type { TriggerStore } from "./trigger-store.ts";
import type { CreateTriggerInput, PatchTriggerInput } from "./trigger-types.ts";

export type TriggersDeps = {
  readonly store: TriggerStore;
};

const VALID_SCOPE_KINDS = ["project", "workspace", "incubation_monitor", "global"] as const;
const VALID_SOURCE_KINDS = ["time", "event"] as const;
const VALID_ACTION_KINDS = ["tick_monitor", "create_research_run", "queue_orchestrator_trigger", "emit_alert"] as const;

function validateScopeKind(kind: unknown): string | undefined {
  if (typeof kind !== "string") return "scope.kind must be a string";
  if (!VALID_SCOPE_KINDS.includes(kind as typeof VALID_SCOPE_KINDS[number])) {
    return `scope.kind must be one of: ${VALID_SCOPE_KINDS.join(", ")}`;
  }
  return undefined;
}

function validateTriggerSourceKind(kind: unknown): string | undefined {
  if (typeof kind !== "string") return "source.kind must be a string";
  if (!VALID_SOURCE_KINDS.includes(kind as typeof VALID_SOURCE_KINDS[number])) {
    return `source.kind must be one of: ${VALID_SOURCE_KINDS.join(", ")}`;
  }
  return undefined;
}

function validateActionKind(kind: unknown): string | undefined {
  if (typeof kind !== "string") return "action.kind must be a string";
  if (!VALID_ACTION_KINDS.includes(kind as typeof VALID_ACTION_KINDS[number])) {
    return `action.kind must be one of: ${VALID_ACTION_KINDS.join(", ")}`;
  }
  return undefined;
}

function validateCreateTriggerInput(data: unknown): { input?: CreateTriggerInput; error?: Response } {
  if (data === null || typeof data !== "object") {
    return { error: badRequest("request body must be a non-null object") };
  }

  const obj = data as Record<string, unknown>;

  // scope is required
  if (!("scope" in obj) || obj.scope === null || typeof obj.scope !== "object") {
    return { error: badRequest("scope is required and must be an object") };
  }
  const scope = obj.scope as Record<string, unknown>;
  const scopeKindErr = validateScopeKind(scope.kind);
  if (scopeKindErr) return { error: badRequest(scopeKindErr) };
  if (scope.kind !== "global" && (scope.id === undefined || typeof scope.id !== "string")) {
    return { error: badRequest("scope.id must be a string for non-global triggers") };
  }

  // source is required
  if (!("source" in obj) || obj.source === null || typeof obj.source !== "object") {
    return { error: badRequest("source is required and must be an object") };
  }
  const source = obj.source as Record<string, unknown>;
  const sourceKindErr = validateTriggerSourceKind(source.kind);
  if (sourceKindErr) return { error: badRequest(sourceKindErr) };

  // action is required
  if (!("action" in obj) || obj.action === null || typeof obj.action !== "object") {
    return { error: badRequest("action is required and must be an object") };
  }
  const action = obj.action as Record<string, unknown>;
  const actionKindErr = validateActionKind(action.kind);
  if (actionKindErr) return { error: badRequest(actionKindErr) };
  if (typeof action.target !== "object" || action.target === null) {
    return { error: badRequest("action.target is required and must be an object") };
  }

  // optional budget_policy
  let budget_policy = undefined;
  if ("budget_policy" in obj && obj.budget_policy !== undefined) {
    if (typeof obj.budget_policy !== "object" || obj.budget_policy === null) {
      return { error: badRequest("budget_policy must be an object") };
    }
    const bp = obj.budget_policy as Record<string, unknown>;
    if (typeof bp.max_cost_usd_per_fire !== "number" || bp.max_cost_usd_per_fire < 0) {
      return { error: badRequest("budget_policy.max_cost_usd_per_fire must be a non-negative number") };
    }
    budget_policy = { max_cost_usd_per_fire: bp.max_cost_usd_per_fire };
  }

  // optional debounce_seconds
  let debounce_seconds = undefined;
  if ("debounce_seconds" in obj && obj.debounce_seconds !== undefined) {
    if (typeof obj.debounce_seconds !== "number" || !Number.isInteger(obj.debounce_seconds) || obj.debounce_seconds < 0) {
      return { error: badRequest("debounce_seconds must be a non-negative integer") };
    }
    debounce_seconds = obj.debounce_seconds;
  }

  // optional enabled
  let enabled = undefined;
  if ("enabled" in obj && obj.enabled !== undefined) {
    if (typeof obj.enabled !== "boolean") {
      return { error: badRequest("enabled must be a boolean") };
    }
    enabled = obj.enabled;
  }

  const input: CreateTriggerInput = {
    scope: {
      kind: scope.kind,
      id: scope.id === "global" || scope.kind === "global" ? null : (scope.id as string | null),
    },
    source: {
      kind: source.kind,
      schedule: typeof source.schedule === "string" ? source.schedule : undefined,
      topic: source.topic === null || typeof source.topic === "string" ? source.topic : undefined,
      filters:
        source.filters && typeof source.filters === "object"
          ? (source.filters as Record<string, unknown>)
          : undefined,
    },
    action: {
      kind: action.kind,
      target: action.target as Record<string, unknown>,
    },
    ...(budget_policy !== undefined ? { budget_policy } : {}),
    ...(debounce_seconds !== undefined ? { debounce_seconds } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  };

  return { input };
}

function validatePatchInput(data: unknown): { input?: PatchTriggerInput; error?: Response } {
  if (data === null || typeof data !== "object") {
    return { error: badRequest("request body must be a non-null object") };
  }
  const obj = data as Record<string, unknown>;

  const input: Record<string, unknown> = {};

  if ("scope" in obj && obj.scope !== undefined) {
    if (typeof obj.scope !== "object" || obj.scope === null) {
      return { error: badRequest("scope must be an object") };
    }
    const scope = obj.scope as Record<string, unknown>;
    const scopeKindErr = validateScopeKind(scope.kind);
    if (scopeKindErr) return { error: badRequest(scopeKindErr) };
    input.scope = {
      kind: scope.kind,
      id: scope.id === null || scope.kind === "global" ? null : (scope.id as string | null),
    };
  }

  if ("source" in obj && obj.source !== undefined) {
    if (typeof obj.source !== "object" || obj.source === null) {
      return { error: badRequest("source must be an object") };
    }
    const source = obj.source as Record<string, unknown>;
    const sourceKindErr = validateTriggerSourceKind(source.kind);
    if (sourceKindErr) return { error: badRequest(sourceKindErr) };
    input.source = {
      kind: source.kind,
      schedule: typeof source.schedule === "string" ? source.schedule : undefined,
      topic: source.topic === null || typeof source.topic === "string" ? source.topic : undefined,
      filters: source.filters as Record<string, unknown> | undefined,
    };
  }

  if ("action" in obj && obj.action !== undefined) {
    if (typeof obj.action !== "object" || obj.action === null) {
      return { error: badRequest("action must be an object") };
    }
    const action = obj.action as Record<string, unknown>;
    const actionKindErr = validateActionKind(action.kind);
    if (actionKindErr) return { error: badRequest(actionKindErr) };
    input.action = {
      kind: action.kind,
      target: action.target as Record<string, unknown>,
    };
  }

  if ("budget_policy" in obj) {
    if (obj.budget_policy === null) {
      input.budget_policy = null;
    } else if (typeof obj.budget_policy === "object" && obj.budget_policy !== null) {
      const bp = obj.budget_policy as Record<string, unknown>;
      if (typeof bp.max_cost_usd_per_fire !== "number" || bp.max_cost_usd_per_fire < 0) {
        return { error: badRequest("budget_policy.max_cost_usd_per_fire must be a non-negative number") };
      }
      input.budget_policy = { max_cost_usd_per_fire: bp.max_cost_usd_per_fire };
    } else {
      return { error: badRequest("budget_policy must be an object or null") };
    }
  }

  if ("debounce_seconds" in obj && obj.debounce_seconds !== undefined) {
    if (typeof obj.debounce_seconds !== "number" || !Number.isInteger(obj.debounce_seconds) || obj.debounce_seconds < 0) {
      return { error: badRequest("debounce_seconds must be a non-negative integer") };
    }
    input.debounce_seconds = obj.debounce_seconds;
  }

  if ("enabled" in obj && obj.enabled !== undefined) {
    if (typeof obj.enabled !== "boolean") {
      return { error: badRequest("enabled must be a boolean") };
    }
    input.enabled = obj.enabled;
  }

  return { input: input as unknown as PatchTriggerInput };
}

export async function handleTriggers(
  req: Request,
  deps: TriggersDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/triggers")) return undefined;

  // GET /v1/triggers — list all triggers
  if (pathname === "/v1/triggers") {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const scopeKind = url.searchParams.get("scope_kind") ?? undefined;
      const scopeId = url.searchParams.get("scope_id") ?? undefined;
      const enabled = url.searchParams.get("enabled");
      const items = deps.store.list({
        scope_kind: scopeKind ?? undefined,
        scope_id: scopeId === "" ? null : scopeId ?? undefined,
        enabled: enabled === "true" ? true : enabled === "false" ? false : undefined,
      });
      return jsonResponse(200, { _v: 1, items, next_cursor: null });
    }

    // POST /v1/triggers — create
    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      if ("error" in body) return body.error;
      const validated = validateCreateTriggerInput(body.data);
      if (validated.error) return validated.error;
      const trigger = deps.store.create(validated.input!);
      return jsonResponse(201, { _v: 1, ...trigger });
    }

    return methodNotAllowed();
  }

  // /v1/triggers/:id...
  const rest = pathname.slice("/v1/triggers/".length);
  const segments = rest.split("/");
  const id = segments[0]!;

  if (!id) return notFoundResponse(pathname);

  // GET /v1/triggers/:id
  if (segments.length === 1 && req.method === "GET") {
    try {
      const trigger = deps.store.get(id);
      return jsonResponse(200, { _v: 1, ...trigger });
    } catch (e) {
      if (e instanceof Error && e.constructor.name === "TriggerNotFoundError") {
        // TriggerNotFoundError — handled below
      }
      if (e instanceof Error && e.message.startsWith("Trigger not found")) {
        return notFoundResponse(pathname);
      }
      throw e;
    }
  }

  // PATCH /v1/triggers/:id
  if (segments.length === 1 && req.method === "PATCH") {
    const body = await parseJsonBody(req);
    if ("error" in body) return body.error;
    const validated = validatePatchInput(body.data);
    if (validated.error) return validated.error;
    try {
      const trigger = deps.store.patch(id, validated.input!);
      return jsonResponse(200, { _v: 1, ...trigger });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Trigger not found")) {
        return notFoundResponse(pathname);
      }
      throw e;
    }
  }

  // POST /v1/triggers/:id/fire — manual fire
  if (segments[1] === "fire" && segments.length === 2 && req.method === "POST") {
    try {
      const trigger = deps.store.get(id);
      if (!trigger.enabled) {
        return badRequest("trigger is not enabled");
      }
      // Record the fire — actual trigger execution (creating target work) is done
      // by the trigger engine outside this handler; here we just record that it fired.
      const updated = deps.store.recordFired(id);
      return jsonResponse(200, { _v: 1, ...updated });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Trigger not found")) {
        return notFoundResponse(pathname);
      }
      throw e;
    }
  }

  // DELETE /v1/triggers/:id
  if (segments.length === 1 && req.method === "DELETE") {
    try {
      deps.store.delete(id);
      return new Response(null, { status: 204 });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Trigger not found")) {
        return notFoundResponse(pathname);
      }
      throw e;
    }
  }

  return notFoundResponse(pathname);
}
