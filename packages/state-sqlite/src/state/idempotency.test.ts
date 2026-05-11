import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { loadBundledMigrations, migrate } from "@aloop/sqlite-db";
import { createIdempotencyStore, type IdempotencyStore } from "./idempotency.ts";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return db;
}

describe("IdempotencyStore", () => {
  let db: ReturnType<typeof makeDb>;
  let store: IdempotencyStore;

  beforeEach(() => {
    db = makeDb();
    store = createIdempotencyStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("get", () => {
    test("returns null for unknown key", () => {
      expect(store.get("nonexistent")).toBeNull();
    });

    test("returns null for expired key", async () => {
      // Directly insert an expired idempotency record to test TTL expiry
      const expiredAt = new Date(Date.now() - 1).toISOString(); // 1ms in the past
      db.prepare(
        "INSERT INTO idempotency_keys (key, status, result, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      ).run("expired_key", "ok", '"result"', new Date().toISOString(), expiredAt);

      expect(store.get("expired_key")).toBeNull();
    });

    test("returns stored ok result for valid key", () => {
      const payload = { id: "proj_123" };
      store.put("idem-key-001", payload, "ok");

      const result = store.get("idem-key-001");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("ok");
      expect(result!.result).toEqual(payload);
    });

    test("returns stored error result for valid key", () => {
      const errorPayload = new Error("something went wrong");
      store.put("idem-key-002", errorPayload, "error");

      const result = store.get("idem-key-002");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("error");
      expect((result!.result as Error).message).toBe("something went wrong");
    });

    test("result is parsed from JSON", () => {
      store.put("idem-key-003", { nested: { value: 42 } }, "ok");

      const result = store.get("idem-key-003");
      expect(result!.result).toEqual({ nested: { value: 42 } });
    });
  });

  describe("put", () => {
    test("stores result with 24-hour TTL", () => {
      const before = Date.now();
      store.put("fresh-key", { data: 1 }, "ok");
      const result = store.get("fresh-key");
      const after = Date.now();

      expect(result).not.toBeNull();
      expect(result!.status).toBe("ok");

      // expires_at should be approximately 24 hours from now
      const expiresAt = new Date(result!.created_at).getTime();
      const expectedMin = before + 24 * 60 * 60 * 1000 - 1000; // allow 1s variance
      const expectedMax = after + 24 * 60 * 60 * 1000 + 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    test("stores ok status", () => {
      store.put("ok-key", { ok: true }, "ok");
      const result = store.get("ok-key");
      expect(result!.status).toBe("ok");
    });

    test("stores error status", () => {
      store.put("err-key", { fail: true }, "error");
      const result = store.get("err-key");
      expect(result!.status).toBe("error");
    });

    test("replaces existing key with new result", () => {
      store.put("replace-key", { v: 1 }, "ok");
      store.put("replace-key", { v: 2 }, "ok");

      const result = store.get("replace-key");
      expect((result!.result as { v: number }).v).toBe(2);
    });

    test("can store null as result value", () => {
      store.put("null-result-key", null, "ok");
      const result = store.get("null-result-key");
      expect(result!.result).toBeNull();
    });

    test("can store array as result value", () => {
      store.put("array-result-key", [1, 2, 3], "ok");
      const result = store.get("array-result-key");
      expect(result!.result).toEqual([1, 2, 3]);
    });

    test("can store string as result value", () => {
      store.put("string-result-key", "hello world", "ok");
      const result = store.get("string-result-key");
      expect(result!.result).toBe("hello world");
    });
  });

  describe("round-trip", () => {
    test("ok result survives get/put cycle", () => {
      const original = { projectId: "proj_abc", status: "active" };
      store.put("cycle-ok", original, "ok");
      const retrieved = store.get("cycle-ok");
      expect(retrieved!.result).toEqual(original);
      expect(retrieved!.status).toBe("ok");
    });

    test("error result survives get/put cycle", () => {
      const original = { message: "conflict", code: 409 };
      store.put("cycle-err", original, "error");
      const retrieved = store.get("cycle-err");
      expect(retrieved!.result).toEqual(original);
      expect(retrieved!.status).toBe("error");
    });
  });
});
