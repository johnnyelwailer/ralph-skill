import type { Database } from "bun:sqlite";
import type {
  ContextBlock,
  ContextInput,
  ContextPlugin,
  SourceRef,
} from "@aloop/core";

export type ReviewHistoryOptions = {
  readonly db: Database;
};

function makeBlock(
  id: string,
  title: string,
  body: string,
  sources: readonly SourceRef[],
  confidence?: number,
): ContextBlock {
  return { id, title, body, sources, ...(confidence !== undefined && { confidence }), createdAt: new Date().toISOString() };
}

function sqlRows<T>(db: Database, sql: string, params: (string | number | null)[]): T[] {
  return db.query<T, (string | number | null)[]>(sql).all(...params);
}

function buildReviewFindingsContext(db: Database, projectId: string): ContextBlock | null {
  const rows = sqlRows<
    { id: string; kind: string; filename: string }
  >(
    db,
    `SELECT id, kind, filename FROM artifacts
     WHERE project_id = ?
     ORDER BY created_at DESC LIMIT 5`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `[${r.kind}] ${r.filename}`).join("\n---\n");
  return makeBlock(
    "review-findings",
    "Prior Review Findings",
    body,
    rows.map((r) => ({ label: `artifact:${r.id.slice(0, 8)}`, uri: "" })),
    0.8,
  );
}

function buildUnresolvedFollowupsContext(db: Database, projectId: string): ContextBlock | null {
  const rows = sqlRows<
    { id: string; status: string; kind: string }
  >(
    db,
    `SELECT id, status, kind FROM sessions
     WHERE project_id = ? AND kind = 'child' AND status IN ('pending', 'running')
     ORDER BY updated_at DESC LIMIT 5`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `[${r.status}] ${r.kind} session: ${r.id.slice(0, 8)}`).join("\n");
  return makeBlock(
    "unresolved-followups",
    "Unresolved Follow-up Tasks",
    body,
    [{ label: "sessions", uri: "" }],
    0.7,
  );
}

function buildRecurringModuleRisksContext(db: Database, projectId: string): ContextBlock | null {
  const rows = sqlRows<
    { session_id: string; metric_name: string; value: number }
  >(
    db,
    `SELECT sm.session_id, sm.metric_name, sm.value
     FROM session_metrics sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.project_id = ? AND sm.metric_name = 'iteration_stuck_count' AND sm.value > 1
     ORDER BY sm.updated_at DESC LIMIT 5`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const body = rows
    .map((r) => `session ${r.session_id.slice(0, 8)}: ${r.metric_name}=${r.value}`)
    .join("\n");
  return makeBlock(
    "recurring-risks",
    "Recurring Module Risks",
    body,
    [{ label: "session_metrics", uri: "" }],
    0.6,
  );
}

function buildPriorReviewSessionsContext(db: Database, projectId: string): ContextBlock | null {
  const rows = sqlRows<
    { id: string; workflow: string | null; status: string }
  >(
    db,
    `SELECT id, workflow, status FROM sessions
     WHERE project_id = ? AND workflow LIKE '%review%'
     ORDER BY updated_at DESC LIMIT 5`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const body = rows
    .map((r) => `[${r.status}] ${r.workflow ?? "review"} (${r.id.slice(0, 8)})`)
    .join("\n");
  return makeBlock(
    "prior-review-sessions",
    "Prior Review Sessions",
    body,
    [{ label: "sessions", uri: "" }],
    0.7,
  );
}

export function createReviewHistoryProvider(opts: ReviewHistoryOptions): ContextPlugin {
  return {
    id: "review_history",
    async build(input: ContextInput): Promise<ContextBlock[]> {
      const blocks: ContextBlock[] = [];
      const { projectId, budgetTokens } = input;
      const targetSize = Math.min(budgetTokens, 4000);

      const findingsBlock = buildReviewFindingsContext(opts.db, projectId);
      if (findingsBlock) blocks.push(findingsBlock);

      const followupsBlock = buildUnresolvedFollowupsContext(opts.db, projectId);
      if (followupsBlock) blocks.push(followupsBlock);

      const risksBlock = buildRecurringModuleRisksContext(opts.db, projectId);
      if (risksBlock) blocks.push(risksBlock);

      const sessionsBlock = buildPriorReviewSessionsContext(opts.db, projectId);
      if (sessionsBlock) blocks.push(sessionsBlock);

      return blocks;
    },
  };
}