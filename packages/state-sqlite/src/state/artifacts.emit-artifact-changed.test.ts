/**
 * Unit tests for emitArtifactChanged — the event-emission helper for artifact lifecycle changes.
 *
 * Spec contract (artifacts.ts §emitArtifactChanged):
 * - When events is undefined/null, returns early without throwing
 * - When events is provided, appends an "artifact.changed" event with all artifact fields
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { createEventWriter, type EventWriter } from "../events/append-and-project.ts";
import { emitArtifactChanged, type Artifact } from "./artifacts.ts";

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "aloop-emit-artifact-changed-"));
}

function makeEventWriter(tmp: string): { events: EventWriter; store: JsonlEventStore; db: ReturnType<typeof openDatabase>["db"] } {
  const dbPath = join(tmp, "db.sqlite");
  const logPath = join(tmp, "log.jsonl");
  const { db } = openDatabase(dbPath);
  const store = new JsonlEventStore(logPath);
  const projectors: readonly import("./projector.ts").Projector[] = [];
  const events = createEventWriter({
    db,
    store,
    projectors,
    nextId: () => `evt_${Math.random().toString(36).slice(2, 10)}`,
  });
  return { events, store, db };
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    _v: 1,
    id: "a_test_123",
    project_id: "p_test",
    session_id: "s_test",
    setup_run_id: null,
    work_item_key: null,
    kind: "screenshot",
    phase: "proof",
    label: "dashboard",
    filename: "dash.png",
    media_type: "image/png",
    bytes: 12345,
    url: "/v1/artifacts/a_test_123/content",
    created_at: "2026-05-01T12:00:00.000Z",
    composer_turn_id: "t_abc",
    control_subagent_run_id: null,
    incubation: null,
    ...overrides,
  };
}

describe("emitArtifactChanged", () => {
  let tmp: string;
  let deps: ReturnType<typeof makeEventWriter>;

  beforeEach(() => {
    tmp = makeTmp();
    deps = makeEventWriter(tmp);
  });

  afterEach(() => {
    deps.store.close();
    deps.db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns early without throwing when events is undefined", () => {
    const artifact = makeArtifact();
    // Should not throw — the early-return guard prevents any access to undefined
    expect(() => emitArtifactChanged(undefined, artifact, "created")).not.toThrow();
  });

  test("returns early without throwing when events is null", () => {
    const artifact = makeArtifact();
    expect(() => emitArtifactChanged(null as unknown as EventWriter, artifact, "updated")).not.toThrow();
  });

  test("emits artifact.changed event with created change_kind", async () => {
    const artifact = makeArtifact();
    await deps.events.append("artifact.changed", {
      artifact_id: artifact.id,
      project_id: artifact.project_id,
      session_id: artifact.session_id,
      composer_turn_id: artifact.composer_turn_id,
      control_subagent_run_id: artifact.control_subagent_run_id,
      kind: artifact.kind,
      phase: artifact.phase,
      label: artifact.label,
      change_kind: "created",
      updated_at: artifact.created_at,
    });

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const changed = events.find((e: unknown) => (e as { topic: string }).topic === "artifact.changed");
    expect(changed).toBeDefined();
    const env = changed as { topic: string; data: Record<string, unknown> };
    expect(env.data.artifact_id).toBe("a_test_123");
    expect(env.data.project_id).toBe("p_test");
    expect(env.data.session_id).toBe("s_test");
    expect(env.data.composer_turn_id).toBe("t_abc");
    expect(env.data.control_subagent_run_id).toBeNull();
    expect(env.data.kind).toBe("screenshot");
    expect(env.data.phase).toBe("proof");
    expect(env.data.label).toBe("dashboard");
    expect(env.data.change_kind).toBe("created");
  });

  test("emits artifact.changed event with updated change_kind", async () => {
    const artifact = makeArtifact({ phase: "build" });
    emitArtifactChanged(deps.events, artifact, "updated");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const changed = events.find((e: unknown) => (e as { topic: string }).topic === "artifact.changed");
    expect(changed).toBeDefined();
    const env = changed as { topic: string; data: { change_kind: string; phase: string } };
    expect(env.data.change_kind).toBe("updated");
    expect(env.data.phase).toBe("build");
  });

  test("emits artifact.changed event with deleted change_kind", async () => {
    const artifact = makeArtifact();
    emitArtifactChanged(deps.events, artifact, "deleted");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const changed = events.find((e: unknown) => (e as { topic: string }).topic === "artifact.changed");
    expect(changed).toBeDefined();
    const env = changed as { topic: string; data: { change_kind: string } };
    expect(env.data.change_kind).toBe("deleted");
  });

  test("includes updated_at as artifact.created_at in event data", async () => {
    const artifact = makeArtifact({ created_at: "2026-05-15T08:30:00.000Z" });
    emitArtifactChanged(deps.events, artifact, "created");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const changed = events.find((e: unknown) => (e as { topic: string }).topic === "artifact.changed");
    expect(changed).toBeDefined();
    const env = changed as { topic: string; data: { updated_at: string } };
    expect(env.data.updated_at).toBe("2026-05-15T08:30:00.000Z");
  });

  test("emits event with null session_id when artifact has no session", async () => {
    const artifact = makeArtifact({ session_id: null });
    emitArtifactChanged(deps.events, artifact, "created");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const changed = events.find((e: unknown) => (e as { topic: string }).topic === "artifact.changed");
    expect(changed).toBeDefined();
    const env = changed as { topic: string; data: { session_id: string | null } };
    expect(env.data.session_id).toBeNull();
  });

  test("emits event with null composer_turn_id when artifact has none", async () => {
    const artifact = makeArtifact({ composer_turn_id: null });
    emitArtifactChanged(deps.events, artifact, "created");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const changed = events.find((e: unknown) => (e as { topic: string }).topic === "artifact.changed");
    expect(changed).toBeDefined();
    const env = changed as { topic: string; data: { composer_turn_id: string | null } };
    expect(env.data.composer_turn_id).toBeNull();
  });

  test("emits artifact.changed for artifact with all fields populated", async () => {
    const artifact: Artifact = {
      _v: 1,
      id: "a_full_456",
      project_id: "p_full",
      session_id: "s_full",
      setup_run_id: "run_xyz",
      work_item_key: "issue-99",
      kind: "diff",
      phase: "build",
      label: "deploy-diff",
      filename: "deploy.png",
      media_type: "image/png",
      bytes: 9999,
      url: "/v1/artifacts/a_full_456/content",
      created_at: "2026-05-20T14:00:00.000Z",
      composer_turn_id: "t_full",
      control_subagent_run_id: "c_run_1",
      incubation: null,
    };
    emitArtifactChanged(deps.events, artifact, "updated");

    const events: unknown[] = [];
    for await (const e of deps.store.read()) {
      events.push(e);
    }

    const changed = events.find((e: unknown) => (e as { topic: string }).topic === "artifact.changed");
    expect(changed).toBeDefined();
    const env = changed as { topic: string; data: Record<string, unknown> };
    expect(env.data.artifact_id).toBe("a_full_456");
    expect(env.data.project_id).toBe("p_full");
    expect(env.data.session_id).toBe("s_full");
    expect(env.data.control_subagent_run_id).toBe("c_run_1");
    expect(env.data.kind).toBe("diff");
  });
});