import type { Database } from "bun:sqlite";
import type {
  Session,
  SessionFilter,
  SessionQueueItem,
  SessionStatus,
} from "./sessions-store.ts";

// ── Row shapes ─────────────────────────────────────────────────────────────────

type SessionRow = {
  id: string;
  project_id: string;
  kind: string;
  status: string;
  workflow: string;
  provider_chain: string;
  issue_ref: string | null;
  parent_session_id: string | null;
  max_iterations: number | null;
  notes: string;
  current_iteration: number;
  current_phase: string | null;
  current_provider_id: string | null;
  last_event_id: string | null;
  created_at: string;
  updated_at: string;
  stopped_at: string | null;
  started_at: string | null;
};

type QueueRow = {
  id: string;
  session_id: string;
  filename: string;
  instruction: string;
  affects_completed_work: string;
  position: number;
  created_at: string;
};

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as Session["kind"],
    status: row.status as SessionStatus,
    workflow: row.workflow,
    providerChain: JSON.parse(row.provider_chain) as string[],
    issueRef: row.issue_ref,
    parentSessionId: row.parent_session_id,
    maxIterations: row.max_iterations,
    notes: row.notes,
    currentIteration: row.current_iteration,
    currentPhase: row.current_phase ?? null,
    currentProviderId: row.current_provider_id ?? null,
    lastEventId: row.last_event_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stoppedAt: row.stopped_at ?? null,
    startedAt: row.started_at ?? null,
  };
}

function rowToQueue(row: QueueRow): SessionQueueItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    filename: row.filename,
    instruction: row.instruction,
    affectsCompletedWork: row.affects_completed_work as SessionQueueItem["affectsCompletedWork"],
    position: row.position,
    createdAt: row.created_at,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function insertSession(db: Database, s: Session): void {
  db.run(
    `INSERT INTO sessions (
      id, project_id, kind, status, workflow, provider_chain,
      issue_ref, parent_session_id, max_iterations, notes,
      current_iteration, current_phase, current_provider_id, last_event_id,
      created_at, updated_at, stopped_at, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.id,
      s.projectId,
      s.kind,
      s.status,
      s.workflow,
      JSON.stringify(s.providerChain),
      s.issueRef,
      s.parentSessionId,
      s.maxIterations,
      s.notes,
      s.currentIteration,
      s.currentPhase,
      s.currentProviderId,
      s.lastEventId,
      s.createdAt,
      s.updatedAt,
      s.stoppedAt,
      s.startedAt,
    ],
  );
}

export function getSessionById(db: Database, id: string): Session | undefined {
  const row = db.query<SessionRow, [string]>(
    `SELECT * FROM sessions WHERE id = ?`,
  ).get(id);
  return row ? rowToSession(row) : undefined;
}

export function listSessionsFromDb(db: Database, filter: SessionFilter = {}): Session[] {
  const conditions: string[] = [];
  const params: string[] = [];

  if (filter.projectId) {
    conditions.push(`project_id = ?`);
    params.push(filter.projectId);
  }
  if (filter.status && filter.status.length > 0) {
    const placeholders = filter.status.map(() => `?`).join(", ");
    conditions.push(`status IN (${placeholders})`);
    params.push(...filter.status);
  }
  if (filter.kind && filter.kind.length > 0) {
    const placeholders = filter.kind.map(() => `?`).join(", ");
    conditions.push(`kind IN (${placeholders})`);
    params.push(...filter.kind);
  }
  if (filter.parentSessionId) {
    conditions.push(`parent_session_id = ?`);
    params.push(filter.parentSessionId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 50;
  const sql = `SELECT * FROM sessions ${where} ORDER BY created_at DESC, id LIMIT ?`;
  const allParams: string[] = [...params, String(limit)];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db.query(sql) as any).all(...allParams).map(rowToSession);
}

export function updateSessionStatus(
  db: Database,
  id: string,
  status: SessionStatus,
  now: string,
  stoppedAt?: string,
  startedAt?: string,
): void {
  db.run(
    `UPDATE sessions
       SET status = ?, updated_at = ?
         ${stoppedAt !== undefined ? ", stopped_at = ?" : ""}
         ${startedAt !== undefined ? ", started_at = ?" : ""}
       WHERE id = ?`,
    stoppedAt !== undefined && startedAt !== undefined
      ? [status, now, stoppedAt, startedAt, id]
      : stoppedAt !== undefined
        ? [status, now, stoppedAt, id]
        : startedAt !== undefined
          ? [status, now, startedAt, id]
          : [status, now, id],
  );
}

export function updateSessionPhase(
  db: Database,
  id: string,
  phase: string,
  providerId: string | null,
  now: string,
): void {
  db.run(
    `UPDATE sessions
       SET current_phase = ?, current_provider_id = ?, updated_at = ?
       WHERE id = ?`,
    [phase, providerId, now, id],
  );
}

export function advanceSessionIteration(
  db: Database,
  id: string,
  now: string,
): void {
  db.run(
    `UPDATE sessions
       SET current_iteration = current_iteration + 1, updated_at = ?
       WHERE id = ?`,
    [now, id],
  );
}

export function updateSessionLastEventId(
  db: Database,
  id: string,
  eventId: string,
  now: string,
): void {
  db.run(
    `UPDATE sessions SET last_event_id = ?, updated_at = ? WHERE id = ?`,
    [eventId, now, id],
  );
}

export function deleteSession(db: Database, id: string): void {
  db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
}

export function insertQueueItem(db: Database, item: SessionQueueItem): void {
  db.run(
    `INSERT INTO session_queue
      (id, session_id, filename, instruction, affects_completed_work, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.sessionId,
      item.filename,
      item.instruction,
      item.affectsCompletedWork,
      item.position,
      item.createdAt,
    ],
  );
}

export function listQueueItems(
  db: Database,
  sessionId: string,
): SessionQueueItem[] {
  return db
    .query<QueueRow, [string]>(
      `SELECT * FROM session_queue
        WHERE session_id = ?
        ORDER BY position ASC, created_at ASC`,
    )
    .all(sessionId)
    .map(rowToQueue);
}

export function getQueueItem(
  db: Database,
  sessionId: string,
  itemId: string,
): SessionQueueItem | undefined {
  const row = db.query<QueueRow, [string, string]>(
    `SELECT * FROM session_queue
       WHERE id = ? AND session_id = ?`,
  ).get(itemId, sessionId);
  return row ? rowToQueue(row) : undefined;
}

export function deleteQueueItem(db: Database, itemId: string): void {
  db.run(`DELETE FROM session_queue WHERE id = ?`, [itemId]);
}

// ── Session Metrics ───────────────────────────────────────────────────────────

export type SessionMetricRow = {
  session_id: string;
  metric_name: string;
  value: number;
  updated_at: string;
};

export function getSessionMetrics(
  db: Database,
  sessionId: string,
): Array<{ name: string; value: number; updatedAt: string }> {
  return db
    .query<SessionMetricRow, [string]>(
      `SELECT session_id, metric_name, value, updated_at
         FROM session_metrics
        WHERE session_id = ?
        ORDER BY metric_name`,
    )
    .all(sessionId)
    .map((row) => ({
      name: row.metric_name,
      value: row.value,
      updatedAt: row.updated_at,
    }));
}
