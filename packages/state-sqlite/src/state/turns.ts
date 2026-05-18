import type { Database } from "bun:sqlite";

export type TurnPhase = "plan" | "build" | "review" | "qa" | "proof" | "finalize";

export type Turn = {
  readonly id: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly sequence: number;
  readonly phase: TurnPhase | null;
  readonly createdAt: string;
  readonly endedAt: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
};

export type TurnFilter = {
  readonly sessionId?: string;
  readonly turnId?: string;
};

export type CreateTurnInput = {
  readonly id?: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly sequence?: number;
  readonly phase?: TurnPhase | null;
  readonly now?: string;
};

export type UpdateTurnInput = {
  readonly endedAt?: string | null;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly costUsd?: number;
};

export class TurnNotFoundError extends Error {
  readonly code = "turn_not_found" as const;
  constructor(readonly id: string) {
    super(`turn not found: ${id}`);
    this.name = "TurnNotFoundError";
  }
}

export class TurnRegistry {
  constructor(private readonly _db: Database) {}

  get db(): Database {
    return this._db;
  }

  create(input: CreateTurnInput): Turn {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();
    this._db.run(
      `INSERT OR IGNORE INTO turns (id, session_id, turn_id, sequence, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        input.sessionId,
        input.turnId,
        input.sequence ?? 0,
        now,
      ],
    );
    const rows = this._db
      .query<{
        id: string;
        session_id: string;
        turn_id: string;
        sequence: number;
        created_at: string;
        ended_at: string | null;
        tokens_in: number;
        tokens_out: number;
        cost_usd: number;
      }, [string, string]>(
        `SELECT * FROM turns WHERE session_id = ? AND turn_id = ?`,
      )
      .all(input.sessionId, input.turnId);
    const row = rows[0];
    if (!row) throw new TurnNotFoundError(id);
    return rowToTurn(row);
  }

  getBySessionAndTurn(sessionId: string, turnId: string): Turn | undefined {
    const rows = this._db
      .query<{
        id: string;
        session_id: string;
        turn_id: string;
        sequence: number;
        created_at: string;
        ended_at: string | null;
        tokens_in: number;
        tokens_out: number;
        cost_usd: number;
      }, [string, string]>(
        `SELECT * FROM turns WHERE session_id = ? AND turn_id = ?`,
      )
      .all(sessionId, turnId);
    return rows[0] ? rowToTurn(rows[0]) : undefined;
  }

  list(filter: TurnFilter = {}): Turn[] {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filter.sessionId) {
      conditions.push("session_id = ?");
      params.push(filter.sessionId);
    }
    if (filter.turnId) {
      conditions.push("turn_id = ?");
      params.push(filter.turnId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this._db
      .query<{
        id: string;
        session_id: string;
        turn_id: string;
        sequence: number;
        created_at: string;
        ended_at: string | null;
        tokens_in: number;
        tokens_out: number;
        cost_usd: number;
      }, string[]>(
        `SELECT * FROM turns ${where} ORDER BY created_at ASC`,
      )
      .all(...params);
    return rows.map(rowToTurn);
  }

  update(id: string, input: UpdateTurnInput): Turn {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (input.endedAt !== undefined) {
      sets.push("ended_at = ?");
      params.push(input.endedAt);
    }
    if (input.tokensIn !== undefined) {
      sets.push("tokens_in = ?");
      params.push(input.tokensIn);
    }
    if (input.tokensOut !== undefined) {
      sets.push("tokens_out = ?");
      params.push(input.tokensOut);
    }
    if (input.costUsd !== undefined) {
      sets.push("cost_usd = ?");
      params.push(input.costUsd);
    }
    if (sets.length === 0) {
      const rows = this._db
        .query<{
          id: string;
          session_id: string;
          turn_id: string;
          sequence: number;
          created_at: string;
          ended_at: string | null;
          tokens_in: number;
          tokens_out: number;
          cost_usd: number;
        }, string>(`SELECT * FROM turns WHERE id = ?`)
        .all(id);
      const existing = rows[0];
      if (!existing) throw new TurnNotFoundError(id);
      return rowToTurn(existing);
    }
    params.push(id);
    const changes = this._db.run(
      `UPDATE turns SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
    if (changes.changes === 0) throw new TurnNotFoundError(id);
    const rows2 = this._db
      .query<{
        id: string;
        session_id: string;
        turn_id: string;
        sequence: number;
        created_at: string;
        ended_at: string | null;
        tokens_in: number;
        tokens_out: number;
        cost_usd: number;
      }, string>(`SELECT * FROM turns WHERE id = ?`)
      .all(id);
    const row = rows2[0];
    if (!row) throw new TurnNotFoundError(id);
    return rowToTurn(row);
  }
}

function rowToTurn(row: {
  id: string;
  session_id: string;
  turn_id: string;
  sequence: number;
  created_at: string;
  ended_at: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}): Turn {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    sequence: row.sequence,
    phase: null,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    costUsd: row.cost_usd,
  };
}