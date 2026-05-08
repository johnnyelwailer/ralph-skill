import type { IncubationStore } from "@aloop/state-sqlite";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  parseJsonBody,
} from "./http-helpers.ts";

export type IncubationDeps = { readonly store: IncubationStore };

// ── Shared response helpers ───────────────────────────────────────────────────

function itemResponse(item: ReturnType<IncubationStore["getItem"]>) {
  if (!item) return null;
  return {
    _v: 1 as const,
    id: item.id,
    scope: item.scope,
    project_id: item.project_id ?? null,
    title: item.title,
    description: item.description,
    status: item.status,
    research_runs: item.research_runs.map(runResponse),
    proposal: item.proposal ? proposalResponse(item.proposal) : null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function runResponse(run: Parameters<typeof IncubationStore.prototype.getRun>[0] extends string ? ReturnType<IncubationStore["getRun"]> : never): Record<string, unknown> {
  if (!run) return null;
  return {
    id: run.id,
    incubation_item_id: run.incubation_item_id,
    mode: run.mode,
    status: run.status,
    plan: run.plan,
    results: run.results ?? null,
    started_at: run.started_at ?? null,
    completed_at: run.completed_at ?? null,
    created_at: run.created_at,
    updated_at: run.updated_at,
  };
}

function proposalResponse(p: NonNullable<Parameters<typeof IncubationStore.prototype.getProposal>[0] extends string ? ReturnType<IncubationStore["getProposal"]> : never>): Record<string, unknown> {
  return {
    id: p.id,
    incubation_item_id: p.incubation_item_id,
    kind: p.kind,
    title: p.title,
    description: p.description,
    promotion_target: p.promotion_ref?.target ?? null,
    promotion_ref: p.promotion_ref ?? null,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

// ── IncubationItem handlers ──────────────────────────────────────────────────

export async function createIncubationItem(
  req: Request,
  deps: IncubationDeps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const scope = body.data.scope as string | undefined;
  if (!scope || !["global", "project", "candidate_project"].includes(scope)) {
    return badRequest("scope is required and must be one of: global, project, candidate_project", { scope });
  }

  const title = typeof body.data.title === "string" ? body.data.title : undefined;
  if (!title) return badRequest("title is required");

  const description = typeof body.data.description === "string" ? body.data.description : "";
  const project_id = typeof body.data.project_id === "string" ? body.data.project_id : undefined;
  const status = body.data.status as string | undefined;
  if (status && !["active", "paused", "promoted", "discarded"].includes(status)) {
    return badRequest("invalid status", { status });
  }

  try {
    const item = deps.store.createItem({
      scope: scope as "global" | "project" | "candidate_project",
      project_id,
      title,
      description,
      status: status as "active" | "paused" | "promoted" | "discarded" | undefined,
    });
    return jsonResponse(201, itemResponse(item)!);
  } catch (err) {
    return errorResponse(500, "internal_error", String(err));
  }
}

export async function listIncubationItems(
  req: Request,
  deps: IncubationDeps,
): Promise<Response> {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const project_id = url.searchParams.get("project_id");
  const status = url.searchParams.get("status");

  if (scope && !["global", "project", "candidate_project"].includes(scope)) {
    return badRequest("invalid scope", { scope });
  }
  if (status && !["active", "paused", "promoted", "discarded"].includes(status)) {
    return badRequest("invalid status", { status });
  }

  const items = deps.store.listItems({
    ...(scope && { scope: scope as "global" | "project" | "candidate_project" }),
    ...(project_id !== null && { project_id }),
    ...(status && { status: status as "active" | "paused" | "promoted" | "discarded" }),
  });

  return jsonResponse(200, {
    _v: 1,
    items: items.map((i) => itemResponse(i)!),
    next_cursor: null,
  });
}

export function getIncubationItem(
  id: string,
  deps: IncubationDeps,
): Response {
  const item = deps.store.getItem(id);
  if (!item) return errorResponse(404, "incubation_item_not_found", `incubation item not found: ${id}`, { id });
  return jsonResponse(200, itemResponse(item)!);
}

export async function patchIncubationItem(
  id: string,
  req: Request,
  deps: IncubationDeps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const patch: Parameters<typeof deps.store.updateItem>[1] = {};
  if (typeof body.data.title === "string") patch.title = body.data.title;
  if (typeof body.data.description === "string") patch.description = body.data.description;
  if (body.data.status !== undefined) {
    if (!["active", "paused", "promoted", "discarded"].includes(body.data.status as string)) {
      return badRequest("invalid status", { status: body.data.status });
    }
    patch.status = body.data.status as "active" | "paused" | "promoted" | "discarded";
  }
  if (body.data.project_id !== undefined) {
    patch.project_id = body.data.project_id === null ? null : String(body.data.project_id);
  }

  try {
    const item = deps.store.updateItem(id, patch);
    return jsonResponse(200, itemResponse(item)!);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "incubation_item_not_found") {
      return errorResponse(404, "incubation_item_not_found", (err as Error).message, { id });
    }
    throw err;
  }
}

export function deleteIncubationItem(
  id: string,
  deps: IncubationDeps,
): Response {
  try {
    deps.store.deleteItem(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "incubation_item_not_found") {
      return errorResponse(404, "incubation_item_not_found", (err as Error).message, { id });
    }
    throw err;
  }
}

// ── ResearchRun handlers ──────────────────────────────────────────────────────

export async function createResearchRun(
  itemId: string,
  req: Request,
  deps: IncubationDeps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const mode = body.data.mode as string | undefined;
  if (!mode || !["source_synthesis", "monitor_tick", "outreach_analysis", "experiment_loop"].includes(mode)) {
    return badRequest("mode is required and must be one of: source_synthesis, monitor_tick, outreach_analysis, experiment_loop", { mode });
  }

  const plan = Array.isArray(body.data.plan) ? body.data.plan : [];
  const status = body.data.status as string | undefined;
  if (status && !["pending", "running", "completed", "failed", "cancelled"].includes(status)) {
    return badRequest("invalid status", { status });
  }

  // Verify item exists
  const item = deps.store.getItem(itemId);
  if (!item) return errorResponse(404, "incubation_item_not_found", `incubation item not found: ${itemId}`, { item_id: itemId });

  try {
    const run = deps.store.createRun({
      incubation_item_id: itemId,
      mode: mode as "source_synthesis" | "monitor_tick" | "outreach_analysis" | "experiment_loop",
      plan: plan as Parameters<typeof deps.store.createRun>[0]["plan"],
      status: status as "pending" | "running" | "completed" | "failed" | "cancelled" | undefined,
    });
    return jsonResponse(201, runResponse(run)!);
  } catch (err) {
    return errorResponse(500, "internal_error", String(err));
  }
}

export function listResearchRuns(
  itemId: string,
  deps: IncubationDeps,
): Response {
  const item = deps.store.getItem(itemId);
  if (!item) return errorResponse(404, "incubation_item_not_found", `incubation item not found: ${itemId}`, { item_id: itemId });

  const runs = deps.store.listRuns(itemId);
  return jsonResponse(200, {
    _v: 1,
    items: runs.map((r) => runResponse(r)!),
    next_cursor: null,
  });
}

export async function patchResearchRun(
  id: string,
  req: Request,
  deps: IncubationDeps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const patch: Parameters<typeof deps.store.updateRun>[1] = {};
  if (body.data.status !== undefined) {
    if (!["pending", "running", "completed", "failed", "cancelled"].includes(body.data.status as string)) {
      return badRequest("invalid status", { status: body.data.status });
    }
    patch.status = body.data.status as "pending" | "running" | "completed" | "failed" | "cancelled";
  }
  if (body.data.results !== undefined) patch.results = body.data.results;
  if (typeof body.data.started_at === "string") patch.started_at = body.data.started_at;
  if (typeof body.data.completed_at === "string") patch.completed_at = body.data.completed_at;

  try {
    const run = deps.store.updateRun(id, patch);
    return jsonResponse(200, runResponse(run)!);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "research_run_not_found") {
      return errorResponse(404, "research_run_not_found", (err as Error).message, { id });
    }
    throw err;
  }
}

// ── Proposal handlers ────────────────────────────────────────────────────────

export async function createProposal(
  itemId: string,
  req: Request,
  deps: IncubationDeps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const kind = body.data.kind as string | undefined;
  const validKinds = ["setup_candidate", "spec_change", "epic", "story", "steering", "decision_record", "discard"];
  if (!kind || !validKinds.includes(kind)) {
    return badRequest(`kind is required and must be one of: ${validKinds.join(", ")}`, { kind });
  }

  const title = typeof body.data.title === "string" ? body.data.title : undefined;
  if (!title) return badRequest("title is required");

  const description = typeof body.data.description === "string" ? body.data.description : "";
  const promotion_target = body.data.promotion_target as string | undefined;
  if (promotion_target && !["backlog", "sprint", "spec", "architecture", "workflow"].includes(promotion_target)) {
    return badRequest("invalid promotion_target", { promotion_target });
  }

  const promotion_ref = body.data.promotion_ref as { target: string; ref: string } | undefined;

  // Verify item exists
  const item = deps.store.getItem(itemId);
  if (!item) return errorResponse(404, "incubation_item_not_found", `incubation item not found: ${itemId}`, { item_id: itemId });

  try {
    const proposal = deps.store.createProposal({
      incubation_item_id: itemId,
      kind: kind as "setup_candidate" | "spec_change" | "epic" | "story" | "steering" | "decision_record" | "discard",
      title,
      description,
      promotion_target: promotion_target as "backlog" | "sprint" | "spec" | "architecture" | "workflow" | undefined,
      promotion_ref,
    });
    return jsonResponse(201, proposalResponse(proposal)!);
  } catch (err) {
    return errorResponse(500, "internal_error", String(err));
  }
}

export function getProposal(
  id: string,
  deps: IncubationDeps,
): Response {
  const proposal = deps.store.getProposal(id);
  if (!proposal) return errorResponse(404, "proposal_not_found", `proposal not found: ${id}`, { id });
  return jsonResponse(200, proposalResponse(proposal)!);
}

export function listProposalsForItem(
  itemId: string,
  deps: IncubationDeps,
): Response {
  const item = deps.store.getItem(itemId);
  if (!item) return errorResponse(404, "incubation_item_not_found", `incubation item not found: ${itemId}`, { item_id: itemId });

  const proposals = deps.store.listProposals(itemId);
  return jsonResponse(200, {
    _v: 1,
    items: proposals.map((p) => proposalResponse(p)!),
    next_cursor: null,
  });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function handleIncubation(
  req: Request,
  deps: IncubationDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/incubation")) return undefined;

  // POST /v1/incubation/items
  if (pathname === "/v1/incubation/items" && req.method === "POST") {
    return createIncubationItem(req, deps);
  }

  // GET /v1/incubation/items
  if (pathname === "/v1/incubation/items" && req.method === "GET") {
    return listIncubationItems(req, deps);
  }

  const itemsPrefix = "/v1/incubation/items/";
  if (pathname.startsWith(itemsPrefix)) {
    const rest = pathname.slice(itemsPrefix.length);
    const segments = rest.split("/");

    if (segments.length === 1) {
      // /v1/incubation/items/:id
      const id = segments[0]!;
      if (req.method === "GET") return getIncubationItem(id, deps);
      if (req.method === "PATCH") return patchIncubationItem(id, req, deps);
      if (req.method === "DELETE") return deleteIncubationItem(id, deps);
    }

    if (segments.length === 2 && segments[1] === "research-runs") {
      // /v1/incubation/items/:id/research-runs
      const itemId = segments[0]!;
      if (req.method === "POST") return createResearchRun(itemId, req, deps);
      if (req.method === "GET") return listResearchRuns(itemId, deps);
    }

    if (segments.length === 2 && segments[1] === "proposals") {
      // /v1/incubation/items/:id/proposals
      const itemId = segments[0]!;
      if (req.method === "POST") return createProposal(itemId, req, deps);
      if (req.method === "GET") return listProposalsForItem(itemId, deps);
    }
  }

  const runsPrefix = "/v1/incubation/research-runs/";
  if (pathname.startsWith(runsPrefix) && req.method === "PATCH") {
    const id = pathname.slice(runsPrefix.length);
    return patchResearchRun(id, req, deps);
  }

  const proposalsPrefix = "/v1/incubation/proposals/";
  if (pathname.startsWith(proposalsPrefix) && req.method === "GET") {
    const id = pathname.slice(proposalsPrefix.length);
    return getProposal(id, deps);
  }

  return undefined;
}