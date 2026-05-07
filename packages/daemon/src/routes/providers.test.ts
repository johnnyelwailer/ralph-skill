import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../daemon/start.ts";
import { resolveDaemonPaths } from "@aloop/daemon-config";

describe("/v1/providers/overrides", () => {
  let home: string;
  let daemon: RunningDaemon;
  let baseUrl: string;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "aloop-home-"));
    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
      dbPath: ":memory:",
    });
    baseUrl = `http://${daemon.http.hostname}:${daemon.http.port}`;
  });

  afterEach(async () => {
    await daemon.stop().catch(() => {});
    rmSync(home, { recursive: true, force: true });
  });

  test("GET returns the current override document", async () => {
    const res = await fetch(`${baseUrl}/v1/providers/overrides`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.allow).toBeNull();
    expect(body.deny).toBeNull();
    expect(body.force).toBeNull();
  });

  test("GET /v1/providers returns registered providers with health", async () => {
    const res = await fetch(`${baseUrl}/v1/providers`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      _v: number;
      items: Array<{ id: string; health: { status: string } }>;
    };
    expect(body._v).toBe(1);
    expect(body.items.map((item) => item.id)).toContain("opencode");
    const opencode = body.items.find((item) => item.id === "opencode");
    expect(opencode?.health.status).toBe("unknown");
  });

  test("PUT persists and returns the new overrides", async () => {
    const res = await fetch(`${baseUrl}/v1/providers/overrides`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allow: ["codex"], force: "codex" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: string[]; force: string };
    expect(body.allow).toEqual(["codex"]);
    expect(body.force).toBe("codex");

    const after = await fetch(`${baseUrl}/v1/providers/overrides`).then(
      (r) => r.json() as Promise<{ force: string }>,
    );
    expect(after.force).toBe("codex");
  });

  test("DELETE resets overrides to defaults", async () => {
    await fetch(`${baseUrl}/v1/providers/overrides`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deny: ["opencode"] }),
    });

    const res = await fetch(`${baseUrl}/v1/providers/overrides`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allow: null; deny: null; force: null };
    expect(body.allow).toBeNull();
    expect(body.deny).toBeNull();
    expect(body.force).toBeNull();
  });

  test("GET /v1/providers/opencode/quota returns 501 when probe is unavailable", async () => {
    const res = await fetch(`${baseUrl}/v1/providers/opencode/quota`, {
      headers: { "x-aloop-auth-handle": "auth_1" },
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quota_probe_unavailable");
  });

  test("POST /v1/providers/resolve-chain returns current resolved chain", async () => {
    const res = await fetch(`${baseUrl}/v1/providers/resolve-chain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { _v: number; resolved_chain: string[] };
    expect(body._v).toBe(1);
    expect(body.resolved_chain).toEqual(["opencode", "opencode-cli"]);
  });

  test("POST /v1/providers/resolve-chain reflects live overrides", async () => {
    await fetch(`${baseUrl}/v1/providers/overrides`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deny: ["opencode"] }),
    });
    const res = await fetch(`${baseUrl}/v1/providers/resolve-chain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_2" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resolved_chain: string[]; excluded_overrides: string[] };
    expect(body.resolved_chain).toEqual(["opencode-cli"]);
    expect(body.excluded_overrides).toEqual(["opencode"]);
  });
});
