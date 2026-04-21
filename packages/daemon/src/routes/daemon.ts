import type { ConfigStore } from "@aloop/daemon-config";
import { buildHealth } from "./health.ts";

export type DaemonDeps = {
  readonly startedAt: number;
  readonly config: ConfigStore;
};

/**
 * Daemon-scoped routes: health, config view, hot reload.
 *
 *   GET  /v1/daemon/health    canonical v1 health (delegates to buildHealth)
 *   GET  /v1/daemon/config    current effective daemon + overrides config
 *   POST /v1/daemon/reload    re-read daemon.yml + overrides.yml from disk
 */
export function handleDaemon(
  req: Request,
  deps: DaemonDeps,
  pathname: string,
): Response | undefined {
  if (req.method === "GET" && pathname === "/v1/daemon/health") {
    return json(200, buildHealth(deps.startedAt));
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
  return undefined;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
