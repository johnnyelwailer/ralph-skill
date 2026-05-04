/**
 * Tests for incubation API handlers.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { handleIncubation, type IncubationDeps } from "./incubation-handlers.ts";
import { migrate } from "@aloop/sqlite-db";
import { loadBundledMigrations } from "@aloop/sqlite-db";

// ---------------------------------------------------------------------------
// Test database setup
// ---------------------------------------------------------------------------

function createTestDb(): { db: Database; dir: string } {
  const dir = join("/tmp", `incubation-test-${crypto.randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, "test.db"));
  const migrations = loadBundledMigrations();
  migrate(db, migrations);
  return { db, dir };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

async function makeRequest(
  handler: typeof handleIncubation,
  deps: IncubationDeps,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<Response> {
  // Preserve full URL (including query string) so the handler can read params via new URL(req.url).
  const url = `http://localhost${pathname}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const req = new Request(url, init);
  const resp = await handler(req, deps, pathname);
  if (resp === undefined) {
    return new Response(null, { status: 404 });
  }
  return resp;
}

async function createItem(
  handler: typeof handleIncubation,
  deps: IncubationDeps,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
    title: "Test item",
    body: "Test body",
    scope: { kind: "global" },
    source: { client: "api" },
    ...overrides,
  });
  expect(resp.status).toBe(201);
  return resp.clone().json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let handler: typeof handleIncubation;
let deps: IncubationDeps;
let db: Database;
let dir: string;

beforeEach(() => {
  const setup = createTestDb();
  db = setup.db;
  dir = setup.dir;
  deps = { db, sessionsDir: "/tmp/sessions" };
  handler = handleIncubation;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// IncubationItem tests
// ---------------------------------------------------------------------------

describe("IncubationItem", () => {
  test("POST /v1/incubation/items creates an item with all fields", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "My research idea",
      body: "Investigate the properties of dark matter",
      scope: { kind: "global" },
      labels: ["research", "physics"],
      priority: "high",
      source: { client: "composer" },
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(typeof body.id).toBe("string");
    expect(body.title).toBe("My research idea");
    expect(body.body).toBe("Investigate the properties of dark matter");
    expect(body.state).toBe("captured");
    expect(body.labels).toEqual(["research", "physics"]);
    expect(body.priority).toBe("high");
    expect((body.scope as Record<string, unknown>).kind).toBe("global");
    expect((body.source as Record<string, unknown>).client).toBe("composer");
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();
  });

  test("POST /v1/incubation/items with project scope", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Project-scoped item",
      scope: { kind: "project", project_id: "proj_123" },
      source: { client: "cli" },
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.scope as Record<string, unknown>).kind).toBe("project");
    expect((body.scope as Record<string, unknown>).project_id).toBe("proj_123");
  });

  test("POST /v1/incubation/items with candidate_project scope", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "New project candidate",
      scope: { kind: "candidate_project", abs_path: "/home/user/new-project", repo_url: "https://github.com/user/repo" },
      source: { client: "dashboard" },
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    const scope = body.scope as Record<string, unknown>;
    expect(scope.kind).toBe("candidate_project");
    expect(scope.abs_path).toBe("/home/user/new-project");
    expect(scope.repo_url).toBe("https://github.com/user/repo");
  });

  test("POST /v1/incubation/items returns 400 when title is missing", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      body: "No title here",
      source: { client: "api" },
    });
    expect(resp.status).toBe(400);
  });

  test("GET /v1/incubation/items returns empty list initially", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/incubation/items");
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.items).toEqual([]);
  });

  test("GET /v1/incubation/items returns created items", async () => {
    await createItem(handler, deps, { title: "Item A" });
    await createItem(handler, deps, { title: "Item B" });

    const resp = await makeRequest(handler, deps, "GET", "/v1/incubation/items");
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.items as unknown[]).length).toBe(2);
  });

  test("GET /v1/incubation/items?state= captures filters by state", async () => {
    const item = await createItem(handler, deps, { title: "Clarifying item" });
    // Manually set state via PATCH
    await makeRequest(handler, deps, "PATCH", `/v1/incubation/items/${item.id}`, { state: "clarifying" });

    const resp = await makeRequest(handler, deps, "GET", "/v1/incubation/items?state=clarifying");
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.items as unknown[]).length).toBe(1);
    expect(((body.items as Record<string, unknown>[])[0]).id).toBe(item.id);
  });

  test("GET /v1/incubation/items?state= returns 400 for invalid state", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/incubation/items?state=invalid_state");
    expect(resp.status).toBe(400);
  });

  test("GET /v1/incubation/items/:id returns item when found", async () => {
    const item = await createItem(handler, deps, { title: "Find me" });
    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/items/${item.id}`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.id).toBe(item.id);
    expect(body.title).toBe("Find me");
  });

  test("GET /v1/incubation/items/:id returns 404 for unknown id", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/incubation/items/unknown-id");
    expect(resp.status).toBe(404);
  });

  test("PATCH /v1/incubation/items/:id updates state", async () => {
    const item = await createItem(handler, deps, { title: "Updatable item" });
    expect(item.state).toBe("captured");

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/items/${item.id}`, {
      state: "clarifying",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.state).toBe("clarifying");
  });

  test("PATCH /v1/incubation/items/:id returns 400 for invalid state", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/items/${item.id}`, {
      state: "not_a_valid_state",
    });
    expect(resp.status).toBe(400);
  });

  test("DELETE /v1/incubation/items/:id discards the item", async () => {
    const item = await createItem(handler, deps, { title: "To be discarded" });
    const resp = await makeRequest(handler, deps, "DELETE", `/v1/incubation/items/${item.id}`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.state).toBe("discarded");
  });

  test("GET /v1/incubation/items?scope_kind=project filters by scope", async () => {
    await createItem(handler, deps, { title: "Global item", scope: { kind: "global" } });
    const projectItem = await createItem(handler, deps, {
      title: "Project item",
      scope: { kind: "project", project_id: "proj_abc" },
    });

    const resp = await makeRequest(handler, deps, "GET", "/v1/incubation/items?scope_kind=project");
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.items as unknown[]).length).toBe(1);
    expect(((body.items as Record<string, unknown>[])[0]).id).toBe(projectItem.id);
  });
});

// ---------------------------------------------------------------------------
// ResearchRun tests
// ---------------------------------------------------------------------------

describe("ResearchRun", () => {
  test("POST /v1/incubation/items/:id/research-runs creates a research run", async () => {
    const item = await createItem(handler, deps, { title: "Research item" });

    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-runs`, {
      mode: "source_synthesis",
      question: "What are the latest developments in fusion energy?",
      provider_chain: ["opencode/default"],
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(typeof body.id).toBe("string");
    expect(body.item_id).toBe(item.id);
    expect(body.status).toBe("pending");
    expect(body.mode).toBe("source_synthesis");
    expect(body.question).toBe("What are the latest developments in fusion energy?");
    expect(body.cost_usd).toBe(0);
    expect(body.tokens_in).toBe(0);
    expect(body.tokens_out).toBe(0);
    expect(body.artifact_ids).toEqual([]);
  });

  test("POST /v1/incubation/items/:id/research-runs returns 404 for unknown item", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items/unknown-id/research-runs", {
      mode: "source_synthesis",
      question: "Test",
    });
    expect(resp.status).toBe(404);
  });

  test("GET /v1/incubation/items/:id/research-runs lists runs for an item", async () => {
    const item = await createItem(handler, deps);
    await createItem(handler, deps); // another item
    await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-runs`, {
      mode: "source_synthesis",
      question: "Run 1",
    });
    await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-runs`, {
      mode: "monitor_tick",
      question: "Run 2",
    });

    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/items/${item.id}/research-runs`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.items as unknown[]).length).toBe(2);
  });

  test("GET /v1/incubation/research-runs/:id returns a run", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-runs`, {
      mode: "source_synthesis",
      question: "Find this run",
    });
    const run = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/research-runs/${run.id}`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.id).toBe(run.id);
    expect(body.question).toBe("Find this run");
  });

  test("PATCH /v1/incubation/research-runs/:id updates status", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-runs`, {
      mode: "source_synthesis",
      question: "Status update test",
    });
    const run = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/research-runs/${run.id}`, {
      status: "running",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.status).toBe("running");
  });

  test("PATCH /v1/incubation/research-runs/:id updates phase", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-runs`, {
      mode: "source_synthesis",
      question: "Phase update test",
    });
    const run = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/research-runs/${run.id}`, {
      phase: "source_acquisition",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.phase).toBe("source_acquisition");
  });

  test("PATCH /v1/incubation/research-runs/:id sets findings_summary", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-runs`, {
      mode: "source_synthesis",
      question: "Summary test",
    });
    const run = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/research-runs/${run.id}`, {
      findings_summary: "Fusion energy shows promising developments in 2026.",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.findings_summary).toBe("Fusion energy shows promising developments in 2026.");
  });
});

// ---------------------------------------------------------------------------
// ResearchMonitor tests
// ---------------------------------------------------------------------------

describe("ResearchMonitor", () => {
  function makeMonitorBody() {
    return {
      cadence: "daily",
      question: "Track model capability changes",
      source_plan: {
        allowed_kinds: ["official_docs", "repository"],
        require_citations: true,
      },
      synthesis_policy: {
        mode: "digest",
        alert_conditions: ["new_frontier_model"],
      },
    };
  }

  test("POST /v1/incubation/items/:id/research-monitors creates a monitor", async () => {
    const item = await createItem(handler, deps, { title: "Monitored item" });
    const body = makeMonitorBody();

    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-monitors`, body);
    expect(resp.status).toBe(201);
    const result = await resp.json() as Record<string, unknown>;
    expect(result._v).toBe(1);
    expect(typeof result.id).toBe("string");
    expect(result.item_id).toBe(item.id);
    expect(result.status).toBe("active");
    expect(result.mode).toBe("monitor_tick");
    expect(result.cadence).toBe("daily");
    expect(result.question).toBe("Track model capability changes");
  });

  test("POST /v1/incubation/items/:id/research-monitors with cron cadence", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-monitors`, {
      cadence: { cron: "0 0 */2 * *" },
      question: "Every 2 hours",
      source_plan: { allowed_kinds: ["web_page"], require_citations: false },
      synthesis_policy: { mode: "append_findings" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.cadence).toEqual({ cron: "0 0 */2 * *" });
  });

  test("GET /v1/incubation/research-monitors/:id returns a monitor", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-monitors`, makeMonitorBody());
    const mon = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/research-monitors/${mon.id}`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.id).toBe(mon.id);
  });

  test("PATCH /v1/incubation/research-monitors/:id pauses a monitor", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/research-monitors`, makeMonitorBody());
    const mon = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/research-monitors/${mon.id}`, {
      status: "paused",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.status).toBe("paused");
  });
});

// ---------------------------------------------------------------------------
// OutreachPlan tests
// ---------------------------------------------------------------------------

describe("OutreachPlan", () => {
  test("POST /v1/incubation/items/:id/outreach-plans creates a plan", async () => {
    const item = await createItem(handler, deps, { title: "Survey item" });

    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/outreach-plans`, {
      kind: "survey_plan",
      title: "Developer experience survey",
      target_audience: "Aloop users",
      draft: "Do you find the setup process intuitive?",
      personal_data_classification: "anonymous",
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.kind).toBe("survey_plan");
    expect(body.title).toBe("Developer experience survey");
    expect(body.state).toBe("draft");
    expect(body.personal_data_classification).toBe("anonymous");
  });

  test("POST /v1/incubation/items/:id/outreach-plans returns 400 when title is missing", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/outreach-plans`, {
      kind: "survey_plan",
      target_audience: "Some audience",
    });
    expect(resp.status).toBe(400);
  });

  test("GET /v1/incubation/items/:id/outreach-plans lists plans", async () => {
    const item = await createItem(handler, deps);
    await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/outreach-plans`, {
      kind: "survey_plan",
      title: "Plan A",
      target_audience: "Audience A",
    });

    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/items/${item.id}/outreach-plans`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.items as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// IncubationProposal tests
// ---------------------------------------------------------------------------

describe("IncubationProposal", () => {
  test("POST /v1/incubation/items/:id/proposals creates a proposal", async () => {
    const item = await createItem(handler, deps, { title: "Proposal item" });

    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "spec_change",
      title: "Add dark mode support",
      body: "## Motivation\nDark mode is requested by users.",
      rationale: "User feedback and accessibility",
      evidence_refs: ["artifact_abc123"],
      target: { type: "spec_change", file_path: "docs/spec/ui.md" },
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.kind).toBe("spec_change");
    expect(body.title).toBe("Add dark mode support");
    expect(body.state).toBe("draft");
    expect(body.evidence_refs).toEqual(["artifact_abc123"]);
    expect(body.target).toEqual({ type: "spec_change", file_path: "docs/spec/ui.md" });
  });

  test("POST /v1/incubation/items/:id/proposals returns 400 for invalid kind", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "not_a_valid_kind",
      title: "Invalid",
    });
    expect(resp.status).toBe(400);
  });

  test("GET /v1/incubation/proposals/:id returns a proposal", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "decision_record",
      title: "Use SQLite for local storage",
    });
    const proposal = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/proposals/${proposal.id}`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.id).toBe(proposal.id);
    expect(body.title).toBe("Use SQLite for local storage");
  });

  test("PATCH /v1/incubation/proposals/:id transitions state", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "story",
      title: "Implement user auth",
    });
    const proposal = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/proposals/${proposal.id}`, {
      state: "ready",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.state).toBe("ready");
  });

  test("PATCH /v1/incubation/proposals/:id returns 400 for invalid state", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "decision_record",
      title: "Test",
    });
    const proposal = await createResp.json() as Record<string, unknown>;

    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/proposals/${proposal.id}`, {
      state: "not_valid",
    });
    expect(resp.status).toBe(400);
  });

  test("GET /v1/incubation/items/:id/proposals lists proposals", async () => {
    const item = await createItem(handler, deps);
    await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "epic",
      title: "Epic proposal",
    });

    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/items/${item.id}/proposals`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.items as unknown[]).length).toBe(1);
    expect(((body.items as Record<string, unknown>[])[0]).kind).toBe("epic");
  });
});

// ---------------------------------------------------------------------------
// MethodNotAllowed / NotFound routing
// ---------------------------------------------------------------------------

describe("Routing", () => {
  test("PUT /v1/incubation/items returns method not allowed", async () => {
    const resp = await makeRequest(handler, deps, "PUT", "/v1/incubation/items", {});
    expect(resp.status).toBe(405);
  });

  test("unrecognized path returns undefined (caller 404s)", async () => {
    const resp = await makeRequest(handler, deps, "GET", "/v1/incubation/nonexistent-route", {});
    expect(resp.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Validator helpers — isValidState, isValidProposalKind, isValidProposalState
// ---------------------------------------------------------------------------
//
// These are package-private helpers in incubation-handlers.ts.  We test them
// by exercising the API routes whose correctness depends on them:
//   - POST /v1/incubation/items  → isValidState used in PATCH (item state transitions)
//   - POST /v1/incubation/items/:id/proposals  → isValidProposalKind used here
//   - PATCH /v1/incubation/proposals/:id  → isValidProposalState used here
//
// We do NOT import the validators directly (they are not exported).  Instead we
// test them through the handler to assert what they *should* do per spec.
// ---------------------------------------------------------------------------

describe("isValidState validator", () => {
  test("returns true for every valid IncubationItemState", async () => {
    const states = [
      "captured",
      "clarifying",
      "researching",
      "synthesized",
      "ready_for_promotion",
      "promoted",
      "discarded",
      "archived",
    ] as const;
    for (const state of states) {
      const item = await createItem(handler, deps, { title: "State test" });
      const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/items/${item.id}`, { state });
      expect(resp.status).toBe(200, `state "${state}" should be accepted`);
    }
  });

  test("returns false for an invalid state — PATCH returns 400", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/items/${item.id}`, {
      state: "not_a_valid_state",
    });
    expect(resp.status).toBe(400);
  });

  test("returns false for empty string state — PATCH returns 400", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/items/${item.id}`, {
      state: "",
    });
    expect(resp.status).toBe(400);
  });

  test("isValidState is case-sensitive — capitalised valid word is rejected", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/items/${item.id}`, {
      state: "Captured",
    });
    expect(resp.status).toBe(400);
  });
});

describe("isValidProposalKind validator", () => {
  test("returns true for every valid IncubationProposalKind", async () => {
    const kinds = [
      "setup_candidate",
      "spec_change",
      "epic",
      "story",
      "steering",
      "decision_record",
      "discard",
    ] as const;
    for (const kind of kinds) {
      const item = await createItem(handler, deps, { title: "Kind test" });
      const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
        kind,
        title: "Test proposal",
      });
      expect(resp.status).toBe(201, `kind "${kind}" should be accepted`);
    }
  });

  test("returns false for an invalid kind — POST returns 400", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "not_a_valid_kind",
      title: "Invalid",
    });
    expect(resp.status).toBe(400);
  });

  test("returns false for empty string kind — POST returns 400", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "",
      title: "Invalid",
    });
    expect(resp.status).toBe(400);
  });

  test("isValidProposalKind is case-sensitive — lowercase with underscore is required", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "SPEC_CHANGE",
      title: "Invalid",
    });
    expect(resp.status).toBe(400);
  });
});

describe("isValidProposalState validator", () => {
  test("returns true for every valid IncubationProposalState", async () => {
    const validStates = ["draft", "ready", "applied", "rejected"] as const;
    for (const state of validStates) {
      const item = await createItem(handler, deps, { title: "Proposal state test" });
      const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
        kind: "story",
        title: "State transition test",
      });
      const proposal = await createResp.json() as Record<string, unknown>;
      const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/proposals/${proposal.id}`, { state });
      expect(resp.status).toBe(200, `proposal state "${state}" should be accepted`);
    }
  });

  test("returns false for an invalid proposal state — PATCH returns 400", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "story",
      title: "Invalid state test",
    });
    const proposal = await createResp.json() as Record<string, unknown>;
    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/proposals/${proposal.id}`, {
      state: "not_valid",
    });
    expect(resp.status).toBe(400);
  });

  test("returns false for empty string proposal state — PATCH returns 400", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/proposals`, {
      kind: "story",
      title: "Empty state test",
    });
    const proposal = await createResp.json() as Record<string, unknown>;
    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/proposals/${proposal.id}`, {
      state: "",
    });
    expect(resp.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// parseScope — validates and extracts IncubationScope from request body
// ---------------------------------------------------------------------------
//
// parseScope is a private helper called during POST /v1/incubation/items.
// It maps the raw scope object from the request body to the typed IncubationScope
// union.  We test it through the API:
//   - kind "global"       → { kind: "global" }
//   - kind "project"      → { kind: "project", project_id: string }
//   - kind "candidate_project" → { kind: "candidate_project", abs_path?, repo_url? }
//   - missing/invalid kind → defaults to { kind: "global" } (per spec: spec.md)
// ---------------------------------------------------------------------------

describe("parseScope — scope kind routing", () => {
  test("accepts explicit global scope", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Global item",
      scope: { kind: "global" },
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.scope).toEqual({ kind: "global" });
  });

  test("accepts project scope with project_id", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Project item",
      scope: { kind: "project", project_id: "proj_test_123" },
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.scope).toEqual({ kind: "project", project_id: "proj_test_123" });
  });

  test("project scope without project_id returns 400", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Bad project scope",
      scope: { kind: "project" },
      source: { client: "api" },
    });
    expect(resp.status).toBe(400);
  });

  test("project scope with non-string project_id returns 400", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Bad project id type",
      scope: { kind: "project", project_id: 12345 },
      source: { client: "api" },
    });
    expect(resp.status).toBe(400);
  });

  test("accepts candidate_project scope with abs_path only", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Candidate project (path only)",
      scope: { kind: "candidate_project", abs_path: "/home/user/new-project" },
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.scope).toEqual({ kind: "candidate_project", abs_path: "/home/user/new-project" });
  });

  test("accepts candidate_project scope with repo_url only", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Candidate project (url only)",
      scope: { kind: "candidate_project", repo_url: "https://github.com/user/repo" },
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.scope).toEqual({ kind: "candidate_project", repo_url: "https://github.com/user/repo" });
  });

  test("accepts candidate_project scope with both fields", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Candidate project (both fields)",
      scope: {
        kind: "candidate_project",
        abs_path: "/home/user/repo",
        repo_url: "https://github.com/user/repo",
      },
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.scope).toEqual({
      kind: "candidate_project",
      abs_path: "/home/user/repo",
      repo_url: "https://github.com/user/repo",
    });
  });

  test("candidate_project scope with invalid abs_path type returns 400", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Bad abs_path type",
      scope: { kind: "candidate_project", abs_path: 42 },
      source: { client: "api" },
    });
    // abs_path must be a string if provided; non-string is rejected
    expect(resp.status).toBe(400);
  });

  test("unknown kind falls back to global scope", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Unknown scope kind",
      scope: { kind: "not_real_kind" },
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    // Per parseScope: unrecognized kind → { kind: "global" }
    expect(body.scope).toEqual({ kind: "global" });
  });

  test("missing scope field defaults to global", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "No scope provided",
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.scope).toEqual({ kind: "global" });
  });

  test("scope as non-object (number) defaults to global", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items", {
      title: "Bad scope type",
      scope: 42,
      source: { client: "api" },
    });
    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.scope).toEqual({ kind: "global" });
  });
});

// ---------------------------------------------------------------------------
// IncubationComment tests
// ---------------------------------------------------------------------------

describe("IncubationComment", () => {
  test("POST /v1/incubation/items/:id/comments creates a comment", async () => {
    const item = await createItem(handler, deps, { title: "Item for comment" });

    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/comments`, {
      author: "researcher@example.com",
      body: "This needs more investigation.",
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(typeof body.id).toBe("string");
    expect(body.item_id).toBe(item.id);
    expect(body.author).toBe("researcher@example.com");
    expect(body.body).toBe("This needs more investigation.");
  });

  test("POST /v1/incubation/items/:id/comments with minimal fields", async () => {
    const item = await createItem(handler, deps);

    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/comments`, {
      author: "analyst",
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.author).toBe("analyst");
    expect(body.body).toBe("");
  });

  test("POST /v1/incubation/items/:id/comments returns 400 when author is missing", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/comments`, {
      body: "Has a body but no author",
    });
    expect(resp.status).toBe(400);
  });

  test("POST /v1/incubation/items/:id/comments returns 400 when author is empty string", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/comments`, {
      author: "",
      body: "Empty author",
    });
    expect(resp.status).toBe(400);
  });

  test("POST /v1/incubation/items/:id/comments returns 404 for unknown item", async () => {
    const resp = await makeRequest(handler, deps, "POST", "/v1/incubation/items/unknown-item-id/comments", {
      author: "someone",
    });
    expect(resp.status).toBe(404);
  });

  test("GET /v1/incubation/items/:id/comments returns comments for an item", async () => {
    const item = await createItem(handler, deps, { title: "Item with comments" });
    await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/comments`, {
      author: "reviewer",
      body: "First comment",
    });
    await makeRequest(handler, deps, "POST", `/v1/incubation/items/${item.id}/comments`, {
      author: "lead",
      body: "Second comment",
    });

    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/items/${item.id}/comments`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.item_id).toBe(item.id);
    expect((body.comments as unknown[]).length).toBe(2);
  });

  test("GET /v1/incubation/items/:id/comments returns empty list for item with no comments", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "GET", `/v1/incubation/items/${item.id}/comments`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.comments).toEqual([]);
  });

  test("POST /v1/incubation/items/:id/comments returns method not allowed for PUT", async () => {
    const item = await createItem(handler, deps);
    const resp = await makeRequest(handler, deps, "PUT", `/v1/incubation/items/${item.id}/comments`, {
      author: "someone",
    });
    expect(resp.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// ResearchMonitor — next_run_at update
// ---------------------------------------------------------------------------

describe("ResearchMonitor next_run_at", () => {
  function makeMonitorBody() {
    return {
      cadence: "daily",
      question: "Track capability changes",
      source_plan: { allowed_kinds: ["official_docs"], require_citations: false },
      synthesis_policy: { mode: "digest", alert_conditions: ["new_frontier_model"] },
    };
  }

  test("PATCH /v1/incubation/research-monitors/:id updates next_run_at", async () => {
    const item = await createItem(handler, deps);
    const createResp = await makeRequest(
      handler,
      deps,
      "POST",
      `/v1/incubation/items/${item.id}/research-monitors`,
      makeMonitorBody(),
    );
    const mon = await createResp.json() as Record<string, unknown>;

    const newRunAt = "2026-07-01T09:00:00.000Z";
    const resp = await makeRequest(handler, deps, "PATCH", `/v1/incubation/research-monitors/${mon.id}`, {
      next_run_at: newRunAt,
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.next_run_at).toBe(newRunAt);
  });

  test("PATCH /v1/incubation/research-monitors/:id returns 404 for unknown id", async () => {
    const resp = await makeRequest(
      handler,
      deps,
      "PATCH",
      "/v1/incubation/research-monitors/unknown-mon-id",
      { next_run_at: "2026-07-01T00:00:00.000Z" },
    );
    expect(resp.status).toBe(404);
  });
});
