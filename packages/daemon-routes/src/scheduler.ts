import type { SchedulerService } from "@aloop/scheduler";
import { SCHEDULER_KNOB_BOUNDS } from "@aloop/scheduler-limits";

export type SchedulerDeps = {
  readonly scheduler: SchedulerService;
};

export async function handleScheduler(
  req: Request,
  deps: SchedulerDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname === "/v1/scheduler/limits") {
    if (req.method === "GET") {
      const limits = deps.scheduler.currentLimits();
      return jsonResponse(200, {
        _v: 1,
        max_permits: limits.concurrencyCap,
        permit_ttl_default_seconds: limits.permitTtlDefaultSeconds,
        permit_ttl_max_seconds: limits.permitTtlMaxSeconds,
        system_limits: {
          cpu_max_pct: limits.systemLimits.cpuMaxPct,
          mem_max_pct: limits.systemLimits.memMaxPct,
          load_max: limits.systemLimits.loadMax,
        },
        burn_rate: {
          max_tokens_since_commit: limits.burnRate.maxTokensSinceCommit,
          min_commits_per_hour: limits.burnRate.minCommitsPerHour,
        },
      });
    }
    if (req.method !== "PUT") return methodNotAllowed();

    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;

    const updated = await deps.scheduler.updateLimits(parsed.data);
    if (!updated.ok) {
      if ("errors" in updated) {
        return badRequest("invalid scheduler limits", { errors: updated.errors });
      }
      return jsonResponse(422, {
        _v: 1,
        error: {
          code: "tune_out_of_bounds",
          message: "scheduler tuning request violates hard bounds",
          details: { violations: updated.violations },
        },
      });
    }
    return jsonResponse(200, {
        _v: 1,
        max_permits: updated.limits.concurrencyCap,
        permit_ttl_default_seconds: updated.limits.permitTtlDefaultSeconds,
        permit_ttl_max_seconds: updated.limits.permitTtlMaxSeconds,
        system_limits: {
          cpu_max_pct: updated.limits.systemLimits.cpuMaxPct,
          mem_max_pct: updated.limits.systemLimits.memMaxPct,
          load_max: updated.limits.systemLimits.loadMax,
        },
        burn_rate: {
          max_tokens_since_commit: updated.limits.burnRate.maxTokensSinceCommit,
          min_commits_per_hour: updated.limits.burnRate.minCommitsPerHour,
        },
      });
  }

  if (pathname === "/v1/scheduler/tune") {
    if (req.method !== "POST") return methodNotAllowed();

    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;

    const body = parsed.data as {
      result?: unknown;
    };

    if (typeof body.result !== "object" || body.result === null) {
      return badRequest("result field is required and must be an object");
    }

    const result = body.result as Record<string, unknown>;
    const adjustments = result.adjustments;

    if (!Array.isArray(adjustments)) {
      return badRequest("result.adjustments must be an array");
    }

    const patch: Record<string, unknown> = {};
    const accepted: string[] = [];
    const rejected: string[] = [];

    for (const adj of adjustments as unknown[]) {
      if (typeof adj !== "object" || adj === null) continue;
      const a = adj as Record<string, unknown>;
      const knob = typeof a.knob === "string" ? a.knob : null;
      const proposed = typeof a.proposed === "number" ? a.proposed : null;
      const acceptedFlag = a.accepted === true;

      if (!knob || proposed === null) continue;

      const bound = knobBoundFor(knob);
      if (bound === undefined) continue;

      if (proposed < bound.min || proposed > bound.max) {
        rejected.push(knob);
        continue;
      }

      if (acceptedFlag) {
        const patchKey = knobToPatchKey(knob);
        if (patchKey !== null) {
          patch[patchKey] = proposed;
          accepted.push(knob);
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse(200, {
        _v: 1,
        adjustments: accepted.map((knob) => ({
          knob,
          proposed: null as unknown,
          accepted: false,
          rationale: "no valid adjustments to apply",
        })),
      });
    }

    const updated = await deps.scheduler.updateLimits(patch);
    if (!updated.ok) {
      if ("errors" in updated) {
        return badRequest("invalid scheduler limits", { errors: updated.errors });
      }
      return jsonResponse(422, {
        _v: 1,
        error: {
          code: "tune_out_of_bounds",
          message: "scheduler tuning request violates hard bounds",
          details: { violations: updated.violations },
        },
      });
    }

    return jsonResponse(200, {
      _v: 1,
      adjustments: accepted.map((knob) => ({
        knob,
        proposed: patch[knobToPatchKey(knob)!],
        accepted: true,
        rationale: "applied via orch_tune agent",
      })),
    });
  }

  if (pathname === "/v1/scheduler/permits") {
    if (req.method === "GET") {
      return jsonResponse(200, { items: deps.scheduler.listPermits() });
    }
    if (req.method !== "POST") return methodNotAllowed();

    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;

    const sessionId = asNonEmptyString(parsed.data.session_id);
    const composerTurnId = asNonEmptyString(parsed.data.composer_turn_id);
    const controlSubagentRunId = asNonEmptyString(parsed.data.control_subagent_run_id);
    const projectId = asNonEmptyString(parsed.data.project_id) ?? null;
    const providerCandidate = asNonEmptyString(parsed.data.provider_candidate);
    const ttlSeconds = asPositiveInt(parsed.data.ttl_seconds);
    const estimatedCostUsd = asNonNegativeNumber(parsed.data.estimated_cost_usd);
    if (!sessionId && !composerTurnId && !controlSubagentRunId) {
      return badRequest("session_id is required (or composer_turn_id or control_subagent_run_id)");
    }
    const owners = [
      sessionId ? { sessionId } : undefined,
      composerTurnId ? { composerTurnId } : undefined,
      controlSubagentRunId ? { controlSubagentRunId } : undefined,
    ].filter((owner): owner is { sessionId: string } | { composerTurnId: string } | { controlSubagentRunId: string } => owner !== undefined);
    if (owners.length > 1) return badRequest("only one owner field may be provided");
    if (!providerCandidate) return badRequest("provider_candidate is required");
    if (ttlSeconds === "invalid") return badRequest("ttl_seconds must be a positive integer");
    if (estimatedCostUsd === "invalid") return badRequest("estimated_cost_usd must be a non-negative number");

    const decision = await deps.scheduler.acquirePermit({
      ...owners[0]!,
      projectId,
      providerCandidate,
      ...(typeof ttlSeconds === "number" ? { ttlSeconds } : {}),
      ...(typeof estimatedCostUsd === "number" ? { estimatedCostUsd } : {}),
    });
    if (!decision.granted) return jsonResponse(200, { _v: 1, ...decision });
    return jsonResponse(200, { _v: 1, granted: true, permit: decision.permit });
  }

  if (!pathname.startsWith("/v1/scheduler/permits/")) return undefined;
  if (req.method !== "DELETE") return methodNotAllowed();

  const id = pathname.slice("/v1/scheduler/permits/".length);
  if (id.length === 0) return notFoundResponse(pathname);
  const released = await deps.scheduler.releasePermit(id);
  if (!released) return notFoundResponse(pathname);
  return new Response(null, { status: 204 });
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asPositiveInt(value: unknown): number | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return "invalid";
  return value;
}

function asNonNegativeNumber(value: unknown): number | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "invalid";
  return value;
}

function knobBoundFor(knob: string): { min: number; max: number } | undefined {
  switch (knob) {
    case "scheduler.concurrency.cap": return SCHEDULER_KNOB_BOUNDS.concurrencyCap;
    case "scheduler.burn_rate.max_tokens_since_commit": return SCHEDULER_KNOB_BOUNDS.maxTokensSinceCommit;
    case "scheduler.burn_rate.min_commits_per_hour": return SCHEDULER_KNOB_BOUNDS.minCommitsPerHour;
    case "scheduler.system.cpu_max_pct": return SCHEDULER_KNOB_BOUNDS.cpuMaxPct;
    case "scheduler.system.mem_max_pct": return SCHEDULER_KNOB_BOUNDS.memMaxPct;
    case "scheduler.permit_ttl_default_seconds": return SCHEDULER_KNOB_BOUNDS.permitTtlDefaultSeconds;
    case "scheduler.permit_ttl_max_seconds": return SCHEDULER_KNOB_BOUNDS.permitTtlDefaultSeconds;
    case "watchdog.stuck_threshold_seconds": return SCHEDULER_KNOB_BOUNDS.watchdogStuckThresholdSeconds;
    case "scheduler.system.load_max": return SCHEDULER_KNOB_BOUNDS.loadMax;
    default: return undefined;
  }
}

function knobToPatchKey(knob: string): string | null {
  switch (knob) {
    case "scheduler.concurrency.cap": return "max_permits";
    case "scheduler.burn_rate.max_tokens_since_commit": return "max_tokens_since_commit";
    case "scheduler.burn_rate.min_commits_per_hour": return "min_commits_per_hour";
    case "scheduler.system.cpu_max_pct": return "cpu_max_pct";
    case "scheduler.system.mem_max_pct": return "mem_max_pct";
    case "scheduler.permit_ttl_default_seconds": return "permit_ttl_default_seconds";
    case "scheduler.permit_ttl_max_seconds": return "permit_ttl_max_seconds";
    case "watchdog.stuck_threshold_seconds": return "watchdog_stuck_threshold_seconds";
    case "scheduler.system.load_max": return "load_max";
    default: return null;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): Response {
  return jsonResponse(status, {
    error: { _v: 1, code, message, details },
  });
}

function badRequest(message: string, details: Record<string, unknown> = {}): Response {
  return errorResponse(400, "bad_request", message, details);
}

function notFoundResponse(path: string): Response {
  return errorResponse(404, "not_found", `No route: ${path}`, { path });
}

function methodNotAllowed(): Response {
  return errorResponse(405, "method_not_allowed", "method not allowed for this resource");
}

async function parseJsonBody(
  req: Request,
): Promise<{ data: Record<string, unknown> } | { error: Response }> {
  try {
    const text = await req.text();
    if (text.length === 0) return { data: {} };
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { error: badRequest("request body must be a JSON object") };
    }
    return { data: parsed as Record<string, unknown> };
  } catch {
    return { error: badRequest("invalid JSON body") };
  }
}
