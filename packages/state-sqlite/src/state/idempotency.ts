import type { Database } from "@aloop/sqlite-db";

export type IdempotencyResult = {
  status: "ok" | "error";
  result: unknown;
  created_at: string;
};

export type IdempotencyStore = {
  /**
   * Look up a previously-seen idempotency key.
   * Returns the stored result if the key exists and has not expired.
   * Returns null if the key is unknown or has expired.
   */
  get(key: string): IdempotencyResult | null;

  /**
   * Store the result of a mutation under a key.
   * Stores for 24 hours (TTL enforced at read time via expires_at).
   */
  put(key: string, result: unknown, status: "ok" | "error"): void;
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function makeExpiresAt(now: Date): string {
  return new Date(now.getTime() + TWENTY_FOUR_HOURS_MS).toISOString();
}

export function createIdempotencyStore(db: Database): IdempotencyStore {
  return {
    get(key: string): IdempotencyResult | null {
      const now = new Date().toISOString();
      const row = db
        .prepare<
          { status: string; result: string; created_at: string },
          string
        >(
          "SELECT status, result, created_at FROM idempotency_keys WHERE key = ? AND expires_at > ?",
        )
        .get(key, now) as
        | { status: string; result: string; created_at: string }
        | undefined;

      if (!row) return null;
      return {
        status: row.status as "ok" | "error",
        result: JSON.parse(row.result),
        created_at: row.created_at,
      };
    },

    put(key: string, result: unknown, status: "ok" | "error"): void {
      const now = new Date();
      const createdAt = now.toISOString();
      const expiresAt = makeExpiresAt(now);
      db.prepare(
        "INSERT OR REPLACE INTO idempotency_keys (key, status, result, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      ).run(key, status, JSON.stringify(result), createdAt, expiresAt);
    },
  };
}
