import type { Database } from "bun:sqlite";
import type {
  ContextBlock,
  ContextInput,
  ContextPlugin,
  SourceRef,
} from "@aloop/core";

export type HumanSteeringOptions = {
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

function buildRecentHumanCommentsContext(
  db: Database,
  projectId: string,
  sessionId: string,
): ContextBlock | null {
  const rows = sqlRows<
    { session_id: string; filename: string }
  >(
    db,
    `SELECT a.session_id, a.filename FROM artifacts a
     WHERE a.session_id = ? AND a.project_id = ?
     ORDER BY a.created_at DESC LIMIT 5`,
    [sessionId, projectId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `[${r.session_id.slice(0, 8)}] ${r.filename}`).join("\n");
  return makeBlock(
    "recent-comments",
    "Recent Human Comments",
    body,
    rows.map((r) => ({ label: `session:${r.session_id.slice(0, 8)}`, uri: "" })),
    0.9,
  );
}

function buildExplicitSteeringContext(
  db: Database,
  projectId: string,
): ContextBlock | null {
  const rows = sqlRows<
    { session_id: string; filename: string }
  >(
    db,
    `SELECT session_id, filename FROM artifacts
     WHERE project_id = ?
     ORDER BY created_at DESC LIMIT 3`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `${r.filename}`).join("\n---\n");
  return makeBlock(
    "explicit-steering",
    "Explicit Human Steering",
    body,
    rows.map((r) => ({ label: `session:${r.session_id.slice(0, 8)}`, uri: "" })),
    0.95,
  );
}

function buildActiveOrchestratorSessionContext(
  db: Database,
  projectId: string,
  sessionId: string,
): ContextBlock | null {
  const rows = sqlRows<
    { id: string; status: string; kind: string }
  >(
    db,
    `SELECT id, status, kind FROM sessions
     WHERE project_id = ? AND kind IN ('orchestrator', 'standalone') AND id != ?
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId, sessionId],
  );
  if (rows.length === 0 || !rows[0]) return null;
  const row = rows[0];
  return makeBlock(
    "active-orchestrator",
    "Active Orchestrator Session",
    `session: ${row.id.slice(0, 8)}\nstatus: ${row.status}\nkind: ${row.kind}`,
    [{ label: "sessions", uri: "" }],
    0.8,
  );
}

export function createHumanSteeringProvider(opts: HumanSteeringOptions): ContextPlugin {
  return {
    id: "human_steering",
    async build(input: ContextInput): Promise<ContextBlock[]> {
      const blocks: ContextBlock[] = [];
      const { projectId, sessionId } = input;

      const commentsBlock = buildRecentHumanCommentsContext(opts.db, projectId, sessionId);
      if (commentsBlock) blocks.push(commentsBlock);

      const steeringBlock = buildExplicitSteeringContext(opts.db, projectId);
      if (steeringBlock) blocks.push(steeringBlock);

      const orchBlock = buildActiveOrchestratorSessionContext(opts.db, projectId, sessionId);
      if (orchBlock) blocks.push(orchBlock);

      return blocks;
    },
  };
}