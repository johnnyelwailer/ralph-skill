import type { ConfigStore } from "@aloop/daemon-config";
import { parseDaemonConfig } from "@aloop/daemon-config";
import { buildHealth } from "./health.ts";
import { buildCounters } from "./daemon-counters.ts";
import type { SchedulerService } from "@aloop/scheduler";
import type { ProjectRegistry } from "@aloop/state-sqlite";

export type DaemonDeps = {
  readonly startedAt: number;
  readonly config: ConfigStore;
  readonly scheduler: SchedulerService;
  readonly registry: ProjectRegistry;
  readonly sessionsDir: () => string;
};

/**
 * Daemon-scoped routes: health, config view, hot reload.
 *
 *   GET  /v1/daemon/health    canonical v1 health (delegates to buildHealth)
 *   GET  /v1/daemon/config    current effective daemon + overrides config
 *   POST /v1/daemon/reload    re-read daemon.yml + overrides.yml from disk
 *   PUT  /v1/daemon/config    write daemon config at runtime (feature-gated)
 */
export async function handleDaemon(
  req: Request,
  deps: DaemonDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (req.method === "GET" && pathname === "/v1/daemon/health") {
    const counters = buildCounters(deps.sessionsDir(), deps.scheduler);
    return json(200, buildHealth(deps.startedAt, Date.now(), counters));
  }
  if (req.method === "GET" && pathname === "/v1/daemon/config") {
    return json(200, {
      _v: 1,
      daemon: deps.config.daemon(),
      overrides: deps.config.overrides(),
    });
  }
  if (req.method === "POST" && pathname === "/v1/daemon/reload") {
    const result = deps.config.reload();
    if (!result.ok) {
      return json(400, {
        error: { _v: 1, code: "config_invalid", message: "reload failed", details: { errors: result.errors } },
      });
    }
    return json(200, { _v: 1, daemon: result.daemon, overrides: result.overrides });
  }

  // PUT /v1/daemon/config — write daemon config at runtime.
  // Gate: requires features.daemon_config_write = true in daemon.yml.
  if (req.method === "PUT" && pathname === "/v1/daemon/config") {
    if (!deps.config.daemon().features.daemonConfigWrite) {
      return undefined; // feature disabled → fall through to 404
    }
    const current = deps.config.daemon();
    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;
    const result = parseDaemonConfig(parsed.data);
    if (!result.ok) {
      return json(400, {
        error: { _v: 1, code: "bad_request", message: "invalid daemon config", details: { errors: result.errors } },
      });
    }
    // HTTP bind/port require a daemon restart — reject if the client tries to change them.
    const next = result.value;
    const httpChanged =
      next.http.bind !== current.http.bind || next.http.port !== current.http.port;
    if (httpChanged) {
      return json(400, {
        error: {
          _v: 1,
          code: "bad_request",
          message: "http.bind and http.port require a daemon restart to take effect",
          details: { current_bind: current.http.bind, current_port: current.http.port },
        },
      });
    }
    const updated = deps.config.setDaemon(next);
    return json(200, { _v: 1, daemon: updated, overrides: deps.config.overrides() });
  }

  return undefined;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function parseJsonBody(
  req: Request,
): Promise<{ data: Record<string, unknown> } | { error: Response }> {
  try {
    const text = await req.text();
    if (text.length === 0) return { data: {} };
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { error: json(400, { error: { _v: 1, code: "bad_request", message: "request body must be a JSON object" } }) };
    }
    return { data: parsed as Record<string, unknown> };
  } catch {
    return { error: json(400, { error: { _v: 1, code: "bad_request", message: "invalid JSON body" } }) };
  }
}
