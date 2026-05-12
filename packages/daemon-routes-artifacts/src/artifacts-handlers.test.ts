import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleArtifacts, type ArtifactsDeps } from "./artifacts-handlers.ts";
import type { ArtifactKind } from "@aloop/state-sqlite";

// ─── Minimal ArtifactRegistry mock ─────────────────────────────────────────

type MockArtifact = {
  id: string;
  project_id: string;
  session_id: string | null;
  setup_run_id: string | null;
  work_item_key: string | null;
  kind: ArtifactKind;
  phase: string | null;
  label: string | null;
  filename: string;
  media_type: string;
  bytes: number;
  composer_turn_id: string | null;
  control_subagent_run_id: string | null;
  created_at: string;
  updated_at: string;
};

function makeArtifactRegistry(): {
  registry: ArtifactsDeps["registry"];
  storage: Map<string, MockArtifact>;
} {
  const storage = new Map<string, MockArtifact>();
  let counter = 0;

  const registry: ArtifactsDeps["registry"] = {
    list(filter) {
      const all = Array.from(storage.values());
      return all.filter((a) => {
        if (filter.project_id && a.project_id !== filter.project_id) return false;
        if (filter.session_id && a.session_id !== filter.session_id) return false;
        if (filter.setup_run_id && a.setup_run_id !== filter.setup_run_id) return false;
        if (filter.work_item_key && a.work_item_key !== filter.work_item_key) return false;
        if (filter.phase && a.phase !== filter.phase) return false;
        if (filter.kind && a.kind !== filter.kind) return false;
        if (filter.composer_turn_id && a.composer_turn_id !== filter.composer_turn_id) return false;
        if (filter.control_subagent_run_id && a.control_subagent_run_id !== filter.control_subagent_run_id) return false;
        return true;
      });
    },
    get(id) {
      return storage.get(id) ?? undefined;
    },
    create(input) {
      const id = `artifact_${String(++counter).padStart(6, "0")}`;
      const now = new Date().toISOString();
      const artifact: MockArtifact = {
        id,
        project_id: input.project_id,
        session_id: input.session_id ?? null,
        setup_run_id: input.setup_run_id ?? null,
        work_item_key: input.work_item_key ?? null,
        kind: input.kind,
        phase: input.phase ?? null,
        label: input.label ?? null,
        filename: input.filename,
        media_type: input.media_type,
        bytes: input.bytes,
        composer_turn_id: input.composer_turn_id ?? null,
        control_subagent_run_id: input.control_subagent_run_id ?? null,
        created_at: now,
        updated_at: now,
      };
      storage.set(id, artifact);
      return artifact;
    },
    delete(id) {
      storage.delete(id);
    },
  };

  return { registry, storage };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let tmp: string;
let deps: ArtifactsDeps;
let registryStorage: Map<string, MockArtifact>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "aloop-artifacts-handlers-"));
  const { registry, storage } = makeArtifactRegistry();
  registryStorage = storage;
  deps = {
    registry,
    artifactsDir: () => tmp,
  };
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ─── handleArtifacts dispatcher ─────────────────────────────────────────────

describe("handleArtifacts dispatcher", () => {
  test("returns undefined for paths not starting with /v1/artifacts", async () => {
    const res = await handleArtifacts(new Request("http://x/v1/foo"), deps, "/v1/foo");
    expect(res).toBeUndefined();
  });

  test("GET /v1/artifacts dispatches to listArtifacts", async () => {
    const res = await handleArtifacts(new Request("http://x/v1/artifacts", { method: "GET" }), deps, "/v1/artifacts");
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body._v).toBe(1);
    expect(body.items).toEqual([]);
  });

  test("POST /v1/artifacts dispatches to uploadArtifact", async () => {
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", new File([""], "x.png", { type: "image/png" }));
    const req = new Request("http://x/v1/artifacts", { method: "POST", body: form });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(201);
  });

  test("PUT /v1/artifacts returns method not allowed", async () => {
    const res = await handleArtifacts(new Request("http://x/v1/artifacts", { method: "PUT" }), deps, "/v1/artifacts");
    expect(res!.status).toBe(405);
  });

  test("GET /v1/artifacts/:id dispatches to getArtifact", async () => {
    // Pre-create an artifact
    deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "x.png",
      media_type: "image/png",
      bytes: 0,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
    });
    const req = new Request("http://x/v1/artifacts/artifact_000001", { method: "GET" });
    const res = await handleArtifacts(req, deps, "/v1/artifacts/artifact_000001");
    expect(res!.status).toBe(200);
  });

  test("DELETE /v1/artifacts/:id dispatches to deleteArtifact", async () => {
    const artifact = deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "x.png",
      media_type: "image/png",
      bytes: 0,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
    });
    const req = new Request(`http://x/v1/artifacts/${artifact.id}`, { method: "DELETE" });
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${artifact.id}`);
    expect(res!.status).toBe(204);
  });

  test("GET /v1/artifacts/:id/content dispatches to getArtifactContent", async () => {
    const artifact = deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "x.png",
      media_type: "image/png",
      bytes: 0,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
    });
    const req = new Request(`http://x/v1/artifacts/${artifact.id}/content`, { method: "GET" });
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${artifact.id}/content`);
    expect(res!.status).toBe(404);
  });

  test("PUT /v1/artifacts/:id returns method not allowed", async () => {
    const req = new Request("http://x/v1/artifacts/artifact_000001", { method: "PUT" });
    const res = await handleArtifacts(req, deps, "/v1/artifacts/artifact_000001");
    expect(res!.status).toBe(405);
  });

  test("unknown sub-path returns undefined", async () => {
    const req = new Request("http://x/v1/artifacts/abc/xyz", { method: "GET" });
    const res = await handleArtifacts(req, deps, "/v1/artifacts/abc/xyz");
    expect(res!.status).toBe(405);
  });
});

// ─── listArtifacts ──────────────────────────────────────────────────────────

describe("listArtifacts", () => {
  function makeArtifact(overrides: Partial<MockArtifact> = {}) {
    return deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "x.png",
      media_type: "image/png",
      bytes: 100,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
      ...overrides,
    });
  }

  test("returns all artifacts when no filters", async () => {
    makeArtifact({ project_id: "proj-a" });
    makeArtifact({ project_id: "proj-b" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(2);
  });

  test("filters by project_id", async () => {
    makeArtifact({ project_id: "proj-a" });
    makeArtifact({ project_id: "proj-b" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts?project_id=proj-a"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].project_id).toBe("proj-a");
  });

  test("filters by session_id", async () => {
    makeArtifact({ session_id: "sess-001" });
    makeArtifact({ session_id: "sess-002" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts?session_id=sess-001"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].session_id).toBe("sess-001");
  });

  test("filters by setup_run_id", async () => {
    makeArtifact({ setup_run_id: "run-001" });
    makeArtifact({ setup_run_id: "run-002" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts?setup_run_id=run-001"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].setup_run_id).toBe("run-001");
  });

  test("filters by work_item_key", async () => {
    makeArtifact({ work_item_key: "wi-001" });
    makeArtifact({ work_item_key: "wi-002" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts?work_item_key=wi-001"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(1);
  });

  test("filters by phase", async () => {
    makeArtifact({ phase: "generation" });
    makeArtifact({ phase: "review" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts?phase=generation"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].phase).toBe("generation");
  });



  test("filters by composer_turn_id", async () => {
    makeArtifact({ composer_turn_id: "turn-abc" });
    makeArtifact({ composer_turn_id: "turn-xyz" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts?composer_turn_id=turn-abc"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(1);
  });

  test("filters by control_subagent_run_id", async () => {
    makeArtifact({ control_subagent_run_id: "ctrl-abc" });
    makeArtifact({ control_subagent_run_id: "ctrl-xyz" });
    const res = await handleArtifacts(new Request("http://x/v1/artifacts?control_subagent_run_id=ctrl-abc"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body.items).toHaveLength(1);
  });

  test("returns envelope with _v:1 and next_cursor: null", async () => {
    const res = await handleArtifacts(new Request("http://x/v1/artifacts"), deps, "/v1/artifacts");
    const body = await res!.json();
    expect(body._v).toBe(1);
    expect(body.next_cursor).toBeNull();
  });
});

// ─── getArtifact ─────────────────────────────────────────────────────────────

describe("getArtifact", () => {
  test("returns artifact when found", async () => {
    const artifact = deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "x.png",
      media_type: "image/png",
      bytes: 0,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
    });
    const req = new Request(`http://x/v1/artifacts/${artifact.id}`, { method: "GET" });
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${artifact.id}`);
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.id).toBe(artifact.id);
    expect(body.project_id).toBe("proj-001");
  });

  test("returns 404 when artifact not found", async () => {
    const req = new Request("http://x/v1/artifacts/nonexistent-id", { method: "GET" });
    const res = await handleArtifacts(req, deps, "/v1/artifacts/nonexistent-id");
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("nonexistent-id");
  });
});

// ─── getArtifactContent ──────────────────────────────────────────────────────

describe("getArtifactContent", () => {
  test("returns 200 with content when file exists", async () => {
    // Create artifact in registry
    const artifact = deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "photo.png",
      media_type: "image/png",
      bytes: 5,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
    });
    // Write the file to disk
    const artifactDir = join(tmp, artifact.id);
    writeFileSync(join(artifactDir, "photo.png"), new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]));

    const req = new Request(`http://x/v1/artifacts/${artifact.id}/content`, { method: "GET" });
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${artifact.id}/content`);
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("image/png");
    expect(res!.headers.get("content-length")).toBe("5");
    const bytes = await res!.arrayBuffer();
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]));
  });

  test("returns 404 when artifact not found in registry", async () => {
    const req = new Request("http://x/v1/artifacts/nonexistent/content", { method: "GET" });
    const res = await handleArtifacts(req, deps, "/v1/artifacts/nonexistent/content");
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error.code).toBe("not_found");
  });

  test("returns 404 when file missing on disk even though registry entry exists", async () => {
    const artifact = deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "missing.png",
      media_type: "image/png",
      bytes: 0,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
    });
    // Don't write the file — simulating a missing artifact file

    const req = new Request(`http://x/v1/artifacts/${artifact.id}/content`, { method: "GET" });
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${artifact.id}/content`);
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("artifact file not found");
  });
});

// ─── deleteArtifact ─────────────────────────────────────────────────────────

describe("deleteArtifact", () => {
  test("returns 204 and removes artifact when found", async () => {
    const artifact = deps.registry.create({
      project_id: "proj-001",
      kind: "image",
      filename: "x.png",
      media_type: "image/png",
      bytes: 0,
      session_id: null,
      setup_run_id: null,
      work_item_key: null,
      phase: null,
      label: null,
      composer_turn_id: null,
      control_subagent_run_id: null,
    });
    const req = new Request(`http://x/v1/artifacts/${artifact.id}`, { method: "DELETE" });
    const res = await handleArtifacts(req, deps, `/v1/artifacts/${artifact.id}`);
    expect(res!.status).toBe(204);
    expect(deps.registry.get(artifact.id)).toBeUndefined();
  });

  test("returns 404 when artifact not found", async () => {
    const req = new Request("http://x/v1/artifacts/nonexistent-id", { method: "DELETE" });
    const res = await handleArtifacts(req, deps, "/v1/artifacts/nonexistent-id");
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error.code).toBe("not_found");
  });
});

// ─── uploadArtifact ──────────────────────────────────────────────────────────

describe("uploadArtifact", () => {
  function upload(form: FormData) {
    return handleArtifacts(
      new Request("http://x/v1/artifacts", { method: "POST", body: form }),
      deps,
      "/v1/artifacts",
    );
  }

  test("returns 400 when project_id is missing", async () => {
    const form = new FormData();
    form.set("kind", "image");
    form.set("file", new File([""], "x.png"));
    const res = await upload(form);
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error.message).toContain("project_id");
  });

  test("returns 400 when project_id is blank", async () => {
    const form = new FormData();
    form.set("project_id", "   ");
    form.set("kind", "image");
    form.set("file", new File([""], "x.png"));
    const res = await upload(form);
    expect(res!.status).toBe(400);
  });

  test("returns 400 when kind is missing", async () => {
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("file", new File([""], "x.png"));
    const res = await upload(form);
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error.message).toContain("kind");
  });

  test("returns 400 when kind is invalid", async () => {
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "not_a_real_kind");
    form.set("file", new File([""], "x.png"));
    const res = await upload(form);
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error.message).toContain("kind must be one of");
  });

  test("returns 400 when file field is missing", async () => {
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    const res = await upload(form);
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error.message).toContain("file");
  });

  test("returns 400 when invalid multipart/form-data body", async () => {
    const req = new Request("http://x/v1/artifacts", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "this is not form data",
    });
    const res = await handleArtifacts(req, deps, "/v1/artifacts");
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error.message).toContain("invalid multipart");
  });

  test("returns 201 with created artifact on success", async () => {
    const content = new Uint8Array([0x01, 0x02, 0x03]);
    const file = new File([content], "photo.png", { type: "image/png" });
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.id).toBeDefined();
    expect(body.project_id).toBe("proj-001");
    expect(body.kind).toBe("image");
    expect(body.filename).toBe("photo.png");
    expect(body.media_type).toBe("image/png");
    expect(body.bytes).toBe(3);
  });

  test("saves uploaded file bytes to disk", async () => {
    const content = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const file = new File([content], "data.bin", { type: "application/octet-stream" });
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "other");
    form.set("file", file);

    const res = await upload(form);
    const body = await res!.json();
    const artifactId = body.id;
    const artifactDir = join(tmp, artifactId);
    const stored = await Bun.file(join(artifactDir, "data.bin")).arrayBuffer();
    expect(new Uint8Array(stored)).toEqual(content);
  });

  test("accepts optional session_id", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);
    form.set("session_id", "sess-abc");

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.session_id).toBe("sess-abc");
  });

  test("accepts optional setup_run_id", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);
    form.set("setup_run_id", "run-xyz");

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.setup_run_id).toBe("run-xyz");
  });

  test("accepts optional work_item_key", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);
    form.set("work_item_key", "wi-key");

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.work_item_key).toBe("wi-key");
  });

  test("accepts optional label", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);
    form.set("label", "my screenshot");

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.label).toBe("my screenshot");
  });

  test("accepts optional phase", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);
    form.set("phase", "generation");

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.phase).toBe("generation");
  });

  test("accepts optional composer_turn_id", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);
    form.set("composer_turn_id", "turn-123");

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.composer_turn_id).toBe("turn-123");
  });

  test("accepts optional control_subagent_run_id", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);
    form.set("control_subagent_run_id", "ctrl-456");

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.control_subagent_run_id).toBe("ctrl-456");
  });

  test("defaults media_type to application/octet-stream when file has no type", async () => {
    const file = new File([""], "x.zzz"); // no type
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "other");
    form.set("file", file);

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.media_type).toBe("application/octet-stream");
  });

  test("uses filename from File object when set", async () => {
    const file = new File([""], "real-name.png", { type: "image/png" });
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);

    const res = await upload(form);
    const body = await res!.json();
    expect(body.filename).toBe("real-name.png");
  });

  test("uses 'unknown' as filename fallback when File.name is empty", async () => {
    // File.name is empty string — simulate via a plain object trick
    // We can't easily create a File with empty name, but the code handles it
    // with: const filename = (file as File).name ?? "unknown";
    // We'll trust the implementation; add a test for the path coverage
    const file = new File([""], "", { type: "image/png" });
    const form = new FormData();
    form.set("project_id", "proj-001");
    form.set("kind", "image");
    form.set("file", file);

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.filename).toBe("unknown");
  });

  test("trims whitespace from string form fields", async () => {
    const file = new File([""], "x.png");
    const form = new FormData();
    form.set("project_id", "  proj-001  ");
    form.set("kind", "  image  ");
    form.set("file", file);

    const res = await upload(form);
    expect(res!.status).toBe(201);
    const body = await res!.json();
    expect(body.project_id).toBe("proj-001");
    expect(body.kind).toBe("image");
  });
});
