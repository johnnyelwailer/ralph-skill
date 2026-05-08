import type { Database } from "bun:sqlite";

// ── Types ────────────────────────────────────────────────────────────────────

export type IncubationScope = "global" | "project" | "candidate_project";

export type ResearchSourceKind =
  | "user_attachment"
  | "web_page"
  | "forum"
  | "chat_log"
  | "documentation"
  | "code_snippet"
  | "api_spec"
  | "architecture_decision"
  | "performance_report"
  | "security_scan"
  | "test_result"
  | "code_review"
  | "incident_report"
  | "runbook"
  | "other";

export type ResearchRunMode =
  | "source_synthesis"
  | "monitor_tick"
  | "outreach_analysis"
  | "experiment_loop";

export type IncubationItemStatus = "active" | "paused" | "promoted" | "discarded";

export type ProposalKind =
  | "setup_candidate"
  | "spec_change"
  | "epic"
  | "story"
  | "steering"
  | "decision_record"
  | "discard";

export type PromotionTarget = "backlog" | "sprint" | "spec" | "architecture" | "workflow";

export interface ResearchSourcePlan {
  kind: ResearchSourceKind;
  description: string;
  location: string;
  credentials?: Record<string, string>;
}

export interface PromotionRef {
  target: PromotionTarget;
  ref: string;
}

export interface ResearchRun {
  id: string;
  incubation_item_id: string;
  mode: ResearchRunMode;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  plan: ResearchSourcePlan[];
  results?: unknown;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface IncubationProposal {
  id: string;
  incubation_item_id: string;
  kind: ProposalKind;
  title: string;
  description: string;
  promotion_ref?: PromotionRef;
  created_at: string;
  updated_at: string;
}

export interface IncubationItem {
  id: string;
  scope: IncubationScope;
  project_id?: string;
  title: string;
  description: string;
  status: IncubationItemStatus;
  research_runs: ResearchRun[];
  proposal?: IncubationProposal;
  created_at: string;
  updated_at: string;
}

// ── Row types (database) ─────────────────────────────────────────────────────

interface IncubationItemRow {
  id: string;
  scope: string;
  project_id: string | null;
  title: string;
  description: string;
  status: string;
  proposal_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ResearchRunRow {
  id: string;
  incubation_item_id: string;
  mode: string;
  status: string;
  plan: string;
  results: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface IncubationProposalRow {
  id: string;
  incubation_item_id: string;
  kind: string;
  title: string;
  description: string;
  promotion_target: string | null;
  promotion_ref: string | null;
  created_at: string;
  updated_at: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class IncubationItemNotFoundError extends Error {
  readonly code = "incubation_item_not_found";
  constructor(readonly id: string) {
    super(`incubation item not found: ${id}`);
  }
}

export class ResearchRunNotFoundError extends Error {
  readonly code = "research_run_not_found";
  constructor(readonly id: string) {
    super(`research run not found: ${id}`);
  }
}

export class ProposalNotFoundError extends Error {
  readonly code = "proposal_not_found";
  constructor(readonly id: string) {
    super(`proposal not found: ${id}`);
  }
}

// ── Row-to-object helpers ─────────────────────────────────────────────────────

function rowToIncubationItem(row: IncubationItemRow, runs: ResearchRun[], proposal: IncubationProposal | undefined): IncubationItem {
  return {
    id: row.id,
    scope: row.scope as IncubationScope,
    project_id: row.project_id ?? undefined,
    title: row.title,
    description: row.description,
    status: row.status as IncubationItemStatus,
    research_runs: runs,
    proposal,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToResearchRun(row: ResearchRunRow): ResearchRun {
  return {
    id: row.id,
    incubation_item_id: row.incubation_item_id,
    mode: row.mode as ResearchRunMode,
    status: row.status as ResearchRun["status"],
    plan: JSON.parse(row.plan) as ResearchSourcePlan[],
    results: row.results ? JSON.parse(row.results) : undefined,
    started_at: row.started_at ?? undefined,
    completed_at: row.completed_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToProposal(row: IncubationProposalRow): IncubationProposal {
  return {
    id: row.id,
    incubation_item_id: row.incubation_item_id,
    kind: row.kind as ProposalKind,
    title: row.title,
    description: row.description,
    promotion_ref: row.promotion_ref ? (JSON.parse(row.promotion_ref) as PromotionRef) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── IncubationItem CRUD ───────────────────────────────────────────────────────

export class IncubationStore {
  constructor(private readonly db: Database) {}

  createItem(input: {
    id?: string;
    scope: IncubationScope;
    project_id?: string;
    title: string;
    description: string;
    status?: IncubationItemStatus;
    now?: string;
  }): IncubationItem {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();
    const status = input.status ?? "active";

    this.db.run(
      `INSERT INTO incubation_items (id, scope, project_id, title, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.scope, input.project_id ?? null, input.title, input.description, status, now, now],
    );

    return this.getItem(id)!;
  }

  getItem(id: string): IncubationItem | undefined {
    const row = this.db
      .query<IncubationItemRow, [string]>(`SELECT * FROM incubation_items WHERE id = ?`)
      .get(id);
    if (!row) return undefined;
    const runs = this.listRuns(id);
    const proposal = row.proposal_id
      ? this.getProposal(row.proposal_id) ?? undefined
      : undefined;
    return rowToIncubationItem(row, runs, proposal);
  }

  listItems(filter?: {
    scope?: IncubationScope;
    project_id?: string;
    status?: IncubationItemStatus;
  }): IncubationItem[] {
    const conditions: string[] = [];
    const params: (string | null)[] = [];

    if (filter?.scope) {
      conditions.push("scope = ?");
      params.push(filter.scope);
    }
    if (filter?.project_id !== undefined) {
      conditions.push("project_id = ?");
      params.push(filter.project_id ?? null);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db
      .query<IncubationItemRow, []>(`SELECT * FROM incubation_items ${where} ORDER BY created_at DESC`)
      .all(...params as []);
    return rows.map((row) => {
      const runs = this.listRuns(row.id);
      const proposal = row.proposal_id ? this.getProposal(row.proposal_id) ?? undefined : undefined;
      return rowToIncubationItem(row, runs, proposal);
    });
  }

  updateItem(id: string, patch: {
    title?: string;
    description?: string;
    status?: IncubationItemStatus;
    project_id?: string | null;
    proposal_id?: string | null;
    now?: string;
  }): IncubationItem {
    const now = patch.now ?? new Date().toISOString();
    const fields: string[] = ["updated_at = ?"];
    const params: (string | null)[] = [now];

    if (patch.title !== undefined) { fields.push("title = ?"); params.push(patch.title); }
    if (patch.description !== undefined) { fields.push("description = ?"); params.push(patch.description); }
    if (patch.status !== undefined) { fields.push("status = ?"); params.push(patch.status); }
    if (patch.project_id !== undefined) { fields.push("project_id = ?"); params.push(patch.project_id ?? null); }
    if (patch.proposal_id !== undefined) { fields.push("proposal_id = ?"); params.push(patch.proposal_id ?? null); }

    params.push(id);
    const changes = this.db
      .query<{ changes: number }, [string]>(`UPDATE incubation_items SET ${fields.join(", ")} WHERE id = ?`)
      .run(...params as [string]);

    if (changes.changes === 0) throw new IncubationItemNotFoundError(id);
    return this.getItem(id)!;
  }

  deleteItem(id: string): void {
    const changes = this.db
      .query<{ changes: number }, [string]>(`DELETE FROM incubation_items WHERE id = ?`)
      .run(id);
    if (changes.changes === 0) throw new IncubationItemNotFoundError(id);
  }

  // ── ResearchRun CRUD ───────────────────────────────────────────────────────

  createRun(input: {
    id?: string;
    incubation_item_id: string;
    mode: ResearchRunMode;
    plan: ResearchSourcePlan[];
    status?: ResearchRun["status"];
    now?: string;
  }): ResearchRun {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();
    const status = input.status ?? "pending";
    const planJson = JSON.stringify(input.plan);

    this.db.run(
      `INSERT INTO research_runs (id, incubation_item_id, mode, status, plan, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.incubation_item_id, input.mode, status, planJson, now, now],
    );
    return this.getRun(id)!;
  }

  getRun(id: string): ResearchRun | undefined {
    const row = this.db
      .query<ResearchRunRow, [string]>(`SELECT * FROM research_runs WHERE id = ?`)
      .get(id);
    return row ? rowToResearchRun(row) : undefined;
  }

  listRuns(incubation_item_id: string): ResearchRun[] {
    return this.db
      .query<ResearchRunRow, [string]>(
        `SELECT * FROM research_runs WHERE incubation_item_id = ? ORDER BY created_at DESC`,
      )
      .all(incubation_item_id)
      .map(rowToResearchRun);
  }

  updateRun(id: string, patch: {
    status?: ResearchRun["status"];
    results?: unknown;
    started_at?: string;
    completed_at?: string;
    now?: string;
  }): ResearchRun {
    const now = patch.now ?? new Date().toISOString();
    const fields: string[] = ["updated_at = ?"];
    const params: (string | null)[] = [now];

    if (patch.status !== undefined) { fields.push("status = ?"); params.push(patch.status); }
    if (patch.results !== undefined) { fields.push("results = ?"); params.push(JSON.stringify(patch.results)); }
    if (patch.started_at !== undefined) { fields.push("started_at = ?"); params.push(patch.started_at); }
    if (patch.completed_at !== undefined) { fields.push("completed_at = ?"); params.push(patch.completed_at); }

    params.push(id);
    const changes = this.db
      .query<{ changes: number }, [string]>(`UPDATE research_runs SET ${fields.join(", ")} WHERE id = ?`)
      .run(...params as [string]);

    if (changes.changes === 0) throw new ResearchRunNotFoundError(id);
    return this.getRun(id)!;
  }

  // ── Proposal CRUD ─────────────────────────────────────────────────────────

  createProposal(input: {
    id?: string;
    incubation_item_id: string;
    kind: ProposalKind;
    title: string;
    description: string;
    promotion_target?: PromotionTarget;
    promotion_ref?: PromotionRef;
    now?: string;
  }): IncubationProposal {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();

    // If this is the first proposal, link it to the incubation item
    const promotionRefJson = input.promotion_ref ? JSON.stringify(input.promotion_ref) : null;

    this.db.run(
      `INSERT INTO incubation_proposals (id, incubation_item_id, kind, title, description, promotion_target, promotion_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.incubation_item_id, input.kind, input.title, input.description, input.promotion_target ?? null, promotionRefJson, now, now],
    );

    // Auto-link to the incubation item if it has no proposal_id yet
    const item = this.db
      .query<IncubationItemRow, [string]>(`SELECT * FROM incubation_items WHERE id = ?`)
      .get(input.incubation_item_id);
    if (item && !item.proposal_id) {
      this.db.run(`UPDATE incubation_items SET proposal_id = ?, updated_at = ? WHERE id = ?`, [id, now, input.incubation_item_id]);
    }

    return this.getProposal(id)!;
  }

  getProposal(id: string): IncubationProposal | undefined {
    const row = this.db
      .query<IncubationProposalRow, [string]>(`SELECT * FROM incubation_proposals WHERE id = ?`)
      .get(id);
    return row ? rowToProposal(row) : undefined;
  }

  listProposals(incubation_item_id: string): IncubationProposal[] {
    return this.db
      .query<IncubationProposalRow, [string]>(
        `SELECT * FROM incubation_proposals WHERE incubation_item_id = ? ORDER BY created_at DESC`,
      )
      .all(incubation_item_id)
      .map(rowToProposal);
  }
}