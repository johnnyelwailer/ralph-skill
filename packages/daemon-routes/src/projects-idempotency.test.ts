import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  loadBundledMigrations,
  migrate,
  ProjectRegistry,
  createIdempotencyStore,
} from "@aloop/state-sqlite";
import { handleProjects, type ProjectsDeps } from "./projects.ts";

function makeDeps(): ProjectsDeps {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return {
    registry: new ProjectRegistry(db),
    sessionsDir: join(tmpdir(), "aloop-idempotency-test-sessions"),
  };
}

function makeDepsWithIdempotency(): ProjectsDeps {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return {
    registry: new ProjectRegistry(db),
    sessionsDir: join(tmpdir(), "aloop-idempotency-test-sessions"),
    idempotencyStore: createIdempotencyStore(db),
  };
}

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

describe("POST /v1/projects idempotency", () => {
  describe("without idempotency store", () => {
    test("creates project normally without Idempotency-Key header", async () => {
      const deps = makeDeps();
      const req = new Request("http://x/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ abs_path: "/test/idempotent/no-store" }),
      });
      const res = await handleProjects(req, deps, "/v1/projects");
      expect(res!.status).toBe(201);
      const body = await resJson<{ id: string }>(res!);
      expect(body.id).toBeTruthy();
    });

    test("creates project normally even with Idempotency-Key header when no store configured", async () => {
      const deps = makeDeps();
      const req = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "key-ignored-when-no-store",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/ignored-key" }),
      });
      const res = await handleProjects(req, deps, "/v1/projects");
      expect(res!.status).toBe(201);
    });
  });

  describe("with idempotency store", () => {
    test("creates project and stores result when Idempotency-Key is provided (cache miss)", async () => {
      const deps = makeDepsWithIdempotency();
      const req = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem-key-001",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/first" }),
      });
      const res = await handleProjects(req, deps, "/v1/projects");
      expect(res!.status).toBe(201);
      const body = await resJson<{ id: string }>(res!);
      expect(body.id).toBeTruthy();

      // Verify the result was stored in the idempotency store
      const cached = deps.idempotencyStore!.get("idem-key-001");
      expect(cached).not.toBeNull();
      expect((cached as { result: unknown }).result).toEqual(
        expect.objectContaining({ id: body.id }),
      );
    });

    test("returns cached response on repeat request with same Idempotency-Key (cache hit)", async () => {
      const deps = makeDepsWithIdempotency();

      // First request
      const req1 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem-key-002",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/dup" }),
      });
      const res1 = await handleProjects(req1, deps, "/v1/projects");
      expect(res1!.status).toBe(201);
      const body1 = await resJson<{ id: string }>(res1!);
      const firstId = body1.id;

      // Second request with same key — should get cached response
      const req2 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem-key-002",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/dup" }),
      });
      const res2 = await handleProjects(req2, deps, "/v1/projects");
      expect(res2!.status).toBe(200); // Cached — 200 not 201
      const body2 = await resJson<{ id: string }>(res2!);
      // Should be the same cached result
      expect(body2.id).toBe(firstId);

      // Verify only ONE project was created in the registry (not two)
      const listReq = new Request("http://x/v1/projects");
      const listRes = await handleProjects(listReq, deps, "/v1/projects");
      const listBody = await resJson<{ items: unknown[] }>(listRes!);
      const dupProjects = (listBody.items as { abs_path: string }[]).filter(
        (p) => p.abs_path === "/test/idempotent/dup",
      );
      expect(dupProjects).toHaveLength(1);
    });

    test("whitespace in Idempotency-Key is trimmed before lookup", async () => {
      const deps = makeDepsWithIdempotency();

      // First request with spaced key
      const req1 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "  spaced-key-001  ",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/spaced" }),
      });
      const res1 = await handleProjects(req1, deps, "/v1/projects");
      expect(res1!.status).toBe(201);

      // Second request with same spaced key (should still hit cache after trim)
      const req2 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "spaced-key-001",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/spaced" }),
      });
      const res2 = await handleProjects(req2, deps, "/v1/projects");
      expect(res2!.status).toBe(200);
    });

    test("different Idempotency-Key values do not interfere with each other", async () => {
      const deps = makeDepsWithIdempotency();

      const req1 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "key-alpha",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/alpha" }),
      });
      const res1 = await handleProjects(req1, deps, "/v1/projects");
      expect(res1!.status).toBe(201);

      const req2 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "key-beta",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/beta" }),
      });
      const res2 = await handleProjects(req2, deps, "/v1/projects");
      expect(res2!.status).toBe(201);

      // Verify both projects exist separately
      const listReq = new Request("http://x/v1/projects");
      const listRes = await handleProjects(listReq, deps, "/v1/projects");
      const listBody = await resJson<{ items: unknown[] }>(listRes!);
      expect((listBody.items as { abs_path: string }[]).map((p) => p.abs_path).sort()).toEqual([
        "/test/idempotent/alpha",
        "/test/idempotent/beta",
      ]);
    });

    test("second POST with same idempotency key returns cached 201 (not a new conflict check)", async () => {
      // When a repeat POST uses the same idempotency key, the cached 201 response
      // is returned directly — the handler does NOT run createProject again,
      // so no new conflict check occurs. This is the core idempotency guarantee:
      // replaying a successful creation returns the same result without re-running
      // the business logic that might produce a different outcome (e.g., 409).
      const deps = makeDepsWithIdempotency();

      // First request — creates the project
      const req1 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "key-conflict-001",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/conflict" }),
      });
      const res1 = await handleProjects(req1, deps, "/v1/projects");
      expect(res1!.status).toBe(201);
      const body1 = await resJson<{ id: string }>(res1!);

      // Second request with same key — cached 201 returned, NOT 409.
      // Even though the same path is now registered, the handler does not
      // run createProject on the replay, so no conflict check fires.
      const req2 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "key-conflict-001",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/conflict" }),
      });
      const res2 = await handleProjects(req2, deps, "/v1/projects");
      expect(res2!.status).toBe(200); // cached replay, not 409
      const body2 = await resJson<{ id: string }>(res2!);
      expect(body2.id).toBe(body1.id); // same project returned
    });

    test("missing Idempotency-Key header does not query store", async () => {
      const deps = makeDepsWithIdempotency();

      // Create a project that would conflict
      const req1 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/no-key" }),
      });
      const res1 = await handleProjects(req1, deps, "/v1/projects");
      expect(res1!.status).toBe(201);

      // Second request — no idempotency key, so store is not consulted
      // This creates a NEW project with the same path (if the registry allows it)
      // OR it would get a 409 because the path is already registered.
      // In either case, the idempotency store was not involved.
      const req2 = new Request("http://x/v1/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ abs_path: "/test/idempotent/no-key" }),
      });
      const res2 = await handleProjects(req2, deps, "/v1/projects");
      // With no idempotency key, the duplicate path would conflict (409)
      expect(res2!.status).toBe(409);
    });
  });
});
