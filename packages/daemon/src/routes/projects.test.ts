import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../daemon/start.ts";
import { resolveDaemonPaths } from "@aloop/daemon-config";

/**
 * Integration tests for /v1/projects over HTTP. Drives the full daemon
 * (HTTP + router + state) — these are the real endpoints any client would hit.
 */
describe("/v1/projects", () => {
  let home: string;
  let daemon: RunningDaemon;
  let baseUrl: string;
  let projectDir: string;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "aloop-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "aloop-proj-"));
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
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("POST creates a project, returns 201 with canonical shape", async () => {
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: projectDir, name: "demo" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.status).toBe("setup_pending");
    expect(body.name).toBe("demo");
    expect(typeof body.id).toBe("string");
    expect(typeof body.abs_path).toBe("string");
  });

  test("POST returns 400 when abs_path is missing", async () => {
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("POST returns 400 on invalid JSON", async () => {
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  test("POST returns 409 when path is already registered", async () => {
    await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    });
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("project_already_registered");
  });

  test("GET /v1/projects lists registered projects", async () => {
    const created = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    }).then((r) => r.json() as Promise<{ id: string }>);

    const list = await fetch(`${baseUrl}/v1/projects`).then(
      (r) => r.json() as Promise<{ items: Array<{ id: string }>; next_cursor: string | null }>,
    );
    expect(list.items.length).toBe(1);
    expect(list.items[0]!.id).toBe(created.id);
    expect(list.next_cursor).toBeNull();
  });

  test("GET /v1/projects?status filters correctly", async () => {
    const created = (await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    }).then((r) => r.json())) as { id: string };

    const readyList = await fetch(`${baseUrl}/v1/projects?status=ready`).then(
      (r) => r.json() as Promise<{ items: unknown[] }>,
    );
    expect(readyList.items.length).toBe(0);

    const pendingList = await fetch(`${baseUrl}/v1/projects?status=setup_pending`).then(
      (r) => r.json() as Promise<{ items: Array<{ id: string }> }>,
    );
    expect(pendingList.items.map((p) => p.id)).toEqual([created.id]);
  });

  test("GET /v1/projects?status rejects invalid status", async () => {
    const res = await fetch(`${baseUrl}/v1/projects?status=bogus`);
    expect(res.status).toBe(400);
  });

  test("GET /v1/projects/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${baseUrl}/v1/projects/unknown`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("project_not_found");
  });

  test("GET /v1/projects/:id returns the project", async () => {
    const created = (await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir, name: "demo" }),
    }).then((r) => r.json())) as { id: string };

    const res = await fetch(`${baseUrl}/v1/projects/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe(created.id);
    expect(body.name).toBe("demo");
  });

  test("PATCH /v1/projects/:id updates name", async () => {
    const created = (await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    }).then((r) => r.json())) as { id: string };

    const res = await fetch(`${baseUrl}/v1/projects/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "renamed" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("renamed");
  });

  test("PATCH /v1/projects/:id rejects empty body", async () => {
    const created = (await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    }).then((r) => r.json())) as { id: string };

    const res = await fetch(`${baseUrl}/v1/projects/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("DELETE /v1/projects/:id archives the project", async () => {
    const created = (await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    }).then((r) => r.json())) as { id: string };

    const del = await fetch(`${baseUrl}/v1/projects/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const body = (await del.json()) as { status: string };
    expect(body.status).toBe("archived");
  });

  test("POST /v1/projects/:id/purge hard-deletes", async () => {
    const created = (await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      body: JSON.stringify({ abs_path: projectDir }),
    }).then((r) => r.json())) as { id: string };

    const purge = await fetch(`${baseUrl}/v1/projects/${created.id}/purge`, { method: "POST" });
    expect(purge.status).toBe(204);

    const get = await fetch(`${baseUrl}/v1/projects/${created.id}`);
    expect(get.status).toBe(404);
  });

  test("method not allowed returns 405", async () => {
    const res = await fetch(`${baseUrl}/v1/projects`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });
});
