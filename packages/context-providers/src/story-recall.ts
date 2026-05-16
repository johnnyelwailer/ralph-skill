import type { Database } from "bun:sqlite";
import type {
  ContextBlock,
  ContextInput,
  ContextPlugin,
  SourceRef,
} from "@aloop/core";

export type StoryRecallOptions = {
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

function buildCurrentStoryContext(db: Database, sessionId: string): ContextBlock | null {
  const rows = sqlRows<
    {
      id: string;
      workflow: string | null;
      parent_session_id: string | null;
      kind: string;
    }
  >(
    db,
    `SELECT id, workflow, parent_session_id, kind FROM sessions WHERE id = ? LIMIT 1`,
    [sessionId],
  );
  if (rows.length === 0 || !rows[0]) return null;
  const row = rows[0];
  const body = [
    `session: ${row.id.slice(0, 8)}`,
    `workflow: ${row.workflow ?? "none"}`,
    `kind: ${row.kind}`,
    `parent: ${row.parent_session_id?.slice(0, 8) ?? "none"}`,
  ].join("\n");
  return makeBlock(
    "current-story",
    "Current Story",
    body,
    [{ label: "sessions", uri: "" }],
    1.0,
  );
}

function buildStoryHistoryContext(db: Database, sessionId: string): ContextBlock | null {
  const rows = sqlRows<
    { id: string; status: string; created_at: string }
  >(
    db,
    `SELECT id, status, created_at FROM sessions
     WHERE parent_session_id = ? OR id = ?
     ORDER BY created_at ASC LIMIT 10`,
    [sessionId, sessionId],
  );
  if (rows.length === 0) return null;
  const body = rows
    .map((r) => `[${r.status}] ${r.id.slice(0, 8)} at ${r.created_at}`)
    .join("\n");
  return makeBlock(
    "story-history",
    "Story Session History",
    body,
    [{ label: "sessions", uri: "" }],
    0.9,
  );
}

function buildChildSessionsContext(db: Database, sessionId: string): ContextBlock | null {
  const rows = sqlRows<
    { id: string; status: string; kind: string }
  >(
    db,
    `SELECT id, status, kind FROM sessions WHERE parent_session_id = ? ORDER BY created_at DESC LIMIT 5`,
    [sessionId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `[${r.status}] ${r.kind}: ${r.id.slice(0, 8)}`).join("\n");
  return makeBlock(
    "child-sessions",
    "Child Sessions",
    body,
    [{ label: "sessions", uri: "" }],
    0.8,
  );
}

function buildRecentProofContext(db: Database, sessionId: string): ContextBlock | null {
  const rows = sqlRows<
    { id: string; kind: string; filename: string }
  >(
    db,
    `SELECT a.id, a.kind, a.filename FROM artifacts a
     JOIN sessions s ON s.project_id = a.project_id
     WHERE s.id = ? AND a.kind IN ('proof', 'review')
     ORDER BY a.created_at DESC LIMIT 3`,
    [sessionId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `[${r.kind}] ${r.filename}`).join("\n---\n");
  return makeBlock(
    "recent-proof",
    "Recent Proof/Review Outcomes",
    body,
    rows.map((r) => ({ label: `artifact:${r.id.slice(0, 8)}`, uri: "" })),
    0.7,
  );
}

export function createStoryRecallProvider(opts: StoryRecallOptions): ContextPlugin {
  return {
    id: "story_recall",
    async build(input: ContextInput): Promise<ContextBlock[]> {
      const blocks: ContextBlock[] = [];
      const { sessionId, budgetTokens } = input;
      const targetSize = Math.min(budgetTokens, 4000);

      const storyBlock = buildCurrentStoryContext(opts.db, sessionId);
      if (storyBlock) blocks.push(storyBlock);

      const historyBlock = buildStoryHistoryContext(opts.db, sessionId);
      if (historyBlock) blocks.push(historyBlock);

      const childBlock = buildChildSessionsContext(opts.db, sessionId);
      if (childBlock) blocks.push(childBlock);

      const proofBlock = buildRecentProofContext(opts.db, sessionId);
      if (proofBlock) blocks.push(proofBlock);

      return blocks;
    },
  };
}