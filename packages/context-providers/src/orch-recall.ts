import type { Database } from "bun:sqlite";
import type {
  ContextBlock,
  ContextInput,
  ContextPlugin,
  SourceRef,
} from "@aloop/core";

export type OrchRecallOptions = {
  readonly sessionsDir: string;
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

function buildRelatedStoriesContext(
  db: Database,
  projectId: string,
): ContextBlock | null {
  const stories = sqlRows<
    { id: string; workflow: string | null }
  >(
    db,
    `SELECT DISTINCT id, workflow FROM sessions
     WHERE project_id = ? AND workflow IS NOT NULL AND workflow != ''
     ORDER BY created_at DESC LIMIT 5`,
    [projectId],
  );
  if (stories.length === 0) return null;
  const body = stories
    .map((s) => `- ${s.workflow ?? "unknown"} [session: ${s.id.slice(0, 8)}]`)
    .join("\n");
  return makeBlock(
    "related-stories",
    "Recently Active Stories",
    body,
    [{ label: "sessions", uri: "" }],
    0.7,
  );
}

function buildFailedAttemptsContext(
  db: Database,
  projectId: string,
): ContextBlock | null {
  const failed = sqlRows<
    { id: string; status: string }
  >(
    db,
    `SELECT id, status FROM sessions
     WHERE project_id = ? AND status = 'failed'
     ORDER BY updated_at DESC LIMIT 5`,
    [projectId],
  );
  if (failed.length === 0) return null;
  const body = failed
    .map((f) => `- session ${f.id.slice(0, 8)} failed`)
    .join("\n");
  return makeBlock(
    "failed-attempts",
    "Recent Failed Sessions",
    body,
    [{ label: "sessions", uri: "" }],
    0.8,
  );
}

function buildStaleAssumptionsContext(
  db: Database,
  projectId: string,
  sessionId: string,
): ContextBlock | null {
  const stale = sqlRows<
    { session_id: string; metric_name: string; value: number }
  >(
    db,
    `SELECT sm.session_id, sm.metric_name, sm.value
     FROM session_metrics sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.project_id = ? AND sm.metric_name = 'iteration_stuck_count' AND sm.value > 2
     AND s.id != ?
     ORDER BY sm.updated_at DESC LIMIT 3`,
    [projectId, sessionId],
  );
  if (stale.length === 0) return null;
  const body = stale
    .map((s) => `- session ${s.session_id.slice(0, 8)}: stuck=${s.value}`)
    .join("\n");
  return makeBlock(
    "stale-assumptions",
    "Sessions with Stuck Iterations",
    body,
    [{ label: "session_metrics", uri: "" }],
    0.6,
  );
}

function buildProofContext(
  db: Database,
  projectId: string,
): ContextBlock | null {
  const proofs = sqlRows<
    { id: string; kind: string; filename: string }
  >(
    db,
    `SELECT id, kind, filename FROM artifacts
     WHERE project_id = ?
     ORDER BY created_at DESC LIMIT 3`,
    [projectId],
  );
  if (proofs.length === 0) return null;
  const body = proofs
    .map((p) => `[${p.kind}] ${p.filename}`)
    .join("\n---\n");
  return makeBlock(
    "proof-artifacts",
    "Recent Artifacts",
    body,
    proofs.map((p) => ({ label: `artifact:${p.id.slice(0, 8)}`, uri: "" })),
    0.8,
  );
}

export function createOrchRecallProvider(
  opts: OrchRecallOptions,
): ContextPlugin {
  return {
    id: "orch_recall",
    async build(input: ContextInput): Promise<ContextBlock[]> {
      const blocks: ContextBlock[] = [];
      const { sessionId, projectId } = input;

      const relatedBlock = buildRelatedStoriesContext(opts.db, projectId);
      if (relatedBlock) blocks.push(relatedBlock);

      const failedBlock = buildFailedAttemptsContext(opts.db, projectId);
      if (failedBlock) blocks.push(failedBlock);

      const staleBlock = buildStaleAssumptionsContext(opts.db, projectId, sessionId);
      if (staleBlock) blocks.push(staleBlock);

      const proofBlock = buildProofContext(opts.db, projectId);
      if (proofBlock) blocks.push(proofBlock);

      return blocks;
    },
  };
}