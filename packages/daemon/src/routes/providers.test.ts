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
});
