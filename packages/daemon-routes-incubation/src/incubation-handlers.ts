/**
 * Incubation API handlers.
 * All routes are prefixed /v1/incubation/
 * Fully specified in docs/spec/incubation.md.
 */
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from "@aloop/daemon-routes";
import type {
  IncubationItem,
  IncubationItemComment,
  IncubationItemState,
  IncubationScope,
  IncubationItemSourceClient,
  OutreachPlan,
  ResearchMonitor,
  ResearchMonitorEventTrigger,
  ResearchRun,
  IncubationProposal,
  IncubationProposalKind,
  IncubationProposalState,
} from "@aloop/core";
import {
  IncubationCommentNotFoundError,
  IncubationCommentRegistry,
  IncubationItemNotFoundError,
  IncubationItemRegistry,
  ResearchRunNotFoundError,
  ResearchRunRegistry,
  ResearchMonitorNotFoundError,
  ResearchMonitorRegistry,
  OutreachPlanNotFoundError,
  OutreachPlanRegistry,
  IncubationProposalNotFoundError,
  IncubationProposalRegistry,
  type CreateIncubationCommentInput,
  type CreateIncubationItemInput,
  type CreateResearchRunInput,
  type CreateResearchMonitorInput,
  type CreateOutreachPlanInput,
  type CreateIncubationProposalInput,
} from "@aloop/state-sqlite";
import type { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Deps and response helpers
// ---------------------------------------------------------------------------

export type IncubationDeps = {
  readonly db: Database;
  readonly sessionsDir: string | (() => string);
};

function itemResponse(item: IncubationItem): Record<string, unknown> {
  return {
    _v: 1,
    id: item.id,
    scope: item.scope,
    title: item.title,
    body: item.body,
    state: item.state,
    labels: item.labels,
    priority: item.priority,
    source: item.source,
    links: item.links,
    metadata: item.metadata,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function runResponse(run: ResearchRun): Record<string, unknown> {
  return {
    _v: 1,
    id: run.id,
    item_id: run.item_id,
    project_id: run.project_id,
    status: run.status,
    mode: run.mode,
    phase: run.phase,
    question: run.question,
    provider_chain: run.provider_chain,
    source_plan: run.source_plan,
    experiment_plan: run.experiment_plan,
    monitor_id: run.monitor_id,
    cost_usd: run.cost_usd,
    tokens_in: run.tokens_in,
    tokens_out: run.tokens_out,
    artifact_ids: run.artifact_ids,
    findings_summary: run.findings_summary,
    created_at: run.created_at,
    updated_at: run.updated_at,
    ended_at: run.ended_at,
  };
}

function monitorResponse(mon: ResearchMonitor): Record<string, unknown> {
  return {
    _v: 1,
    id: mon.id,
    item_id: mon.item_id,
    status: mon.status,
    cadence: mon.cadence,
    event_triggers: mon.event_triggers,
    question: mon.question,
    mode: mon.mode,
    source_plan: mon.source_plan,
    synthesis_policy: mon.synthesis_policy,
    next_run_at: mon.next_run_at,
    last_run_at: mon.last_run_at,
    created_at: mon.created_at,
    updated_at: mon.updated_at,
  };
}

function outreachResponse(plan: OutreachPlan): Record<string, unknown> {
  return {
    _v: 1,
    id: plan.id,
    item_id: plan.item_id,
    kind: plan.kind,
    state: plan.state,
    title: plan.title,
    target_audience: plan.target_audience,
    draft: plan.draft,
    consent_text: plan.consent_text,
    personal_data_classification: plan.personal_data_classification,
    send_mode: plan.send_mode,
    approved_snapshot_id: plan.approved_snapshot_id,
    artifact_ids: plan.artifact_ids,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
  };
}

function proposalResponse(proposal: IncubationProposal): Record<string, unknown> {
  return {
    _v: 1,
    id: proposal.id,
    item_id: proposal.item_id,
    kind: proposal.kind,
    title: proposal.title,
    body: proposal.body,
    rationale: proposal.rationale,
    evidence_refs: proposal.evidence_refs,
    target: proposal.target,
    state: proposal.state,
    created_at: proposal.created_at,
    updated_at: proposal.updated_at,
  };
}

function commentResponse(comment: IncubationItemComment): Record<string, unknown> {
  return {
    _v: 1 as const,
    id: comment.id,
    item_id: comment.item_id,
    author: comment.author,
    body: comment.body,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const VALID_ITEM_STATES: readonly IncubationItemState[] = [
  "captured", "clarifying", "researching", "synthesized",
  "ready_for_promotion", "promoted", "discarded", "archived",
];

const VALID_PROPOSAL_KINDS: readonly IncubationProposalKind[] = [
  "setup_candidate", "spec_change", "epic", "story",
  "steering", "decision_record", "discard",
];

const VALID_PROPOSAL_STATES: readonly IncubationProposalState[] = [
  "draft", "ready", "applied", "rejected",
];

function isValidState(state: string): state is IncubationItemState {
  return (VALID_ITEM_STATES as readonly string[]).includes(state);
}

function isValidProposalKind(kind: string): kind is IncubationProposalKind {
  return (VALID_PROPOSAL_KINDS as readonly string[]).includes(kind);
}

function isValidProposalState(state: string): state is IncubationProposalState {
  return (VALID_PROPOSAL_STATES as readonly string[]).includes(state);
}

// ---------------------------------------------------------------------------
// Scope parser
// ---------------------------------------------------------------------------

function parseScope(body: Record<string, unknown>): IncubationScope {
  const s = body.scope as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") return { kind: "global" };

  const kind = s.kind as string;
  if (kind === "global") return { kind: "global" };
  if (kind === "project") {
    const projectId = s.project_id;
    if (typeof projectId !== "string") throw new Error("scope.project_id must be a string");
    return { kind: "project", project_id: projectId };
  }
  if (kind === "candidate_project") {
    return {
      kind: "candidate_project",
      abs_path: typeof s.abs_path === "string" ? s.abs_path : undefined,
      repo_url: typeof s.repo_url === "string" ? s.repo_url : undefined,
    };
  }
  return { kind: "global" };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleIncubation(
  req: Request,
  deps: IncubationDeps,
  pathname: string,
): Promise<Response | undefined> {
  // Strip query string so pathname comparisons are clean
  const [pathBase] = pathname.split("?");
  if (!pathBase.startsWith("/v1/incubation")) return undefined;
  const pathnameForResponse = pathname; // preserve original for error messages

  const db = deps.db;
  const itemReg = new IncubationItemRegistry(db);
  const runReg = new ResearchRunRegistry(db);
  const monitorReg = new ResearchMonitorRegistry(db);
  const outreachReg = new OutreachPlanRegistry(db);
  const proposalReg = new IncubationProposalRegistry(db);

  // -------------------------------------------------------------------------
  // /v1/incubation/items
  // -------------------------------------------------------------------------
  if (pathBase === "/v1/incubation/items") {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const state = url.searchParams.get("state");
      const projectId = url.searchParams.get("project_id");
      const scopeKind = url.searchParams.get("scope_kind") as "global" | "project" | "candidate_project" | null;
      const q = url.searchParams.get("q");

      if (state && !isValidState(state)) {
        return badRequest(`invalid state: ${state}`, { state });
      }

      const items = itemReg.list({
        ...(state && { state: state as IncubationItemState }),
        ...(projectId && { project_id: projectId }),
        ...(scopeKind && { scope_kind: scopeKind }),
        ...(q && { q }),
      });

      return jsonResponse(200, {
        _v: 1,
        items: items.map(itemResponse),
        next_cursor: null,
      });
    }

    if (req.method === "POST") {
      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return badRequest("title is required");

      const scope = parseScope(body);
      const labels = Array.isArray(body.labels) ? body.labels as string[] : [];
      const priority = typeof body.priority === "string" && ["low", "normal", "high"].includes(body.priority)
        ? (body.priority as "low" | "normal" | "high")
        : undefined;

      let sourceClient: IncubationItemSourceClient = "api";
      if (typeof body.source === "object" && body.source !== null) {
        const src = body.source as Record<string, unknown>;
        sourceClient = (typeof src.client === "string"
          ? src.client
          : "api") as IncubationItemSourceClient;
      }

      const source = {
        client: sourceClient,
        captured_at: typeof body.captured_at === "string" ? body.captured_at : new Date().toISOString(),
        author: typeof body.author === "string" ? body.author : undefined,
        url: typeof body.url === "string" ? body.url : undefined,
      };

      try {
        const item = itemReg.create({
          scope,
          title,
          body: typeof body.body === "string" ? body.body : "",
          labels,
          priority,
          source,
          links: {
            project_id: typeof body.project_id === "string" ? body.project_id : undefined,
            artifact_ids: Array.isArray(body.artifact_ids) ? body.artifact_ids as readonly string[] : [],
            related_item_ids: Array.isArray(body.related_item_ids) ? body.related_item_ids as readonly string[] : [],
          },
          metadata: typeof body.metadata === "object" && body.metadata !== null
            ? body.metadata as Record<string, unknown>
            : {},
        });
        return jsonResponse(201, itemResponse(item));
      } catch (err) {
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/items/:id
  // -------------------------------------------------------------------------
  const itemsMatch = pathBase.match(/^\/v1\/incubation\/items\/([^/]+)$/);
  if (itemsMatch) {
    const id = itemsMatch[1]!;

    if (req.method === "GET") {
      const item = itemReg.get(id);
      if (!item) return notFoundResponse(pathname);
      return jsonResponse(200, itemResponse(item));
    }

    if (req.method === "PATCH") {
      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      try {
        let item = itemReg.get(id);
        if (!item) return notFoundResponse(pathname);

        if (typeof body.state === "string") {
          if (!isValidState(body.state)) {
            return badRequest(`invalid state: ${body.state}`, { state: body.state });
          }
          item = itemReg.updateState(id, body.state as IncubationItemState);
        }

        if (typeof body.title === "string") {
          // Title is not directly updateable — recreate or reject
          return badRequest("title cannot be changed after creation; create a new item");
        }

        return jsonResponse(200, itemResponse(item));
      } catch (err) {
        if (err instanceof IncubationItemNotFoundError) return notFoundResponse(pathname);
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    if (req.method === "DELETE") {
      try {
        const item = itemReg.discard(id);
        return jsonResponse(200, itemResponse(item));
      } catch (err) {
        if (err instanceof IncubationItemNotFoundError) return notFoundResponse(pathname);
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/items/:id/research-runs
  // -------------------------------------------------------------------------
  const runsMatch = pathBase.match(/^\/v1\/incubation\/items\/([^/]+)\/research-runs$/);
  if (runsMatch) {
    const itemId = runsMatch[1]!;

    if (req.method === "GET") {
      const runs = runReg.listByItem(itemId);
      return jsonResponse(200, {
        _v: 1,
        items: runs.map(runResponse),
        next_cursor: null,
      });
    }

    if (req.method === "POST") {
      const item = itemReg.get(itemId);
      if (!item) return notFoundResponse(pathname);

      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      const mode = typeof body.mode === "string" ? body.mode : "source_synthesis";
      const question = typeof body.question === "string" ? body.question : "";

      try {
        const run = runReg.create({
          item_id: itemId,
          project_id: typeof body.project_id === "string" ? body.project_id : undefined,
          mode: mode as ResearchRun["mode"],
          question,
          provider_chain: Array.isArray(body.provider_chain)
            ? body.provider_chain as readonly string[]
            : [],
          source_plan: body.source_plan ? body.source_plan as ResearchRun["source_plan"] : undefined,
          experiment_plan: body.experiment_plan ? body.experiment_plan as ResearchRun["experiment_plan"] : undefined,
          monitor_id: typeof body.monitor_id === "string" ? body.monitor_id : undefined,
        });
        return jsonResponse(201, runResponse(run));
      } catch (err) {
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/items/:id/research-monitors
  // -------------------------------------------------------------------------
  const monitorsMatch = pathBase.match(/^\/v1\/incubation\/items\/([^/]+)\/research-monitors$/);
  if (monitorsMatch) {
    const itemId = monitorsMatch[1]!;

    if (req.method === "GET") {
      const monitors = monitorReg.listByItem(itemId);
      return jsonResponse(200, {
        _v: 1,
        items: monitors.map(monitorResponse),
        next_cursor: null,
      });
    }

    if (req.method === "POST") {
      const item = itemReg.get(itemId);
      if (!item) return notFoundResponse(pathname);

      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      const cadence = typeof body.cadence === "string" && ["hourly", "daily", "weekly", "monthly"].includes(body.cadence)
        ? (body.cadence as "hourly" | "daily" | "weekly" | "monthly")
        : typeof body.cadence === "object" && body.cadence !== null && typeof (body.cadence as Record<string, unknown>).cron === "string"
          ? { cron: (body.cadence as Record<string, unknown>).cron as string }
          : "daily";

      const question = typeof body.question === "string" ? body.question : "";
      const sourcePlan = body.source_plan;
      const synthesisPolicy = body.synthesis_policy;

      if (!sourcePlan || !synthesisPolicy) {
        return badRequest("source_plan and synthesis_policy are required");
      }

      try {
        const mon = monitorReg.create({
          item_id: itemId,
          cadence,
          question,
          source_plan: sourcePlan as ResearchMonitor["source_plan"],
          synthesis_policy: synthesisPolicy as ResearchMonitor["synthesis_policy"],
          event_triggers: (Array.isArray(body.event_triggers) ? body.event_triggers : []) as ReadonlyArray<ResearchMonitorEventTrigger>,
          next_run_at: typeof body.next_run_at === "string" ? body.next_run_at : new Date().toISOString(),
        });
        return jsonResponse(201, monitorResponse(mon));
      } catch (err) {
        console.error("[incubation] monitor create error:", err);
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/items/:id/outreach-plans
  // -------------------------------------------------------------------------
  const outreachMatch = pathBase.match(/^\/v1\/incubation\/items\/([^/]+)\/outreach-plans$/);
  if (outreachMatch) {
    const itemId = outreachMatch[1]!;

    if (req.method === "GET") {
      const plans = outreachReg.listByItem(itemId);
      return jsonResponse(200, {
        _v: 1,
        items: plans.map(outreachResponse),
        next_cursor: null,
      });
    }

    if (req.method === "POST") {
      const item = itemReg.get(itemId);
      if (!item) return notFoundResponse(pathname);

      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      const kind = typeof body.kind === "string" ? body.kind : "survey_plan";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const targetAudience = typeof body.target_audience === "string" ? body.target_audience : "";

      if (!title) return badRequest("title is required");
      if (!targetAudience) return badRequest("target_audience is required");

      try {
        const plan = outreachReg.create({
          item_id: itemId,
          kind: kind as OutreachPlan["kind"],
          title,
          target_audience: targetAudience,
          draft: typeof body.draft === "string" ? body.draft : "",
          consent_text: typeof body.consent_text === "string" ? body.consent_text : undefined,
          personal_data_classification: typeof body.personal_data_classification === "string"
            ? body.personal_data_classification as OutreachPlan["personal_data_classification"]
            : undefined,
          send_mode: typeof body.send_mode === "string"
            ? body.send_mode as OutreachPlan["send_mode"]
            : undefined,
        });
        return jsonResponse(201, outreachResponse(plan));
      } catch (err) {
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/items/:id/proposals
  // -------------------------------------------------------------------------
  const proposalsMatch = pathBase.match(/^\/v1\/incubation\/items\/([^/]+)\/proposals$/);
  if (proposalsMatch) {
    const itemId = proposalsMatch[1]!;

    if (req.method === "GET") {
      const proposals = proposalReg.listByItem(itemId);
      return jsonResponse(200, {
        _v: 1,
        items: proposals.map(proposalResponse),
        next_cursor: null,
      });
    }

    if (req.method === "POST") {
      const item = itemReg.get(itemId);
      if (!item) return notFoundResponse(pathname);

      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      const kind = typeof body.kind === "string" ? body.kind : "decision_record";
      if (!isValidProposalKind(kind)) {
        return badRequest(`invalid kind: ${kind}`, { kind });
      }

      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return badRequest("title is required");

      try {
        const proposal = proposalReg.create({
          item_id: itemId,
          kind: kind as IncubationProposalKind,
          title,
          body: typeof body.body === "string" ? body.body : "",
          rationale: typeof body.rationale === "string" ? body.rationale : "",
          evidence_refs: Array.isArray(body.evidence_refs) ? body.evidence_refs as readonly string[] : [],
          target: body.target as IncubationProposal["target"],
        });
        return jsonResponse(201, proposalResponse(proposal));
      } catch (err) {
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/proposals/:id
  // -------------------------------------------------------------------------
  const proposalMatch = pathBase.match(/^\/v1\/incubation\/proposals\/([^/]+)$/);
  if (proposalMatch) {
    const id = proposalMatch[1]!;

    if (req.method === "GET") {
      const proposal = proposalReg.get(id);
      if (!proposal) return notFoundResponse(pathname);
      return jsonResponse(200, proposalResponse(proposal));
    }

    if (req.method === "PATCH") {
      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      try {
        let proposal = proposalReg.get(id);
        if (!proposal) return notFoundResponse(pathname);

        if (typeof body.state === "string") {
          if (!isValidProposalState(body.state)) {
            return badRequest(`invalid state: ${body.state}`, { state: body.state });
          }
          proposal = proposalReg.updateState(id, body.state as IncubationProposalState);
        }

        return jsonResponse(200, proposalResponse(proposal));
      } catch (err) {
        if (err instanceof IncubationProposalNotFoundError) return notFoundResponse(pathname);
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/research-runs/:id
  // -------------------------------------------------------------------------
  const runMatch = pathBase.match(/^\/v1\/incubation\/research-runs\/([^/]+)$/);
  if (runMatch) {
    const id = runMatch[1]!;

    if (req.method === "GET") {
      const run = runReg.get(id);
      if (!run) return notFoundResponse(pathname);
      return jsonResponse(200, runResponse(run));
    }

    if (req.method === "PATCH") {
      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      try {
        let run = runReg.get(id);
        if (!run) return notFoundResponse(pathname);

        if (typeof body.status === "string") {
          run = runReg.updateStatus(id, body.status as ResearchRun["status"]);
        }
        if (typeof body.phase === "string") {
          run = runReg.updatePhase(id, body.phase as ResearchRun["phase"]);
        }
        if (typeof body.findings_summary === "string") {
          run = runReg.setFindingsSummary(id, body.findings_summary);
        }

        return jsonResponse(200, runResponse(run));
      } catch (err) {
        if (err instanceof ResearchRunNotFoundError) return notFoundResponse(pathname);
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/research-monitors/:id
  // -------------------------------------------------------------------------
  const monitorMatch = pathBase.match(/^\/v1\/incubation\/research-monitors\/([^/]+)$/);
  if (monitorMatch) {
    const id = monitorMatch[1]!;

    if (req.method === "GET") {
      const mon = monitorReg.get(id);
      if (!mon) return notFoundResponse(pathname);
      return jsonResponse(200, monitorResponse(mon));
    }

    if (req.method === "PATCH") {
      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      try {
        let mon = monitorReg.get(id);
        if (!mon) return notFoundResponse(pathname);

        if (typeof body.status === "string") {
          mon = monitorReg.updateStatus(id, body.status as ResearchMonitor["status"]);
        }
        if (typeof body.next_run_at === "string") {
          mon = monitorReg.updateNextRun(id, body.next_run_at);
        }

        return jsonResponse(200, monitorResponse(mon));
      } catch (err) {
        if (err instanceof ResearchMonitorNotFoundError) return notFoundResponse(pathname);
        return errorResponse(500, "internal_error", (err as Error).message);
      }
    }

    return methodNotAllowed();
  }

  // -------------------------------------------------------------------------
  // /v1/incubation/items/:id/comments
  // -------------------------------------------------------------------------
  const commentsMatch = pathBase.match(/^\/v1\/incubation\/items\/([^/]+)\/comments$/);
  if (commentsMatch) {
    const itemId = commentsMatch[1]!;
    const commentReg = new IncubationCommentRegistry(db);

    if (req.method === "GET") {
      const comments = commentReg.listByItem(itemId);
      return jsonResponse(200, { _v: 1, item_id: itemId, comments });
    }

    if (req.method === "POST") {
      const parsed = await parseJsonBody(req);
      if ("error" in parsed) return parsed.error;
      const body = parsed.data;

      if (!body || typeof body.author !== "string" || !body.author) {
        return badRequest("author is required", { author: body?.author });
      }

      // Verify the item exists
      if (!itemReg.get(itemId)) return notFoundResponse(pathnameForResponse);

      const input: CreateIncubationCommentInput = {
        item_id: itemId,
        author: body.author,
        body: typeof body.body === "string" ? body.body : "",
      };

      const comment = commentReg.create(input);
      return jsonResponse(201, commentResponse(comment));
    }

    return methodNotAllowed();
  }

  return undefined;
}
