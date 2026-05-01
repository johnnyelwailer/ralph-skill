import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSetupRun,
  listSetupRuns,
  getSetupRun,
  getSetupChapters,
  answerSetupRun,
  commentSetupRun,
  approveScaffold,
  resumeSetupRun,
  deleteSetupRun,
  getSetupEvents,
  type SetupDeps,
} from "./setup-handlers.ts";
import { SetupStore } from "./setup-store.ts";

function makeStore(tmp: string) {
  return new SetupStore({ stateDir: join(tmp, "state") });
}

function makeDeps(tmp: string) {
  const eventsDir = join(tmp, "events");
  mkdirSync(eventsDir, { recursive: true });
  return {
    store: makeStore(tmp),
    eventsDir,
  } as SetupDeps;
}

describe("createSetupRun", () => {
  let tmp: string;
  let deps: SetupDeps;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 201 with created run", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body._v).toBe(1);
    expect(body.abs_path).toBe("/test/project");
    expect(body.mode).toBe("standalone");
    expect(body.status).toBe("active");
    expect(body.phase).toBe("discovery");
    expect(body.id).toMatch(/^setup_/);
  });

  test("returns 201 with mode=orchestrator", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project", mode: "orchestrator" }),
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.mode).toBe("orchestrator");
  });

  test("returns 201 with non_interactive=true", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({
        abs_path: "/test/project",
        non_interactive: true,
      }),
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.non_interactive).toBe(true);
  });

  test("returns 400 when abs_path is missing", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("abs_path");
  });

  test("returns 400 when abs_path is not a string", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: 123 }),
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when mode is invalid", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test", mode: "invalid" }),
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("mode");
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: "not json",
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for non-object JSON body", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify("string"),
    });
    const res = await createSetupRun(req, deps);
    expect(res.status).toBe(400);
  });
});

describe("getSetupRun", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 200 with run when found", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}`);
    const res = getSetupRun(runId, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.id).toBe(runId);
  });

  test("returns 404 when run not found", () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist");
    const res = getSetupRun("notexist", deps);
    expect(res.status).toBe(404);
  });
});

describe("getSetupChapters", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 200 with chapters array", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/chapters`);
    const res = getSetupChapters(runId, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.chapters).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("returns 404 when run not found", () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist/chapters");
    const res = getSetupChapters("notexist", deps);
    expect(res.status).toBe(404);
  });
});

describe("answerSetupRun", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 400 when question_id is missing", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/answer`, {
      method: "POST",
      body: JSON.stringify({ value: "my answer" }),
    });
    const res = await answerSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("question_id");
  });

  test("returns 400 when value is missing", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/answer`, {
      method: "POST",
      body: JSON.stringify({ question_id: "q1" }),
    });
    const res = await answerSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("value");
  });

  test("returns 400 when question_id is not a string", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/answer`, {
      method: "POST",
      body: JSON.stringify({ question_id: 123, value: "my answer" }),
    });
    const res = await answerSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 when value is not a string", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/answer`, {
      method: "POST",
      body: JSON.stringify({ question_id: "q1", value: 999 }),
    });
    const res = await answerSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 404 when run not found", async () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist/answer", {
      method: "POST",
      body: JSON.stringify({ question_id: "q1", value: "a" }),
    });
    const res = await answerSetupRun("notexist", req, deps);
    expect(res.status).toBe(404);
  });

  test("returns 400 for invalid JSON", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/answer`, {
      method: "POST",
      body: "not json",
    });
    const res = await answerSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
  });
});

describe("commentSetupRun", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 200 with comment added", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        target_type: "chapter",
        target_id: "ch_1",
        body: "looks good",
      }),
    });
    const res = await commentSetupRun(runId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toHaveLength(1);
    expect(body.chapters[0].title).toContain("chapter");
    expect(body.chapters[0].body).toBe("looks good");
  });

  test("returns 200 with artifact_refs", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        target_type: "document",
        target_id: "doc_1",
        body: "check this",
        artifact_refs: ["file:///a/b.ts"],
      }),
    });
    const res = await commentSetupRun(runId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters[0].artifact_refs).toEqual(["file:///a/b.ts"]);
  });

  test("returns 400 when target_type is missing", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/comments`, {
      method: "POST",
      body: JSON.stringify({ target_id: "ch_1", body: "hi" }),
    });
    const res = await commentSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("target_type");
  });

  test("returns 400 when target_type is invalid", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        target_type: "invalid",
        target_id: "ch_1",
        body: "hi",
      }),
    });
    const res = await commentSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("target_type");
  });

  test("returns 400 when target_id is missing", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/comments`, {
      method: "POST",
      body: JSON.stringify({ target_type: "chapter", body: "hi" }),
    });
    const res = await commentSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("target_id");
  });

  test("returns 400 when body is missing", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/comments`, {
      method: "POST",
      body: JSON.stringify({ target_type: "chapter", target_id: "ch_1" }),
    });
    const res = await commentSetupRun(runId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("body");
  });

  test("returns 404 when run not found", async () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist/comments", {
      method: "POST",
      body: JSON.stringify({
        target_type: "chapter",
        target_id: "ch_1",
        body: "hi",
      }),
    });
    const res = await commentSetupRun("notexist", req, deps);
    expect(res.status).toBe(404);
  });
});

describe("approveScaffold", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 409 when verdict is not resolved", async () => {
    const res = await approveScaffold(runId, deps);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("setup_not_ready");
    expect(body.error.message).toContain("resolved");
  });

  test("returns 200 when verdict is resolved (updates phase to generation)", async () => {
    deps.store.updateVerdict(runId, "resolved");
    const res = await approveScaffold(runId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phase).toBe("generation");
    expect(body.verdict).toBe("resolved");
  });

  test("returns 404 when run not found", async () => {
    const res = await approveScaffold("notexist", deps);
    expect(res.status).toBe(404);
  });
});

describe("resumeSetupRun", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 409 when status is not active", async () => {
    deps.store.complete(runId);
    const res = await resumeSetupRun(runId, deps);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("setup_run_not_active");
  });

  test("returns 200 when status is active", async () => {
    const res = await resumeSetupRun(runId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(runId);
    expect(body.status).toBe("active");
  });

  test("returns 404 when run not found", async () => {
    const res = await resumeSetupRun("notexist", deps);
    expect(res.status).toBe(404);
  });
});

describe("deleteSetupRun", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 204 on successful delete", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}`, {
      method: "DELETE",
    });
    const res = await deleteSetupRun(runId, req, deps);
    expect(res.status).toBe(204);
  });

  test("returns 404 when run not found", async () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist", {
      method: "DELETE",
    });
    const res = await deleteSetupRun("notexist", req, deps);
    expect(res.status).toBe(404);
  });

  test("deletes without projectRegistry and sessionsDir (optional deps)", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}`, {
      method: "DELETE",
    });
    const res = await deleteSetupRun(runId, req, deps);
    expect(res.status).toBe(204);
  });
});

describe("getSetupEvents", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns 200 and closes immediately when no events file exists", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}/events`);
    const res = getSetupEvents(runId, req, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  test("returns 404 when run not found", () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist/events");
    const res = getSetupEvents("notexist", req, deps);
    expect(res.status).toBe(404);
  });

  test("streams events from events.jsonl", async () => {
    const eventsPath = join(deps.eventsDir, runId, "events.jsonl");
    mkdirSync(join(deps.eventsDir, runId), { recursive: true });
    writeFileSync(
      eventsPath,
      JSON.stringify({ id: "evt_1", topic: "discovery.start", data: {} }) + "\n" +
        JSON.stringify({ id: "evt_2", topic: "discovery.done", data: {} }) + "\n",
    );

    const req = new Request(`http://localhost/v1/setup/runs/${runId}/events`);
    const res = getSetupEvents(runId, req, deps);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain("id: evt_1");
    expect(text).toContain("event: discovery.start");
    expect(text).toContain("id: evt_2");
    expect(text).toContain("event: discovery.done");
  });

  test("skips events before since param", async () => {
    const eventsPath = join(deps.eventsDir, runId, "events.jsonl");
    mkdirSync(join(deps.eventsDir, runId), { recursive: true });
    writeFileSync(
      eventsPath,
      JSON.stringify({ id: "evt_1", topic: "discovery.start", data: {} }) + "\n" +
        JSON.stringify({ id: "evt_2", topic: "discovery.done", data: {} }) + "\n",
    );

    const req = new Request(`http://localhost/v1/setup/runs/${runId}/events?since=evt_1`);
    const res = getSetupEvents(runId, req, deps);
    const text = await res.text();
    expect(text).toContain("id: evt_2");
    expect(text).not.toContain("evt_1");
  });

  test("skips events before Last-Event-ID header", async () => {
    const eventsPath = join(deps.eventsDir, runId, "events.jsonl");
    mkdirSync(join(deps.eventsDir, runId), { recursive: true });
    writeFileSync(
      eventsPath,
      JSON.stringify({ id: "a", topic: "discovery.start", data: {} }) + "\n" +
        JSON.stringify({ id: "b", topic: "discovery.done", data: {} }) + "\n",
    );

    const req = new Request(`http://localhost/v1/setup/runs/${runId}/events`, {
      headers: { "Last-Event-ID": "a" },
    });
    const res = getSetupEvents(runId, req, deps);
    const text = await res.text();
    expect(text).toContain("id: b");
    expect(text).not.toContain("id: a");
  });

  test("skips malformed lines in events file", async () => {
    const eventsPath = join(deps.eventsDir, runId, "events.jsonl");
    mkdirSync(join(deps.eventsDir, runId), { recursive: true });
    writeFileSync(
      eventsPath,
      "not json\n" +
        JSON.stringify({ id: "evt_1", topic: "discovery.start", data: {} }) + "\n",
    );

    const req = new Request(`http://localhost/v1/setup/runs/${runId}/events`);
    const res = getSetupEvents(runId, req, deps);
    const text = await res.text();
    expect(text).toContain("id: evt_1");
  });
});

describe("buildRunResponse fields", () => {
  let tmp: string;
  let deps: SetupDeps;
  let runId: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-handlers-"));
    deps = makeDeps(tmp);
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const created = await (await createSetupRun(createReq, deps)).json();
    runId = created.id;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("response includes expected envelope fields", async () => {
    const req = new Request(`http://localhost/v1/setup/runs/${runId}`);
    const res = getSetupRun(runId, deps);
    const body = await (res as Response).json();

    expect(body._v).toBe(1);
    expect(body.id).toBe(runId);
    expect(body.project_id).toBe(null);
    expect(body.abs_path).toBe("/test");
    expect(body.status).toBe("active");
    expect(body.phase).toBe("discovery");
    expect(body.verdict).toBe("unresolved");
    expect(body.questions).toEqual([]);
    expect(body.chapters).toEqual([]);
    expect(body.findings_count).toBe(0);
    expect(body.non_interactive).toBe(false);
    expect(body.events_url).toContain(`/v1/setup/runs/${runId}/events`);
    expect(body.chapters_url).toContain(`/v1/setup/runs/${runId}/chapters`);
  });
});
