import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "url";
import { handleArtifacts, type ArtifactsDeps } from "./artifacts-handlers.ts";
import { ArtifactRegistry, type ArtifactKind } from "@aloop/state-sqlite";
import { migrate, loadBundledMigrations } from "@aloop/sqlite-db";
import { Database } from "bun:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeDeps(): ArtifactsDeps {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const registry = new ArtifactRegistry(db);
  const tempDir = mkdtempSync(join(tmpdir(), "aloop-artifacts-test-"));
  return {
    registry,
    artifactsDir: () => tempDir,
  };
}

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

function makeRequest(method: string, url: string, formData?: FormData): Request {
  return new Request(`http://localhost${url}`, {
    method,
    ...(formData ? { body: formData } : {}),
  });
}

describe("handleArtifacts", () => {
  describe("path mismatch", () => {
    test("returns undefined for unrelated pathname", async () => {
      const deps = makeDeps();
      const req = makeRequest("GET", "/v1/something/else");
      const result = await handleArtifacts(req, deps, "/v1/something/else");
      expect(result).toBeUndefined();
    });
  });

  describe("GET /v1/artifacts", () => {
    test("returns empty list when no artifacts", async () => {
      const deps = makeDeps();
      const req = makeRequest("GET", "/v1/artifacts");
      const res = await handleArtifacts(req, deps, "/v1/artifacts");
      expect(res!.status).toBe(200);
      const body = await resJson<{ _v: number; items: unknown[] }>(res!);
      expect(body._v).toBe(1);
      expect(body.items).toEqual([]);
    });

    test("returns artifacts filtered by project_id", async () => {
      const deps = makeDeps();
      deps.registry.create({
        project_id: "p_1",
        kind: "image",
        filename: "a.png",
        media_type: "image/png",
        bytes: 10,
      });
      deps.registry.create({
        project_id: "p_2",
        kind: "screenshot",
        filename: "b.png",
        media_type: "image/png",
        bytes: 20,
      });
      const req = makeRequest("GET", "/v1/artifacts?project_id=p_1");
      const res = await handleArtifacts(req, deps, "/v1/artifacts");
      expect(res!.status).toBe(200);
      const body = await resJson<{ items: Array<{ project_id: string }> }>(res!);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.project_id).toBe("p_1");
    });

    test("returns 405 for non-GET/POST", async () => {
      const deps = makeDeps();
      const req = makeRequest("DELETE", "/v1/artifacts");
      const res = await handleArtifacts(req, deps, "/v1/artifacts");
      expect(res!.status).toBe(405);
    });
  });

  describe("GET /v1/artifacts/:id", () => {
    test("returns artifact metadata", async () => {
      const deps = makeDeps();
      const created = deps.registry.create({
        project_id: "p_abc",
        kind: "screenshot",
        filename: "dash.png",
        media_type: "image/png",
        bytes: 12345,
      });
      const req = makeRequest("GET", `/v1/artifacts/${created.id}`);
      const res = await handleArtifacts(req, deps, `/v1/artifacts/${created.id}`);
      expect(res!.status).toBe(200);
      const body = await resJson<{ _v: number; id: string; filename: string }>(res!);
      expect(body._v).toBe(1);
      expect(body.id).toBe(created.id);
      expect(body.filename).toBe("dash.png");
    });

    test("returns 404 for unknown artifact", async () => {
      const deps = makeDeps();
      const req = makeRequest("GET", "/v1/artifacts/a_unknown");
      const res = await handleArtifacts(req, deps, "/v1/artifacts/a_unknown");
      expect(res!.status).toBe(404);
      const body = await resJson<{ error: { code: string } }>(res!);
      expect(body.error.code).toBe("not_found");
    });
  });

  describe("DELETE /v1/artifacts/:id", () => {
    test("returns 204 when artifact is deleted", async () => {
      const deps = makeDeps();
      const created = deps.registry.create({
        project_id: "p_del",
        kind: "image",
        filename: "delete-me.png",
        media_type: "image/png",
        bytes: 100,
      });

      // Artificially create the file on disk so delete has something to remove
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const artifactDir = join(deps.artifactsDir(), created.id);
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, "delete-me.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

      const req = makeRequest("DELETE", `/v1/artifacts/${created.id}`);
      const res = await handleArtifacts(req, deps, `/v1/artifacts/${created.id}`);
      expect(res!.status).toBe(204);
      expect(res!.body).toBeNull();

      // Verify it was removed from registry
      const getReq = makeRequest("GET", `/v1/artifacts/${created.id}`);
      const getRes = await handleArtifacts(getReq, deps, `/v1/artifacts/${created.id}`);
      expect(getRes!.status).toBe(404);
    });

    test("returns 404 for unknown artifact", async () => {
      const deps = makeDeps();
      const req = makeRequest("DELETE", "/v1/artifacts/a_nonexistent");
      const res = await handleArtifacts(req, deps, "/v1/artifacts/a_nonexistent");
      expect(res!.status).toBe(404);
      const body = await resJson<{ error: { code: string } }>(res!);
      expect(body.error.code).toBe("not_found");
    });
  });

  describe("GET /v1/artifacts/:id/content", () => {
    test("returns 404 for unknown artifact content", async () => {
      const deps = makeDeps();
      const req = makeRequest("GET", "/v1/artifacts/a_missing/content");
      const res = await handleArtifacts(req, deps, "/v1/artifacts/a_missing/content");
      expect(res!.status).toBe(404);
    });
  });

  describe("method not allowed", () => {
    test("returns 405 for PUT on /v1/artifacts", async () => {
      const deps = makeDeps();
      const req = makeRequest("PUT", "/v1/artifacts");
      const res = await handleArtifacts(req, deps, "/v1/artifacts");
      expect(res!.status).toBe(405);
    });

    test("returns 405 for POST on /v1/artifacts/:id", async () => {
      const deps = makeDeps();
      const req = makeRequest("POST", "/v1/artifacts/a_123");
      const res = await handleArtifacts(req, deps, "/v1/artifacts/a_123");
      expect(res!.status).toBe(405);
    });

    test("returns 405 for non-GET method on /v1/artifacts/:id/content", async () => {
      const deps = makeDeps();
      const req = makeRequest("DELETE", "/v1/artifacts/a_123/content");
      const res = await handleArtifacts(req, deps, "/v1/artifacts/a_123/content");
      expect(res!.status).toBe(405);
    });
  });
});

// ─── POST /v1/artifacts ──────────────────────────────────────────────────────

describe("POST /v1/artifacts (uploadArtifact)", () => {
  test("returns 201 with created artifact when all required fields are valid", async () => {
    const deps = makeDeps();
    const formData = new FormData();
    formData.set("project_id", "p_upload_1");
    formData.set("kind", "image");
    const file = new File(["PNG file content"], "test.png", { type: "image/png" });
    formData.set("file", file);

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(201);
    const body = await resJson<{ _v: number; id: string; project_id: string; kind: string; filename: string }>(res!);
    expect(body._v).toBe(1);
    expect(body.id).toBeTruthy();
    expect(body.project_id).toBe("p_upload_1");
    expect(body.kind).toBe("image");
    expect(body.filename).toBe("test.png");
  });

  test("returns 201 and stores file content on disk", async () => {
    const deps = makeDeps();
    const file = new File(["hello world"], "hello.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.set("project_id", "p_upload_2");
    formData.set("kind", "other");
    formData.set("file", file);

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(201);
    const body = await resJson<{ id: string }>(res!);

    // retrieve and verify content
    const contentReq = new Request(`http://localhost/v1/artifacts/${body.id}/content`);
    const contentRes = await handleArtifacts(contentReq, deps, `/v1/artifacts/${body.id}/content`);
    expect(contentRes!.status).toBe(200);
    expect(contentRes!.headers.get("content-type")).toContain("text/plain");
    const stored = await contentRes!.text();
    expect(stored).toBe("hello world");
  });

  test("returns 201 with all optional fields", async () => {
    const deps = makeDeps();
    const file = new File(["data"], "optional.png", { type: "image/png" });
    const formData = new FormData();
    formData.set("project_id", "p_upload_3");
    formData.set("kind", "mockup");
    formData.set("file", file);
    formData.set("session_id", "sess_abc");
    formData.set("setup_run_id", "run_123");
    formData.set("work_item_key", "task_01");
    formData.set("phase", "execute");
    formData.set("label", "v2 diff");

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(201);
    const body = await resJson<Record<string, unknown>>(res!);
    expect(body.session_id).toBe("sess_abc");
    expect(body.setup_run_id).toBe("run_123");
    expect(body.work_item_key).toBe("task_01");
    expect(body.phase).toBe("execute");
    expect(body.label).toBe("v2 diff");
  });

  test("returns 400 when project_id is missing", async () => {
    const deps = makeDeps();
    const file = new File(["x"], "f.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.set("kind", "other");
    formData.set("file", file);

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("project_id");
  });

  test("returns 400 when project_id is empty string", async () => {
    const deps = makeDeps();
    const file = new File(["x"], "f.txt");
    const formData = new FormData();
    formData.set("project_id", "   ");
    formData.set("kind", "image");
    formData.set("file", file);

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when kind is missing", async () => {
    const deps = makeDeps();
    const file = new File(["x"], "f.txt");
    const formData = new FormData();
    formData.set("project_id", "p_test");
    formData.set("file", file);

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("kind");
  });

  test("returns 400 for invalid kind value", async () => {
    const deps = makeDeps();
    const file = new File(["x"], "f.txt");
    const formData = new FormData();
    formData.set("project_id", "p_test");
    formData.set("kind", "not_a_real_kind");
    formData.set("file", file);

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("kind must be one of");
  });

  test("returns 400 when file field is missing", async () => {
    const deps = makeDeps();
    const formData = new FormData();
    formData.set("project_id", "p_test");
    formData.set("kind", "image");

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("file");
  });

  test("accepts all valid kind values", async () => {
    const validKinds = ["image", "screenshot", "mockup", "diff", "other"] as const;
    for (const kind of validKinds) {
      const deps = makeDeps();
      const file = new File(["data"], "f.bin");
      const formData = new FormData();
      formData.set("project_id", `p_kind_${kind}`);
      formData.set("kind", kind);
      formData.set("file", file);

      const req = new Request(`http://localhost/v1/artifacts`, {
        method: "POST",
        body: formData,
      });
      const res = await handleArtifacts(req, deps, "/v1/artifacts");
      expect(res!.status).toBe(201), `kind=${kind} should be accepted`;
    }
  });

  test("uses application/octet-stream when file has no media type", async () => {
    const deps = makeDeps();
    const file = new File(["data"], "no-ext", { type: "" });
    const formData = new FormData();
    formData.set("project_id", "p_no_type");
    formData.set("kind", "other");
    formData.set("file", file);

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(201);
    const body = await resJson<{ media_type: string }>(res!);
    expect(body.media_type).toBe("application/octet-stream");
  });
});

// ─── GET /v1/artifacts filter params ─────────────────────────────────────────

describe("GET /v1/artifacts filter parameters", () => {
  test("filters by session_id", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_s", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, session_id: "sess_1" });
    deps.registry.create({ project_id: "p_s", kind: "image", filename: "b.png", media_type: "image/png", bytes: 10, session_id: "sess_2" });
    deps.registry.create({ project_id: "p_s", kind: "image", filename: "c.png", media_type: "image/png", bytes: 10, session_id: null });

    const req = makeRequest("GET", "/v1/artifacts?session_id=sess_1");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ session_id: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.session_id).toBe("sess_1");
  });

  test("filters by setup_run_id", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_r", kind: "image", filename: "r1.png", media_type: "image/png", bytes: 10, setup_run_id: "run_a" });
    deps.registry.create({ project_id: "p_r", kind: "image", filename: "r2.png", media_type: "image/png", bytes: 10, setup_run_id: "run_b" });

    const req = makeRequest("GET", "/v1/artifacts?setup_run_id=run_a");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ setup_run_id: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.setup_run_id).toBe("run_a");
  });

  test("filters by work_item_key", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_w", kind: "image", filename: "w1.png", media_type: "image/png", bytes: 10, work_item_key: "task_1" });
    deps.registry.create({ project_id: "p_w", kind: "image", filename: "w2.png", media_type: "image/png", bytes: 10, work_item_key: "task_2" });

    const req = makeRequest("GET", "/v1/artifacts?work_item_key=task_1");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ work_item_key: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.work_item_key).toBe("task_1");
  });

  test("filters by phase", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_ph", kind: "image", filename: "ph1.png", media_type: "image/png", bytes: 10, phase: "setup" });
    deps.registry.create({ project_id: "p_ph", kind: "image", filename: "ph2.png", media_type: "image/png", bytes: 10, phase: "execute" });

    const req = makeRequest("GET", "/v1/artifacts?phase=execute");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ phase: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.phase).toBe("execute");
  });

  test("filters by type (maps to kind)", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_t", kind: "screenshot", filename: "t1.png", media_type: "image/png", bytes: 10 });
    deps.registry.create({ project_id: "p_t", kind: "image", filename: "t2.png", media_type: "image/png", bytes: 10 });

    const req = makeRequest("GET", "/v1/artifacts?type=screenshot");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ kind: string }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.kind).toBe("screenshot");
  });

  test("combines multiple filters", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_multi", kind: "image", filename: "m1.png", media_type: "image/png", bytes: 10, session_id: "sess_x", phase: "execute" });
    deps.registry.create({ project_id: "p_multi", kind: "image", filename: "m2.png", media_type: "image/png", bytes: 10, session_id: "sess_x", phase: "setup" });
    deps.registry.create({ project_id: "p_multi", kind: "image", filename: "m3.png", media_type: "image/png", bytes: 10, session_id: "sess_y", phase: "execute" });
    deps.registry.create({ project_id: "p_multi", kind: "image", filename: "m4.png", media_type: "image/png", bytes: 10, session_id: "sess_y", phase: "setup" });

    // Both filters apply (AND logic): session_id=sess_x AND phase=execute
    const req = makeRequest("GET", "/v1/artifacts?session_id=sess_x&phase=execute");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<Record<string, unknown>> }>(res!);
    expect(body.items).toHaveLength(1);
    expect((body.items[0] as { session_id: string; phase: string }).session_id).toBe("sess_x");
    expect((body.items[0] as { session_id: string; phase: string }).phase).toBe("execute");
  });
});

// ─── GET /v1/artifacts/:id/content ───────────────────────────────────────────

describe("GET /v1/artifacts/:id/content with real file", () => {
  test("returns file content with correct content-type header", async () => {
    const deps = makeDeps();
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const created = deps.registry.create({
      project_id: "p_c",
      kind: "screenshot",
      filename: "screen.png",
      media_type: "image/png",
      bytes: 5,
    });
    const artifactDir = join(deps.artifactsDir(), created.id);
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "screen.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0a]));

    const req = makeRequest("GET", `/v1/artifacts/${created.id}/content`);
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${created.id}/content`);
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("image/png");
    expect(res!.headers.get("content-length")).toBe("5");
  });

  test("returns 404 when artifact exists but file is missing from disk", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({
      project_id: "p_m",
      kind: "other",
      filename: "gone.txt",
      media_type: "text/plain",
      bytes: 100,
    });
    // Do NOT write the file to disk

    const req = makeRequest("GET", `/v1/artifacts/${created.id}/content`);
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${created.id}/content`);
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("not_found");
  });
});

// ─── GET /v1/artifacts filter params: composer_turn_id, control_subagent_run_id,
//     incubation_item_id, research_run_id ───────────────────────────────────

describe("GET /v1/artifacts filter parameters (incubation/research fields)", () => {
  test("filters by composer_turn_id", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_ct", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, composer_turn_id: "ct_abc" });
    deps.registry.create({ project_id: "p_ct", kind: "image", filename: "b.png", media_type: "image/png", bytes: 10, composer_turn_id: "ct_xyz" });
    deps.registry.create({ project_id: "p_ct", kind: "image", filename: "c.png", media_type: "image/png", bytes: 10, composer_turn_id: null });

    const req = makeRequest("GET", "/v1/artifacts?composer_turn_id=ct_abc");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ composer_turn_id: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.composer_turn_id).toBe("ct_abc");
  });

  test("filters by control_subagent_run_id", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_csr", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, control_subagent_run_id: "csr_1" });
    deps.registry.create({ project_id: "p_csr", kind: "image", filename: "b.png", media_type: "image/png", bytes: 10, control_subagent_run_id: "csr_2" });

    const req = makeRequest("GET", "/v1/artifacts?control_subagent_run_id=csr_1");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ control_subagent_run_id: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.control_subagent_run_id).toBe("csr_1");
  });

  test("filters by incubation_item_id", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_ii", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, incubation_item_id: "ii_incub_1" });
    deps.registry.create({ project_id: "p_ii", kind: "image", filename: "b.png", media_type: "image/png", bytes: 10, incubation_item_id: "ii_incub_2" });

    const req = makeRequest("GET", "/v1/artifacts?incubation_item_id=ii_incub_1");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ incubation_item_id: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.incubation_item_id).toBe("ii_incub_1");
  });

  test("filters by research_run_id", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_rr", kind: "image", filename: "a.png", media_type: "image/png", bytes: 10, research_run_id: "rr_research_1" });
    deps.registry.create({ project_id: "p_rr", kind: "image", filename: "b.png", media_type: "image/png", bytes: 10, research_run_id: "rr_research_2" });

    const req = makeRequest("GET", "/v1/artifacts?research_run_id=rr_research_1");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ research_run_id: string | null }> }>(res!);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.research_run_id).toBe("rr_research_1");
  });

  test("combines incubation/research filters with other filters", async () => {
    const deps = makeDeps();
    deps.registry.create({ project_id: "p_combo", kind: "image", filename: "match.png", media_type: "image/png", bytes: 10, session_id: "sess_A", phase: "execute", composer_turn_id: "ct_match" });
    deps.registry.create({ project_id: "p_combo", kind: "image", filename: "wrong_sess.png", media_type: "image/png", bytes: 10, session_id: "sess_B", phase: "execute", composer_turn_id: "ct_match" });
    deps.registry.create({ project_id: "p_combo", kind: "image", filename: "wrong_phase.png", media_type: "image/png", bytes: 10, session_id: "sess_A", phase: "setup", composer_turn_id: "ct_match" });
    deps.registry.create({ project_id: "p_combo", kind: "image", filename: "wrong_ct.png", media_type: "image/png", bytes: 10, session_id: "sess_A", phase: "execute", composer_turn_id: "ct_other" });

    const req = makeRequest("GET", "/v1/artifacts?session_id=sess_A&phase=execute&composer_turn_id=ct_match");
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<Record<string, unknown>> }>(res!);
    expect(body.items).toHaveLength(1);
    expect((body.items[0] as { filename: string }).filename).toBe("match.png");
  });
});

// ─── POST /v1/artifacts (uploadArtifact): incubation/research optional fields ──

describe("POST /v1/artifacts (uploadArtifact) incubation/research fields", () => {
  test("accepts all incubation and research optional fields", async () => {
    const deps = makeDeps();
    const file = new File(["data"], "research.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.set("project_id", "p_incub_research");
    formData.set("kind", "other");
    formData.set("file", file);
    formData.set("composer_turn_id", "ct_upload");
    formData.set("control_subagent_run_id", "csr_upload");
    formData.set("incubation_item_id", "ii_upload");
    formData.set("research_run_id", "rr_upload");

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(201);
    const body = await resJson<Record<string, unknown>>(res!);
    expect(body.composer_turn_id).toBe("ct_upload");
    expect(body.control_subagent_run_id).toBe("csr_upload");
    expect(body.incubation_item_id).toBe("ii_upload");
    expect(body.research_run_id).toBe("rr_upload");
  });

  test("accepts a single incubation/research field independently", async () => {
    const deps = makeDeps();
    const file = new File(["data"], "wip.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.set("project_id", "p_single_field");
    formData.set("kind", "diff");
    formData.set("file", file);
    formData.set("incubation_item_id", "ii_only");

    const req = new Request("http://localhost/v1/artifacts", {
      method: "POST",
      body: formData,
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(201);
    const body = await resJson<Record<string, unknown>>(res!);
    expect(body.incubation_item_id).toBe("ii_only");
    expect(body.composer_turn_id).toBeNull();
    expect(body.control_subagent_run_id).toBeNull();
    expect(body.research_run_id).toBeNull();
  });
});
