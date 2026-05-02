import type { Database } from "bun:sqlite";

export type Permit = {
  readonly id: string;
  readonly sessionId: string;
  readonly projectId: string | null;
  readonly providerId: string;
  readonly ttlSeconds: number;
  readonly grantedAt: string;
  readonly expiresAt: string;
};

type PermitRow = {
  id: string;
  session_id: string;
  project_id: string | null;
  provider_id: string;
  ttl_seconds: number;
  granted_at: string;
  expires_at: string;
};

function rowToPermit(row: PermitRow): Permit {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    providerId: row.provider_id,
    ttlSeconds: row.ttl_seconds,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
  };
}

export class PermitRegistry {
  constructor(private readonly db: Database) {}

  get(id: string): Permit | undefined {
    const row = this.db.query<PermitRow, [string]>(`SELECT * FROM permits WHERE id = ?`).get(id);
    return row ? rowToPermit(row) : undefined;
  }

  list(): Permit[] {
    return this.db
      .query<PermitRow, []>(`SELECT * FROM permits ORDER BY granted_at, id`)
      .all()
      .map(rowToPermit);
  }

  countActive(): number {
    const row = this.db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM permits`).get();
    return row?.count ?? 0;
  }

  countByProject(projectId: string): number {
    const row = this.db.query<{ count: number }, [string]>(
      `SELECT COUNT(*) AS count FROM permits WHERE project_id = ?`,
    ).get(projectId);
    return row?.count ?? 0;
  }

  listExpired(nowIso: string): Permit[] {
    return this.db
      .query<PermitRow, [string]>(
        `SELECT * FROM permits WHERE expires_at <= ? ORDER BY expires_at, id`,
      )
      .all(nowIso)
      .map(rowToPermit);
  }
}

export type GrantedPermitProjection = {
  readonly permitId: string;
  readonly sessionId: string;
  readonly projectId: string | null;
  readonly providerId: string;
  readonly ttlSeconds: number;
  readonly grantedAt: string;
  readonly expiresAt: string;
  /**
   * Estimated cost in USD cents. Written to project_daily_cost by the
   * project-daily-cost projector on scheduler.permit.grant events.
   */
  readonly estimatedCostUsdCents?: number;
};

export function projectGrantedPermit(db: Database, permit: GrantedPermitProjection): void {
  db.run(
    `INSERT INTO permits (id, session_id, project_id, provider_id, ttl_seconds, granted_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       project_id = excluded.project_id,
       provider_id = excluded.provider_id,
       ttl_seconds = excluded.ttl_seconds,
       granted_at = excluded.granted_at,
       expires_at = excluded.expires_at`,
    [
      permit.permitId,
      permit.sessionId,
      permit.projectId,
      permit.providerId,
      permit.ttlSeconds,
      permit.grantedAt,
      permit.expiresAt,
    ],
  );
}

export function projectPermitRemoval(db: Database, permitId: string): void {
  db.run(`DELETE FROM permits WHERE id = ?`, [permitId]);
}

export function clearPermits(db: Database): void {
  db.run(`DELETE FROM permits`);
}
