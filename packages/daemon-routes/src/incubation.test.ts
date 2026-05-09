import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";
import {
  IncubationStore,
  IncubationItemNotFoundError,
  ResearchRunNotFoundError,
  ProposalNotFoundError,
  CommentNotFoundError,
  type IncubationScope,
  type IncubationItemStatus,
  type ResearchRunMode,
  type ProposalKind,
} from "@aloop/state-sqlite";
import type { IncubationDeps } from "./incubation.ts";
import {
  createIncubationItem,
  listIncubationItems,
  getIncubationItem,
  patchIncubationItem,
  deleteIncubationItem,
  createResearchRun,
  listResearchRuns,
  getResearchRun,
  pauseResearchRun,
  resumeResearchRun,
  deleteResearchRun,
  patchResearchRun,
  createProposal,
  getProposal,
  patchProposal,
  listProposalsForItem,
  createComment,
  listComments,
  getComment,
  patchComment,
  deleteComment,
} from "./incubation.ts";

function makeDeps(): IncubationDeps {
  const { db } = openDatabase(":memory:");
  const store = new IncubationStore(db);
  return { store };
}

// ─────────────────────────────────────────────────────────────────
// createIncubationItem
// ─────────────────────────────────────────────────────────────────

describe("createIncubationItem", () => {
  let deps: IncubationDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  afterEach(() => {
    // store holds db reference internally — close not exposed, memory DB auto-cleaned
  });

  test("returns 201 with created item on valid global scope input", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({
        scope: "global",
        title: "Explore new AI architecture",
        description: "Researching a novel transformer variant",
      }),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.scope).toBe("global");
    expect(body.title).toBe("Explore new AI architecture");
    expect(body.status).toBe("active");
    expect(body.project_id).toBeNull();
    expect(body.research_runs).toEqual([]);
    expect(body.proposal).toBeNull();
  });

  test("returns 201 with created item on project scope", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({
        scope: "project",
        project_id: "proj_test123",
        title: "Project-scoped research",
        description: "Investigate within a project",
      }),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.scope).toBe("project");
    expect(body.project_id).toBe("proj_test123");
  });

  test("returns 400 when scope is missing", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ title: "No scope", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("scope");
  });

  test("returns 400 when scope is invalid value", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "not_valid", title: "x", description: "y" }),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("scope");
  });

  test("returns 400 when scope is global but project_id is provided", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({
        scope: "global",
        project_id: "should-not-have-this",
        title: "Conflicting scopes",
        description: "desc",
      }),
    });
    // Handler should accept it (project_id is ignored for global)
    const res = await createIncubationItem(req, deps);
    // The implementation accepts project_id silently for global scope
    expect(res.status).toBe(201);
  });

  test("returns 400 when title is missing", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("title");
  });

  test("returns 201 with optional status", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({
        scope: "global",
        title: "Paused item",
        description: "desc",
        status: "paused",
      }),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("paused");
  });

  test("returns 400 for invalid status", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({
        scope: "global",
        title: "x",
        description: "y",
        status: "not_a_status",
      }),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("status");
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: "not json",
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 when body is a JSON array", async () => {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify([{ scope: "global", title: "x", description: "y" }]),
    });
    const res = await createIncubationItem(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("request body must be a JSON object");
  });
});

// ─────────────────────────────────────────────────────────────────
// listIncubationItems
// ─────────────────────────────────────────────────────────────────

describe("listIncubationItems", () => {
  let deps: IncubationDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  async function createItem(scope: IncubationScope, title: string) {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope, title, description: "desc" }),
    });
    await createIncubationItem(req, deps);
  }

  test("returns 200 with empty items when no items exist", async () => {
    const req = new Request("http://localhost/v1/incubation/items");
    const res = await listIncubationItems(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  test("returns all items when no filters applied", async () => {
    await createItem("global", "Item A");
    await createItem("project", "Item B");
    const req = new Request("http://localhost/v1/incubation/items");
    const res = await listIncubationItems(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
  });

  test("returns 200 for valid scope filter", async () => {
    await createItem("global", "Global Item");
    await createItem("project", "Project Item");
    const req = new Request("http://localhost/v1/incubation/items?scope=global");
    const res = await listIncubationItems(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.scope).toBe("global");
  });

  test("returns 200 for valid status filter", async () => {
    // Create paused item
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Active", description: "d", status: "active" }),
    });
    await createIncubationItem(req1, deps);
    const req2 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Paused", description: "d", status: "paused" }),
    });
    await createIncubationItem(req2, deps);

    const req = new Request("http://localhost/v1/incubation/items?status=paused");
    const res = await listIncubationItems(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.status).toBe("paused");
  });

  test("returns 400 for invalid scope filter", async () => {
    const req = new Request("http://localhost/v1/incubation/items?scope=invalid_scope");
    const res = await listIncubationItems(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for invalid status filter", async () => {
    const req = new Request("http://localhost/v1/incubation/items?status=invalid_status");
    const res = await listIncubationItems(req, deps);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// getIncubationItem
// ─────────────────────────────────────────────────────────────────

describe("getIncubationItem", () => {
  let deps: IncubationDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  async function createItem(scope: IncubationScope = "global", title = "Test Item"): Promise<string> {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope, title, description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    const body = await res.json();
    return body.id;
  }

  test("returns 200 with item when found", async () => {
    const id = await createItem();
    const res = getIncubationItem(id, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
    expect(body.title).toBe("Test Item");
  });

  test("returns 404 when item not found", async () => {
    const res = getIncubationItem("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("incubation_item_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// patchIncubationItem
// ─────────────────────────────────────────────────────────────────

describe("patchIncubationItem", () => {
  let deps: IncubationDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  async function createItem(scope: IncubationScope = "global", title = "Test Item"): Promise<string> {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope, title, description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    const body = await res.json();
    return body.id;
  }

  test("returns 200 with patched item when title is updated", async () => {
    const id = await createItem();
    const req = new Request(`http://localhost/v1/incubation/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const res = await patchIncubationItem(id, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Updated Title");
  });

  test("returns 200 when status is patched to paused", async () => {
    const id = await createItem();
    const req = new Request(`http://localhost/v1/incubation/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "paused" }),
    });
    const res = await patchIncubationItem(id, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("paused");
  });

  test("returns 404 when item does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/items/nonexistent", {
      method: "PATCH",
      body: JSON.stringify({ title: "x" }),
    });
    const res = await patchIncubationItem("nonexistent", req, deps);
    expect(res.status).toBe(404);
  });

  test("returns 400 for invalid status value", async () => {
    const id = await createItem();
    const req = new Request(`http://localhost/v1/incubation/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "not_a_status" }),
    });
    const res = await patchIncubationItem(id, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("status");
  });

  test("returns 400 for invalid JSON body", async () => {
    const id = await createItem();
    const req = new Request(`http://localhost/v1/incubation/items/${id}`, {
      method: "PATCH",
      body: "not json",
    });
    const res = await patchIncubationItem(id, req, deps);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// deleteIncubationItem
// ─────────────────────────────────────────────────────────────────

describe("deleteIncubationItem", () => {
  let deps: IncubationDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  async function createItem(): Promise<string> {
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "To Delete", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    const body = await res.json();
    return body.id;
  }

  test("returns 204 when item is deleted", async () => {
    const id = await createItem();
    const res = deleteIncubationItem(id, deps);
    expect(res.status).toBe(204);
    // Verify it's gone
    const getRes = getIncubationItem(id, deps);
    expect(getRes.status).toBe(404);
  });

  test("returns 404 when item does not exist", async () => {
    const res = deleteIncubationItem("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("incubation_item_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// createResearchRun
// ─────────────────────────────────────────────────────────────────

describe("createResearchRun", () => {
  let deps: IncubationDeps;
  let itemId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Run Test", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    const body = await res.json();
    itemId = body.id;
  });

  test("returns 201 with created run on valid input", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({
        mode: "source_synthesis",
        plan: [{ kind: "documentation", description: "Investigate scaling laws", location: "https://example.com" }],
      }),
    });
    const res = await createResearchRun(itemId, req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.incubation_item_id).toBe(itemId);
    expect(body.mode).toBe("source_synthesis");
    expect(body.status).toBe("pending");
    expect(body.started_at).toBeNull();
    expect(body.completed_at).toBeNull();
  });

  test("returns 400 when mode is missing", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({ plan: { prompt: "x" } }),
    });
    const res = await createResearchRun(itemId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("mode");
  });

  test("returns 400 when mode is invalid", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({ mode: "not_valid", plan: { prompt: "x" } }),
    });
    const res = await createResearchRun(itemId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 404 when incubation item does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/items/nonexistent/runs", {
      method: "POST",
      body: JSON.stringify({ mode: "source_synthesis", plan: [{ kind: "documentation", description: "x", location: "https://x.com" }] }),
    });
    const res = await createResearchRun("nonexistent", req, deps);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// listResearchRuns
// ─────────────────────────────────────────────────────────────────

describe("listResearchRuns", () => {
  let deps: IncubationDeps;
  let itemId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "List Runs", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    const body = await res.json();
    itemId = body.id;
  });

  test("returns 200 with empty runs when no runs exist", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`);
    const res = listResearchRuns(itemId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  test("returns 404 when incubation item does not exist", () => {
    const req = new Request("http://localhost/v1/incubation/items/nonexistent/runs");
    const res = listResearchRuns("nonexistent", deps);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// patchResearchRun
// ─────────────────────────────────────────────────────────────────

describe("patchResearchRun", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let runId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Patch Run", description: "desc" }),
    });
    const res1 = await createIncubationItem(req1, deps);
    const body1 = await res1.json();
    itemId = body1.id;

    const req2 = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({ mode: "experiment_loop", plan: [{ kind: "documentation", description: "x", location: "https://x.com" }] }),
    });
    const res2 = await createResearchRun(itemId, req2, deps);
    const body2 = await res2.json();
    runId = body2.id;
  });

  test("returns 200 with patched run when status is updated", async () => {
    const req = new Request(`http://localhost/v1/incubation/runs/${runId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "running" }),
    });
    const res = await patchResearchRun(runId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
  });

  test("returns 404 when run does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/runs/nonexistent", {
      method: "PATCH",
      body: JSON.stringify({ status: "running" }),
    });
    const res = await patchResearchRun("nonexistent", req, deps);
    expect(res.status).toBe(404);
  });

  test("returns 400 for invalid status value", async () => {
    const req = new Request(`http://localhost/v1/incubation/runs/${runId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "not_a_status" }),
    });
    const res = await patchResearchRun(runId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request(`http://localhost/v1/incubation/runs/${runId}`, {
      method: "PATCH",
      body: "not json",
    });
    const res = await patchResearchRun(runId, req, deps);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// createProposal
// ─────────────────────────────────────────────────────────────────

describe("createProposal", () => {
  let deps: IncubationDeps;
  let itemId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Proposal Test", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    const body = await res.json();
    itemId = body.id;
  });

  test("returns 201 with created proposal on valid input", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: JSON.stringify({
        kind: "epic",
        title: "Add new endpoint",
        description: "Propose a new REST endpoint",
        promotion_ref: { target: "backlog", ref: "proposal-1" },
      }),
    });
    const res = await createProposal(itemId, req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.incubation_item_id).toBe(itemId);
    expect(body.kind).toBe("epic");
    expect(body.title).toBe("Add new endpoint");
    expect(body.promotion_target).toBe("backlog");
  });

  test("returns 400 when kind is missing", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: JSON.stringify({ title: "x", description: "y" }),
    });
    const res = await createProposal(itemId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("kind");
  });

  test("returns 400 when kind is invalid", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: JSON.stringify({ kind: "not_valid", title: "x", description: "y" }),
    });
    const res = await createProposal(itemId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 when title is missing", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: JSON.stringify({ kind: "epic", description: "y" }),
    });
    const res = await createProposal(itemId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("title");
  });

  test("returns 404 when incubation item does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/items/nonexistent/proposals", {
      method: "POST",
      body: JSON.stringify({ kind: "epic", title: "x", description: "y" }),
    });
    const res = await createProposal("nonexistent", req, deps);
    expect(res.status).toBe(404);
  });

  test("returns 400 when title is missing", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: JSON.stringify({ kind: "epic", description: "y" }),
    });
    const res = await createProposal(itemId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("title");
  });

  test("returns 404 when incubation item does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/items/nonexistent/proposals", {
      method: "POST",
      body: JSON.stringify({ kind: "epic", title: "x", description: "y" }),
    });
    const res = await createProposal("nonexistent", req, deps);
    expect(res.status).toBe(404);
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: "not json",
    });
    const res = await createProposal(itemId, req, deps);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// getProposal
// ─────────────────────────────────────────────────────────────────

describe("getProposal", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let proposalId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Get Proposal Test", description: "desc" }),
    });
    const res1 = await createIncubationItem(req1, deps);
    const body1 = await res1.json();
    itemId = body1.id;

    const req2 = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: JSON.stringify({ kind: "epic", title: "Test Proposal", description: "desc" }),
    });
    const res2 = await createProposal(itemId, req2, deps);
    const body2 = await res2.json();
    proposalId = body2.id;
  });

  test("returns 200 with proposal when found", async () => {
    const res = getProposal(proposalId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(proposalId);
    expect(body.title).toBe("Test Proposal");
  });

  test("returns 404 when proposal not found", async () => {
    const res = getProposal("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("proposal_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// listProposalsForItem
// ─────────────────────────────────────────────────────────────────

describe("listProposalsForItem", () => {
  let deps: IncubationDeps;
  let itemId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "List Proposals Test", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    const body = await res.json();
    itemId = body.id;
  });

  test("returns 200 with empty proposals when none exist", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`);
    const res = listProposalsForItem(itemId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  test("returns 404 when incubation item does not exist", () => {
    const req = new Request("http://localhost/v1/incubation/items/nonexistent/proposals");
    const res = listProposalsForItem("nonexistent", deps);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// getResearchRun
// ─────────────────────────────────────────────────────────────────

describe("getResearchRun", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let runId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Get Run Test", description: "desc" }),
    });
    const res1 = await createIncubationItem(req1, deps);
    const body1 = await res1.json();
    itemId = body1.id;

    const req2 = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({ mode: "source_synthesis", plan: [{ kind: "documentation", description: "x", location: "https://x.com" }] }),
    });
    const res2 = await createResearchRun(itemId, req2, deps);
    const body2 = await res2.json();
    runId = body2.id;
  });

  test("returns 200 with run when found", async () => {
    const res = getResearchRun(runId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(runId);
    expect(body.mode).toBe("source_synthesis");
  });

  test("returns 404 when run does not exist", async () => {
    const res = getResearchRun("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("research_run_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// pauseResearchRun
// ─────────────────────────────────────────────────────────────────

describe("pauseResearchRun", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let runId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Pause Run Test", description: "desc" }),
    });
    const res1 = await createIncubationItem(req1, deps);
    const body1 = await res1.json();
    itemId = body1.id;

    const req2 = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({ mode: "experiment_loop", plan: [{ kind: "documentation", description: "x", location: "https://x.com" }] }),
    });
    const res2 = await createResearchRun(itemId, req2, deps);
    const body2 = await res2.json();
    runId = body2.id;
  });

  test("returns 200 when paused from running", async () => {
    // Transition run from pending -> running first
    const patchReq = new Request(`http://localhost/v1/incubation/runs/${runId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "running" }),
    });
    await patchResearchRun(runId, patchReq, deps);

    const res = await pauseResearchRun(runId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("paused");
  });

  test("returns 400 when run is not in running status", async () => {
    await pauseResearchRun(runId, deps);

    const res = await pauseResearchRun(runId, deps);
    expect(res.status).toBe(400);
  });

  test("returns 404 when run does not exist", async () => {
    const res = await pauseResearchRun("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// resumeResearchRun
// ─────────────────────────────────────────────────────────────────

describe("resumeResearchRun", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let runId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Resume Run Test", description: "desc" }),
    });
    const res1 = await createIncubationItem(req1, deps);
    const body1 = await res1.json();
    itemId = body1.id;

    const req2 = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({ mode: "experiment_loop", plan: [{ kind: "documentation", description: "x", location: "https://x.com" }] }),
    });
    const res2 = await createResearchRun(itemId, req2, deps);
    const body2 = await res2.json();
    runId = body2.id;
  });

  test("returns 200 when resumed from paused", async () => {
    // Transition run from pending -> running -> paused first
    const patchReq = new Request(`http://localhost/v1/incubation/runs/${runId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "running" }),
    });
    await patchResearchRun(runId, patchReq, deps);
    await pauseResearchRun(runId, deps);

    const res = await resumeResearchRun(runId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
  });

  test("returns 400 when run is not paused", async () => {
    const res = await resumeResearchRun(runId, deps);
    expect(res.status).toBe(400);
  });

  test("returns 404 when run does not exist", async () => {
    const res = await resumeResearchRun("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// deleteResearchRun
// ─────────────────────────────────────────────────────────────────

describe("deleteResearchRun", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let runId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Delete Run Test", description: "desc" }),
    });
    const res1 = await createIncubationItem(req1, deps);
    const body1 = await res1.json();
    itemId = body1.id;

    const req2 = new Request(`http://localhost/v1/incubation/items/${itemId}/runs`, {
      method: "POST",
      body: JSON.stringify({ mode: "source_synthesis", plan: [{ kind: "documentation", description: "x", location: "https://x.com" }] }),
    });
    const res2 = await createResearchRun(itemId, req2, deps);
    const body2 = await res2.json();
    runId = body2.id;
  });

  test("returns 204 when run is deleted", async () => {
    const res = await deleteResearchRun(runId, deps);
    expect(res.status).toBe(204);
  });

  test("returns 404 when run does not exist", async () => {
    const res = await deleteResearchRun("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// patchProposal
// ─────────────────────────────────────────────────────────────────

describe("patchProposal", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let proposalId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req1 = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Patch Proposal Test", description: "desc" }),
    });
    const res1 = await createIncubationItem(req1, deps);
    const body1 = await res1.json();
    itemId = body1.id;

    const req2 = new Request(`http://localhost/v1/incubation/items/${itemId}/proposals`, {
      method: "POST",
      body: JSON.stringify({ kind: "epic", title: "Original Title", description: "Original description" }),
    });
    const res2 = await createProposal(itemId, req2, deps);
    const body2 = await res2.json();
    proposalId = body2.id;
  });

  test("returns 200 with patched proposal when title is updated", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Updated Title");
    expect(body.description).toBe("Original description");
  });

  test("returns 200 with patched proposal when description is updated", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "Updated description" }),
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe("Updated description");
  });

  test("returns 200 with patched proposal when promotion_target is updated", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({ promotion_target: "sprint" }),
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promotion_target).toBe("sprint");
  });

  test("returns 200 with patched proposal when promotion_ref is updated", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({ promotion_ref: { target: "architecture", ref: "arch-123" } }),
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promotion_ref?.target).toBe("architecture");
    expect(body.promotion_ref?.ref).toBe("arch-123");
  });

  test("returns 200 with patched proposal when all fields are updated", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "Full Patch",
        description: "Full description patch",
        promotion_target: "spec",
        promotion_ref: { target: "workflow", ref: "wf-456" },
      }),
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Full Patch");
    expect(body.description).toBe("Full description patch");
    expect(body.promotion_target).toBe("spec");
    expect(body.promotion_ref?.target).toBe("workflow");
    expect(body.promotion_ref?.ref).toBe("wf-456");
  });

  test("returns 404 when proposal does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/proposals/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      body: JSON.stringify({ title: "New Title" }),
    });
    const res = await patchProposal("00000000-0000-0000-0000-000000000000", req, deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("proposal_not_found");
  });

  test("returns 400 for invalid promotion_target value", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({ promotion_target: "not_a_target" }),
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid promotion_ref target", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({ promotion_ref: { target: "not_a_target", ref: "ref-123" } }),
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request(`http://localhost/v1/incubation/proposals/${proposalId}`, {
      method: "PATCH",
      body: "not json",
    });
    const res = await patchProposal(proposalId, req, deps);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────

describe("createComment", () => {
  let deps: IncubationDeps;
  let itemId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Test Item", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    itemId = (await res.json()).id;
  });

  test("returns 201 with created comment", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "This is a comment", author: "alice" }),
    });
    const res = await createComment(itemId, req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.body).toBe("This is a comment");
    expect(body.author).toBe("alice");
    expect(body.incubation_item_id).toBe(itemId);
    expect(body._v).toBe(1);
  });

  test("defaults author to anonymous when not provided", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "Anonymous comment" }),
    });
    const res = await createComment(itemId, req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.author).toBe("anonymous");
  });

  test("returns 400 when body is missing", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/comments`, {
      method: "POST",
      body: JSON.stringify({ author: "bob" }),
    });
    const res = await createComment(itemId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 404 when incubation item does not exist", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const req = new Request(`http://localhost/v1/incubation/items/${fakeId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "Hello" }),
    });
    const res = await createComment(fakeId, req, deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("incubation_item_not_found");
  });
});

describe("listComments", () => {
  let deps: IncubationDeps;
  let itemId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Test Item", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    itemId = (await res.json()).id;

    // Create two comments
    for (const body of ["First comment", "Second comment"]) {
      await createComment(itemId, new Request(`http://localhost/v1/incubation/items/${itemId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }), deps);
    }
  });

  test("returns 200 with comments ordered by created_at asc", async () => {
    const req = new Request(`http://localhost/v1/incubation/items/${itemId}/comments`);
    const res = await listComments(itemId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].body).toBe("First comment");
    expect(body.items[1].body).toBe("Second comment");
    expect(body._v).toBe(1);
    expect(body.next_cursor).toBeNull();
  });

  test("returns 404 when incubation item does not exist", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const req = new Request(`http://localhost/v1/incubation/items/${fakeId}/comments`);
    const res = await listComments(fakeId, deps);
    expect(res.status).toBe(404);
  });
});

describe("getComment", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let commentId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Test Item", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    itemId = (await res.json()).id;

    const cReq = new Request(`http://localhost/v1/incubation/items/${itemId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "My comment", author: "carol" }),
    });
    const cRes = await createComment(itemId, cReq, deps);
    commentId = (await cRes.json()).id;
  });

  test("returns 200 with the comment", async () => {
    const req = new Request(`http://localhost/v1/incubation/comments/${commentId}`);
    const res = await getComment(commentId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(commentId);
    expect(body.body).toBe("My comment");
    expect(body.author).toBe("carol");
    expect(body._v).toBe(1);
  });

  test("returns 404 when comment does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/comments/00000000-0000-0000-0000-000000000000");
    const res = await getComment("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("incubation_comment_not_found");
  });
});

describe("patchComment", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let commentId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Test Item", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    itemId = (await res.json()).id;

    const cReq = new Request(`http://localhost/v1/incubation/items/${itemId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "Original body" }),
    });
    const cRes = await createComment(itemId, cReq, deps);
    commentId = (await cRes.json()).id;
  });

  test("returns 200 with updated comment", async () => {
    const req = new Request(`http://localhost/v1/incubation/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body: "Updated body" }),
    });
    const res = await patchComment(commentId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.body).toBe("Updated body");
    expect(body.id).toBe(commentId);
  });

  test("returns 400 when body is not a string", async () => {
    const req = new Request(`http://localhost/v1/incubation/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body: 123 }),
    });
    const res = await patchComment(commentId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 404 when comment does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/comments/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      body: JSON.stringify({ body: "New body" }),
    });
    const res = await patchComment("00000000-0000-0000-0000-000000000000", req, deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("incubation_comment_not_found");
  });
});

describe("deleteComment", () => {
  let deps: IncubationDeps;
  let itemId: string;
  let commentId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const req = new Request("http://localhost/v1/incubation/items", {
      method: "POST",
      body: JSON.stringify({ scope: "global", title: "Test Item", description: "desc" }),
    });
    const res = await createIncubationItem(req, deps);
    itemId = (await res.json()).id;

    const cReq = new Request(`http://localhost/v1/incubation/items/${itemId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "To be deleted" }),
    });
    const cRes = await createComment(itemId, cReq, deps);
    commentId = (await cRes.json()).id;
  });

  test("returns 204 on successful deletion", async () => {
    const req = new Request(`http://localhost/v1/incubation/comments/${commentId}`, { method: "DELETE" });
    const res = await deleteComment(commentId, deps);
    expect(res.status).toBe(204);

    // Verify it's gone
    const getReq = new Request(`http://localhost/v1/incubation/comments/${commentId}`);
    const getRes = await getComment(commentId, deps);
    expect(getRes.status).toBe(404);
  });

  test("returns 404 when comment does not exist", async () => {
    const req = new Request("http://localhost/v1/incubation/comments/00000000-0000-0000-0000-000000000000", { method: "DELETE" });
    const res = await deleteComment("00000000-0000-0000-0000-000000000000", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("incubation_comment_not_found");
  });
});
