import type { Database } from "bun:sqlite";
import type {
  ContextBlock,
  ContextInput,
  ContextPlugin,
  SourceRef,
} from "@aloop/core";

export type TaskRecallOptions = {
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

function buildCurrentTaskContext(db: Database, sessionId: string): ContextBlock | null {
  const rows = sqlRows<
    { id: string; workflow: string | null; status: string }
  >(
    db,
    `SELECT id, workflow, status FROM sessions WHERE id = ? LIMIT 1`,
    [sessionId],
  );
  if (rows.length === 0 || !rows[0]) return null;
  const row = rows[0];
  const body = [
    `session: ${row.id.slice(0, 8)}`,
    `workflow: ${row.workflow ?? "none"}`,
    `status: ${row.status}`,
  ].join("\n");
  return makeBlock(
    "current-task",
    "Current Task",
    body,
    [{ label: "sessions", uri: "" }],
    1.0,
  );
}

function buildFailedAttemptsContext(db: Database, sessionId: string): ContextBlock | null {
  const rows = sqlRows<
    { value: number }
  >(
    db,
    `SELECT value FROM session_metrics
     WHERE session_id = ? AND metric_name = 'iteration_stuck_count' AND value > 0
     ORDER BY updated_at DESC LIMIT 5`,
    [sessionId],
  );
  if (rows.length === 0) return null;
  const body = rows
    .map((r) => `stuck count: ${r.value}`)
    .join("\n");
  return makeBlock(
    "failed-attempts",
    "Failed Attempts in Current Task",
    body,
    [{ label: "session_metrics", uri: "" }],
    0.9,
  );
}

function buildBlockersContext(db: Database, sessionId: string): ContextBlock | null {
  const rows = sqlRows<
    { metric_name: string; value: number }
  >(
    db,
    `SELECT metric_name, value FROM session_metrics
     WHERE session_id = ? AND metric_name IN ('iteration_stuck_count', 'phase_retry_exhaustion_rate')
     AND value > 0
     ORDER BY updated_at DESC LIMIT 3`,
    [sessionId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `${r.metric_name}: ${r.value}`).join("\n");
  return makeBlock(
    "blockers",
    "Current Blockers",
    body,
    [{ label: "session_metrics", uri: "" }],
    0.8,
  );
}

export function createTaskRecallProvider(opts: TaskRecallOptions): ContextPlugin {
  return {
    id: "task_recall",
    async build(input: ContextInput): Promise<ContextBlock[]> {
      const blocks: ContextBlock[] = [];
      const { sessionId } = input;

      const taskBlock = buildCurrentTaskContext(opts.db, sessionId);
      if (taskBlock) blocks.push(taskBlock);

      const failedBlock = buildFailedAttemptsContext(opts.db, sessionId);
      if (failedBlock) blocks.push(failedBlock);

      const blockersBlock = buildBlockersContext(opts.db, sessionId);
      if (blockersBlock) blocks.push(blockersBlock);

      return blocks;
    },
  };
}