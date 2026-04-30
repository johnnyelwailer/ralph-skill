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

function runArtifactsMigration(db: Database): void {
  const sql = readFileSync(join(__dirname, "../../state-sqlite/src/migrations/006-artifacts.sql"), "utf-8");
  db.run(sql);
}

function makeDeps(): ArtifactsDeps {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  runArtifactsMigration(db);
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
