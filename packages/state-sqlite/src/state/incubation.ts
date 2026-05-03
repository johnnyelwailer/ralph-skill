import type { Database } from "bun:sqlite";
import type {
  IncubationItem,
  IncubationItemLinks,
  IncubationItemSource,
  IncubationItemState,
  IncubationPriority,
  IncubationProposal,
  IncubationProposalKind,
  IncubationProposalState,
  IncubationScope,
  OutreachPlan,
  OutreachPlanKind,
  OutreachPlanPersonalDataClassification,
  OutreachPlanSendMode,
  OutreachPlanState,
  PromotionTarget,
  ResearchMonitor,
  ResearchMonitorCadence,
  ResearchMonitorEventTrigger,
  ResearchMonitorStatus,
  ResearchMonitorSynthesisPolicy,
  ResearchRun,
  ResearchRunMode,
  ResearchRunPhase,
  ResearchRunStatus,
  ResearchSourceKind,
  ResearchSourcePlan,
  ExperimentPlan,
} from "@aloop/core";

// ---------------------------------------------------------------------------
// Row types (database representation)
// ---------------------------------------------------------------------------

type IncubationItemRow = {
  id: string;
  scope_kind: string;
  scope_project_id: string | null;
  scope_abs_path: string | null;
  scope_repo_url: string | null;
  title: string;
  body: string;
  state: string;
  labels: string;
  priority: string | null;
  source_client: string;
  source_captured_at: string;
  source_author: string | null;
  source_url: string | null;
  links_project_id: string | null;
  links_artifact_ids: string;
  links_related_item_ids: string;
  links_promoted_refs: string;
  metadata: string;
  created_at: string;
  updated_at: string;
};

type ResearchRunRow = {
  id: string;
  item_id: string;
  project_id: string | null;
  status: string;
  mode: string;
  phase: string | null;
  question: string;
  provider_chain: string;
  source_plan: string | null;
  experiment_plan: string | null;
  monitor_id: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  artifact_ids: string;
  findings_summary: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
};

type ResearchMonitorRow = {
  id: string;
  item_id: string;
  status: string;
  cadence_kind: string;
  cadence_cron: string | null;
  event_triggers: string;
  question: string;
  source_plan: string;
  synthesis_policy: string;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type OutreachPlanRow = {
  id: string;
  item_id: string;
  kind: string;
  state: string;
  title: string;
  target_audience: string;
  draft: string;
  consent_text: string | null;
  personal_data_classification: string;
  send_mode: string;
  approved_snapshot_id: string | null;
  artifact_ids: string;
  created_at: string;
  updated_at: string;
};

type IncubationProposalRow = {
  id: string;
  item_id: string;
  kind: string;
  title: string;
  body: string;
  rationale: string;
  evidence_refs: string;
  target: string | null;
  state: string;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Row -> Domain mappers
// ---------------------------------------------------------------------------

function rowToScope(row: IncubationItemRow): IncubationScope {
  if (row.scope_kind === "global") return { kind: "global" };
  if (row.scope_kind === "project") return { kind: "project", project_id: row.scope_project_id! };
  return {
    kind: "candidate_project",
    abs_path: row.scope_abs_path ?? undefined,
    repo_url: row.scope_repo_url ?? undefined,
  };
}

function rowToLinks(row: IncubationItemRow): IncubationItemLinks {
  return {
    project_id: row.links_project_id ?? undefined,
    artifact_ids: JSON.parse(row.links_artifact_ids) as readonly string[],
    related_item_ids: JSON.parse(row.links_related_item_ids) as readonly string[],
    promoted_refs: JSON.parse(row.links_promoted_refs) as readonly PromotionTarget[],
  };
}

function rowToSource(row: IncubationItemRow): IncubationItemSource {
  return {
    client: row.source_client as IncubationItemSource["client"],
    captured_at: row.source_captured_at,
    author: row.source_author ?? undefined,
    url: row.source_url ?? undefined,
  };
}

function rowToIncubationItem(row: IncubationItemRow): IncubationItem {
  return {
    _v: 1,
    id: row.id,
    scope: rowToScope(row),
    title: row.title,
    body: row.body,
    state: row.state as IncubationItemState,
    labels: JSON.parse(row.labels) as readonly string[],
    priority: (row.priority as IncubationPriority | undefined) ?? undefined,
    source: rowToSource(row),
    links: rowToLinks(row),
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToResearchRun(row: ResearchRunRow): ResearchRun {
  return {
    _v: 1,
    id: row.id,
    item_id: row.item_id,
    project_id: row.project_id ?? undefined,
    status: row.status as ResearchRunStatus,
    mode: row.mode as ResearchRunMode,
    phase: (row.phase as ResearchRunPhase | undefined) ?? undefined,
    question: row.question,
    provider_chain: JSON.parse(row.provider_chain) as readonly string[],
    source_plan: row.source_plan
      ? (JSON.parse(row.source_plan) as ResearchSourcePlan)
      : undefined,
    experiment_plan: row.experiment_plan
      ? (JSON.parse(row.experiment_plan) as ExperimentPlan)
      : undefined,
    monitor_id: row.monitor_id ?? undefined,
    cost_usd: row.cost_usd,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    artifact_ids: JSON.parse(row.artifact_ids) as readonly string[],
    findings_summary: row.findings_summary ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ended_at: row.ended_at ?? undefined,
  };
}

function rowToResearchMonitor(row: ResearchMonitorRow): ResearchMonitor {
  const cadence: ResearchMonitorCadence =
    row.cadence_kind === "cron"
      ? { cron: row.cadence_cron! }
      : (row.cadence_kind as "hourly" | "daily" | "weekly" | "monthly");
  return {
    _v: 1,
    id: row.id,
    item_id: row.item_id,
    status: row.status as ResearchMonitorStatus,
    cadence,
    event_triggers: JSON.parse(row.event_triggers) as readonly ResearchMonitorEventTrigger[],
    question: row.question,
    mode: "monitor_tick",
    source_plan: JSON.parse(row.source_plan) as ResearchSourcePlan,
    synthesis_policy: JSON.parse(row.synthesis_policy) as ResearchMonitorSynthesisPolicy,
    next_run_at: row.next_run_at,
    last_run_at: row.last_run_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToOutreachPlan(row: OutreachPlanRow): OutreachPlan {
  return {
    _v: 1,
    id: row.id,
    item_id: row.item_id,
    kind: row.kind as OutreachPlanKind,
    state: row.state as OutreachPlanState,
    title: row.title,
    target_audience: row.target_audience,
    draft: row.draft,
    consent_text: row.consent_text ?? undefined,
    personal_data_classification:
      row.personal_data_classification as OutreachPlanPersonalDataClassification,
    send_mode: row.send_mode as OutreachPlanSendMode,
    approved_snapshot_id: row.approved_snapshot_id ?? undefined,
    artifact_ids: JSON.parse(row.artifact_ids) as readonly string[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToIncubationProposal(row: IncubationProposalRow): IncubationProposal {
  return {
    _v: 1,
    id: row.id,
    item_id: row.item_id,
    kind: row.kind as IncubationProposalKind,
    title: row.title,
    body: row.body,
    rationale: row.rationale,
    evidence_refs: JSON.parse(row.evidence_refs) as readonly string[],
    target: row.target ? (JSON.parse(row.target) as PromotionTarget) : undefined,
    state: row.state as IncubationProposalState,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// IncubationItemRegistry
// ---------------------------------------------------------------------------

export type IncubationItemFilter = {
  readonly state?: IncubationItemState;
  readonly project_id?: string;
  readonly scope_kind?: "global" | "project" | "candidate_project";
  /** Full-text search across title and body. */
  readonly q?: string;
};

export type CreateIncubationItemInput = {
  readonly id?: string;
  readonly scope: IncubationScope;
  readonly title: string;
  readonly body?: string;
  readonly state?: IncubationItemState;
  readonly labels?: readonly string[];
  readonly priority?: IncubationPriority;
  readonly source: IncubationItemSource;
  readonly links?: Partial<IncubationItemLinks>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly now?: string;
};

export class IncubationItemRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateIncubationItemInput): IncubationItem {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();
    const state = input.state ?? "captured";
    const labels = JSON.stringify(input.labels ?? []);
    const links = {
      project_id: input.links?.project_id,
      artifact_ids: input.links?.artifact_ids ?? [],
      related_item_ids: input.links?.related_item_ids ?? [],
      promoted_refs: input.links?.promoted_refs ?? [],
    };
    const metadata = JSON.stringify(input.metadata ?? {});

    let scopeKind: string;
    let scopeProjectId: string | null = null;
    let scopeAbsPath: string | null = null;
    let scopeRepoUrl: string | null = null;
    if (input.scope.kind === "global") {
      scopeKind = "global";
    } else if (input.scope.kind === "project") {
      scopeKind = "project";
      scopeProjectId = input.scope.project_id;
    } else {
      scopeKind = "candidate_project";
      scopeAbsPath = input.scope.abs_path ?? null;
      scopeRepoUrl = input.scope.repo_url ?? null;
    }

    this.db.run(
      `INSERT INTO incubation_items (
        id, scope_kind, scope_project_id, scope_abs_path, scope_repo_url,
        title, body, state, labels, priority,
        source_client, source_captured_at, source_author, source_url,
        links_project_id, links_artifact_ids, links_related_item_ids, links_promoted_refs,
        metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scopeKind, scopeProjectId, scopeAbsPath, scopeRepoUrl,
        input.title, input.body ?? "", state, labels, input.priority ?? null,
        input.source.client, input.source.captured_at, input.source.author ?? null,
        input.source.url ?? null, links.project_id ?? null, JSON.stringify(links.artifact_ids),
        JSON.stringify(links.related_item_ids), JSON.stringify(links.promoted_refs),
        metadata, now, now,
      ],
    );

    return this.getRequired(id);
  }

  get(id: string): IncubationItem | undefined {
    const row = this.db
      .query<IncubationItemRow, [string]>("SELECT * FROM incubation_items WHERE id = ?")
      .get(id);
    return row ? rowToIncubationItem(row) : undefined;
  }

  list(filter: IncubationItemFilter = {}): IncubationItem[] {
    let sql = "SELECT * FROM incubation_items WHERE 1=1";
    const params: (string | number | null)[] = [];

    if (filter.state) {
      sql += " AND state = ?";
      params.push(filter.state);
    }
    if (filter.project_id) {
      sql += " AND links_project_id = ?";
      params.push(filter.project_id);
    }
    if (filter.scope_kind) {
      sql += " AND scope_kind = ?";
      params.push(filter.scope_kind);
    }
    if (filter.q) {
      sql += " AND (title LIKE ? OR body LIKE ?)";
      const term = `%${filter.q}%`;
      params.push(term, term);
    }

    sql += " ORDER BY created_at DESC";
    return this.db.query<IncubationItemRow, (string | number | null)[]>(sql).all(...params).map(rowToIncubationItem);
  }

  updateState(
    id: string,
    state: IncubationItemState,
    now: string = new Date().toISOString(),
  ): IncubationItem {
    const changes = this.db.run(
      "UPDATE incubation_items SET state = ?, updated_at = ? WHERE id = ?",
      [state, now, id],
    );
    if (changes.changes === 0) throw new IncubationItemNotFoundError(id);
    return this.getRequired(id);
  }

  updateLinks(id: string, links: IncubationItemLinks): IncubationItem {
    const now = new Date().toISOString();
    const changes = this.db.run(
      `UPDATE incubation_items SET
        links_project_id = ?, links_artifact_ids = ?,
        links_related_item_ids = ?, links_promoted_refs = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        links.project_id ?? null,
        JSON.stringify(links.artifact_ids),
        JSON.stringify(links.related_item_ids),
        JSON.stringify(links.promoted_refs ?? []),
        now, id,
      ],
    );
    if (changes.changes === 0) throw new IncubationItemNotFoundError(id);
    return this.getRequired(id);
  }

  archive(id: string, now: string = new Date().toISOString()): IncubationItem {
    return this.updateState(id, "archived", now);
  }

  discard(id: string, now: string = new Date().toISOString()): IncubationItem {
    return this.updateState(id, "discarded", now);
  }

  promote(id: string, refs: PromotionTarget[], now: string = new Date().toISOString()): IncubationItem {
    const item = this.getRequired(id);
    const links: IncubationItemLinks = {
      ...item.links,
      promoted_refs: [...(item.links.promoted_refs ?? []), ...refs],
    };
    return this.updateLinks(
      this.updateState(id, "promoted", now).id,
      links,
    );
  }

  private getRequired(id: string): IncubationItem {
    const item = this.get(id);
    if (!item) throw new IncubationItemNotFoundError(id);
    return item;
  }
}

export class IncubationItemNotFoundError extends Error {
  readonly code = "incubation_item_not_found";
  constructor(readonly id: string) {
    super(`incubation item not found: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// ResearchRunRegistry
// ---------------------------------------------------------------------------

export type CreateResearchRunInput = {
  readonly id?: string;
  readonly item_id: string;
  readonly project_id?: string;
  readonly mode: ResearchRunMode;
  readonly question: string;
  readonly provider_chain?: readonly string[];
  readonly source_plan?: ResearchSourcePlan;
  readonly experiment_plan?: ExperimentPlan;
  readonly monitor_id?: string;
  readonly now?: string;
};

export class ResearchRunRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateResearchRunInput): ResearchRun {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();

    this.db.run(
      `INSERT INTO research_runs (
        id, item_id, project_id, status, mode, question,
        provider_chain, source_plan, experiment_plan, monitor_id,
        cost_usd, tokens_in, tokens_out, artifact_ids,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 0, 0, 0, '[]', ?, ?)`,
      [
        id, input.item_id, input.project_id ?? null, input.mode, input.question,
        JSON.stringify(input.provider_chain ?? []),
        input.source_plan ? JSON.stringify(input.source_plan) : null,
        input.experiment_plan ? JSON.stringify(input.experiment_plan) : null,
        input.monitor_id ?? null,
        now, now,
      ],
    );

    return this.getRequired(id);
  }

  get(id: string): ResearchRun | undefined {
    const row = this.db
      .query<ResearchRunRow, [string]>("SELECT * FROM research_runs WHERE id = ?")
      .get(id);
    return row ? rowToResearchRun(row) : undefined;
  }

  listByItem(itemId: string): ResearchRun[] {
    return this.db
      .query<ResearchRunRow, [string]>(
        "SELECT * FROM research_runs WHERE item_id = ? ORDER BY created_at DESC",
      )
      .all(itemId)
      .map(rowToResearchRun);
  }

  updateStatus(
    id: string,
    status: ResearchRunStatus,
    now: string = new Date().toISOString(),
  ): ResearchRun {
    const endedAt = status === "completed" || status === "failed" || status === "cancelled"
      ? now
      : null;
    const changes = this.db.run(
      "UPDATE research_runs SET status = ?, updated_at = ?, ended_at = ? WHERE id = ?",
      [status, now, endedAt, id],
    );
    if (changes.changes === 0) throw new ResearchRunNotFoundError(id);
    return this.getRequired(id);
  }

  updatePhase(id: string, phase: ResearchRunPhase): ResearchRun {
    const now = new Date().toISOString();
    const changes = this.db.run(
      "UPDATE research_runs SET phase = ?, updated_at = ? WHERE id = ?",
      [phase, now, id],
    );
    if (changes.changes === 0) throw new ResearchRunNotFoundError(id);
    return this.getRequired(id);
  }

  recordCost(id: string, costUsd: number, tokensIn: number, tokensOut: number): ResearchRun {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE research_runs SET
        cost_usd = cost_usd + ?,
        tokens_in = tokens_in + ?,
        tokens_out = tokens_out + ?,
        updated_at = ?
      WHERE id = ?`,
      [costUsd, tokensIn, tokensOut, now, id],
    );
    return this.getRequired(id);
  }

  addArtifact(id: string, artifactId: string): ResearchRun {
    const run = this.getRequired(id);
    const now = new Date().toISOString();
    const artifactIds = [...run.artifact_ids, artifactId];
    this.db.run(
      "UPDATE research_runs SET artifact_ids = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(artifactIds), now, id],
    );
    return this.getRequired(id);
  }

  setFindingsSummary(id: string, summary: string): ResearchRun {
    const now = new Date().toISOString();
    this.db.run(
      "UPDATE research_runs SET findings_summary = ?, updated_at = ? WHERE id = ?",
      [summary, now, id],
    );
    return this.getRequired(id);
  }

  private getRequired(id: string): ResearchRun {
    const run = this.get(id);
    if (!run) throw new ResearchRunNotFoundError(id);
    return run;
  }
}

export class ResearchRunNotFoundError extends Error {
  readonly code = "research_run_not_found";
  constructor(readonly id: string) {
    super(`research run not found: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// ResearchMonitorRegistry
// ---------------------------------------------------------------------------

export type CreateResearchMonitorInput = {
  readonly id?: string;
  readonly item_id: string;
  readonly cadence: ResearchMonitorCadence;
  readonly event_triggers?: readonly ResearchMonitorEventTrigger[];
  readonly question: string;
  readonly source_plan: ResearchSourcePlan;
  readonly synthesis_policy: ResearchMonitorSynthesisPolicy;
  readonly next_run_at: string;
  readonly now?: string;
};

export class ResearchMonitorRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateResearchMonitorInput): ResearchMonitor {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();

    let cadenceKind: string;
    let cadenceCron: string | null = null;
    if (typeof input.cadence === "string") {
      cadenceKind = input.cadence;
    } else {
      cadenceKind = "cron";
      cadenceCron = input.cadence.cron;
    }

    this.db.run(
      `INSERT INTO research_monitors (
        id, item_id, status, cadence_kind, cadence_cron,
        event_triggers, question, source_plan, synthesis_policy,
        next_run_at, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.item_id, cadenceKind, cadenceCron,
        JSON.stringify(input.event_triggers ?? []),
        input.question, JSON.stringify(input.source_plan),
        JSON.stringify(input.synthesis_policy),
        input.next_run_at, now, now,
      ],
    );

    return this.getRequired(id);
  }

  get(id: string): ResearchMonitor | undefined {
    const row = this.db
      .query<ResearchMonitorRow, [string]>("SELECT * FROM research_monitors WHERE id = ?")
      .get(id);
    return row ? rowToResearchMonitor(row) : undefined;
  }

  listByItem(itemId: string): ResearchMonitor[] {
    return this.db
      .query<ResearchMonitorRow, [string]>(
        "SELECT * FROM research_monitors WHERE item_id = ? ORDER BY created_at DESC",
      )
      .all(itemId)
      .map(rowToResearchMonitor);
  }

  listActive(): ResearchMonitor[] {
    return this.db
      .query<ResearchMonitorRow, []>(
        "SELECT * FROM research_monitors WHERE status = 'active' ORDER BY next_run_at ASC",
      )
      .all()
      .map(rowToResearchMonitor);
  }

  updateStatus(
    id: string,
    status: ResearchMonitorStatus,
    now: string = new Date().toISOString(),
  ): ResearchMonitor {
    const changes = this.db.run(
      "UPDATE research_monitors SET status = ?, updated_at = ? WHERE id = ?",
      [status, now, id],
    );
    if (changes.changes === 0) throw new ResearchMonitorNotFoundError(id);
    return this.getRequired(id);
  }

  updateNextRun(id: string, nextRunAt: string): ResearchMonitor {
    const now = new Date().toISOString();
    const changes = this.db.run(
      "UPDATE research_monitors SET next_run_at = ?, last_run_at = ?, updated_at = ? WHERE id = ?",
      [nextRunAt, now, now, id],
    );
    if (changes.changes === 0) throw new ResearchMonitorNotFoundError(id);
    return this.getRequired(id);
  }

  private getRequired(id: string): ResearchMonitor {
    const mon = this.get(id);
    if (!mon) throw new ResearchMonitorNotFoundError(id);
    return mon;
  }
}

export class ResearchMonitorNotFoundError extends Error {
  readonly code = "research_monitor_not_found";
  constructor(readonly id: string) {
    super(`research monitor not found: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// OutreachPlanRegistry
// ---------------------------------------------------------------------------

export type CreateOutreachPlanInput = {
  readonly id?: string;
  readonly item_id: string;
  readonly kind: OutreachPlanKind;
  readonly title: string;
  readonly target_audience: string;
  readonly draft?: string;
  readonly consent_text?: string;
  readonly personal_data_classification?: OutreachPlanPersonalDataClassification;
  readonly send_mode?: OutreachPlanSendMode;
  readonly now?: string;
};

export class OutreachPlanRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateOutreachPlanInput): OutreachPlan {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();

    this.db.run(
      `INSERT INTO outreach_plans (
        id, item_id, kind, state, title, target_audience, draft,
        consent_text, personal_data_classification, send_mode, artifact_ids,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
      [
        id, input.item_id, input.kind, input.title, input.target_audience,
        input.draft ?? "", input.consent_text ?? null,
        input.personal_data_classification ?? "none",
        input.send_mode ?? "manual_export",
        now, now,
      ],
    );

    return this.getRequired(id);
  }

  get(id: string): OutreachPlan | undefined {
    const row = this.db
      .query<OutreachPlanRow, [string]>("SELECT * FROM outreach_plans WHERE id = ?")
      .get(id);
    return row ? rowToOutreachPlan(row) : undefined;
  }

  listByItem(itemId: string): OutreachPlan[] {
    return this.db
      .query<OutreachPlanRow, [string]>(
        "SELECT * FROM outreach_plans WHERE item_id = ? ORDER BY created_at DESC",
      )
      .all(itemId)
      .map(rowToOutreachPlan);
  }

  updateState(id: string, state: OutreachPlanState): OutreachPlan {
    const now = new Date().toISOString();
    const changes = this.db.run(
      "UPDATE outreach_plans SET state = ?, updated_at = ? WHERE id = ?",
      [state, now, id],
    );
    if (changes.changes === 0) throw new OutreachPlanNotFoundError(id);
    return this.getRequired(id);
  }

  private getRequired(id: string): OutreachPlan {
    const plan = this.get(id);
    if (!plan) throw new OutreachPlanNotFoundError(id);
    return plan;
  }
}

export class OutreachPlanNotFoundError extends Error {
  readonly code = "outreach_plan_not_found";
  constructor(readonly id: string) {
    super(`outreach plan not found: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// IncubationProposalRegistry
// ---------------------------------------------------------------------------

export type CreateIncubationProposalInput = {
  readonly id?: string;
  readonly item_id: string;
  readonly kind: IncubationProposalKind;
  readonly title: string;
  readonly body?: string;
  readonly rationale?: string;
  readonly evidence_refs?: readonly string[];
  readonly target?: PromotionTarget;
  readonly state?: IncubationProposalState;
  readonly now?: string;
};

export class IncubationProposalRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateIncubationProposalInput): IncubationProposal {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();

    this.db.run(
      `INSERT INTO incubation_proposals (
        id, item_id, kind, title, body, rationale,
        evidence_refs, target, state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.item_id, input.kind, input.title,
        input.body ?? "", input.rationale ?? "",
        JSON.stringify(input.evidence_refs ?? []),
        input.target ? JSON.stringify(input.target) : null,
        input.state ?? "draft",
        now, now,
      ],
    );

    return this.getRequired(id);
  }

  get(id: string): IncubationProposal | undefined {
    const row = this.db
      .query<IncubationProposalRow, [string]>("SELECT * FROM incubation_proposals WHERE id = ?")
      .get(id);
    return row ? rowToIncubationProposal(row) : undefined;
  }

  listByItem(itemId: string): IncubationProposal[] {
    return this.db
      .query<IncubationProposalRow, [string]>(
        "SELECT * FROM incubation_proposals WHERE item_id = ? ORDER BY created_at DESC",
      )
      .all(itemId)
      .map(rowToIncubationProposal);
  }

  updateState(id: string, state: IncubationProposalState): IncubationProposal {
    const now = new Date().toISOString();
    const changes = this.db.run(
      "UPDATE incubation_proposals SET state = ?, updated_at = ? WHERE id = ?",
      [state, now, id],
    );
    if (changes.changes === 0) throw new IncubationProposalNotFoundError(id);
    return this.getRequired(id);
  }

  private getRequired(id: string): IncubationProposal {
    const proposal = this.get(id);
    if (!proposal) throw new IncubationProposalNotFoundError(id);
    return proposal;
  }
}

export class IncubationProposalNotFoundError extends Error {
  readonly code = "incubation_proposal_not_found";
  constructor(readonly id: string) {
    super(`incubation proposal not found: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// IncubationCommentRegistry
// ---------------------------------------------------------------------------

import type { IncubationItemComment } from "@aloop/core";

type IncubationCommentRow = {
  id: string;
  item_id: string;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function rowToIncubationComment(row: IncubationCommentRow): IncubationItemComment {
  return {
    _v: 1 as const,
    id: row.id,
    item_id: row.item_id,
    author: row.author,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export type CreateIncubationCommentInput = {
  readonly id?: string;
  readonly item_id: string;
  readonly author: string;
  readonly body?: string;
  readonly now?: string;
};

export class IncubationCommentRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateIncubationCommentInput): IncubationItemComment {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();

    this.db.run(
      `INSERT INTO incubation_comments (id, item_id, author, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.item_id, input.author, input.body ?? "", now, now],
    );

    return this.getRequired(id);
  }

  get(id: string): IncubationItemComment | undefined {
    const row = this.db
      .query<IncubationCommentRow, [string]>("SELECT * FROM incubation_comments WHERE id = ?")
      .get(id);
    return row ? rowToIncubationComment(row) : undefined;
  }

  listByItem(itemId: string): IncubationItemComment[] {
    return this.db
      .query<IncubationCommentRow, [string]>(
        "SELECT * FROM incubation_comments WHERE item_id = ? ORDER BY created_at ASC",
      )
      .all(itemId)
      .map(rowToIncubationComment);
  }

  private getRequired(id: string): IncubationItemComment {
    const comment = this.get(id);
    if (!comment) throw new IncubationCommentNotFoundError(id);
    return comment;
  }
}

export class IncubationCommentNotFoundError extends Error {
  readonly code = "incubation_comment_not_found";
  constructor(readonly id: string) {
    super(`incubation comment not found: ${id}`);
  }
}
