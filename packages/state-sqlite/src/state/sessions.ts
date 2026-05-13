import type { Database } from "bun:sqlite";
import type { SessionKind, SessionStatus } from "@aloop/core";

export type Session = {
  readonly id: string;
  readonly projectId: string;
  readonly kind: SessionKind;
  readonly parentSessionId: string | null;
  readonly workflow: string | null;
  readonly providerChain: readonly string[];
  readonly status: SessionStatus;
  readonly worktreePath: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly endedAt: string | null;
  readonly costUsd: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly commits: number;
};

export type SessionFilter = {
  readonly projectId?: string;
  readonly status?: SessionStatus | readonly SessionStatus[];
  readonly kind?: SessionKind | readonly SessionKind[];
  readonly parentSessionId?: string;
};

export type CreateSessionInput = {
  readonly id?: string;
  readonly projectId: string;
  readonly kind: SessionKind;
  readonly parentSessionId?: string | null;
  readonly workflow?: string | null;
  readonly providerChain?: readonly string[];
  readonly worktreePath?: string | null;
  readonly now?: string;
};

type SessionRow = {
  id: string;
  project_id: string;
  kind: string;
  parent_session_id: string | null;
  workflow: string | null;
  provider_chain: string;
  status: string;
  worktree_path: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  commits: number;
};

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as SessionKind,
    parentSessionId: row.parent_session_id,
    workflow: row.workflow,
    providerChain: JSON.parse(row.provider_chain) as readonly string[],
    status: row.status as SessionStatus,
    worktreePath: row.worktree_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
    costUsd: row.cost_usd,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    commits: row.commits,
  };
}

export class SessionNotFoundError extends Error {
  readonly code = "session_not_found";
  constructor(readonly id: string) {
    super(`session not found: ${id}`);
  }
}

export class SessionRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateSessionInput): Session {
    const id = input.id ?? crypto.randomUUID();
    const projectId = input.projectId;
    const kind = input.kind;
    const parentSessionId = input.parentSessionId ?? null;
    const workflow = (input.workflow ?? "") || "";
    const providerChain =
      input.providerChain !== undefined ? JSON.stringify(input.providerChain) : "[]";
    const worktreePath = input.worktreePath ?? null;
    const now = input.now ?? new Date().toISOString();

    this.db.run(
      `INSERT INTO sessions
         (id, project_id, kind, parent_session_id, workflow, provider_chain,
          status, worktree_path, created_at, updated_at, ended_at,
          cost_usd, tokens_in, tokens_out, commits)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL, 0, 0, 0, 0)`,
      [
        id,
        projectId,
        kind,
        parentSessionId,
        workflow,
        providerChain,
        worktreePath,
        now,
        now,
      ],
    );

    return this.getRequired(id);
  }

  get(id: string): Session | undefined {
    const row = this.db.query<SessionRow, [string]>(`SELECT * FROM sessions WHERE id = ?`).get(id);
    return row ? rowToSession(row) : undefined;
  }

  list(
    filter: SessionFilter & { limit?: number; cursor?: string } = {},
  ): { items: Session[]; nextCursor: string | null } {
    const { projectId, status, kind, parentSessionId, limit, cursor } = filter;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (projectId !== undefined) {
      conditions.push("project_id = ?");
      params.push(projectId);
    }

    if (status !== undefined) {
      if (Array.isArray(status)) {
        const placeholders = status.map(() => "?").join(", ");
        conditions.push(`status IN (${placeholders})`);
        params.push(...status);
      } else {
        conditions.push("status = ?");
        params.push(status as SessionStatus);
      }
    }

    if (kind !== undefined) {
      if (Array.isArray(kind)) {
        const placeholders = kind.map(() => "?").join(", ");
        conditions.push(`kind IN (${placeholders})`);
        params.push(...kind);
      } else {
        conditions.push("kind = ?");
        params.push(kind as SessionKind);
      }
    }

    if (parentSessionId !== undefined) {
      conditions.push("parent_session_id = ?");
      params.push(parentSessionId);
    }

    if (cursor !== undefined) {
      conditions.push("(created_at || ':' || id) > ?");
      params.push(cursor);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const effectiveLimit = limit !== undefined ? Math.min(limit, 100) : 100;

    const rows = this.db
      .query<SessionRow, (string | number)[]>(
        `SELECT * FROM sessions ${whereClause} ORDER BY created_at ASC, id ASC LIMIT ?`,
      )
      .all(...params, effectiveLimit + 1);

    const hasMore = rows.length > effectiveLimit;
    const items = hasMore ? rows.slice(0, effectiveLimit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? `${items[items.length - 1]!.created_at}:${items[items.length - 1]!.id}`
        : null;

    return { items: items.map(rowToSession), nextCursor };
  }

  updateStatus(
    id: string,
    status: SessionStatus,
    now: string = new Date().toISOString(),
  ): Session {
    const endedAt = this._isTerminal(status) ? now : null;
    const changes = this.db.run(
      `UPDATE sessions SET status = ?, updated_at = ?, ended_at = COALESCE(?, ended_at)
       WHERE id = ?`,
      [status, now, endedAt, id],
    );
    if (changes.changes === 0) throw new SessionNotFoundError(id);
    return this.getRequired(id);
  }

  touchActivity(
    id: string,
    costUsd?: number,
    tokensIn?: number,
    tokensOut?: number,
    commits?: number,
    now: string = new Date().toISOString(),
  ): void {
    const sets: string[] = ["updated_at = ?"];
    const params: (string | number)[] = [now];

    if (costUsd !== undefined) {
      sets.push("cost_usd = ?");
      params.push(costUsd);
    }
    if (tokensIn !== undefined) {
      sets.push("tokens_in = ?");
      params.push(tokensIn);
    }
    if (tokensOut !== undefined) {
      sets.push("tokens_out = ?");
      params.push(tokensOut);
    }
    if (commits !== undefined) {
      sets.push("commits = ?");
      params.push(commits);
    }

    params.push(id);
    this.db.run(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  archive(id: string, now: string = new Date().toISOString()): Session {
    return this.updateStatus(id, "archived", now);
  }

  /**
   * Find all sessions with status = 'running' — used by crash recovery at
   * daemon startup (daemon.md §Lifecycle).
   */
  findRunning(): Session[] {
    return this.db
      .query<SessionRow, []>(`SELECT * FROM sessions WHERE status = 'running'`)
      .all()
      .map(rowToSession);
  }

  /**
   * Bulk-transition running sessions to 'interrupted' — called once on daemon
   * startup before crash recovery logic reads event tails.
   */
  interruptAllRunning(now: string = new Date().toISOString()): number {
    const result = this.db.run(
      `UPDATE sessions SET status = 'interrupted', updated_at = ?, ended_at = ?
       WHERE status = 'running'`,
      [now, now],
    );
    return result.changes;
  }

  private _isTerminal(status: SessionStatus): boolean {
    return status === "completed" || status === "failed" || status === "archived";
  }

  private getRequired(id: string): Session {
    const s = this.get(id);
    if (!s) throw new SessionNotFoundError(id);
    return s;
  }
}
